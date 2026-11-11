const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const tables={},properties={},sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const ctx=vm.createContext({console,SHEETS:{},Date,JSON,Set,Map,
  rows_:name=>{assert.notEqual(name,'Reviewers');return tables[name]||[];},reviewRows_:name=>tables[name]||[],appendRow_:(name,row)=>(tables[name]??=[]).push({...row,_rowNumber:(tables[name]||[]).length+2}),
  updateRow_:(name,n,row)=>Object.assign(tables[name][n-2],row),
  reviewerIdentity_:p=>({role:p.role||'evaluator',email:p.email||'eval@example.test'}),
  config_:(k,d)=>properties[k]??d,reviewerHash_:sha,withReviewLock_:fn=>fn(),
  now_:()=>new Date().toISOString(),id_:p=>p+'_'+crypto.randomUUID(),
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k],setProperty:(k,v)=>properties[k]=v})},
  Utilities:{getUuid:()=>crypto.randomUUID(),newBlob:s=>({getBytes:()=>[...Buffer.from(s)]}),
    computeHmacSha256Signature:(data,key)=>[...crypto.createHmac('sha256',Buffer.from(key.map(n=>n&255))).update(Buffer.from(data)).digest()]},
});
for(const name of ['Finals','FinalsControl'])vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/'+name+'.gs','utf8'),ctx);
const tasks=Array.from(vm.runInContext('FINALS_TASKS',ctx));
const req='real_fixture',bundle='a'.repeat(40),hash='b'.repeat(64),token='t'.repeat(40),signing='ab'.repeat(32);
tables.Reviewers=[{email:'eval@example.test',role:'evaluator',active:'true'},{email:'other@example.test',role:'evaluator',active:'true'}];
tables.FinalsRequests=[{request_id:req,team_id:'test',is_test:true,revision:1,submission_json:JSON.stringify({tasks:tasks.map(task=>({task,policy_path:'policy/fixture'}))})}];
const admin=(action,body={})=>ctx.finalsControl_('finals_admin_control_'+action,{role:'admin',email:'admin@example.test',body});
const rpc=(operation,body={})=>ctx.finalsControl_('finals_platform_rpc',{platform:'platform_1',platform_token:token,operation,body});
const review=(action,body={})=>ctx.finalsControl_('finals_reviewer_'+action,{body});
assert.throws(()=>rpc('queue'),/authentication/);
admin('fixture',{request_id:req,bundle_sha:bundle});
admin('enroll',{platform:'platform_1',reviewer:'eval@example.test',token,signing_key_hex:signing});
assert.throws(()=>admin('enroll',{platform:'platform_1',reviewer:'other@example.test',token,signing_key_hex:signing}),/silently/);
const index={manifest_sha256:hash,tasks:Object.fromEntries(tasks.map(t=>[t,Array.from({length:20},(_,i)=>({seed:i,image:t+'/'+i+'.png',sha256:hash}))]))};
admin('register_part',{platform:'platform_1',part:1,index});
assert.throws(()=>rpc('register_references',{index}),/organizer enrollment/);
admin('enroll',{platform:'platform_2',reviewer:'other@example.test',token:'u'.repeat(40),signing_key_hex:signing,reference_manifest_sha256:hash});
const register=index=>ctx.finalsControl_('finals_platform_rpc',{platform:'platform_2',platform_token:'u'.repeat(40),operation:'register_references',body:{index}});
assert.throws(()=>register({...index,manifest_sha256:'0'.repeat(64)}),/organizer enrollment/);
assert.equal(register(index).registered,true);
assert.equal(register(index).registered,true);
const identity={request_id:req,task:'click_bell'};
admin('assign',{...identity,platform:'platform_1',bundle_sha:bundle});
assert.equal(rpc('queue').cards.length,20);assert.equal(rpc('queue').cards.filter(c=>c.variant).length,3);
assert.deepEqual(Array.from(rpc('queue').cards.filter(c=>c.variant),c=>c.slot),[2,10,18]);
assert.equal(review('list').requests.length,0);
admin('assign_owner',{request_id:req,email:'eval@example.test'});
assert.equal(review('list').requests.length,1);
const recipe={policy_path:'policy/fixture',args:{},instruction:'test',install:[],image:'registry.test/image@sha256:'+hash};
admin('runtime_approve',{...identity,recipe});
let job=admin('runtime_queue').jobs[0];
const endpoint={...identity,bundle_sha:bundle,generation:1,url:'wss://127.0.0.1:8443',token,task_config_sha:hash};
const ready={...identity,recipe_sha:job.recipe_sha,generation:1,status:'ready',endpoint,proof:{gpu:'NVIDIA GeForce RTX 5090',tls:true,identity:true,infer:true,reset:true,action_shape:'1x14'}};
assert.throws(()=>admin('runtime_update',{...ready,proof:{}}),/validation/);
admin('runtime_update',ready);
assert.ok(!JSON.stringify(review('list')).includes(token));assert.ok(!JSON.stringify(review('list')).includes(signing));
const start={...identity,slot:2,placement_confirmed:true,reference_sha256:hash,idempotency_key:'c'.repeat(32)};
assert.throws(()=>rpc('start',start),/checks/);
review('check',{request_id:req,check:'submission',checked:true});
review('check',{request_id:req,check:'platform',platform:'platform_1',checked:true});
const attempt=rpc('start',start);assert.equal(rpc('start',start).attempt_id,attempt.attempt_id);
assert.throws(()=>rpc('start',{...start,slot:3,idempotency_key:'d'.repeat(32)}),/active/);
assert.throws(()=>admin('runtime_update',ready),/Active/);
assert.throws(()=>rpc('request_rebuild',{...identity,reason:'network'}),/Close or discard/);
rpc('finish',{...identity,attempt_id:attempt.attempt_id,success:false});
assert.throws(()=>rpc('start',start),/replayed/);
const card=rpc('queue').cards.find(c=>c.slot===2);
const manifest={schema:'rsc-real-evidence-v1',identity:{...identity,attempt_id:attempt.attempt_id,slot:2,reviewer:'eval@example.test',platform:'platform_1',bundle_sha:bundle,plan_sha:card.plan_sha,success:false,seed:1,setting:'base',variant:'pink_bell'},files:{},journal_root:hash};
manifest.signature={algorithm:'HMAC-SHA256',value:crypto.createHmac('sha256',Buffer.from(signing,'hex')).update(ctx.fcCanonical_(manifest)).digest('hex')};
const receipt={manifest,files:['evidence.zip','result.json'].map(n=>({target:'drive:root/'+req+'/click_bell/'+attempt.attempt_id+'/'+n,size:12,sha256:hash,verification:'server_metadata'}))};
assert.equal(rpc('upload_receipt',{...identity,attempt_id:attempt.attempt_id,generation:1,receipt}).registered,true);
assert.equal(review('list').requests[0].progress.collected,1);
assert.throws(()=>review('check',{request_id:req,check:'accept',task:'click_bell',checked:true}),/Twenty/);
rpc('discard',{...identity,attempt_id:attempt.attempt_id,reason:'Placement incorrect'});
assert.equal(rpc('upload_receipt',{...identity,attempt_id:attempt.attempt_id,generation:1,receipt}).registered,false);
assert.equal(review('list').requests[0].progress.collected,0);
assert.equal(rpc('queue').cards.find(c=>c.slot===2).status,'pending');
const rebuild=rpc('request_rebuild',{...identity,reason:'Network unavailable'});assert.equal(rebuild.generation,2);
assert.equal(rpc('request_rebuild',{...identity,reason:'retry'}).generation,2);
assert.throws(()=>admin('runtime_update',ready),/Stale/);
tables.Reviewers[0].active='false';assert.throws(()=>rpc('queue'),/no longer active/);
assert.equal(Object.keys(tables).filter(n=>!['Reviewers','FinalsRequests'].includes(n)).every(n=>n.startsWith('Finals')),true);
console.log('Finals control: auth, isolation, immutable routes, stage gates, runtime proofs, idempotent starts, signed uploads, invalidation, rebuild generations and revocation passed.');

