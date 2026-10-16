const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname,"reviewer-backend.cjs"),"utf8");
const boundary = 'insert("Users", { email: "one@example.com"';
if (!source.includes(boundary)) throw new Error("Harness changed");
eval(source.split(boundary)[0] + `
const admin = vm.runInContext('provisionReviewer("admin@example.com","admin")',context);
const credentials = {reviewer_email:admin.email,reviewer_token:admin.token};
insert("Users",{email:"team@example.com",team_name:"Team"});
insert("Submissions",{evaluation_id:"eval_abc",submission_id:"sub_abc",email:"team@example.com"});
insert("Evaluations",{evaluation_id:"eval_abc",submission_id:"sub_abc",email:"team@example.com"});
insert("ReviewRuns",{evaluation_id:"eval_abc",submission_id:"sub_abc",reviewer_email:admin.email,bundle_commit:"a".repeat(40)});
context.currentJob={evaluation_id:"eval_abc",bundle_commit:"a".repeat(40)};
vm.runInContext('reviewQueue_=()=>({jobs:[currentJob]});reviewCheckpointContext_=()=>"context";reviewJob_=()=>({evaluation:{evaluation_id:"eval_abc"},submission:{submission_id:"sub_abc"}});',context);
const fields={...credentials,evaluation_id:"eval_abc",preparation_operation:"b".repeat(64),expected_bundle_commit:"a".repeat(40),context_json:"context"};
// Backend action dispatcher takes two arguments, so call directly through the VM.
const action=(name,payload=fields)=>vm.runInContext('handleReviewerAction_('+JSON.stringify(name)+','+JSON.stringify(payload)+')',context);
const workflow={stages:Array.from({length:5},()=>({done:false,checks:{}}))};
workflow.stages[3].done=true;
vm.runInContext('reviewStoreWorkflow_({evaluation_id:"eval_abc"},'+JSON.stringify(workflow)+')',context);
call("reviewRows_","ReviewAdjudications");
const before=JSON.stringify([...sheets].map(([key,value])=>[key,value.cells]));
assert.throws(()=>action("reviewer_claim_preparation"),/frozen/);
for(const name of ["reviewer_migrate_bundle","reviewer_upgrade_tools","reviewer_reconcile_final_progress"]) assert.throws(()=>action(name),/frozen/);
assert.equal(JSON.stringify([...sheets].map(([key,value])=>[key,value.cells])),before);
assert.throws(()=>call("reviewResetParticipantProgress_",{evaluation_id:"eval_abc"}),/frozen/);
vm.runInContext('requireReviewResponse_=()=>({correction:{_rowNumber:2},run:{evaluation_id:"eval_abc"},link:{status:"pending"}});',context);
assert.throws(()=>call("handleReviewResponseSubmit_",{response_kind:"correct",notes:"A correction"}),/frozen/);
assert.equal(JSON.stringify([...sheets].map(([key,value])=>[key,value.cells])),before,"Correction must fail before writing any corrected inputs");
workflow.stages[3].done=false;
vm.runInContext('reviewStoreWorkflow_({evaluation_id:"eval_abc"},'+JSON.stringify(workflow)+')',context);
assert.equal(action("reviewer_claim_preparation").claimed,true);
assert.equal(action("reviewer_claim_preparation").claimed,true);
assert.throws(()=>action("reviewer_claim_preparation",{...fields,preparation_operation:"c".repeat(64)}),/in progress/);
assert.throws(()=>action("reviewer_release_preparation",{...fields,preparation_operation:"c".repeat(64)}),/Another publisher/);
assert.throws(()=>action("reviewer_complete_stage",{...credentials,evaluation_id:"eval_abc",stage:3}),/previous stages/);
workflow.stages.slice(0,3).forEach(stage=>stage.done=true);
vm.runInContext('reviewStoreWorkflow_({evaluation_id:"eval_abc"},'+JSON.stringify(workflow)+')',context);
assert.throws(()=>action("reviewer_complete_stage",{...credentials,evaluation_id:"eval_abc",stage:3}),/in progress/);
assert.equal(action("reviewer_release_preparation").released,true);
assert.equal(call("reviewPreparationClaim_","eval_abc"),null);
// Handoff is itself sufficient protection, even before an upload reaches the backend.
workflow.stages[3].done=false;
vm.runInContext('reviewStoreWorkflow_({evaluation_id:"eval_abc"},'+JSON.stringify(workflow)+')',context);
assert.throws(()=>action("reviewer_claim_preparation"),/has started/);
assert.throws(()=>action("reviewer_migrate_bundle"),/has started/);
assert.throws(()=>action("reviewer_upgrade_tools"),/has started/);
workflow.stages.slice(1).forEach(stage=>stage.done=false);
vm.runInContext('reviewStoreWorkflow_({evaluation_id:"eval_abc"},'+JSON.stringify(workflow)+')',context);
for (const [table,row] of [["ReviewTaskResults",{task:"click_bell",status:"submitted"}],
    ["ReviewArchiveUploads",{task:"click_bell",status:"uploading"}],
    ["ReviewTaskCommands",{task:"click_bell",command:"bash policy/team/eval.sh"}]]) {
  insert(table,{evaluation_id:"eval_abc",...row});
  const saved=JSON.stringify([...sheets].map(([key,value])=>[key,value.cells]));
  assert.throws(()=>action("reviewer_claim_preparation"),/has started/);
  assert.equal(JSON.stringify([...sheets].map(([key,value])=>[key,value.cells])),saved);
  sheet(table).cells.splice(1);
}
assert.equal(action("reviewer_claim_preparation").claimed,true);
assert.throws(()=>action("reviewer_complete_stage",{...credentials,evaluation_id:"eval_abc",stage:1}),/in progress/);
assert.equal(action("reviewer_release_preparation").released,true);
console.log("PASS completed and partial snapshots are preserved; publication claims fence concurrent handoff/completion and retain ownership");
`);
