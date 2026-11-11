/** Public real-finals control plane. Isolated from all preliminary records. */
const FC_PLATFORMS = ["platform_1", "platform_2", "platform_3"];
const FC_SETTINGS = ["base", "highlight", "blue_cloth", "patterned_cloth", "distractors"];
const FC_VARIANTS = {click_bell:"pink_bell", drawer_open_place:"drawer_swap", table_rearrangement:"plate_color", items_handover:"pen_color", water_pouring:"cup_color"};
let fcCache_ = null;

function fcRows_() {
  SHEETS.FinalsControl = ["key", "value_json", "updated_at"];
  if (!fcCache_) fcCache_ = rows_("FinalsControl");
  return fcCache_;
}
function fcGet_(key, fallback) {
  const row = fcRows_().find(r=>r.key===key);
  return row ? JSON.parse(row.value_json) : fallback;
}
function fcList_(prefix) { return fcRows_().filter(r=>r.key.startsWith(prefix)).map(r=>JSON.parse(r.value_json)); }
function fcPut_(key, value) {
  const encoded = JSON.stringify(value);
  if (encoded.length > 46000) throw new Error("Control record exceeds the storage limit.");
  const row = fcRows_().find(r=>r.key===key), values = {key, value_json:encoded, updated_at:now_()};
  if (row) { updateRow_("FinalsControl", row._rowNumber, values); Object.assign(row,values); }
  else { appendRow_("FinalsControl", values); fcCache_=null; }
  return value;
}
function fcCanonical_(value) {
  if (Array.isArray(value)) return "["+value.map(fcCanonical_).join(",")+"]";
  if (value && typeof value==="object") return "{"+Object.keys(value).sort().map(k=>fcCanonical_(k)+":"+fcCanonical_(value[k])).join(",")+"}";
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g,c=>"\\u"+c.charCodeAt(0).toString(16).padStart(4,"0"));
}
function fcHex_(bytes) { return bytes.map(v=>(v & 255).toString(16).padStart(2,"0")).join(""); }
function fcSame_(a,b) { return fcCanonical_(a)===fcCanonical_(b); }
function fcCheck_(condition, message) { if (!condition) throw new Error(message); }
function fcHash_(value) { return reviewerHash_(fcCanonical_(value)); }
function fcAudit_(actor, event, detail) {
  SHEETS.FinalsEvents = ["event_id", "actor", "event", "detail_json", "created_at"];
  appendRow_("FinalsEvents",{event_id:id_("realevent"),actor,event,detail_json:JSON.stringify(detail),created_at:now_()});
}
function fcRequest_(id) {
  const row = finalsRows_().find(r=>r.request_id===id);
  fcCheck_(row,"Unknown finals request.");
  return row;
}
function fcPrepared_(id) {
  const fixture=fcGet_("fixture:"+id,null);
  if (fixture && (fcRequest_(id).is_test===true || fcRequest_(id).is_test==="true")) return fixture;
  SHEETS.FinalsPreparations=["preparation_id","request_id","status","bundle_sha","manifest_sha256","note","created_at"];
  return rows_("FinalsPreparations").filter(r=>r.request_id===id && r.status==="prepared").slice(-1)[0] || null;
}
function fcMeta_(id) { return fcGet_("review:"+id,{request_id:id,owner:"",submission_checked:false,platform_checks:{},accepted:{}}); }
function fcMayReview_(who,id,write) {
  fcRequest_(id);
  if (!write && ["admin","observer","supervisor"].includes(who.role)) return;
  fcCheck_(who.role==="admin" || (who.role==="evaluator" && fcMeta_(id).owner===who.email),"This request is not assigned to you.");
}
function fcNotify_(key, subject, text, email) {
  if (fcGet_("mail:"+key,null)) return;
  fcPut_("mail:"+key,{id:key,to:email || "robosynchallenge@gmail.com",subject,text,status:"pending",created_at:now_()});
}
function fcStages_(id) {
  const meta=fcMeta_(id),prepared=fcPrepared_(id),jobs=fcList_("runtime:"+id+":"),assignments=fcList_("assignment:"+id+":"),attempts=fcList_("attempt:").filter(a=>a.request_id===id && a.status!=="deleted");
  const collected=attempts.filter(a=>["success","failure"].includes(a.status) && a.outbox.operation==="complete").length;
  const steps=[Boolean(prepared && meta.submission_checked),jobs.filter(j=>j.status==="ready").length===10,
    assignments.length===10 && assignments.every(a=>meta.platform_checks[a.platform]===true),collected===200,
    FINALS_TASKS.every(t=>meta.accepted[t]===true) && collected===200];
  return {steps,completed:steps.filter(Boolean).length,collected,total:200,ready:jobs.filter(j=>j.status==="ready").length};
}
function fcOverview_(who) {
  const roster=JSON.parse(config_("FINALS_ROSTER_JSON","[]")).concat(JSON.parse(config_("FINALS_TEST_ROSTER_JSON","[]"))),latest={};
  finalsRows_().forEach(r=>{if(!latest[r.team_id] || Number(r.revision)>Number(latest[r.team_id].revision)) latest[r.team_id]=r;});
  const requests=Object.values(latest).filter(r=>["admin","observer","supervisor"].includes(who.role) || fcMeta_(r.request_id).owner===who.email).map(r=>({
    ...finalsPublic_(r),team_name:(roster.find(t=>t.team_id===r.team_id)||{}).team_name||r.team_id,
    email:r.email,review:fcMeta_(r.request_id),progress:fcStages_(r.request_id),preparation:fcPrepared_(r.request_id),
    runtimes:fcList_("runtime:"+r.request_id+":"),assignments:fcList_("assignment:"+r.request_id+":"),
    attempts:fcList_("attempt:").filter(a=>a.request_id===r.request_id).map(a=>({id:a.id,task:a.task,slot:a.slot,status:a.status,reviewer:a.reviewer,uploaded:a.outbox.operation==="complete",reason:a.reason||""})),
    messages:fcList_("mail:").filter(m=>m.request_id===r.request_id).map(m=>({id:m.id,subject:m.subject,text:m.text,to:m.to,status:m.status,sent_at:m.sent_at||null}))
  }));
  // Endpoints and platform credentials are deliberately absent from browser responses.
  return {ok:true,viewer:{email:who.email,role:who.role},requests,platforms:FC_PLATFORMS.map(p=>({platform:p,enrolled:Boolean(fcGet_("platform:"+p,null)),part_registered:Boolean(fcGet_("part:"+p,null))})),worker:fcGet_("worker:runtime",null),
    reviewers:who.role==="admin" ? reviewRows_("Reviewers").filter(r=>String(r.active)==="true" && ["admin","evaluator"].includes(r.role)).map(r=>({email:r.email,role:r.role})):[]};
}
function fcAssignment_(who,body) {
  const a=fcGet_("assignment:"+body.request_id+":"+body.task,null);
  fcCheck_(a && (who.role==="admin" || a.platform===who.platform),"Assignment not accessible.");
  return a;
}
function fcReference_(a,slot) {
  const part=fcGet_("part:"+a.platform,null);
  return part ? part.tasks[a.task].find(r=>r.seed===slot.seed) || null : null;
}
function fcCards_(who) {
  const attempts=fcList_("attempt:");
  return fcList_("assignment:").filter(a=>who.role==="admin" || a.platform===who.platform).flatMap(a=>a.plan.map(s=>{
    const attempt=attempts.find(x=>x.request_id===a.request_id && x.task===a.task && x.slot===s.slot && x.status!=="deleted");
    const runtime=fcGet_("runtime:"+a.request_id+":"+a.task,null);
    return {...s,request_id:a.request_id,platform:a.platform,bundle_sha:a.bundle_sha,plan_sha:a.plan_sha,status:attempt?attempt.status:"pending",attempt_id:attempt?attempt.id:null,reference:fcReference_(a,s),endpoint_ready:runtime && runtime.status==="ready",endpoint_generation:runtime?runtime.generation:null};
  })).sort((a,b)=>a.task.localeCompare(b.task) || FC_SETTINGS.indexOf(a.setting)-FC_SETTINGS.indexOf(b.setting) || a.slot-b.slot || a.request_id.localeCompare(b.request_id));
}
function fcPlatform_(payload) {
  const platform=payload.platform,record=fcGet_("platform:"+platform,null);
  fcCheck_(record && record.active && typeof payload.platform_token==="string" && reviewerHash_(payload.platform_token)===record.token_hash,"Platform authentication failed.");
  // Revoking a reviewer also revokes the corresponding local platform access.
  const reviewer=reviewRows_("Reviewers").find(r=>r.email===record.reviewer && String(r.active)==="true");
  fcCheck_(reviewer,"Platform reviewer is no longer active.");
  return {role:"operator",platform,email:record.reviewer,name:record.reviewer};
}
function fcRuntimeKey_(body) {
  fcCheck_(FINALS_TASKS.includes(body.task),"Unknown task."); fcRequest_(body.request_id);
  return "runtime:"+body.request_id+":"+body.task;
}
function fcRecipe_(body) {
  const recipe=body.recipe;
  fcCheck_(recipe && typeof recipe==="object" && !Array.isArray(recipe),"A reviewed runtime recipe is required.");
  fcCheck_(/^policy\/[A-Za-z0-9_]+$/.test(recipe.policy_path),"Invalid policy module.");
  fcCheck_(recipe.args && typeof recipe.args==="object" && !Array.isArray(recipe.args),"Structured model arguments required.");
  fcCheck_(Array.isArray(recipe.install) && recipe.install.length<=20 && recipe.install.every(cmd=>Array.isArray(cmd) && cmd.length>0 && cmd.every(v=>typeof v==="string" && v.length<4000)),"Install commands must be argument arrays.");
  fcCheck_(typeof recipe.instruction==="string" && recipe.instruction.length<4000,"Task instruction required.");
  fcCheck_(/^[A-Za-z0-9._:/-]+@sha256:[a-f0-9]{64}$/.test(recipe.image),"Pin the container image digest.");
  return recipe;
}
function fcRegisterPart_(platform,part,index) {
  fcCheck_(FC_PLATFORMS.indexOf(platform)+1===part,"Part must match platform.");
  fcCheck_(index && /^[a-f0-9]{64}$/.test(index.manifest_sha256),"Verified manifest hash required.");
  fcCheck_(fcSame_(Object.keys(index.tasks).sort(),FINALS_TASKS.slice().sort()),"All ten task references required.");
  FINALS_TASKS.forEach(t=>{
    const rs=index.tasks[t];fcCheck_(rs.length===20 && new Set(rs.map(r=>r.seed)).size===20,"Twenty unique seeds required.");
    rs.forEach(r=>{fcCheck_(Number.isSafeInteger(r.seed) && r.seed>=0 && /^[a-f0-9]{64}$/.test(r.sha256),"Invalid seed or image hash.");finalsPath_(r.image,"Reference path");});
  });
  const old=fcGet_("part:"+platform,null);fcCheck_(!old || fcSame_(old,index),"Reference part is immutable.");
  fcPut_("part:"+platform,index);return {registered:true};
}
function fcAdmin_(who,action,b) {
  fcCheck_(who.role==="admin","Organizer access required.");
  if (action==="software_fixture") {
    fcCheck_(!b.version || /^[a-z0-9]{1,12}$/.test(b.version),"Invalid software fixture version.");
    const identifier="real_control_software_fixture"+(b.version?"_"+b.version:"");
    if(!finalsRows_().some(r=>r.request_id===identifier)) appendRow_("FinalsRequests",{request_id:identifier,team_id:"organizer_software_fixture"+(b.version?"_"+b.version:""),email:who.email,retry_key:identifier,fingerprint:reviewerHash_(identifier),revision:1,status:"test_submitted",created_at:now_(),is_test:true,
      submission_json:JSON.stringify({method_name:"Organizer GPU software fixture",repository:"https://github.com/ZhaoRunyi/robosynchallenge_real",version_cutoff_at:config_("FINALS_DEADLINE_AT",""),checkpoints:[],dependency_notes:"Official isolated GPU fixture. No robot, participant or scores.",tasks:FINALS_TASKS.map(task=>({task,policy_path:"policy/gpu_policy",checkpoint_ids:[],no_weights_reason:"Software fixture",run_notes:"Authenticated software test only"}))})});
    return {request_id:identifier,is_test:true};
  }
  if (action==="bootstrap") {
    if (!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==="finalsControlMailTick")) ScriptApp.newTrigger("finalsControlMailTick").timeBased().everyMinutes(5).create();
    fcRows_(); return {installed:true};
  }
  if (action==="mail_test") {fcNotify_("smoke-"+finalsText_(b.key,"Test key",60),"[RoboSynChallenge] Finals control notification test","The real-finals control plane notification channel is connected. This is an organizer-only software test.");return {queued:true};}
  if (action==="mail_status") return {messages:fcList_("mail:").map(m=>({id:m.id,status:m.status,sent_at:m.sent_at||null,error_type:m.error_type||null}))};
  if (action==="enroll") {
    fcCheck_(FC_PLATFORMS.includes(b.platform),"Unknown platform.");
    fcCheck_(typeof b.token==="string" && b.token.length>=32 && /^[a-f0-9]{64}$/.test(b.signing_key_hex),"Strong platform credentials required.");
    const reviewer=reviewRows_("Reviewers").find(r=>r.email===b.reviewer && String(r.active)==="true" && ["admin","evaluator"].includes(r.role));
    fcCheck_(reviewer,"An active evaluator is required.");
    const value={platform:b.platform,reviewer:b.reviewer,token_hash:reviewerHash_(b.token),active:true};
    if(b.reference_manifest_sha256){fcCheck_(/^[a-f0-9]{64}$/.test(b.reference_manifest_sha256),"Invalid reference manifest digest.");value.reference_manifest_sha256=b.reference_manifest_sha256;}
    const old=fcGet_("platform:"+b.platform,null); fcCheck_(!old || fcSame_(old,value),"Existing enrollment cannot be silently replaced.");
    PropertiesService.getScriptProperties().setProperty("FINALS_KEY_"+b.platform,b.signing_key_hex);
    fcPut_("platform:"+b.platform,value); return {enrolled:true};
  }
  if (action==="register_part") {
    return fcRegisterPart_(b.platform,b.part,b.index);
  }
  if (action==="assign_owner") {
    fcRequest_(b.request_id);const reviewer=reviewRows_("Reviewers").find(r=>r.email===b.email && String(r.active)==="true" && ["admin","evaluator"].includes(r.role));
    fcCheck_(reviewer,"Active evaluator required.");const meta=fcMeta_(b.request_id);meta.owner=b.email;fcPut_("review:"+b.request_id,meta);return {assigned:true};
  }
  if (action==="fixture") {
    const row=fcRequest_(b.request_id);fcCheck_(row.is_test===true || row.is_test==="true","Only explicitly test-marked requests may use a fixture.");
    fcPut_("fixture:"+b.request_id,{status:"prepared",bundle_sha:finalsSha_(b.bundle_sha,"Fixture SHA"),is_test:true});return {registered:true};
  }
  if (action==="assign") {
    const prepared=fcPrepared_(b.request_id);fcCheck_(prepared && prepared.bundle_sha===b.bundle_sha,"Use the prepared immutable bundle.");
    fcCheck_(FC_PLATFORMS.includes(b.platform) && FINALS_TASKS.includes(b.task),"Invalid task/platform.");
    const part=fcGet_("part:"+b.platform,null);fcCheck_(part,"Register the platform reference part first.");
    const seeds=part.tasks[b.task].map(r=>r.seed);
    const plan=seeds.map((seed,i)=>({slot:i+1,task:b.task,seed,setting:FC_SETTINGS[Math.floor(i/4)],variant:[2,10,18].includes(i+1)?FC_VARIANTS[b.task]||null:null}));
    const value={request_id:b.request_id,task:b.task,platform:b.platform,bundle_sha:b.bundle_sha,plan,plan_sha:fcHash_(plan)};
    const key="assignment:"+b.request_id+":"+b.task,old=fcGet_(key,null);fcCheck_(!old || fcSame_(old,value),"Existing routing/seed plan is immutable.");
    fcPut_(key,value);return {assigned:true};
  }
  if (action==="runtime_queue") {
    fcPut_("worker:runtime",{last_seen:now_(),status:b.status||"online"});
    return {jobs:fcList_("runtime:").map(j=>({...j,submission:JSON.parse(fcRequest_(j.request_id).submission_json),versions:finalsVersionRows_().find(r=>r.request_id===j.request_id)||null,active_attempt:fcList_("attempt:").some(a=>a.request_id===j.request_id && a.task===j.task && a.status==="running")}))};
  }
  if (action==="runtime_cancel") {
    const key=fcRuntimeKey_(b),job=fcGet_(key,null);fcCheck_(job,"Runtime not found.");
    fcCheck_(!fcList_("attempt:").some(a=>a.request_id===b.request_id && a.task===b.task && a.status==="running"),"Close the active attempt first.");
    job.status="cancelled";job.note=finalsText_(b.reason,"Cancellation reason",2000);fcPut_(key,job);return {cancelled:true};
  }
  if (action==="runtime_approve") {
    const key=fcRuntimeKey_(b),prepared=fcPrepared_(b.request_id);fcCheck_(prepared,"Prepare code before model construction.");
    const recipe=fcRecipe_(b),submitted=JSON.parse(fcRequest_(b.request_id).submission_json).tasks.find(t=>t.task===b.task);
    fcCheck_(submitted.policy_path===recipe.policy_path,"Recipe must match the submitted policy module.");
    const old=fcGet_(key,null);fcCheck_(!old || fcSame_(old.recipe,recipe),"Runtime recipe is already pinned; do not silently change model arguments.");
    if (!old) fcPut_(key,{request_id:b.request_id,task:b.task,bundle_sha:prepared.bundle_sha,recipe,recipe_sha:fcHash_(recipe),generation:1,status:"queued",approved_by:who.email,updated_at:now_()});
    return {queued:true};
  }
  if (action==="runtime_update") {
    const key=fcRuntimeKey_(b),job=fcGet_(key,null);fcCheck_(job && job.generation===b.generation && job.recipe_sha===b.recipe_sha,"Stale runtime update.");
    fcCheck_(["building","validating","blocked","rebuilding","ready"].includes(b.status),"Invalid runtime status.");
    fcCheck_(!fcList_("attempt:").some(a=>a.request_id===b.request_id && a.task===b.task && a.status==="running"),"Active rollout prevents endpoint replacement.");
    if (b.status==="ready") {
      const e=b.endpoint,p=b.proof||{};
      fcCheck_(e && e.request_id===job.request_id && e.task===job.task && e.bundle_sha===job.bundle_sha && e.generation===job.generation,"Endpoint identity mismatch.");
      fcCheck_(/^wss:\/\/[A-Za-z0-9.:-]+\/?$/.test(e.url) && e.token.length>=32 && /^[a-f0-9]{64}$/.test(e.task_config_sha),"Authenticated TLS endpoint required.");
      fcCheck_(p.gpu==="NVIDIA GeForce RTX 5090" && p.tls===true && p.identity===true && p.infer===true && p.reset===true && p.action_shape==="1x14","GPU, TLS, reset and inference validation are all required.");
      fcPut_("endpoint:"+b.request_id+":"+b.task,e);
    }
    Object.assign(job,{status:b.status,note:String(b.note||"").slice(0,2000),cloud_id:String(b.cloud_id||job.cloud_id||""),updated_at:now_(),proof:b.status==="ready"?b.proof:job.proof||null});fcPut_(key,job);
    if (["ready","blocked"].includes(b.status)) fcNotify_(fcHash_([key,job.generation,b.status]),"[RoboSynChallenge] Finals model "+b.status,job.request_id+" / "+job.task+"\n"+job.note+"\nhttps://robosyn-bench.net/eval_backend/finals/",fcMeta_(job.request_id).owner||undefined);
    return {recorded:true};
  }
  throw new Error("Unknown finals control administration action.");
}

