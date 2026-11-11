const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const directory = fs.mkdtempSync(path.join(os.tmpdir(),'rsc-paper-backend-'));
const doubles = require('../tools/paper_preview.cjs')(directory);
const rows = [];
const properties = {PAPER_INTAKE_ENABLED:'true', PAPER_DEADLINE_AT:'2099-01-01T00:00:00Z',
  PAPER_DRIVE_ROOT_ID:'paper-preview', PAPER_TEST_DRIVE_ROOT_ID:'paper-test-preview',
  FINALS_ROSTER_JSON:JSON.stringify([{email:'finalist@example.test',team_id:'team1',team_name:'Finalist',enabled:true}]),
  FINALS_TEST_ROSTER_JSON:JSON.stringify([{email:'testing@example.test',team_id:'test1',team_name:'Test',enabled:true}])};
let active=true, mode='ok', sends=0, failStoreReceipt=false;
const context=vm.createContext({...doubles, SHEETS:{}, config_:(key,fallback)=>properties[key]??fallback,
  reviewerIdentity_:payload=>({email:'organizer@example.test',role:payload.admin?'admin':'evaluator'}),
  PropertiesService:{getScriptProperties:()=>({setProperties:values=>Object.assign(properties,values)})},
  requireSession_:id=>{if(!id)throw Error('Session required');return {email:id};}, normalizeEmail_:s=>s,
  findRow_:()=>({token_status:active?'active':'revoked',team_name:'Preliminary Team'}),
  rows_:name=>{assert.equal(name,'PaperSubmissions');return rows.map((r,i)=>({...r,_rowNumber:i+2}));},
  appendRow_:(name,row)=>{assert.equal(name,'PaperSubmissions');rows.push({...row});},
  updateRow_:(name,index,values)=>{assert.equal(name,'PaperSubmissions');if(failStoreReceipt&&values.status==='stored'){failStoreReceipt=false;throw Error('Lost sheet receipt');}Object.assign(rows[index-2],values);},
  withReviewLock_:fn=>fn(), checkRateLimit_:()=>{}, requiredEmail_:s=>s, now_:()=>new Date().toISOString(),
  reviewerHash_:s=>crypto.createHash('sha256').update(s).digest('hex'),
  UrlFetchApp:{fetch:(url,options)=>{sends++;if(mode==='timeout')throw Error('timeout');if(mode==='reject')return {getResponseCode:()=>429};return doubles.UrlFetchApp.fetch(url,options);}},
});
for (const name of ['Finals.gs','PaperSubmissions.gs']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../apps-script',name),'utf8'),context);
const call=(action,payload={})=>context.handlePaperAction_(action,payload);
const pdf=Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
const payload=(email,bytes=pdf)=>({session_id:email,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),pdf_base64:bytes.toString('base64')});
try {
  assert.throws(()=>call('paper_status'),/Session/);
  active=false;assert.throws(()=>call('paper_status',{session_id:'finalist@example.test'}),/active/);active=true;
  assert.equal(call('paper_status',{session_id:'preliminary@example.test'}).stage,'preliminary');
  assert.equal(call('paper_status',{session_id:'finalist@example.test'}).stage,'finals');
  const first=call('paper_submit',{...payload('preliminary@example.test'),stage:'finals',email:'forged@example.test',team_name:'forged',recipient:'attacker@example.test'});
  assert.equal(first.request.stage,'preliminary');assert.equal(first.request.mail_status,'sent');
  assert.equal(rows[0].email,'preliminary@example.test');assert.equal(rows[0].team_name,'Preliminary Team');
  assert.equal(first.request.drive_file_id,undefined);
  assert.ok(rows[0].drive_file_id.startsWith('paper-preview/preliminary/team_'));
  assert.deepEqual(fs.readFileSync(path.join(directory,'papers',rows[0].drive_file_id)),pdf);
  const mail=fs.readFileSync(path.join(directory,'papers/outbox',fs.readdirSync(path.join(directory,'papers/outbox'))[0]),'utf8');
  assert.match(mail,/To: robosynchallenge@gmail.com/);assert.doesNotMatch(mail,/attacker@example/);
  const encoded=mail.split('Content-Disposition: attachment;')[1].split('\r\n\r\n')[1].split('\r\n--')[0];
  assert.deepEqual(Buffer.from(encoded,'base64'),pdf);
  assert.equal(call('paper_submit',payload('preliminary@example.test')).already_recorded,true);
  assert.equal(rows.length,1);assert.equal(sends,1);
  const finalist=call('paper_submit',payload('finalist@example.test'));
  assert.equal(finalist.request.stage,'finals');assert.ok(rows[1].drive_file_id.startsWith('paper-preview/finals/team1/'));
  assert.equal(call('paper_status',{session_id:'finalist@example.test'}).requests.length,1);
  const test=call('paper_submit',payload('testing@example.test'));assert.equal(test.request.mail_status,'test_suppressed');assert.equal(sends,2);
  assert.ok(rows[2].drive_file_id.startsWith('paper-test-preview/'));
  const second=Buffer.from(pdf.toString().replace('1 0 obj','2 0 obj'));
  call('paper_submit',payload('finalist@example.test',second));assert.equal(rows.length,4);
  assert.ok(fs.existsSync(path.join(directory,'papers',rows[1].drive_file_id)));
  assert.throws(()=>call('paper_submit',{...payload('x@example.test'),sha256:'f'.repeat(64)}),/checksum/);
  for(const bad of [Buffer.from('not a PDF'),Buffer.from('%PDF-1.4\ntruncated'),Buffer.alloc(10*1024*1024+1)]) {
    assert.throws(()=>call('paper_submit',payload('x@example.test',bad)),/PDF/);
  }
  assert.throws(()=>call('paper_submit',{...payload('x@example.test'),pdf_base64:'bad!!!!'}),/PDF/);
  properties.PAPER_INTAKE_ENABLED='false';
  assert.throws(()=>call('paper_submit',payload('x@example.test')),/not open/);
  assert.equal(call('paper_submit',payload('finalist@example.test')).already_recorded,true);
  properties.PAPER_INTAKE_ENABLED='true';properties.PAPER_DEADLINE_AT='2000-01-01T00:00:00Z';
  assert.throws(()=>call('paper_submit',payload('x@example.test')),/not open/);
  properties.PAPER_DEADLINE_AT='2099-01-01T00:00:00Z';
  mode='reject';const pending=call('paper_submit',payload('retry@example.test'));
  assert.equal(pending.request.status,'stored');assert.equal(pending.request.mail_status,'pending');
  mode='ok';context.retryPaperNotifications();assert.equal(rows.find(r=>r.email==='retry@example.test').mail_status,'sent');
  mode='timeout';const uncertain=call('paper_submit',payload('timeout@example.test'));
  assert.equal(uncertain.request.status,'stored');assert.equal(uncertain.request.mail_status,'delivery_unknown');
  const before=sends;mode='ok';context.retryPaperNotifications();call('paper_submit',payload('timeout@example.test'));assert.equal(sends,before);
  failStoreReceipt=true;assert.throws(()=>call('paper_submit',payload('lost@example.test')),/Lost sheet/);
  assert.equal(call('paper_submit',payload('lost@example.test')).request.status,'stored');
  assert.equal(rows.filter(r=>r.email==='lost@example.test').length,1);
  const oldGet=doubles.DriveApp.getFolderById;
  doubles.DriveApp.getFolderById=id=>({...oldGet(id),getSharingAccess:()=> 'ANYONE'});
  assert.throws(()=>call('paper_submit',payload('private@example.test')),/publicly shared/);
  doubles.DriveApp.getFolderById=oldGet;
  assert.throws(()=>call('paper_admin_status'),/Organizer/);
  assert.equal(call('paper_admin_status',{admin:true}).enabled,true);
  assert.throws(()=>call('paper_admin_configure',{admin:true,enabled:true,deadline_at:'not-a-date'}),/deadline/);
  assert.throws(()=>call('paper_admin_smoke',{admin:true,probe_id:'x'}),/probe/);
  const probe={admin:true,probe_id:'paper_probe_test_001',send_test_notification:true,pdf_base64:pdf.toString('base64')};
  const smoke=call('paper_admin_smoke',probe);assert.equal(smoke.request.mail_status,'sent');
  const afterSmoke=sends;call('paper_admin_smoke',probe);assert.equal(sends,afterSmoke);
  assert.equal(rows.find(r=>r.paper_id===smoke.request.paper_id).is_test,true);
  console.log('Papers: auth, stage routing, private/test storage, byte-exact attachment, duplicates, revisions, invalid/large PDFs, cutoff, mail retry/uncertainty, lost receipt recovery passed.');
} finally {fs.rmSync(directory,{recursive:true,force:true});}
