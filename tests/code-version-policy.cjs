const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Reuse only the offline Sheet harness, before its intake scenarios.
const source = fs.readFileSync(path.join(__dirname, "reviewer-backend.cjs"), "utf8");
const boundary = 'insert("Users", { email: "one@example.com"';
if (!source.includes(boundary)) throw new Error("Reviewer harness boundary changed");
const harness = source.split(boundary)[0];
const scenario = `
const admin = vm.runInContext('provisionReviewer("admin@example.com", "admin")', context);
const evaluator = vm.runInContext('provisionReviewer("evaluator@example.com", "evaluator")', context);
const credentials = {reviewer_email:admin.email,reviewer_token:admin.token};
const limited = {reviewer_email:evaluator.email,reviewer_token:evaluator.token};
const luxi = "1035603730@qq.com";
const normal = "normal@example.com";
const tasks = Array.from(vm.runInContext("Object.keys(REVIEW_TASK_STEPS)", context));
const links = Object.fromEntries(tasks.map(task => [task,"https://huggingface.co/test/model"]));
const dispatch = (action,payload) => vm.runInContext(
  "handleReviewerAction_("+JSON.stringify(action)+","+JSON.stringify(payload)+")", context);
const policy = fields => dispatch("reviewer_code_policy",{...credentials,participant_email:luxi,...fields});
const jobs = () => call("reviewQueue_",credentials).jobs;
const job = email => jobs().find(row => row.email === email);
let count = 0;
const test = (name,run) => {run();count += 1;console.log("PASS "+name);};
context.GmailApp = context.MailApp = {sendEmail(){throw new Error("Unexpected email");}};
context.UrlFetchApp = {fetch(){throw new Error("Unexpected network");}};
vm.runInContext('Date.now = () => Date.parse("2026-10-16T00:00:00Z")',context);
for (const [email,id] of [[luxi,"luxi"],[normal,"normal"]]) {
  insert("Users",{email,team_name:id,token:"participant-"+id,token_status:"active"});
  insert("Submissions",{email,submission_id:"sub_"+id,evaluation_id:"eval_"+id,
    code_link:"https://github.com/test/policy",task_checkpoint_links_json:JSON.stringify(links),
    is_ranked:"true",created_at:"2026-10-11T00:00:00Z"});
  insert("Evaluations",{email,submission_id:"sub_"+id,evaluation_id:"eval_"+id});
  call("reviewEnsureRun_",{...credentials,evaluation_id:"eval_"+id});
}
const originalNormal = JSON.stringify(job(normal));
const originalLuxi = job(luxi);
const originalIntake = JSON.stringify([sheet("Submissions").cells,sheet("Evaluations").cells]);
const audit = () => call("reviewRows_","ReviewCodePolicies");

test("admin-only policy, active participant and valid mode/reason required",() => {
  assert.throws(()=>dispatch("reviewer_code_policy",{...limited,participant_email:luxi,mode:"latest_reachable",reason:"Unauthorized"}),/Organizer/);
  assert.throws(()=>policy({participant_email:"missing@example.com",mode:"latest_reachable",reason:"Missing"}),/active token/);
  insert("Users",{email:"inactive@example.com",token:"inactive",token_status:"revoked"});
  insert("Users",{email:"empty@example.com",token_status:"active"});
  for (const participant_email of ["inactive@example.com","empty@example.com"]) {
    assert.throws(()=>policy({participant_email,mode:"latest_reachable",reason:"Invalid account"}),/active token/);
  }
  assert.throws(()=>policy({mode:"unknown",reason:"Invalid mode"}),/Unsupported/);
  assert.throws(()=>policy({mode:"latest_reachable",reason:""}),/Approval reason/);
  assert.equal(policy({}).code_version_policy,null);
  assert.equal(audit().length,0);
});

test("approval is append-only, token-hashed and isolated to the participant",() => {
  const result = policy({participant_email:"  1035603730@QQ.COM  ",mode:"latest_reachable",reason:"Explicit code-only authorization"});
  assert.equal(result.code_version_policy.mode,"latest_reachable");
  assert.equal(result.code_version_policy.approved_by,admin.email);
  assert(Number.isFinite(Date.parse(result.code_version_policy.approved_at)));
  assert.equal(audit().length,1);
  assert.equal(audit()[0].token_hash,crypto.createHash("sha256").update("participant-luxi").digest("hex"));
  assert(!JSON.stringify(audit()).includes("participant-luxi"));
  const beforeRead = JSON.stringify(sheet("ReviewCodePolicies").cells);
  assert.equal(policy({}).code_version_policy.mode,"latest_reachable");
  assert.equal(JSON.stringify(sheet("ReviewCodePolicies").cells),beforeRead);
  assert.equal(job(luxi).code_version_policy.mode,"latest_reachable");
  assert.equal(job(luxi).version_cutoff_at,originalLuxi.version_cutoff_at);
  assert.equal(job(luxi).hf_check_context,originalLuxi.hf_check_context);
  assert.equal(job(luxi).version_generation,originalLuxi.version_generation);
  assert.equal(JSON.stringify(job(normal)),originalNormal);
  assert.equal(JSON.stringify([sheet("Submissions").cells,sheet("Evaluations").cells]),originalIntake);
});

const selection = {revision:"d".repeat(40),authored_at:"2030-01-01T00:00:00Z",
  committed_at:"2031-01-01T00:00:00Z",cutoff_at:originalLuxi.version_cutoff_at,policy:"latest_reachable"};
const prepare = (email,selected=selection) => {
  const current = job(email);
  return call("reviewPrepareCode_",{...credentials,evaluation_id:current.evaluation_id,
    bundle_url:"https://github.com/ZhaoRunyi/RoboSynChallenge_eval/tree/"+current.evaluation_id,
    bundle_commit:"b".repeat(40),participant_commit:selected.revision,private_base_commit:"c".repeat(40),
    policy_dirs:["policy/test"],selection:selected,context_json:current.hf_check_context});
};
const report = {code:selection,hf:Object.fromEntries(tasks.map(task => [task,{url:links[task],
  revision:"e".repeat(40),accessible:true,files_checked:1,committed_at:"2026-10-10T00:00:00Z",cutoff_at:selection.cutoff_at}]))};
const version = (email,selected=report) => call("reviewVersionCheck_",{...credentials,
  evaluation_id:job(email).evaluation_id,status:"final",report:selected,context_json:job(email).hf_check_context});
const reconcile = selected => call("reviewReconcileFinalProgress_",{...credentials,
  evaluation_id:"eval_luxi",report:selected,context_json:job(luxi).hf_check_context});

test("future code requires approval and exact policy marker at preparation",() => {
  assert.throws(()=>prepare(normal),/metadata|version/);
  for (const marker of [undefined,"deadline","unknown",{},[]]) {
    assert.throws(()=>prepare(luxi,{...selection,policy:marker}),/metadata|version/);
  }
  for (const field of ["authored_at","committed_at"]) {
    for (const invalid of ["not-a-date","",null]) {
      assert.throws(()=>prepare(luxi,{...selection,[field]:invalid}),/metadata|version/);
    }
  }
  assert.equal(prepare(luxi).ok,true);
  assert.equal(JSON.stringify(job(luxi).code_selection),JSON.stringify(selection));
});

test("version reports retain actual future Git timestamps only for approved code",() => {
  assert.throws(()=>version(normal),/timestamps/);
  assert.throws(()=>version(luxi,{...report,code:{...selection,policy:"deadline"}}),/timestamps/);
  assert.throws(()=>version(luxi,{...report,code:{...selection,authored_at:"invalid"}}),/timestamps/);
  assert.equal(version(luxi).ok,true);
  assert.equal(JSON.stringify(job(luxi).version_report.code),JSON.stringify(selection));
});

test("HF at or after cutoff is rejected by version and reconciliation validators",() => {
  for (const committed_at of [selection.cutoff_at,"2035-01-01T00:00:00Z"]) {
    const late = {...report,hf:{...report.hf,[tasks[0]]:{...report.hf[tasks[0]],committed_at}}};
    assert.throws(()=>version(luxi,late),/timestamps/);
    assert.throws(()=>reconcile(late),/timestamps|receipts/);
  }
});

test("final reconciliation permits marked future code without resetting unchanged progress",() => {
  const old = call("reviewRows_","ReviewVersionChecks").find(row=>row.evaluation_id==="eval_luxi");
  vm.runInContext('reviewWrite_("ReviewVersionChecks",'+old._rowNumber+','+
    JSON.stringify({evaluation_id:"eval_luxi",status:"provisional",report_json:JSON.stringify(report)})+')',context);
  const before = JSON.stringify(call("reviewWorkflow_","eval_luxi"));
  assert.throws(()=>reconcile({...report,code:{...selection,policy:undefined}}),/timestamps/);
  assert.throws(()=>reconcile({...report,code:{...selection,committed_at:"invalid"}}),/timestamps/);
  const result = reconcile(report);
  assert.equal(result.state,"unchanged");
  assert.equal(result.reset,false);
  assert.equal(JSON.stringify(call("reviewWorkflow_","eval_luxi")),before);
  assert.equal(job(luxi).version_status,"final");
});

test("revocation appends audit history and hides stale latest-code receipts",() => {
  const approvedRow = JSON.stringify(audit()[0]);
  assert.equal(policy({mode:"deadline",reason:"Revoke code-only exception"}).code_version_policy,null);
  assert.equal(audit().length,2);
  assert.equal(JSON.stringify(audit()[0]),approvedRow);
  assert.equal(job(luxi).code_version_policy,null);
  assert.equal(job(luxi).code_bundle_commit,"");
  assert.throws(()=>prepare(luxi),/metadata|version/);
  assert.throws(()=>version(luxi),/timestamps/);
  const unmarked = {...selection};delete unmarked.policy;
  assert.throws(()=>prepare(luxi,unmarked),/metadata|version/);
  assert.throws(()=>prepare(luxi,{...selection,policy:"unknown"}),/metadata|version/);
  assert.equal(JSON.stringify(job(normal)),originalNormal);
});

test("token rotation invalidates approval until explicitly reapproved",() => {
  policy({mode:"latest_reachable",reason:"Approve again"});
  const headers = sheet("Users").cells[0];
  const row = sheet("Users").cells.find(cells=>cells[headers.indexOf("email")]===luxi);
  row[headers.indexOf("token")] = "participant-luxi-rotated";
  assert.equal(policy({}).code_version_policy,null);
  assert.equal(job(luxi).code_version_policy,null);
  assert.equal(job(luxi).code_bundle_commit,"");
  assert.throws(()=>prepare(luxi),/metadata|version/);
  policy({mode:"latest_reachable",reason:"Approve current token"});
  assert.equal(audit().length,4);
  assert.equal(audit().at(-1).token_hash,crypto.createHash("sha256").update("participant-luxi-rotated").digest("hex"));
  assert.equal(job(luxi).code_version_policy.mode,"latest_reachable");
  assert.equal(prepare(luxi).ok,true);
});

test("approval without a submission does not synthesize intake or an evaluation",() => {
  insert("Users",{email:"no-request@example.com",token:"standalone",token_status:"active"});
  const before = JSON.stringify([sheet("Submissions").cells,sheet("Evaluations").cells,sheet("ReviewRuns").cells]);
  assert.equal(policy({participant_email:"no-request@example.com",mode:"latest_reachable",reason:"Future eligible preparation"}).ok,true);
  assert.equal(jobs().length,2);
  assert.equal(JSON.stringify([sheet("Submissions").cells,sheet("Evaluations").cells,sheet("ReviewRuns").cells]),before);
  assert.equal(JSON.stringify(job(normal)),originalNormal);
});

test("unapproved code still requires both dates strictly before the cutoff",() => {
  const selected = {...selection,authored_at:"2026-10-10T00:00:00Z",committed_at:"2026-10-11T00:00:00Z"};
  delete selected.policy;
  for (const field of ["authored_at","committed_at"]) {
    assert.throws(()=>prepare(normal,{...selected,[field]:selection.cutoff_at}),/metadata|version/);
    assert.throws(()=>version(normal,{...report,code:{...selected,[field]:selection.cutoff_at}}),/timestamps/);
  }
  assert.equal(prepare(normal,selected).ok,true);
  assert.equal(version(normal,{...report,code:selected}).ok,true);
  assert.equal(job(normal).code_version_policy,null);
  assert.equal(JSON.stringify(job(normal).code_selection),JSON.stringify(selected));
});
console.log("Code version policy: "+count+" focused backend scenarios passed (offline, no email).");
`;
vm.runInNewContext(harness + scenario, {require,console,__dirname}, {filename:__filename});
