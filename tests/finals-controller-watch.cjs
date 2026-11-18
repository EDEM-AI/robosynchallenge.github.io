const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),crypto=require('crypto');
const props={},state={},calls=[];let cloudState='RUNNING',uid='a'.repeat(32),cloudUid=uid,locked=false,fetchHook=null;
const context=vm.createContext({console,Date,JSON,fcCache_:null,now_:()=>new Date().toISOString(),fcCheck_:(yes,text)=>{if(!yes)throw Error(text)},fcGet_:(k,d)=>state[k]??d,fcPut_:(k,v)=>state[k]=v,
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>props[k]=v,deleteProperty:k=>delete props[k]})},
 Utilities:{getUuid:()=>crypto.randomUUID(),formatDate:()=>new Date().toUTCString(),base64Encode:b=>Buffer.from(b).toString('base64'),computeHmacSha256Signature:(s,k)=>crypto.createHmac('sha256',k).update(s).digest()},
 UrlFetchApp:{fetch:(url,options)=>{assert.equal(locked,false,'Cloud I/O must never hold the global lock');calls.push({url,method:options.method});if(fetchHook)fetchHook(options);return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({uid:cloudUid,name:'challenge-cpu',state:cloudState,ownership:{user_name:'owner'}})}}},
 ScriptApp:{getProjectTriggers:()=>[],newTrigger:()=>({timeBased:()=>({everyMinutes:()=>({create:()=>{}})})})},
 LockService:{getScriptLock:()=>({tryLock:()=>{if(locked)return false;locked=true;return true},releaseLock:()=>{assert.equal(locked,true);locked=false}})}});
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/FinalsControllerWatch.gs','utf8'),context);
const config={api_url:'https://cci.cn-sh-01.sensecore.cn/compute/cci/data/v2/subscriptions/0000/resourceGroups/default/zones/cn-sh-01z/workspaces/p7-scientific-embodied-multi-agent/apps/challenge-cpu',uid,account:'owner',access_key_id:'test-key',access_key_secret:'test-secret'};
assert.throws(()=>context.fsControllerWatchAdmin_('team_controller_watch_configure',{...config,api_url:'https://elsewhere'}),/Only the central/);
context.fsControllerWatchAdmin_('team_controller_watch_configure',config);
context.finalsControllerWatchTick();assert.equal(calls.filter(c=>c.method==='post').length,0);
cloudState='SUSPENDED';context.finalsControllerWatchTick();assert.equal(calls.filter(c=>c.method==='post').length,1);
assert.equal(calls.at(-1).url,config.api_url+':start');
context.finalsControllerWatchTick();assert.equal(calls.filter(c=>c.method==='post').length,1);
cloudUid='b'.repeat(32);context.finalsControllerWatchTick();assert.equal(calls.filter(c=>c.method==='post').length,1);
assert(!JSON.stringify(state).includes('test-secret'));
context.fsControllerWatchAdmin_('team_controller_watch_configure',{enabled:false});context.finalsControllerWatchTick();
// A concurrent trigger cannot query or start while an existing claim is active.
cloudUid=uid;cloudState='SUSPENDED';
context.fsControllerWatchAdmin_('team_controller_watch_configure',config);
delete state['controller-watch:status'].last_start_at;
const before=calls.length;
fetchHook=()=>{fetchHook=null;context.finalsControllerWatchTick()};
context.finalsControllerWatchTick();
assert.equal(calls.length-before,2);
assert.equal(props.FINALS_CONTROLLER_WATCH_RUN,undefined);
// A configuration disabled during GET cannot be started or resurrected by the old run.
fetchHook=()=>{fetchHook=null;context.fsControllerWatchAdmin_('team_controller_watch_configure',{enabled:false})};
const starts=calls.filter(c=>c.method==='post').length;
context.finalsControllerWatchTick();
assert.equal(calls.filter(c=>c.method==='post').length,starts);
assert.equal(props.FINALS_CONTROLLER_WATCH,undefined);
assert.equal(props.FINALS_CONTROLLER_WATCH_RUN,undefined);
// An abandoned claim expires; lock contention skips cleanly without network traffic.
context.fsControllerWatchAdmin_('team_controller_watch_configure',config);
props.FINALS_CONTROLLER_WATCH_RUN=JSON.stringify({id:'abandoned',expires_at:Date.now()-1});
cloudState='RUNNING';context.finalsControllerWatchTick();
assert.equal(props.FINALS_CONTROLLER_WATCH_RUN,undefined);
locked=true;const count=calls.length;context.finalsControllerWatchTick();assert.equal(calls.length,count);locked=false;
// A failed start response retains intent, bounding another tick's retry.
cloudState='SUSPENDED';delete state['controller-watch:status'].last_start_at;
fetchHook=options=>{if(options.method==='post'){fetchHook=null;throw new Error('network response lost')}};
context.finalsControllerWatchTick();
const afterLost=calls.filter(c=>c.method==='post').length;
context.finalsControllerWatchTick();
assert.equal(calls.filter(c=>c.method==='post').length,afterLost);
assert.equal(locked,false);
console.log('External controller watchdog: exact target, no running restart, bounded suspended restart, UID protection and secret-free status passed.');
