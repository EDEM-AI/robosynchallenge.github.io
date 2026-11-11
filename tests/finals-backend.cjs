const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const rows = [];
const preparations = [];
const versions = [];
const config = { FINALS_INTAKE_ENABLED:'true', FINALS_DEADLINE_AT:'2099-01-01T00:00:00Z',
  FINALS_ROSTER_JSON:JSON.stringify([{email:'finalist@example.test',team_id:'team1',team_name:'Team',enabled:true}]) };
let active = true, sequence = 0;
let now = Date.parse('2026-11-12T00:00:00Z');
const ctx = vm.createContext({ console, Date:class extends Date { static now(){return now;} }, SHEETS:{}, config_:(k,d)=>config[k] ?? d,
  normalizeEmail_:x=>String(x).toLowerCase(), requireSession_:id=>{if (!id) throw Error('Session required');return {email:id};},
  findRow_:()=>({token_status:active?'active':'revoked'}), rows_:name=>{assert.ok(['FinalsRequests','FinalsPreparations','FinalsVersions'].includes(name));return {FinalsRequests:rows,FinalsPreparations:preparations,FinalsVersions:versions}[name];},
  appendRow_:(name,row)=>{assert.ok(['FinalsRequests','FinalsPreparations','FinalsVersions'].includes(name)); ({FinalsRequests:rows,FinalsPreparations:preparations,FinalsVersions:versions}[name]).push(row);},
  reviewerIdentity_:p=>({role:p.fixture_role||'evaluator'}), requiredEmail_:s=>String(s).trim().toLowerCase(),
  PropertiesService:{getScriptProperties:()=>({setProperties:values=>Object.assign(config,values)})},
  reviewerHash_:x=>crypto.createHash('sha256').update(x).digest('hex'), withReviewLock_:fn=>fn(),
  checkRateLimit_:()=>{}, id_:prefix=>prefix+'_'+(++sequence), now_:()=>new Date().toISOString() });
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../apps-script/Finals.gs'),'utf8'),ctx);
const call=(action,payload)=>ctx.handleFinalsAction_(action,payload);
const tasks=vm.runInContext('FINALS_TASKS',ctx);
const submission={method_name:'Example',description:'Details',repository:'https://github.com/org/repo',
  dependency_notes:'Install dependencies',data_sources:'Public data',compute_notes:'One GPU',
  checkpoints:[{id:'encoder',repo:'org/model',path:''}],
  tasks:Array.from(tasks,task=>({task,policy_path:'policy/MyPolicy',checkpoint_ids:['encoder'],run_notes:'eval.sh task_name '+task}))};
