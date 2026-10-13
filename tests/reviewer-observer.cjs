const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const live = Boolean(process.env.RSC_REVIEWER_OBSERVER_TOKEN_FILE);
  const token = live ? fs.readFileSync(process.env.RSC_REVIEWER_OBSERVER_TOKEN_FILE, "utf8").trim() : "act_" + "0".repeat(64);
  const jobs = JSON.parse(fs.readFileSync(path.join(__dirname, "../static/reviewer-preview.json"), "utf8")).jobs.filter(job => !job.local_walkthrough);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "rsc-observer-chrome-"));
  const chrome = spawn("google-chrome", ["--headless=new", "--no-sandbox", "--disable-gpu", "--remote-allow-origins=*",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--window-size=1440,1000", "about:blank"], { stdio: "ignore" });
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
      for (let i = 0; i < 600; i++) { if (await evaluate(expression)) return; await sleep(100); }
      throw new Error("Timed out: " + expression);
    };
    await rpc("Page.enable");
    await rpc("Page.addScriptToEvaluateOnNewDocument", { source: `
      sessionStorage.setItem("rsc-reviewer-credentials-v1", JSON.stringify({email:"1070055979@qq.com",token:${JSON.stringify(token)}}));
      window.observerCalls=[];
      const originalFetch=window.fetch;
      window.fetch=async function(url,options) {
        if(!String(url).startsWith("https://script.google.com/")) return originalFetch(url,options);
        const payload=JSON.parse(options?.body||"{}");
        window.observerCalls.push(payload.action);
        if(!["reviewer_login","reviewer_queue","reviewer_mail_status"].includes(payload.action)) throw new Error("Unexpected observer mutation");
        if(${JSON.stringify(live)}) return originalFetch(url,options);
        return new Response(JSON.stringify({ok:true,reviewer:{email:"1070055979@qq.com",role:"observer"},jobs:${JSON.stringify(jobs)},messages:${JSON.stringify(jobs.flatMap(job => (job.messages || []).map(message => ({...message,evaluation_id:job.evaluation_id,recipient:job.email,team_name:job.team_name,gmail_url:'https://mail.google.com/mail/u/#search/test'}))))}}));
      };
    ` });
    await rpc("Page.navigate", { url: process.env.RSC_REVIEWER_TEST_URL || "http://127.0.0.1:8032/eval_backend/" });
    await until("document.querySelectorAll('.reviewer-job').length>0");
    assert.equal(await evaluate("document.body.innerText.includes('Global evaluation progress')"), true);
    assert.equal(await evaluate("document.querySelector('.reviewer-sidebar-head h2').textContent"), "All requests");
    assert.equal(await evaluate("document.querySelector('[data-review-job=eval_LOCALWALKTHROUGH]')"), null);
    await evaluate("document.querySelector('[data-review-job=eval_1e815230feb54b]').click()");
    await until("document.querySelector('[data-evaluation-id]').textContent==='eval_1e815230feb54b'");
    assert.equal(await evaluate("document.querySelectorAll('.reviewer-detail-head .reviewer-participant-response').length"), 1);
    assert.equal(await evaluate("document.querySelector('.reviewer-stage-body .reviewer-participant-response')"), null);
    const placement = await evaluate("(() => {const response=document.querySelector('.reviewer-participant-response');const artifact=response.previousElementSibling;return {below:response.getBoundingClientRect().top>=artifact.getBoundingClientRect().bottom,aligned:Math.abs(response.getBoundingClientRect().left-artifact.getBoundingClientRect().left)<1};})()");
    assert.deepEqual(placement, {below:true,aligned:true});
    assert.equal(await evaluate("document.querySelector('fieldset.reviewer-readonly').disabled"), true);
    assert.equal(await evaluate("document.querySelector('[data-review-action=email]').disabled"), true);
    assert.equal(await evaluate("document.querySelector('[data-review-action=next]').disabled"), true);
    for (const width of [1280,1440,1920]) {
      await rpc("Emulation.setDeviceMetricsOverride", { width, height:1000, deviceScaleFactor:1, mobile:false });
      assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"), false);
    }
    await rpc("Page.captureScreenshot", {format:"png"}).then(result => fs.writeFileSync("/tmp/rsc-observer-header.png", Buffer.from(result.data,"base64")));
    await evaluate("document.querySelector('[data-review-stage=\"4\"]').click()");
    await until("document.querySelector('[data-review-stage=\"4\"]').classList.contains('active')");
    assert.equal(await evaluate("window.observerCalls.filter(action=>action==='reviewer_queue').length"), 1, "Browsing stages must not refetch the queue");
    await evaluate("const next=document.querySelector('[data-review-action=next]'); next.disabled=false; next.click(); const email=document.querySelector('[data-review-action=email]'); email.disabled=false; email.click()");
    assert.equal(await evaluate("document.querySelector('[data-mail-composer]')"), null);
    await evaluate("document.querySelector('[data-review-action=downloads]').click()");
    await until("document.querySelector('.reviewer-overview h2')?.textContent==='Download assigned checkpoints'");
    assert.equal(await evaluate("document.body.innerText.includes('download_assigned_checkpoints.py') && document.body.innerText.includes('symbolic link')"), true);
    assert.equal(await evaluate("document.body.innerText.includes('--token-file')"), false);
    assert.equal(await evaluate("window.observerCalls.filter(action=>action==='reviewer_queue').length"), 1, "Opening download commands must be local");
    await rpc("Page.captureScreenshot", {format:"png"}).then(result => fs.writeFileSync("/tmp/rsc-batch-download.png", Buffer.from(result.data,"base64")));
    await evaluate("document.querySelector('[data-review-action=email-status]').click()");
    await until("document.querySelector('.reviewer-overview h2')?.textContent==='Email status' && document.querySelectorAll('.reviewer-mail-table a[href^=\"https://mail.google.com/\"]').length>0");
    assert.equal(await evaluate("document.querySelectorAll('.reviewer-mail-table a[href^=\"https://mail.google.com/\"]').length>0"), true);
    for (const width of [1280,1440,1920]) {
      await rpc("Emulation.setDeviceMetricsOverride", { width, height:1000, deviceScaleFactor:1, mobile:false });
      assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"), false);
    }
    await rpc("Page.captureScreenshot", {format:"png"}).then(result => fs.writeFileSync("/tmp/rsc-email-status.png", Buffer.from(result.data,"base64")));
    await evaluate("document.querySelector('[data-review-action=workspace]').click()");
    await until("document.querySelectorAll('.reviewer-job').length>0");
    assert.equal(await evaluate("window.observerCalls.filter(action=>action==='reviewer_queue').length"), 1, "Email status must load only mail metadata, not the entire queue");
    assert.equal(await evaluate("window.observerCalls.some(action=>![\"reviewer_login\",\"reviewer_queue\",\"reviewer_mail_status\"].includes(action))"), false);
    if (!live) {
      await rpc("Page.addScriptToEvaluateOnNewDocument", {source:`
        sessionStorage.setItem("rsc-reviewer-credentials-v1", JSON.stringify({email:"781785786@qq.com",token:${JSON.stringify(token)}}));
        window.navigationCalls=[]; window.navigationSaves=[];
        const assigned=${JSON.stringify(jobs)}.map(job=>({...job,reviewer_email:'781785786@qq.com'}));
        window.fetch=async function(url,options) {
          const payload=JSON.parse(options.body); window.navigationCalls.push(payload.action);
          if(payload.action==='reviewer_save_checks') {
            await new Promise(resolve=>setTimeout(resolve,400));
            window.navigationSaves.push(payload);
            return new Response(JSON.stringify({ok:true}));
          }
          if(payload.action!=='reviewer_queue') throw new Error('Unexpected navigation operation');
          return new Response(JSON.stringify({ok:true,reviewer:{email:'781785786@qq.com',role:'evaluator'},jobs:assigned}));
        };
      `});
      await rpc("Page.reload");
      await until("document.querySelector('fieldset.reviewer-readonly')?.disabled===false");
      const ids = await evaluate("[...document.querySelectorAll('[data-review-job]')].slice(0,2).map(button=>button.dataset.reviewJob)");
      await evaluate(`document.querySelector('[data-review-job="${ids[0]}"]').click()`);
      const switchResult = await evaluate(`(() => {
        const check=document.querySelector('[data-stage-check=ten_tasks]'); check.checked=true; check.dispatchEvent(new Event('input',{bubbles:true}));
        document.querySelector('[data-review-job="${ids[1]}"]').click();
        return document.querySelector('[data-evaluation-id]').textContent;
      })()`);
      assert.equal(switchResult, ids[1], "Navigation must render before the delayed save finishes");
      await until("window.navigationCalls.includes('reviewer_save_checks')");
      await evaluate(`document.querySelector('[data-review-job="${ids[0]}"]').click(); const check=document.querySelector('[data-stage-check=ten_tasks]'); check.checked=false; check.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('[data-review-job="${ids[1]}"]').click()`);
      await until("window.navigationSaves.length===2");
      assert.deepEqual(await evaluate("window.navigationSaves.map(row=>row.checks.ten_tasks)"), [true,false], "Background saves must retain the final checklist state in order");
      assert.equal(await evaluate("window.navigationCalls.filter(action=>action==='reviewer_queue').length"), 1);
    }
    console.log(JSON.stringify({mode:live?"live":"mocked",visible_requests:await evaluate("document.querySelectorAll('.reviewer-job').length"),header_placement:"below artifact and email",readonly:"all stages browseable; no mutation requests",screenshot:"/tmp/rsc-observer-header.png"}));
  } finally {
    const stopped = new Promise(resolve => chrome.once("exit",resolve));
    if(socket?.readyState===WebSocket.OPEN) socket.send(JSON.stringify({id:999999,method:"Browser.close"})); else chrome.kill();
    await Promise.race([stopped,sleep(5000)]);
    socket?.close();
    if(chrome.exitCode===null) chrome.kill();
    fs.rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:500});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
