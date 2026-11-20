const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../static/js/finals-reviewer.js','utf8');
const job={request_id:'real_fixture',team_name:'Fixture',submission:{tasks:[],method_name:'fixture'},
 review:{owner:'reviewer@example.test',platform_checks:{},accepted:{}},progress:{steps:[],completed:0,collected:0},
 runtimes:[],assignments:[],attempts:[],correction_intake:[{status:'pending_review',received_at:'2026-11-20',
 source_revision:3,subject:'<img src=x onerror=alert(1)>',note:'Review only',request_id:'real_old',
 gmail_message_id:'abc',commit_candidates:['https://github.com/team/policy/commit/'+'a'.repeat(40)]}]};
const root={innerHTML:'',addEventListener:()=>{},querySelector:()=>null};
const viewer={role:'admin',email:'reviewer@example.test'};
vm.runInNewContext(source,{document:{getElementById:()=>root},
 sessionStorage:{getItem:()=>JSON.stringify({...viewer,token:'fixture'})},
 window:{ROBO_SYN_CONFIG:{API_BASE_URL:'https://fixture.invalid'}},setInterval:()=>{},
 fetch:async()=>({ok:true,json:async()=>({ok:true,viewer,requests:[job],platforms:[]})})});
setImmediate(()=>{
 assert.match(root.innerHTML,/Correction replies · 1/);
 assert.match(root.innerHTML,/Pending Review/);
 assert.match(root.innerHTML,/Receiving a reply does not approve or deploy/);
 assert.match(root.innerHTML,/&lt;img/);
 assert.doesNotMatch(root.innerHTML,/<img src=x/);
 assert.match(root.innerHTML,/real_old/);
 console.log('Correction inbox UI: pending status, source revision, candidate, escaping and no deploy action passed.');
});
