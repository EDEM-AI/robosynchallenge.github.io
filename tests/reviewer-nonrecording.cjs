const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const serverJob = {
  evaluation_id: "eval_fixture", submission_id: "sub_fixture", team_name: "Fixture team",
  email: "participant@example.com", reviewer_email: "evaluator@example.com", artifact_name: "Fixture policy",
  coverage_status: "legacy_unverified", task_checkpoint_links: {}, task_commands: {},
  bundle_commit: "", hf_check_context: "initial", preparation_attempt: 0,
  results: [{ task: "click_bell", status: "submitted" }],
  workflow: { stages: Array.from({length:5}, () => ({done:false, checks:{}})) },
};
const original = JSON.stringify(serverJob);
function fixture(email, jobs = [serverJob]) {
  const calls = [], storage = new Map();
  let role = email==="1070055979@qq.com"?"supervisor":email==="tester@example.com"?"tester":"evaluator";
  const context = vm.createContext({
    URL, URLSearchParams, structuredClone, console,
    location: {hostname:"127.0.0.1", search:"", hash:""},
    window: {ROBO_SYN_CONFIG:{API_BASE_URL:"https://script.google.com/test"}},
    document: {querySelector:()=>null},
    sessionStorage: {getItem:key=>storage.get(key)||null, setItem:(key,value)=>storage.set(key,value)},
    fetch: async (_, options) => {
      const payload = JSON.parse(options.body);
      calls.push(payload);
      return {ok:true, json:async()=>({ok:true, reviewer:{role}, jobs:structuredClone(jobs)})};
    },
  });
  let source = fs.readFileSync(path.join(__dirname,"../static/js/reviewer-page.js"),"utf8");
  source = source.replace("window.RSCReviewer = { render, mount };",
    "window.test = {state, request, refresh, nextBlocker, nonRecording, cloneCommand, localChanges, commandDrafts, serverJobs:()=>serverJobs}; window.RSCReviewer = { render, mount };");
  vm.runInContext(source,context);
  const test = context.window.test;
  test.state.credentials = {email,token:"act_fixture"};
  test.state.selected = serverJob.evaluation_id;
  return {test,calls,storage,setRole:value=>{role=value;}};
}