const payload={session_id:'finalist@example.test',submission_key:'retry_key_000000001',submission};
assert.throws(()=>call('finals_status',{}),/Session/);
assert.equal(call('finals_status',{session_id:'other@example.test'}).eligible,false);
assert.throws(()=>call('finals_submit',{...payload,session_id:'other@example.test'}),/roster/);
const result=call('finals_submit',payload);assert.equal(result.request.revision,1);
assert.equal(result.request.submission.version_policy,'latest_before_deadline');
assert.equal(result.request.submission.version_cutoff_at,config.FINALS_DEADLINE_AT);
assert.equal(result.request.submission.code_ref,'');
assert.equal(result.request.submission.checkpoints[0].ref,'main');
assert.equal(result.request.submission.commit,undefined);
assert.equal(result.request.submission.checkpoints[0].revision,undefined);
assert.equal(call('finals_submit',{...payload,submission:{...submission,commit:'a'.repeat(40),version_cutoff_at:'2000-01-01T00:00:00Z'}}).already_recorded,true);
assert.equal(call('finals_submit',payload).already_recorded,true);assert.equal(rows.length,1);
assert.throws(()=>call('finals_submit',{...payload,submission:{...submission,method_name:'Changed'}}),/different content/);
for(const bad of [
  {...submission,code_ref:'a'.repeat(40)},
  {...submission,code_ref:'feature/../escape'},
  {...submission,repository:'https://evil.test/repo'},
  {...submission,tasks:submission.tasks.slice(1)},
  {...submission,tasks:submission.tasks.map(t=>({...t,policy_path:'policy/../escape'}))},
  {...submission,checkpoints:[{...submission.checkpoints[0],ref:'b'.repeat(40)}]},
  {...submission,tasks:submission.tasks.map(t=>({...t,checkpoint_ids:['missing']}))},
]) assert.throws(()=>call('finals_submit',{...payload,submission:bad}));
assert.equal(call('finals_status',{session_id:'other@example.test'}).requests.length,0);
config.FINALS_INTAKE_ENABLED='false';
assert.equal(call('finals_submit',payload).already_recorded,true);
assert.throws(()=>call('finals_submit',{...payload,submission_key:'retry_key_000000002'}),/not currently open/);
active=false;assert.throws(()=>call('finals_status',{session_id:payload.session_id}),/not active/);
assert.equal(rows.length,1);
active=true;
config.FINALS_INTAKE_ENABLED='true';
config.FINALS_TEST_ROSTER_JSON=JSON.stringify([{email:'testing@example.test',team_id:'test_team',enabled:true}]);
const test=call('finals_submit',{...payload,session_id:'testing@example.test'});
assert.equal(test.request.status,'test_submitted');
assert.equal(test.request.is_test,true);
assert.equal(call('finals_status',{session_id:'finalist@example.test'}).requests.length,1);
assert.equal(call('finals_status',{session_id:'testing@example.test'}).is_test,true);
assert.throws(()=>call('finals_admin_queue',{}),/Organizer/);
assert.equal(call('finals_admin_queue',{fixture_role:'admin'}).requests.length,1);
const prepared={fixture_role:'admin',request_id:result.request.request_id,status:'prepared',bundle_sha:'c'.repeat(40),manifest_sha256:'d'.repeat(64),note:'Static checks passed'};
assert.throws(()=>call('finals_admin_prepare_result',prepared),/Freeze/);
const frozen={fixture_role:'admin',request_id:result.request.request_id,fingerprint:rows[0].fingerprint,versions:{
  cutoff_at:config.FINALS_DEADLINE_AT,
  code:{repo:submission.repository,ref:'main',revision:'a'.repeat(40),committed_at:'2026-11-15T12:00:00Z',authored_at:'2026-11-15T11:00:00Z'},
  checkpoints:[{id:'encoder',repo:'org/model',ref:'main',path:'',revision:'b'.repeat(40),committed_at:'2026-11-15T13:00:00Z'}],
}};
assert.throws(()=>call('finals_admin_freeze_versions',frozen),/Wait until/);
now=Date.parse('2099-01-01T00:00:01Z');
assert.throws(()=>call('finals_admin_freeze_versions',{...frozen,fixture_role:'evaluator'}),/Organizer/);
assert.throws(()=>call('finals_admin_freeze_versions',{...frozen,fingerprint:'wrong'}),/fingerprint/);
assert.throws(()=>call('finals_admin_freeze_versions',{...frozen,versions:{...frozen.versions,checkpoints:[]}}),/Every checkpoint/);
assert.throws(()=>call('finals_admin_freeze_versions',{...frozen,versions:{...frozen.versions,code:{...frozen.versions.code,committed_at:config.FINALS_DEADLINE_AT}}}),/strictly before/);
assert.throws(()=>call('finals_admin_freeze_versions',{...frozen,versions:{...frozen.versions,code:{...frozen.versions.code,authored_at:'2100-01-01T00:00:00Z'}}}),/strictly before/);
const freeze=call('finals_admin_freeze_versions',frozen);
assert.equal(versions.length,1);
assert.equal(call('finals_admin_freeze_versions',frozen).already_recorded,true);
assert.throws(()=>call('finals_admin_freeze_versions',{...frozen,versions:{...frozen.versions,code:{...frozen.versions.code,revision:'e'.repeat(40)}}}),/already frozen/);
prepared.version_fingerprint=freeze.versions.fingerprint;
assert.throws(()=>call('finals_admin_prepare_result',{...prepared,version_fingerprint:'wrong'}),/Freeze/);
assert.equal(call('finals_admin_prepare_result',prepared).preparation.bundle_sha,'c'.repeat(40));
assert.equal(call('finals_admin_prepare_result',prepared).already_recorded,true);
assert.throws(()=>call('finals_admin_prepare_result',{...prepared,bundle_sha:'e'.repeat(40)}),/frozen/);
assert.throws(()=>call('finals_admin_prepare_result',{...prepared,request_id:test.request.request_id}),/Formal/);
const roster=Array.from({length:21},(_,i)=>({email:`team${i}@example.test`,team_id:`team_${i}`}));
assert.throws(()=>call('finals_admin_configure',{fixture_role:'admin',settings:{roster:roster.slice(1)}}),/21-team/);
const configured=call('finals_admin_configure',{fixture_role:'admin',settings:{roster,test_roster:[{email:'testing@example.test',team_id:'test_team'}],enabled:true,deadline_at:'2026-11-16T12:00:00Z'}});
assert.equal(configured.finalists,21);assert.equal(configured.test_accounts,1);
assert.equal(new Date(configured.deadline_at).toISOString(),'2026-11-16T12:00:00.000Z');
assert.equal(new Date(new Date(configured.deadline_at).getTime()-1).toISOString(),'2026-11-16T11:59:59.999Z');
console.log('Finals: intake records, roster isolation, branch/path validation, deadline-controlled immutable version freezing, preparation gate and retries passed.');
