const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const tables={},props={};let clock=Date.now();
class Clock extends Date {constructor(...v){super(...(v.length?v:[clock]));}static now(){return clock;}}
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const c=vm.createContext({Date:Clock,JSON,Set,Map,SHEETS:{},console,
 rows_:n=>tables[n]||[],reviewRows_:n=>tables[n]||[],appendRow_:(n,v)=>(tables[n]??=[]).push({...v,_rowNumber:(tables[n]||[]).length+2}),
 updateRow_:(n,r,v)=>Object.assign(tables[n][r-2],v),config_:(k,d)=>props[k]??d,reviewerHash_:sha,withReviewLock_:f=>f(),
 now_:()=>new Clock().toISOString(),id_:p=>p+crypto.randomUUID(),reviewerIdentity_:p=>({role:p.role||'admin',email:p.email||'admin@test'}),
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>props[k]=v})},Utilities:{getUuid:()=>crypto.randomUUID()}});
for(const file of ['Finals','FinalsControl','FinalsStream'])vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/'+file+'.gs','utf8'),c);
const tasks=Array.from(vm.runInContext('FINALS_TASKS',c)),hash='b'.repeat(64),bundle='a'.repeat(40),token='t'.repeat(40);
tables.Reviewers=[{email:'admin@test',role:'admin',active:'true'}];tables.FinalsRequests=[];
const admin=(op,b={})=>c.finalsControl_('finals_admin_control_'+op,{role:'admin',email:'admin@test',body:b});
const rpc=(platform,op,body={})=>c.finalsControl_('finals_platform_rpc',{platform,platform_token:token,operation:op,body});
for(const platform of ['platform_1','platform_2']){
 admin('enroll',{platform,reviewer:'admin@test',token,signing_key_hex:'ab'.repeat(32)});
 admin('register_part',{platform,part:Number(platform.at(-1)),index:{manifest_sha256:hash,tasks:Object.fromEntries(tasks.map(t=>[t,Array.from({length:20},(_,i)=>({seed:i,image:t+'/'+i+'.png',sha256:hash}))]))}});
}
function add(id){
 tables.FinalsRequests.push({request_id:id,team_id:id,is_test:true,revision:1,submission_json:JSON.stringify({tasks:tasks.map(task=>({task,policy_path:'policy/test'}))})});
 admin('fixture',{request_id:id,bundle_sha:bundle});
 c.fcPut_('review:'+id,{request_id:id,owner:'admin@test',submission_checked:true,platform_checks:{platform_1:true,platform_2:true},accepted:{}});
 for(const [task,platform] of [['click_bell','platform_1'],['water_pouring','platform_2']]){
  admin('assign',{request_id:id,task,platform,bundle_sha:bundle});
  admin('runtime_approve',{request_id:id,task,recipe:{transport:'chunk-v2',policy_path:'policy/test',args:{},instruction:'test',install:[],image:'r/image@sha256:'+hash}});
 }
 return admin('team_queue').jobs.find(j=>j.request_id===id);
}
function ready(job){
 const proof={gpu:'NVIDIA GeForce RTX 5090',tls:true,single_worker:true,task_switch:true,chunk_inference:true,tasks:{}};
 const configs={};for(const r of job.registry){proof.tasks[r.task]={reset:true,feedback:true,actions:true};configs[r.task]={task_config_sha:hash,instruction:'test'};}
 admin('team_update',{team_id:job.team_id,generation:job.generation,registry_sha:job.registry_sha,status:'ready',
  endpoint:{protocol:'rsc-real-chunk-v2',request_id:job.request_id,bundle_sha:bundle,generation:job.generation,url:'wss://127.0.0.1:8443',token},proof,tasks:configs});
}
const first=add('real_a');ready(first);const second=add('real_b');ready(second);
let offer=rpc('platform_1','stream_poll');assert.equal(offer.card.setting,'base');
const body={request_id:'real_a',task:'click_bell',slot:1};
let lease=rpc('platform_1','stream_claim',body);
assert.equal(rpc('platform_1','stream_claim',body).reservation.id,lease.reservation.id);
assert.equal(rpc('platform_1','stream_poll').endpoint.protocol,'rsc-real-chunk-v2');
assert.equal(rpc('platform_2','stream_poll').card.request_id,'real_b');
assert.throws(()=>rpc('platform_2','stream_claim',{request_id:'real_a',task:'water_pouring',slot:1}),/no longer available/);
assert.throws(()=>admin('team_rebuild',{request_id:'real_a',reason:'test'}),/reservation/);
clock+=1801000;
// Expired unstarted reservations can be reclaimed, but never an active attempt.
assert.equal(rpc('platform_2','stream_poll').card.request_id,'real_a');
lease=rpc('platform_1','stream_claim',body);
const start={...body,lease_id:lease.reservation.id,placement_confirmed:true,reference_sha256:hash,idempotency_key:'1'.repeat(32)};
const attempt=rpc('platform_1','start',start);assert.equal(rpc('platform_1','start',start).attempt_id,attempt.attempt_id);
clock+=3600000;
assert.equal(rpc('platform_2','stream_poll').card.request_id,'real_b');
assert.throws(()=>admin('team_rebuild',{request_id:'real_a',reason:'test'}),/active rollout/);
rpc('platform_1','finish',{...body,attempt_id:attempt.attempt_id,success:false});
const next=rpc('platform_1','stream_claim',{...body,slot:3});
rpc('platform_1','finish',{...body,attempt_id:attempt.attempt_id,success:false});
assert.equal(rpc('platform_1','stream_poll').reservation.id,next.reservation.id,'old repeated finish must not release new slot');
rpc('platform_1','stream_release',{lease_id:next.reservation.id});
rpc('platform_1','stream_release',{lease_id:next.reservation.id});
// Current setting has pending slots, but only a different setting is ready.
c.fcPut_('teamruntime:real_a',{...c.fcGet_('teamruntime:real_a'),status:'building'});
const a=c.fcGet_('assignment:real_b:click_bell');a.plan=a.plan.filter(s=>s.setting==='highlight');c.fcPut_('assignment:real_b:click_bell',a);
assert.equal(rpc('platform_1','stream_poll').card,null);
clock+=1799000;assert.equal(rpc('platform_1','stream_poll').setting,'base');
clock+=1001;offer=rpc('platform_1','stream_poll');assert.equal(offer.setting,'highlight');assert.equal(offer.switched,true);assert.equal(offer.card.request_id,'real_b');
// Confirmed placement never silently changes even after 30 minutes.
const last=rpc('platform_1','stream_claim',{request_id:'real_b',task:'click_bell',slot:5});
clock+=1700000;rpc('platform_1','stream_poll');clock+=1700000;
// Without a heartbeat its unstarted lease expires, as intended.
assert.equal(c.fsLease_('real_b'),null);
admin('team_cancel',{request_id:'real_b',reason:'test complete'});
admin('team_queue');assert.equal(c.fsJob_('real_b').status,'cancelled');
assert.throws(()=>admin('runtime_update',{request_id:'real_a',task:'click_bell',generation:first.generation,recipe_sha:first.registry[0].recipe_sha,status:'ready'}),/single team/);
console.log('Finals stream: single-team reservations, cross-platform exclusion, expiry, active protection, replay-safe release and 30-minute setting switch passed.');
