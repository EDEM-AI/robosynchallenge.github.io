// Extend the existing real-browser read-only harness with evidence-link resolution.
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const filename = path.join(__dirname, "reviewer-observer.cjs");
let source = fs.readFileSync(filename, "utf8");
function replace(before, after) {
  if (!source.includes(before)) throw new Error("Observer browser harness changed");
  source = source.replace(before, after);
}
replace('const profile = fs.mkdtempSync', `
  const evidenceJob = jobs.find(job => job.evaluation_id === "eval_1e815230feb54b");
  evidenceJob.results = [{task:"click_bell",status:"submitted",summary:{episodes:100,success_rate:50,average_steps:20},
    artifacts:{sha256:"a".repeat(64),url:"https://old-storage.example/evidence.zip"}}];
  const profile = fs.mkdtempSync`);
replace('if(!["reviewer_login","reviewer_queue","reviewer_mail_status"].includes(payload.action))',
  'if(!["reviewer_login","reviewer_queue","reviewer_mail_status","reviewer_resolve_evidence"].includes(payload.action))');
replace(String.raw`window.observerCalls.some(action=>![\"reviewer_login\",\"reviewer_queue\",\"reviewer_mail_status\"].includes(action))`,
  String.raw`window.observerCalls.some(action=>![\"reviewer_login\",\"reviewer_queue\",\"reviewer_mail_status\",\"reviewer_resolve_evidence\"].includes(action))`);
replace('if(${JSON.stringify(live)}) return originalFetch(url,options);', `
        if(payload.action === "reviewer_resolve_evidence") return new Response(JSON.stringify({ok:true,
          storage:"onedrive-02",download_url:"https://new-storage.example/signed-evidence.zip"}));
        if(\u0024{JSON.stringify(live)}) return originalFetch(url,options);`);
const marker = 'await evaluate("const next=document.querySelector(\'[data-review-action=next]\');';
const position = source.indexOf(marker);
if (position < 0) throw new Error("Observer evidence test insertion changed");
source = source.slice(0,position) + `
    await evaluate("window.open=()=>({opener:null,location:{replace:url=>{window.resolvedEvidence=url;}},close(){window.evidenceClosed=true;}}); document.querySelector('[data-review-action=open-evidence]').click()");
    await until("window.resolvedEvidence === 'https://new-storage.example/signed-evidence.zip'");
    assert.equal(await evaluate("window.observerCalls.filter(action=>action==='reviewer_resolve_evidence').length"),1);
    assert.equal(await evaluate("document.querySelector('fieldset.reviewer-readonly').disabled"),true);
    assert.equal(await evaluate("window.resolvedEvidence.includes('token')"),false);
    console.log("PASS read-only evidence click resolves to the new pool without modifying progress");
    ` + source.slice(position);
const test = new Module(filename, module);
test.filename = filename;
test.paths = Module._nodeModulePaths(__dirname);
test._compile(source, filename);