async function main() {
  const {test,calls,storage} = fixture("1070055979@qq.com");
  await test.refresh();
  for (let stage=0;stage<5;stage++) {
    test.state.stage = stage;
    assert.equal(test.nextBlocker(test.state.jobs[0]), "", "Non-recording walkthrough can move freely");
    await test.request("reviewer_complete_stage",{evaluation_id:serverJob.evaluation_id,stage,checks:{}});
    await test.refresh();
    assert.equal(test.state.stage,stage,"Refreshing real data must not reset local walkthrough navigation");
    assert.equal(test.state.jobs[0].workflow.stages[stage].done,true);
  }
  await test.request("reviewer_verify_coverage",{evaluation_id:serverJob.evaluation_id,task_checkpoint_links:{click_bell:"fixture/model"}});
  await test.request("reviewer_save_command",{evaluation_id:serverJob.evaluation_id,task:"click_bell",command:"bash policy/team/eval.sh"});
  await test.request("reviewer_check_result",{evaluation_id:serverJob.evaluation_id,task:"click_bell",decision:"checked"});
  await test.request("reviewer_send_issue",{evaluation_id:serverJob.evaluation_id,body:"Must never send"});
  await test.request("reviewer_retry_preparation",{evaluation_id:serverJob.evaluation_id});
  await test.refresh();
  assert.equal(test.state.jobs[0].task_commands.click_bell,"bash policy/team/eval.sh");
  assert.equal(test.state.jobs[0].results[0].status,"checked");
  assert.equal(test.state.jobs[0].messages,undefined,"Simulated mail must not masquerade as a sent message");
  assert.equal(JSON.stringify(test.serverJobs()[0]),original,"Global progress stays the real server snapshot");
  assert(calls.every(call=>call.action==="reviewer_queue"),"No mutation request may leave the browser");
  assert.equal(storage.size,0,"Forms and progress are never persisted to browser storage");
  const reloaded = fixture("1070055979@qq.com");
  await reloaded.test.refresh();
  assert.equal(JSON.stringify(reloaded.test.state.jobs[0]),original,"Reload discards the entire local walkthrough");
  serverJob.workflow.stages[0].done = true;
  await test.refresh();
  assert.equal(test.localChanges.size,0,"Real progress changes invalidate stale local simulations");
  const evaluator = fixture("evaluator@example.com");
  await evaluator.test.refresh();
  evaluator.test.state.stage = 4;
  assert(evaluator.test.nextBlocker(evaluator.test.state.jobs[0]).includes("previous stages"));
  await evaluator.test.request("reviewer_save_checks",{evaluation_id:serverJob.evaluation_id,stage:1,checks:{}});
  assert.equal(evaluator.calls.at(-1).action,"reviewer_save_checks","Real evaluators retain their normal recording path");
  const tester = fixture("tester@example.com");
  await tester.test.refresh();
  tester.test.state.stage=0;
  assert(tester.test.nextBlocker(tester.test.state.jobs[0]).includes("checkpoint URL"),"Tester retains real stage prerequisites, unlike organizer walkthrough");
  await tester.test.request("reviewer_save_command",{evaluation_id:serverJob.evaluation_id,task:"click_bell",command:"local-only test command"});
  await tester.test.request("reviewer_send_issue",{evaluation_id:serverJob.evaluation_id,body:"Must never send"});
  assert(tester.calls.every(call=>call.action==="reviewer_queue"));
  assert.equal(tester.storage.size,0);
  tester.test.state.drafts.set("fixture",{test:true});
  tester.test.commandDrafts.set("fixture","local-only command draft");
  tester.setRole("evaluator");
  await tester.test.refresh();
  assert.equal(tester.test.localChanges.size,0);
  assert.equal(tester.test.state.drafts.size,0);
  assert.equal(tester.test.commandDrafts.size,0);
  assert.equal(tester.test.state.jobs[0].task_commands.click_bell,undefined);
  await tester.test.request("reviewer_save_command",{evaluation_id:serverJob.evaluation_id,task:"click_bell",command:"formal command"});
  assert.equal(tester.calls.at(-1).action,"reviewer_save_command");
  const assigned = structuredClone(serverJob);
  assigned.evaluation_id = "eval_owned";
  assigned.reviewer_email = "1070055979@qq.com";
  const mixed = fixture("1070055979@qq.com", [assigned, serverJob]);
  await mixed.test.refresh();
  mixed.test.state.selected = assigned.evaluation_id;
  assert.equal(mixed.test.nonRecording(mixed.test.state.jobs[0]), false);
  assert.equal(mixed.test.nonRecording(mixed.test.state.jobs[1]), true);
  mixed.test.state.stage = 4;
  assert(mixed.test.nextBlocker(mixed.test.state.jobs[0]).includes("previous stages"), "Owned request retains real completion requirements");
  await mixed.test.request("reviewer_save_checks", {evaluation_id:assigned.evaluation_id, stage:1, checks:{commit_verified:true}});
  assert.equal(mixed.calls.at(-1).action, "reviewer_save_checks", "Owned supervisor request records normally");
  const realCalls = mixed.calls.length;
  await mixed.test.request("reviewer_save_command", {evaluation_id:serverJob.evaluation_id, task:"click_bell", command:"preview only"});
  assert.equal(mixed.calls.length, realCalls, "Selected owned request cannot cause another request to record");
  await mixed.test.refresh();
  assert.equal(mixed.test.state.jobs[1].task_commands.click_bell, "preview only");
  assert.equal(mixed.test.serverJobs()[1].task_commands.click_bell, undefined);
  mixed.test.state.drafts.set(serverJob.evaluation_id+":0", {ten_tasks:true});
  serverJob.reviewer_email = "1070055979@qq.com";
  await mixed.test.refresh();
  assert.equal(mixed.test.localChanges.has(serverJob.evaluation_id), false, "Reassignment drops prior browser-only simulation");
  assert.equal(mixed.test.state.drafts.has(serverJob.evaluation_id+":0"), false);
  assert.equal(mixed.test.state.jobs[1].task_commands.click_bell, undefined);
  serverJob.reviewer_email = "evaluator@example.com";
  const clone = mixed.test.cloneCommand({...assigned, bundle_url:"https://github.com/ZhaoRunyi/RoboSynChallenge_eval/tree/eval_owned", bundle_commit:"a".repeat(40)});
  assert(!clone.includes("--detach"), "New clones must retain their tracking branch for git pull");
  console.log("Non-recording accounts: organizer walkthrough, tester real gates, browser-only forms/mail and real evaluator recording passed.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
