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
function fixture(email) {
  const calls = [], storage = new Map();
  const context = vm.createContext({
    URL, URLSearchParams, structuredClone, console,
    location: {hostname:"127.0.0.1", search:"", hash:""},
    window: {ROBO_SYN_CONFIG:{API_BASE_URL:"https://script.google.com/test"}},
    document: {querySelector:()=>null},
    sessionStorage: {getItem:key=>storage.get(key)||null, setItem:(key,value)=>storage.set(key,value)},
    fetch: async (_, options) => {
      const payload = JSON.parse(options.body);
      calls.push(payload);
      return {ok:true, json:async()=>({ok:true, reviewer:{role:email==="1070055979@qq.com"?"supervisor":email==="tester@example.com"?"tester":"evaluator"}, jobs:[structuredClone(serverJob)]})};
    },
  });
  let source = fs.readFileSync(path.join(__dirname,"../static/js/reviewer-page.js"),"utf8");
  source = source.replace("window.RSCReviewer = { render, mount };",
    "window.test = {state, request, refresh, nextBlocker, localChanges, serverJobs:()=>serverJobs}; window.RSCReviewer = { render, mount };");
  vm.runInContext(source,context);
  const test = context.window.test;
  test.state.credentials = {email,token:"act_fixture"};
  test.state.selected = serverJob.evaluation_id;
  return {test,calls,storage};
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
  console.log("Non-recording accounts: organizer walkthrough, tester real gates, browser-only forms/mail and real evaluator recording passed.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