function fcRpc_(who,action,b) {
  if (action==="queue") return {cards:fcCards_(who)};
  if (action==="register_references") {
    const enrolled=fcGet_("platform:"+who.platform,null);
    fcCheck_(enrolled && enrolled.reference_manifest_sha256 && b.index && b.index.manifest_sha256===enrolled.reference_manifest_sha256,"Reference manifest must match organizer enrollment.");
    return fcRegisterPart_(who.platform,FC_PLATFORMS.indexOf(who.platform)+1,b.index);
  }
  const a=fcAssignment_(who,b),runtimeKey="runtime:"+b.request_id+":"+b.task;
  if(action==="diagnose") {
    const job=fcGet_(runtimeKey,null);
    return {request_id:a.request_id,task:a.task,platform:a.platform,runtime:job?{status:job.status,generation:job.generation,note:job.note||"",cloud_id:job.cloud_id||"",updated_at:job.updated_at,proof:job.proof||null}:null};
  }
  if (action==="request_rebuild") {
    const reason=finalsText_(b.reason,"Rebuild reason",2000),job=fcGet_(runtimeKey,null);fcCheck_(job,"No approved runtime recipe.");
    fcCheck_(!fcList_("attempt:").some(x=>x.request_id===b.request_id && x.task===b.task && x.status==="running"),"Close or discard the interrupted attempt before rebuilding.");
    if (!["queued","building","validating","rebuilding"].includes(job.status)) {job.generation++;job.status="rebuilding";job.note=reason;job.updated_at=now_();fcPut_(runtimeKey,job);}
    return {status:job.status,generation:job.generation};
  }
  if (action==="start") {
    fcCheck_(Number.isInteger(b.slot) && b.slot>=1 && b.slot<=20 && b.placement_confirmed===true,"Confirm a valid slot and placement.");
    fcCheck_(/^[a-f0-9]{32}$/.test(b.idempotency_key),"Persistent start ID required.");
    const slot=a.plan[b.slot-1],reference=fcReference_(a,slot);fcCheck_(reference && reference.sha256===b.reference_sha256,"Reference image mismatch.");
    const attempts=fcList_("attempt:"),old=attempts.find(x=>x.start_key===b.idempotency_key);
    if (old) {fcCheck_(old.reviewer===who.email && old.start_hash===fcHash_(b) && old.status==="running","Start receipt cannot be replayed.");return {attempt_id:old.id,endpoint:fcGet_("endpoint:"+b.request_id+":"+b.task,null),resumed_receipt:true};}
    const job=fcGet_(runtimeKey,null),meta=fcMeta_(b.request_id);fcCheck_(job && job.status==="ready" && meta.submission_checked && meta.platform_checks[a.platform],"Submission, model and platform checks must pass before starting.");
    fcCheck_(!attempts.some(x=>x.status==="running" && x.platform===a.platform),"Platform already has an active rollout.");
    fcCheck_(!attempts.some(x=>x.request_id===b.request_id && x.task===b.task && x.slot===b.slot && x.status!=="deleted"),"Slot already has a valid attempt.");
    const id=Utilities.getUuid().replace(/-/g,"");
    fcPut_("attempt:"+id,{id,request_id:b.request_id,task:b.task,slot:b.slot,platform:a.platform,reviewer:who.email,status:"running",created_at:now_(),start_key:b.idempotency_key,start_hash:fcHash_(b),outbox:{operation:"waiting",generation:1}});
    return {attempt_id:id,endpoint:fcGet_("endpoint:"+b.request_id+":"+b.task,null),resumed_receipt:false};
  }
  const attempt=fcGet_("attempt:"+b.attempt_id,null);
  fcCheck_(attempt && attempt.request_id===b.request_id && attempt.task===b.task && (who.role==="admin" || attempt.reviewer===who.email),"Attempt not accessible.");
  if (action==="attempt_state") return {attempt,outbox:attempt.outbox};
  if (action==="finish") {
    fcCheck_(typeof b.success==="boolean","Explicit outcome required.");const status=b.success?"success":"failure";
    fcCheck_(["running",status].includes(attempt.status),"Attempt is closed.");
    if(attempt.status==="running") {attempt.status=status;attempt.outbox.operation="upload";attempt.finished_at=now_();fcPut_("attempt:"+attempt.id,attempt);}
    return {status};
  }
  if (action==="discard") {
    const reason=finalsText_(b.reason,"Invalid experiment reason",2000);
    if (attempt.status!=="deleted") {attempt.status="deleted";attempt.reason=reason;attempt.outbox={operation:"delete",generation:attempt.outbox.generation+1};delete attempt.receipt;fcPut_("attempt:"+attempt.id,attempt);const meta=fcMeta_(b.request_id);meta.accepted[b.task]=false;fcPut_("review:"+b.request_id,meta);}
    return {status:"deleted"};
  }
  if (action==="upload_receipt") {
    if (!["success","failure"].includes(attempt.status) || b.generation!==attempt.outbox.generation) return {registered:false};
    const receipt=b.receipt,signed=receipt&&receipt.manifest;fcCheck_(signed && signed.schema==="rsc-real-evidence-v1","Signed evidence required.");
    const key=PropertiesService.getScriptProperties().getProperty("FINALS_KEY_"+a.platform);fcCheck_(/^[a-f0-9]{64}$/.test(key||""),"Platform signing key unavailable.");
    const manifest=Object.assign({},signed);delete manifest.signature;
    const bytes=key.match(/../g).map(x=>{const n=parseInt(x,16);return n>127?n-256:n;});
    const signature=fcHex_(Utilities.computeHmacSha256Signature(Utilities.newBlob(fcCanonical_(manifest)).getBytes(),bytes));
    fcCheck_(signed.signature && signed.signature.algorithm==="HMAC-SHA256" && signed.signature.value===signature,"Evidence signature mismatch.");
    const s=a.plan[attempt.slot-1],identity={attempt_id:attempt.id,request_id:a.request_id,task:a.task,slot:attempt.slot,reviewer:attempt.reviewer,platform:a.platform,bundle_sha:a.bundle_sha,plan_sha:a.plan_sha,success:attempt.status==="success",seed:s.seed,setting:s.setting,variant:s.variant};
    fcCheck_(Object.keys(identity).every(k=>fcSame_(signed.identity[k],identity[k])),"Evidence identity mismatch.");
    fcCheck_(Array.isArray(receipt.files) && receipt.files.length===2 && ["evidence.zip","result.json"].every(name=>receipt.files.some(f=>f.target && f.target.endsWith("/"+[a.request_id,a.task,attempt.id,name].join("/")) && f.verification==="server_metadata" && f.size>0 && /^[a-f0-9]{64}$/.test(f.sha256))),"Both cloud files and metadata checksums are required.");
    if (attempt.receipt) fcCheck_(fcSame_(attempt.receipt,receipt),"Evidence receipt is immutable.");
    attempt.receipt=receipt;attempt.outbox.operation="complete";fcPut_("attempt:"+attempt.id,attempt);return {registered:true};
  }
  throw new Error("Unknown platform operation.");
}

