const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const {spawn} = require('node:child_process');
const {once} = require('node:events');

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'rsc-finals-http-'));
  const server = net.createServer(); server.listen(0,'127.0.0.1'); await once(server,'listening');
  const port = server.address().port; await new Promise(resolve=>server.close(resolve));
  const token = crypto.randomBytes(32).toString('hex');
  const users = ['finalist@example.test','preliminary@example.test'].map(email=>({email,token_status:'active',token_sha256:crypto.createHash('sha256').update(token).digest('hex')}));
  const config = path.join(directory,'config.json');
  fs.writeFileSync(config,JSON.stringify({users,properties:{FINALS_INTAKE_ENABLED:'true',FINALS_DEADLINE_AT:'2099-01-01T00:00:00Z',FINALS_ROSTER_JSON:JSON.stringify([{email:users[0].email,team_id:'fixture',team_name:'Fixture',enabled:true}])}}),{mode:0o600});
  let child;
  async function start() {
    child = spawn(process.execPath,[path.join(__dirname,'../tools/preview_finals.cjs'),config,path.join(directory,'state'),String(port)],{stdio:['ignore','pipe','pipe']});
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Preview startup timed out')),5000);
      child.stdout.once('data',()=>{clearTimeout(timer);resolve();});
      child.once('exit',code=>{clearTimeout(timer);reject(Error('Preview exited: '+code));});
    });
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited=once(child,'exit');child.kill('SIGTERM');await exited;
  }
  async function api(action,payload={}) {
    const response=await fetch(`http://127.0.0.1:${port}/api/finals`,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({action,...payload})});
    return response.json();
  }
  async function login(email) { return (await api('login',{email,token})).session_id; }
  try {
    await start();
    let session_id=await login(users[0].email);
    const status=await api('finals_status',{session_id});
    const submission={method_name:'Fixture',description:'Test',repository:'https://github.com/example/fixture',dependency_notes:'Example',data_sources:'Official data',compute_notes:'One GPU',checkpoints:[{id:'weights',repo:'example/weights',path:''}],tasks:status.tasks.map(task=>({task,policy_path:'policy/act',checkpoint_ids:['weights'],run_notes:'eval.sh'}))};
    const submission_key='http_fixture_request_001';
    const first=await api('finals_submit',{session_id,submission,submission_key});
    assert.equal(first.ok,true);assert.equal(first.request.submission.version_policy,'latest_before_deadline');
    const id=first.request.request_id;
    await stop();await start();
    session_id=await login(users[0].email);
    const restored=await api('finals_status',{session_id});
    assert.equal(restored.requests.length,1);assert.equal(restored.requests[0].request_id,id);
    assert.equal((await api('finals_submit',{session_id,submission,submission_key})).already_recorded,true);
    session_id=await login(users[1].email);
    const other=await api('finals_status',{session_id});
    assert.equal(other.eligible,false);assert.equal(other.intake_open,false);assert.deepEqual(other.requests,[]);
    assert.equal((await api('finals_submit',{session_id,submission,submission_key})).ok,false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'state/requests.json'))).length,1);
    console.log('HTTP preview: submit without SHA, durable record across restart, duplicate retry and non-finalist denial passed. No production writes.');
  } finally {await stop();fs.rmSync(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