let sent=0,queries=[],deliveryUncertain=true;
ctx.Utilities.Charset={UTF_8:'utf8'};
ctx.Utilities.base64Encode=s=>Buffer.from(s).toString('base64');
ctx.Utilities.base64EncodeWebSafe=s=>Buffer.from(s).toString('base64url');
ctx.Gmail={Users:{Messages:{send:message=>{sent++;const raw=Buffer.from(message.raw,'base64url').toString();assert.ok(raw.includes('Notification reference')===false);const body=Buffer.from(raw.split('\r\n\r\n')[1],'base64').toString();assert.match(body,/rscfinalsnotice[a-f0-9]{64}/);if(deliveryUncertain)throw Error('Response lost');return {id:'gmail_rewritten_id'};},
  list:(user,query)=>{queries.push(query.q);return {messages:[{id:'rewritten-id'}]};}}}};
tables.FinalsControl=tables.FinalsControl.filter(r=>!r.key.startsWith('mail:'));
ctx.fcCache_=null;admin('mail_test',{key:'dedup-test'});
ctx.finalsControlMailTick();assert.equal(sent,1);
ctx.finalsControlMailTick();assert.equal(sent,1);assert.ok(queries.some(q=>q.includes('rscfinalsnotice')));
assert.equal(admin('mail_status').messages[0].status,'sent');
console.log('Finals mail: uncertain sends reconciled through a unique body reference despite Gmail Message-ID rewriting; no duplicate send.');
