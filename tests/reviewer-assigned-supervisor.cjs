const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Reuse the Sheet/Apps Script harness without running unrelated intake scenarios.
const harness = fs.readFileSync(path.join(__dirname, "reviewer-backend.cjs"), "utf8")
  .split('insert("Users", { email: "one@example.com"')[0];
const scenario = `
const admin = vm.runInContext('provisionReviewer("admin@example.com", "admin")', context);
const owner = vm.runInContext('provisionReviewer("owner@example.com", "evaluator")', context);
const second = vm.runInContext('provisionReviewer("second@example.com", "evaluator")', context);
const supervisor = vm.runInContext('provisionReviewer("1070055979@qq.com", "supervisor")', context);
const ordinarySupervisor = vm.runInContext('provisionReviewer("other-supervisor@example.com", "supervisor")', context);
const credentials = {reviewer_email:admin.email,reviewer_token:admin.token};
const own = {reviewer_email:supervisor.email,reviewer_token:supervisor.token};
const dispatch = (action,payload) => vm.runInContext(
  'handleReviewerAction_('+JSON.stringify(action)+','+JSON.stringify(payload)+')', context);
let sent = 0;
context.GmailApp = {sendEmail(){sent += 1;}};
context.MailApp = context.GmailApp;
for (const id of ["eval_owned", "eval_other"]) {
  const email = id+"@example.com";
  insert("Users", {email,team_name:id,token_status:"active"});
  insert("Submissions", {submission_id:"sub_"+id,evaluation_id:id,email,is_ranked:"true",created_at:"2026-10-11T10:00:00Z"});
  insert("Evaluations", {submission_id:"sub_"+id,evaluation_id:id,email});
  call("reviewEnsureRun_", {...credentials,evaluation_id:id});
  call("reviewAssign_", {...credentials,evaluation_id:id,assign_to:owner.email});
}
const before = JSON.stringify([...sheets.entries()].map(([name,s])=>[name,s.cells]));
assert.throws(()=>dispatch("reviewer_save_checks", {...own,evaluation_id:"eval_owned",stage:0,checks:{}}),/Non-recording account/);
assert.equal(JSON.stringify([...sheets.entries()].map(([name,s])=>[name,s.cells])),before);
assert.throws(()=>call("reviewReassign_", {...credentials,evaluation_id:"eval_owned",assign_to:ordinarySupervisor.email,reason:"Not allowed"}),/non-assigned/);
call("reviewReassign_", {...credentials,evaluation_id:"eval_owned",assign_to:supervisor.email,reason:"Explicit single formal assignment"});
assert.equal(dispatch("reviewer_queue",own).jobs.length,2,"Global visibility is preserved");
const otherBefore = JSON.stringify(call("reviewWorkflow_","eval_other"));
assert.equal(dispatch("reviewer_save_checks", {...own,evaluation_id:"eval_owned",stage:0,checks:{checkpoint_access:true}}).ok,true);
assert.equal(call("reviewWorkflow_","eval_owned").stages[0].checks.checkpoint_access,true);
for (const action of ["reviewer_save_checks","reviewer_complete_stage","reviewer_send_issue","reviewer_retry_preparation","reviewer_save_command"]) {
  assert.throws(()=>dispatch(action,{...own,evaluation_id:"eval_other",stage:0,checks:{}}),/Non-recording account/);
}
assert.throws(()=>call("reviewOwnedRun_",{...own,evaluation_id:"eval_other"}),/Non-recording account/);
assert.throws(()=>dispatch("reviewer_assign",{...own,evaluation_id:"eval_owned"}),/organizer/i);
assert.equal(JSON.stringify(call("reviewWorkflow_","eval_other")),otherBefore);
call("reviewSetPool_",{...credentials,enabled:true,minimum_evaluators:2});
call("reviewBalancePool_",credentials);
assert.equal(call("reviewQueue_",credentials).jobs.find(j=>j.evaluation_id==="eval_owned").reviewer_email,supervisor.email);
const account = call("reviewPool_",credentials).accounts.find(a=>a.email===supervisor.email);
assert.equal(account.assigned,1);
assert.equal(account.in_pool,false);
assert.equal(sent,0,"Reassignment and permission checks send no email");
console.log("Assigned supervisor: all-request visibility, one-request recording, other-request rejection and pool exclusion passed.");
`;
vm.runInNewContext(harness + scenario, {require,console,__dirname}, {filename:__filename});