function finalsControl_(action,payload) {
  fcCache_=null;
  const platform=action==="finals_platform_rpc";
  const who=platform?fcPlatform_(payload):reviewerIdentity_(payload),body=payload.body||{};
  if (action==="finals_reviewer_list") return fcOverview_(who);
  return withReviewLock_(()=>{
    fcCache_=null;
    let result;
    if (platform) result=fcRpc_(who,payload.operation,body);
    else if (action.startsWith("finals_admin_control_")) result=fcAdmin_(who,action.slice("finals_admin_control_".length),body);
    else {
      fcMayReview_(who,body.request_id,true);const meta=fcMeta_(body.request_id);
      if (action==="finals_reviewer_check") {
        fcCheck_(typeof body.checked==="boolean","Explicit check state required.");
        if(body.check==="submission") {fcCheck_(fcPrepared_(body.request_id),"Frozen prepared bundle required.");meta.submission_checked=body.checked;}
        else if(body.check==="platform") {fcCheck_(FC_PLATFORMS.includes(body.platform) && fcGet_("part:"+body.platform,null) && fcGet_("platform:"+body.platform,null),"Enroll the platform and register its references first.");meta.platform_checks[body.platform]=body.checked;}
        else if(body.check==="accept") {fcCheck_(FINALS_TASKS.includes(body.task),"Invalid task.");const attempts=fcList_("attempt:").filter(a=>a.request_id===body.request_id && a.task===body.task && ["success","failure"].includes(a.status) && a.outbox.operation==="complete");fcCheck_(!body.checked || attempts.length===20,"Twenty signed uploaded attempts are required.");meta.accepted[body.task]=body.checked;}
        else throw new Error("Unknown review check.");
        fcPut_("review:"+body.request_id,meta);result={recorded:true};
      } else if(action==="finals_reviewer_rebuild") {result=fcRpc_({role:"admin",email:who.email},"request_rebuild",body);}
      else if(action==="finals_reviewer_discard") {result=fcRpc_({role:"admin",email:who.email},"discard",body);}
      else if(action==="finals_reviewer_issue") {
        const row=fcRequest_(body.request_id),subject=finalsText_(body.subject,"Email subject",200),text=finalsText_(body.text,"Email body",10000);
        fcCheck_(/^[a-f0-9]{32}$/.test(body.retry_key||""),"Persistent email request ID required.");
        const key=fcHash_([body.request_id,body.retry_key]),old=fcGet_("mail:"+key,null);
        if(old) fcCheck_(old.text===text && old.subject==="[RoboSynChallenge Finals] "+subject,"Email retry content differs.");
        else fcPut_("mail:"+key,{id:key,request_id:body.request_id,to:row.email,subject:"[RoboSynChallenge Finals] "+subject,text,status:"pending",created_at:now_()});
        result={queued:true};
      }
      else throw new Error("Unknown reviewer operation.");
    }
    if (!["queue","attempt_state"].includes(payload.operation) && action!=="finals_admin_control_runtime_queue") fcAudit_(who.email||who.name,action,{operation:payload.operation||null,request_id:body.request_id||null,task:body.task||null,attempt_id:body.attempt_id||null});
    return {ok:true,...result};
  });
}

