const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { fixture } = require("./private-leaderboard-backend.cjs");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const f = fixture();
  f.job("eval_complete", { stages: 5, model: "Reviewed model" });
  f.job("eval_pending", { model: "Pending model" });
  f.job("eval_partial", { count: 9, model: "Partial model" });
  f.job("eval_blocked", { blocked: true, model: "Blocked model" });
  const board = f.call();
  const sample = JSON.parse(fs.readFileSync(path.join(__dirname, "../static/reviewer-preview.json"), "utf8")).jobs.find(job => !job.local_walkthrough);
  const jobs = board.tables[0].rows.map(row => ({ ...sample, evaluation_id: row.evaluation_id, team_name: row.team_name, artifact_name: row.model_name,
    email: "participant@example.test", reviewer_email: f.credentials.reviewer_email, evaluation_blocked: row.review_status === "blocked",
    workflow: { machine_id: "", stages: Array.from({ length: 5 }, (_, index) => ({ done: index < (row.review_status === "reviewed" ? 5 : 4), checks: {} })) },
    overall_summary: row,
    results: board.tables.slice(1).flatMap(table => { const task = table.rows.find(task => task.evaluation_id === row.evaluation_id);
      return task.success_rate == null ? [] : [{ task: table.id, status: row.review_status === "reviewed" ? "checked" : "submitted", summary: { ...task, episodes: 100 }, artifacts: {} }]; }) }));
  // The assigned workspace has editable checks; leaderboard navigation must not save them.
  jobs[0].workflow.stages[4].done = false;
  const preview = { captured_at: "private-leaderboard-test", reviewer_email: f.credentials.reviewer_email,
    reviewer_token_sha256: f.data.get("Reviewers")[0].token_sha256, jobs, machines: [] };
  const root = path.resolve(__dirname, "..");
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (pathname === "/static/reviewer-preview.json") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(preview)); return; }
    const file = path.resolve(root, "." + pathname, pathname.endsWith("/") ? "index.html" : "");
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" })[path.extname(file)] || "application/octet-stream");
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/eval_backend/`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "rsc-private-chrome-"));
  const chrome = spawn("google-chrome", ["--headless=new", "--no-sandbox", "--disable-gpu", "--disable-background-networking", "--remote-allow-origins=*",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--window-size=1440,1000", "about:blank"], { stdio: "ignore" });
  let socket;
  try {
    const portFile = path.join(profile, "DevToolsActivePort");
    for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await sleep(100);
    assert(fs.existsSync(portFile), "Chrome DevTools must start");
    const port = fs.readFileSync(portFile, "utf8").split("\n")[0];
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(pages.find(page => page.type === "page").webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let id = 0;
    const pending = new Map(), browserErrors = [];
    const rpc = (method, params = {}) => new Promise((resolve, reject) => {
      const current = ++id; pending.set(current, { resolve, reject }); socket.send(JSON.stringify({ id: current, method, params }));
    });
    socket.onmessage = event => {
      const message = JSON.parse(event.data), waiter = pending.get(message.id);
      if (waiter) { pending.delete(message.id); if (message.error) waiter.reject(new Error(message.error.message)); else waiter.resolve(message.result); }
      if (message.method === "Runtime.exceptionThrown") browserErrors.push(message.params.exceptionDetails.text);
      if (message.method === "Fetch.requestPaused") {
        const request = message.params;
        // Remote fonts and any accidental real API access never leave this test.
        const allowed = request.request.url.startsWith(`http://127.0.0.1:${server.address().port}/`);
        rpc(allowed ? "Fetch.continueRequest" : "Fetch.fulfillRequest", { requestId: request.requestId, ...(allowed ? {} : { responseCode: 204, body: "" }) }).catch(() => {});
      }
    };
    const evaluate = async expression => {
      const result = await rpc("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const until = async expression => {
      for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await sleep(100); }
      throw new Error("Timed out: " + expression + "\n" + await evaluate("document.body.innerText.slice(0,1000)"));
    };
    const click = action => evaluate(`document.querySelector('[data-review-action="${action}"]').click()`);
    const screenshot = async name => {
      const shot = await rpc("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(`/tmp/rsc-private-leaderboard-${name}.png`, Buffer.from(shot.data, "base64"));
    };
    await rpc("Page.enable"); await rpc("Runtime.enable");
    await rpc("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
    await rpc("Page.addScriptToEvaluateOnNewDocument", { source: `
      window.testCalls=[];
      window.testBoard=${JSON.stringify(board)};
      window.testJobs=${JSON.stringify(jobs)};
      window.testRole=sessionStorage.getItem('testRole')||'evaluator';
      const originalInterval=window.setInterval;
      window.setInterval=function(callback, delay, ...args) {
        if(delay===45000) { window.testProgressTick=callback; return 1; }
        return originalInterval(callback, delay, ...args);
      };
      const originalFetch=window.fetch;
      window.fetch=async function(url, options) {
        if(String(url).startsWith('../') || String(url).startsWith(location.origin)) return originalFetch(url, options);
        const payload=JSON.parse(options?.body||'{}'); window.testCalls.push(payload.action);
        if(!['reviewer_login','reviewer_queue','reviewer_mail_status','reviewer_private_leaderboard'].includes(payload.action)) throw new Error('Unexpected mutation: '+payload.action);
        if(payload.action==='reviewer_private_leaderboard') {
          if(window.delayBoard) await new Promise(resolve=>window.releaseBoard=resolve);
          if(window.failBoard) return new Response(JSON.stringify({ok:false,error:'Private board unavailable'}));
          return new Response(JSON.stringify(window.testBoard));
        }
        return new Response(JSON.stringify({ok:true,reviewer:{role:window.testRole},jobs:window.testJobs,messages:[]}));
      };
    ` });
    await rpc("Page.navigate", { url });
    await until("!!document.querySelector('[data-review-form=login]')");
    assert.equal(await evaluate("document.querySelector('[data-review-action=private-leaderboard]')"), null);
    assert.deepEqual(await evaluate("window.testCalls"), []);
    await evaluate(`document.querySelector('[name=email]').value=${JSON.stringify(f.credentials.reviewer_email)}; document.querySelector('[name=token]').value=${JSON.stringify(f.token)}; document.querySelector('[data-review-form=login]').requestSubmit()`);
    await until("!!document.querySelector('[data-review-action=private-leaderboard]') && !document.querySelector('[data-review-action=refresh]').disabled");
    const oldLayout = await evaluate("document.querySelectorAll('.reviewer-job').length");
    assert.equal(oldLayout, 4);
    await evaluate("document.querySelector('[data-stage-check]').checked=true");
    await click("private-leaderboard");
    await until("document.querySelectorAll('.reviewer-private-table').length===11");
    assert.deepEqual(await evaluate("window.testCalls"), ["reviewer_login", "reviewer_queue", "reviewer_private_leaderboard"]);
    assert.equal(await evaluate("document.querySelector('.reviewer-private-section h3').textContent"), "Overall - 10 tasks");
    assert.equal(await evaluate("document.querySelectorAll('.reviewer-private-table')[0].textContent.includes('Pending review')"), true);
    assert.equal(await evaluate("document.querySelectorAll('[data-review-action=private-leaderboard][aria-current=page]').length"), 1);
    assert.equal(await evaluate("[...document.querySelectorAll('.reviewer-private-table')].every(t=>t.querySelectorAll('tbody tr').length===4)"), true);
    assert.equal(await evaluate("document.querySelectorAll('.reviewer-private-table')[0].textContent.includes('Incomplete Tasks')"), true);
    assert.equal(await evaluate("document.querySelector('.reviewer-private-board').textContent.includes('@')"), false);
    const oldProgress = await evaluate("document.querySelector('.reviewer-progress progress').value");
    await evaluate("window.originalBoard=document.querySelector('.reviewer-private-table'); window.testJobs[0].workflow.stages[4].done=true; window.testProgressTick()");
    assert.equal(await evaluate("document.querySelector('.reviewer-progress progress').value"), oldProgress + 1,
      "A ready request's completed stage must update without a page reload");
    assert.equal(await evaluate("window.originalBoard===document.querySelector('.reviewer-private-table')"), true,
      "Background progress reads must not redraw the leaderboard");
    assert.equal(await evaluate("window.testCalls.at(-1)"), "reviewer_queue");
    await evaluate("window.testJobs[0].workflow.stages[4].done=false");
    await click("refresh");
    await until(`document.querySelector('.reviewer-progress progress').value===${oldProgress} && document.querySelectorAll('.reviewer-private-table').length===11 && !document.querySelector('[data-review-action=refresh]').disabled`);
    for (const [width, height, mobile, name] of [[1440,1000,false,"desktop"], [390,844,true,"mobile"], [320,740,true,"mobile-small"]]) {
      await rpc("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
      await sleep(100);
      assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"), false, name + " has no page overflow");
      assert.equal(await evaluate("(() => {const title=document.querySelector('.reviewer-progress strong').getBoundingClientRect();const summary=document.querySelector('.reviewer-progress > span').getBoundingClientRect();return title.right<=summary.left || title.bottom<=summary.top || summary.bottom<=title.top;})()"), true, "Progress text does not overlap");
      assert.equal(await evaluate("[...document.querySelectorAll('.reviewer-private-table th')].every(el=>el.scrollWidth<=el.clientWidth)"), true, "Table headings fit");
      assert.equal(await evaluate("(() => {const buttons=[...document.querySelectorAll('.reviewer-overview-tools button')].map(b=>b.getBoundingClientRect()); return buttons.every((a,i)=>buttons.every((b,j)=>i===j || a.right<=b.left || b.right<=a.left || a.bottom<=b.top || b.bottom<=a.top));})()"), true, "Toolbar does not overlap");
      if (mobile) {
        assert.equal(await evaluate("(() => { const scroll=document.querySelector('.reviewer-private-scroll'); scroll.scrollLeft=1000; return scroll.scrollLeft>0; })()"), true);
        await evaluate("document.querySelector('.reviewer-private-scroll').scrollLeft=0");
      }
      await screenshot(name);
    }
    await rpc("Emulation.setDeviceMetricsOverride", { width:1440, height:1000, deviceScaleFactor:1, mobile:false });
    await evaluate("window.failBoard=true"); await click("refresh");
    await until("!!document.querySelector('[data-review-action=private-leaderboard-retry]')");
    assert.equal(await evaluate("document.querySelectorAll('.reviewer-private-table').length"), 0, "Failed refresh clears stale private data");
    await evaluate("window.failBoard=false"); await click("private-leaderboard-retry");
    await until("document.querySelectorAll('.reviewer-private-table').length===11");
    await click("workspace");
    assert.equal(await evaluate("document.querySelectorAll('.reviewer-job').length"), oldLayout);
    await evaluate("document.querySelector('[data-review-job=eval_blocked]').click()");
    await until("document.querySelector('[data-evaluation-id]')?.textContent==='eval_blocked'");
    await click("private-leaderboard");
    await until("document.querySelectorAll('.reviewer-private-table').length===11");
    assert.equal(await evaluate("document.querySelector('.reviewer-private-table').textContent.includes('Blocked / invalid')"), true, "A blocked selection must not block the global read");
    await click("workspace");
    await evaluate("location.hash='private-leaderboard'");
    await until("document.querySelectorAll('.reviewer-private-table').length===11");
    await rpc("Page.reload");
    await until("document.querySelectorAll('.reviewer-private-table').length===11");
    await evaluate("window.testBoard={ok:true,tables:window.testBoard.tables.map(t=>({...t,rows:[]}))}"); await click("refresh");
    await until("document.querySelector('.reviewer-private-table')?.textContent.includes('No eligible evaluation requests.')");
    await evaluate("window.testBoard={ok:true,tables:[]}"); await click("refresh");
    await until("document.querySelector('.reviewer-error')?.textContent.includes('Incomplete private leaderboard response')");
    await evaluate("window.delayBoard=true"); await click("private-leaderboard-retry");
    await until("document.querySelector('.reviewer-private-board')?.getAttribute('aria-busy')==='true'");
    assert.equal(await evaluate("document.querySelector('[data-review-action=refresh]').disabled"), true);
    await click("logout"); await evaluate("window.releaseBoard()");
    await until("!!document.querySelector('[data-review-form=login]')");
    assert.equal(await evaluate("document.querySelector('.reviewer-private-table')"), null);
    // Tester reads must reach the backend rather than the local mutation simulator.
    await evaluate(`sessionStorage.setItem('testRole','tester');sessionStorage.setItem('rsc-reviewer-credentials-v1',JSON.stringify({email:${JSON.stringify(f.credentials.reviewer_email)},token:${JSON.stringify(f.token)}}))`);
    await rpc("Page.reload");
    await until("document.querySelectorAll('.reviewer-private-table').length===11");
    assert.equal(await evaluate("window.testCalls.includes('reviewer_private_leaderboard')"), true);
    assert.equal(await evaluate("window.testCalls.some(a=>!['reviewer_queue','reviewer_private_leaderboard'].includes(a))"), false);
    await evaluate("sessionStorage.setItem('testRole','observer')"); await rpc("Page.reload");
    await until("document.querySelectorAll('.reviewer-private-table').length===11");
    // An empty assignment queue must not hide the global private view.
    await click("workspace"); await evaluate("window.testJobs=[]"); await click("refresh");
    await until("document.querySelectorAll('.reviewer-job').length===0");
    await click("private-leaderboard"); await until("document.querySelectorAll('.reviewer-private-table').length===11");
    // Local preview authenticates before projecting fixture summaries, with no remote call.
    await click("logout");
    await rpc("Page.navigate", { url: url + "?review_preview=1#private-leaderboard" });
    await until("!!document.querySelector('[data-review-form=login]')");
    await evaluate(`document.querySelector('[name=email]').value=${JSON.stringify(f.credentials.reviewer_email)};document.querySelector('[name=token]').value='wrong';document.querySelector('[data-review-form=login]').requestSubmit()`);
    await until("!!document.querySelector('.reviewer-error')");
    assert.equal(await evaluate("document.querySelector('.reviewer-private-table')"), null);
    await evaluate(`document.querySelector('[name=email]').value=${JSON.stringify(f.credentials.reviewer_email)};document.querySelector('[name=token]').value=${JSON.stringify(f.token)};document.querySelector('[data-review-form=login]').requestSubmit()`);
    await until("document.querySelectorAll('.reviewer-private-table').length===11");
    assert.deepEqual(await evaluate("window.testCalls"), []);
    assert.equal(await evaluate("document.querySelectorAll('.reviewer-private-table')[0].textContent.includes('Incomplete Tasks')"), true);
    assert.deepEqual(browserErrors, []);
    console.log("PASS private leaderboard CDP: desktop 1440, mobile 390/320 screenshots; authenticated reads, no mutation, navigation/deep links, refresh/retry/empty/error/loading, logout race, tester/observer and local preview");
    console.log("Screenshots: /tmp/rsc-private-leaderboard-{desktop,mobile,mobile-small}.png");
  } finally {
    socket?.close();
    const exited = new Promise(resolve => chrome.once("exit", resolve));
    chrome.kill();
    await exited;
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
