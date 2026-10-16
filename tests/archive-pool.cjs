const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname,"reviewer-backend.cjs"),"utf8");
const boundary = 'insert("Users", { email: "one@example.com"';
if (!source.includes(boundary)) throw new Error("Harness changed");
const scenario = `
vm.runInContext(fs.readFileSync(path.join(base,"ArchivePool.gs"),"utf8"),context);
const admin=vm.runInContext('provisionReviewer("admin@example.com","admin")',context);
const evaluator=vm.runInContext('provisionReviewer("one@example.com","evaluator")',context);
const outsider=vm.runInContext('provisionReviewer("other@example.com","evaluator")',context);
const supervisor=vm.runInContext('provisionReviewer("supervisor@example.com","supervisor")',context);
const credentials={reviewer_email:admin.email,reviewer_token:admin.token};
const as=user=>({reviewer_email:user.email,reviewer_token:user.token});
const invoke=(action,fields={},user=admin)=>vm.runInContext("handleReviewerAction_("+JSON.stringify(action)+","+JSON.stringify({...as(user),...fields})+")",context);
const identity={evaluation_id:"eval_abc",task:"click_bell"};
const record={evaluation_id:"eval_abc",task:"click_bell",artifacts:{sha256:"a".repeat(64),url:"https://source.example/original"}};
const recordHash=call("archiveRecordHash_",record);
insert("ReviewRuns",{evaluation_id:"eval_abc",submission_id:"sub_abc",reviewer_email:evaluator.email});
insert("ReviewTaskResults",{...identity,status:"checked",result_json:JSON.stringify(record)});
insert("ReviewArchiveUploads",{...identity,status:"completed",upload_id:"arc_abc",expected_sha256:record.artifacts.sha256,size:100,record_hash:recordHash});
properties.ARCHIVE_MS_DRIVE_ID="source";properties.ARCHIVE_MS_ROOT_ITEM_ID="root";
properties["ARCHIVE_POOL_onedrive-02"]=JSON.stringify({drive_id:"dest",root_item_id:"target"});
properties.ARCHIVE_POOL_SLOTS=JSON.stringify(["onedrive-02"]);
context.graphCalls=[];context.changedSource=false;context.changedTarget=false;
context.destinationUnavailable=false;context.badManifest=false;
context.registeredRecord=record;
vm.runInContext('archivePoolGraph_ = (slot,p,method,body,headers) => { graphCalls.push({slot,path:p,method:method||"get",headers}); '+
 'if(slot!=="ingress") { if(destinationUnavailable) throw new Error("Destination unavailable"); if(p.includes("?$select=id")) return {id:"folder"}; '+
 'if(p.endsWith("/content")) return badManifest?{}:registeredRecord; '+
 'if(p.endsWith("/json")) return {id:"json",file:{},eTag:"json-tag",parentReference:{id:"folder"}}; '+
 'return {id:"zip",file:{},size:100,eTag:changedTarget?"new-tag":"zip-tag",parentReference:{id:"folder"},"@microsoft.graph.downloadUrl":"https://download.example/signed"}; } '+
 'if(p.endsWith("permanentDelete")) return null; return {id:"source-zip",file:{},size:100,eTag:changedSource?"changed":"source-tag","@microsoft.graph.downloadUrl":"https://source.example/signed"}; };',context);
const publish={...identity,upload_id:"arc_abc",record_hash:recordHash,verified_sha256:record.artifacts.sha256,slot:"onedrive-02",zip_item_id:"zip",zip_etag:"zip-tag",json_item_id:"json",json_etag:"json-tag",source_zip_id:"source-zip",source_etag:"source-tag"};
const resolve={...identity,sha256:record.artifacts.sha256};
const cleanup={...resolve,upload_id:"arc_abc"};
let passed=0;const test=(name,fn)=>{fn();passed++;console.log("PASS "+name);};
test("storage mutations require organizer credentials and reject clone capabilities",()=>{
 assert.throws(()=>invoke("reviewer_archive_pool_queue",{},evaluator),/Organizer/);
 assert.throws(()=>invoke("reviewer_archive_pool_queue",{upload_token:"upl_bad"}),/Clone/);
});
test("only completed registered matching uploads enter the queue",()=>{
 assert.equal(invoke("reviewer_archive_pool_queue").items.length,1);
});
`;
const tests = scenario + `
test("read-only evidence resolution works for assigned and all-request viewers",()=>{
 assert.equal(invoke("reviewer_resolve_evidence",resolve,evaluator).storage,"ingress");
 assert.equal(invoke("reviewer_resolve_evidence",resolve,supervisor).storage,"ingress");
 assert.throws(()=>invoke("reviewer_resolve_evidence",resolve,outsider),/not assigned/);
});
test("publication checks immutable identity, hash and exact destination manifest",()=>{
 assert.throws(()=>invoke("reviewer_archive_pool_publish",{...publish,upload_id:"old"}),/changed/);
 assert.throws(()=>invoke("reviewer_archive_pool_publish",{...publish,verified_sha256:"b".repeat(64)}),/changed/);
 context.badManifest=true;assert.throws(()=>invoke("reviewer_archive_pool_publish",publish),/manifest/);context.badManifest=false;
 context.changedTarget=true;assert.throws(()=>invoke("reviewer_archive_pool_publish",publish),/identity/);context.changedTarget=false;
 assert.equal(invoke("reviewer_archive_pool_publish",publish).location.status,"ready");
 assert.equal(invoke("reviewer_archive_pool_publish",publish).duplicate,true);
 assert.equal(call("reviewRows_","ReviewArchiveLocations").length,1);
 assert.equal(invoke("reviewer_resolve_evidence",resolve,evaluator).storage,"onedrive-02");
});
test("source cleanup fails closed until separately approved",()=>{
 assert.throws(()=>invoke("reviewer_archive_pool_cleanup",cleanup),/approval/);
 assert(!context.graphCalls.some(row=>row.path.endsWith("permanentDelete")));
 invoke("reviewer_archive_pool_enable_cleanup",{enabled:true,reason:"Explicit test approval"});
});
test("changed targets, unavailable destinations and changed sources prevent deletion",()=>{
 context.changedTarget=true;assert.throws(()=>invoke("reviewer_archive_pool_cleanup",cleanup),/identity/);context.changedTarget=false;
 context.destinationUnavailable=true;assert.throws(()=>invoke("reviewer_archive_pool_cleanup",cleanup),/unavailable/);context.destinationUnavailable=false;
 context.changedSource=true;assert.throws(()=>invoke("reviewer_archive_pool_cleanup",cleanup),/not deleted/);context.changedSource=false;
 assert(!context.graphCalls.some(row=>row.path.endsWith("permanentDelete")));
});
test("current verified source alone is deleted and original records stay unchanged",()=>{
 const before=JSON.stringify(sheet("ReviewTaskResults").cells);
 assert.equal(invoke("reviewer_archive_pool_cleanup",cleanup).source_removed,true);
 const deletes=context.graphCalls.filter(row=>row.path.endsWith("permanentDelete"));
 assert.equal(deletes.length,1);assert.equal(deletes[0].path,"/drives/source/items/source-zip/permanentDelete");
 assert.equal(deletes[0].headers["If-Match"],"source-tag");
 assert.equal(invoke("reviewer_archive_pool_cleanup",cleanup).duplicate,true);
 assert.equal(JSON.stringify(sheet("ReviewTaskResults").cells),before);
 assert.equal(invoke("reviewer_resolve_evidence",resolve,supervisor).storage,"onedrive-02");
});
test("a new upload/result cannot reuse the old source-cleanup authorization",()=>{
 const rows=call("reviewRows_","ReviewArchiveUploads");
 vm.runInContext('reviewWrite_("ReviewArchiveUploads",'+rows[0]._rowNumber+', {evaluation_id:"eval_abc",status:"uploading"})',context);
 assert.equal(invoke("reviewer_archive_pool_queue").items.length,0);
 assert.throws(()=>invoke("reviewer_archive_pool_cleanup",cleanup),/completely registered/);
});
console.log("Archive pool: "+passed+" backend scenarios passed (offline).");
`;
eval(source.split(boundary)[0] + tests);