function finalsControlMailTick() {
  // Persist a sending state before the external side effect. Uncertain sends are
  // reconciled by Message-ID instead of blindly sending another notification.
  const pending=withReviewLock_(()=>{fcCache_=null;return fcList_("mail:").filter(m=>["pending","sending"].includes(m.status)).slice(0,10);});
  pending.forEach(mail=>{
    const messageId="finals-"+mail.id+"@robosyn-bench.net";
    const marker="rscfinalsnotice"+reviewerHash_(mail.id);
    if(mail.status==="sending") {
      const found=Gmail.Users.Messages.list("me",{q:'in:sent {rfc822msgid:'+messageId+' "'+marker+'"}',maxResults:1});
      if(found.messages && found.messages.length) withReviewLock_(()=>{fcCache_=null;const current=fcGet_("mail:"+mail.id,null);current.status="sent";current.sent_at=now_();fcPut_("mail:"+mail.id,current);});
      return;
    }
    const claimed=withReviewLock_(()=>{fcCache_=null;const m=fcGet_("mail:"+mail.id,null);if(m.status!=="pending")return false;m.status="sending";m.started_at=now_();fcPut_("mail:"+mail.id,m);return true;});
    if(!claimed)return;
    try {
      const raw=["From: RoboSynChallenge <robosynchallenge@gmail.com>","To: "+mail.to,"Date: "+new Date().toUTCString(),"Subject: =?UTF-8?B?"+Utilities.base64Encode(mail.subject,Utilities.Charset.UTF_8)+"?=","Message-ID: <"+messageId+">","MIME-Version: 1.0","Content-Type: text/plain; charset=UTF-8","Content-Transfer-Encoding: base64","",Utilities.base64Encode(mail.text+"\n\nNotification reference: "+marker,Utilities.Charset.UTF_8)].join("\r\n");
      const sent=Gmail.Users.Messages.send({raw:Utilities.base64EncodeWebSafe(raw,Utilities.Charset.UTF_8)},"me");
      withReviewLock_(()=>{fcCache_=null;const m=fcGet_("mail:"+mail.id,null);m.status="sent";m.sent_at=now_();m.gmail_id=sent.id;fcPut_("mail:"+mail.id,m);});
    } catch(error) { withReviewLock_(()=>{fcCache_=null;const m=fcGet_("mail:"+mail.id,null);if(m.status==="sending"){m.error_type="delivery_uncertain";fcPut_("mail:"+mail.id,m);}});console.error("Finals notification pending reconciliation: "+mail.id); }
  });
}
