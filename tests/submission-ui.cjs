const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "rsc-submit-chrome-"));
  const chrome = spawn("google-chrome", ["--headless=new", "--no-sandbox", "--disable-gpu",
    "--remote-allow-origins=*", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--window-size=1440,1000", "about:blank"], { stdio: "ignore" });
  let socket;
  try {
    const portFile = path.join(profile, "DevToolsActivePort");
    for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await sleep(100);
    assert(fs.existsSync(portFile));
    const port = fs.readFileSync(portFile, "utf8").split("\n")[0];
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(pages.find(page => page.type === "page").webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let id = 0;
    const pending = new Map();
    socket.onmessage = event => {
      const message = JSON.parse(event.data), waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message)); else waiter.resolve(message.result);
    };
    const rpc = (method, params = {}) => new Promise((resolve, reject) => {
      const current = ++id; pending.set(current, { resolve, reject });
      socket.send(JSON.stringify({ id: current, method, params }));
    });
    const evaluate = async expression => {
      const result = await rpc("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    };
    const until = async expression => {
      for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await sleep(100); }
      throw new Error("Timed out: " + expression);
    };
    await rpc("Page.enable");
    await rpc("Page.addScriptToEvaluateOnNewDocument", { source: `
      sessionStorage.setItem("robosynchallenge-session-v1", JSON.stringify({version:1,
        user:{id:"synthetic@example.invalid",email:"synthetic@example.invalid",username:"Synthetic test",role:"participant"},
        session:{session_id:"synthetic",expires_at:"2099-01-01T00:00:00Z"}}));
      window.submissionCalls=[];
      window.submissionGate={allowed:true,deadline_at:"2099-10-12T12:00:00Z",exception:false};
      const testGate=new URLSearchParams(location.search).get("test_gate");
      if(testGate==="closed") window.submissionGate={allowed:false,deadline_at:"2026-10-12T12:00:00Z",exception:false,contact_email:"robosynchallenge@gmail.com"};
      if(testGate==="extension") window.submissionGate={allowed:true,deadline_at:"2026-10-12T12:00:00Z",exception:true,exception_expires_at:"2099-01-01T00:00:00Z"};
      const originalFetch=window.fetch;
      window.fetch=async function(url, options) {
        if (!String(url).startsWith("https://script.google.com/")) return originalFetch(url, options);
        const payload=JSON.parse(options?.body || "{}");
        if(payload.action==="submission_status") return new Response(JSON.stringify({ok:true,...window.submissionGate}));
        if(payload.action==="submit_policy") {
          window.submissionCalls.push(payload);
          await new Promise(resolve=>setTimeout(resolve,100));
          return new Response(JSON.stringify({ok:false,error:"Synthetic backend refusal; no real request sent"}));
        }
        return new Response(JSON.stringify({ok:true,rows:[],submissions:[],evaluations:[]}));
      };
    ` });
    await rpc("Page.navigate", { url: "http://127.0.0.1:8032/#/submit-policy" });
    await until("!!document.querySelector('[data-form=evaluation]')");
    await until("!document.querySelector('[data-form=evaluation] [type=submit]').disabled");
    assert.equal(await evaluate("document.querySelectorAll('[name^=checkpoint_]').length"), 11);
    assert.equal(await evaluate("document.querySelector('.task-checkpoints').open"), true);
    await evaluate(`(() => {
      const form=document.querySelector('[data-form=evaluation]');
      const values={artifact_name:"Synthetic",title:"Test",short_description:"Test",code_link:"https://github.com/example/test",
        checkpoint_link:"https://huggingface.co/example/common",data_source_text:"Test",technical_notes:"All tasks"};
      Object.entries(values).forEach(([name,value])=>form.elements[name].value=value);
      form.requestSubmit();
    })()`);
    await until("document.querySelector('[data-evaluation-status]')?.hidden===false");
    assert.equal(await evaluate("window.submissionCalls.length"), 0);
    await evaluate("document.querySelector('[name=all_tasks_confirmed]').checked=true; document.querySelector('[name=checkpoint_click_bell]').value='https://huggingface.co/example/bell'; document.querySelector('[data-form=evaluation]').requestSubmit(); document.querySelector('[data-form=evaluation]').requestSubmit()");
    await until("window.submissionCalls.length===1 && !document.querySelector('[type=submit]').disabled");
    const payload = await evaluate("window.submissionCalls[0].submission");
    assert.equal(Object.keys(payload.task_checkpoint_links).length, 10);
    assert.equal(payload.task_checkpoint_links.click_bell, "https://huggingface.co/example/bell");
    assert.equal(payload.task_checkpoint_links.water_pouring, "https://huggingface.co/example/common");
    assert.equal(payload.all_tasks_confirmed, true);
    assert.equal(await evaluate("document.querySelector('[data-evaluation-status]').textContent.includes('Synthetic backend refusal')"), true);
    await rpc("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }).then(result =>
      fs.writeFileSync("/tmp/rsc-submission-desktop.png", Buffer.from(result.data, "base64")));
    await rpc("Page.navigate", { url: "http://127.0.0.1:8032/?test_gate=closed#/submit-policy" });
    await until("!!document.querySelector('[data-form=evaluation]') && document.body.textContent.includes('closed')");
    assert.equal(await evaluate("document.querySelector('[data-form=evaluation] [type=submit]').disabled"),true);
    assert.equal(await evaluate("document.body.textContent.includes('robosynchallenge@gmail.com')"),true);
    await rpc("Page.navigate", { url: "http://127.0.0.1:8032/?test_gate=extension#/submit-policy" });
    await until("!!document.querySelector('[data-form=evaluation]') && !document.querySelector('[data-form=evaluation] [type=submit]').disabled");
    assert.equal(await evaluate("document.body.textContent.includes('organizer-approved extension')"),true);
    console.log("Submission UI: ten-task mapping, shared checkpoint, override, required confirmation, visible errors and double-submit guard passed; no real API calls.");
  } finally {
    socket?.close();
    const stopped = new Promise(resolve => chrome.once("exit", resolve));
    chrome.kill();
    await Promise.race([stopped, sleep(5000)]);
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
