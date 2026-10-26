const assert = require("node:assert/strict");
const { spawn, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const base = process.argv[2] || "http://127.0.0.1:8042";
  const root = path.resolve(__dirname, "..");
  const originalCss = execFileSync("git", ["show", "HEAD:static/css/site.css"], { cwd: root, encoding: "utf8" });
  const currentCss = fs.readFileSync(path.join(root, "static/css/site.css"), "utf8");
  assert.equal(currentCss.match(/^body \{[\s\S]*?^\}/m)[0], originalCss.match(/^body \{[\s\S]*?^\}/m)[0], "Original page gradient is unchanged");
  const snapshotPath = process.argv[3] || "/__preview__/preliminary-leaderboard.json";
  const snapshot = await (await fetch(base + snapshotPath)).json();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "rsc-preliminary-chrome-"));
  const chrome = spawn("google-chrome", ["--headless=new", "--no-sandbox", "--disable-gpu", "--disable-background-networking",
    "--remote-allow-origins=*", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  let socket;
  const exited = new Promise(resolve => chrome.once("exit", resolve));
  try {
    const portFile = path.join(profile, "DevToolsActivePort");
    for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await sleep(100);
    assert(fs.existsSync(portFile));
    const port = fs.readFileSync(portFile, "utf8").split("\n")[0];
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(pages.find(page => page.type === "page").webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let id = 0;
    const pending = new Map(), errors = [], requests = [];
    const rpc = (method, params = {}) => new Promise((resolve, reject) => {
      const current = ++id;
      pending.set(current, { resolve, reject });
      socket.send(JSON.stringify({ id: current, method, params }));
    });
    socket.onmessage = event => {
      const message = JSON.parse(event.data), waiter = pending.get(message.id);
      if (waiter) {
        pending.delete(message.id);
        if (message.error) waiter.reject(new Error(message.error.message));
        else waiter.resolve(message.result);
      }
      if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text);
      if (message.method === "Fetch.requestPaused") {
        const paused = message.params;
        requests.push(paused.request.url);
        const local = paused.request.url.startsWith(base + "/");
        rpc(local ? "Fetch.continueRequest" : "Fetch.fulfillRequest", { requestId: paused.requestId,
          ...(local ? {} : { responseCode: 204, body: "" }) }).catch(() => {});
      }
    };
    const evaluate = async expression => {
      const result = await rpc("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const until = async expression => {
      for (let i = 0; i < 200; i++) {
        if (await evaluate(expression)) return;
        await sleep(100);
      }
      throw new Error("Timed out: " + expression + "\n" + await evaluate("document.body.innerText.slice(0,1200)"));
    };
    await rpc("Page.enable");
    await rpc("Runtime.enable");
    await rpc("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
    await rpc("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await rpc("Page.navigate", { url: base + "/index.html#/leaderboard" });
    await until(`document.querySelectorAll('.leaderboard-table tbody tr').length===${snapshot.team_count * 11}`);
    assert.equal(await evaluate("document.querySelector('h1').textContent"), "Preliminary leaderboard.");
    assert.equal(await evaluate("document.querySelectorAll('.leaderboard-section').length"), 11);
    assert.equal(await evaluate("document.querySelector('.leaderboard-section').id"), "leaderboard-overall");
    assert.equal(await evaluate("document.querySelectorAll('.preliminary-tabs,.leaderboard-warning,[data-preliminary-search]').length"), 0);
    assert.equal(await evaluate("document.querySelectorAll('.leaderboard-task-nav,[data-leaderboard-jump]').length"), 0, "Task navigation is removed");
    assert.equal(await evaluate("document.querySelectorAll('.leaderboard-overview,.leaderboard-summary').length"), 0);
    assert.equal(await evaluate("document.body.innerText.includes('Participant ranked')"), false);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.leaderboard-table tbody td:nth-child(2)')).verticalAlign"), "middle");
    assert.equal(await evaluate("[...document.querySelectorAll('.leaderboard-table')].every(table=>getComputedStyle(table).backgroundColor==='rgba(220, 239, 210, 0.2)')"), true, "Every table uses the old public leaderboard's faint green");
    assert.equal(await evaluate("[...document.querySelectorAll('.leaderboard-table tbody tr,.leaderboard-table thead th')].every(row=>getComputedStyle(row).backgroundColor==='rgba(0, 0, 0, 0)')"), true, "Green is applied once, without darker headers or podium rows");
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.leaderboard-model > strong')).color===getComputedStyle(document.querySelector('.eyebrow')).color"), true, "Team names use the existing orange text color");
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.leaderboard-method')).color!==getComputedStyle(document.querySelector('.leaderboard-model > strong')).color"), true, "Method names retain their muted color");
    assert.equal(await evaluate("/Local preview|Reference results notice|reproducibility notice/i.test(document.body.innerText)"), false);
    assert.equal(await evaluate("document.querySelector('.leaderboard-table tbody tr .leaderboard-model > strong').textContent"), snapshot.tables[0].rows[0].team_name);
    assert.equal(await evaluate("document.querySelector('.leaderboard-table tbody tr .leaderboard-method').textContent"), snapshot.tables[0].rows[0].model_name);
    assert.equal(await evaluate("document.querySelector('.leaderboard-table tbody tr').cells[2].textContent.trim()"), snapshot.tables[0].rows[0].weighted_all.toFixed(1));
    assert.equal(await evaluate("(() => {const name=document.querySelector('.leaderboard-model > strong');const method=document.querySelector('.leaderboard-method');return method.getBoundingClientRect().top>=name.getBoundingClientRect().bottom && parseFloat(getComputedStyle(method).fontSize)<parseFloat(getComputedStyle(name).fontSize) && getComputedStyle(name).fontFamily.includes('Fraunces');})()"), true, "Team name above a smaller method name, with the original font");
    assert.deepEqual(await evaluate("[...document.querySelector('.leaderboard-table thead tr').cells].map(cell=>cell.textContent.trim())"), ["Rank", "Team / Method", "Score", "Success", "Steps", "Inference (ms)"]);
    assert.equal(await evaluate("/hippovla|luxi\s*tech/i.test(document.body.innerText)"), false);
    for (const [width, height, mobile, name] of [[1440, 1000, false, "desktop"], [390, 844, true, "mobile"], [320, 740, true, "mobile-small"]]) {
      await rpc("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
      await sleep(150);
      assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth+1"), false, name + " has no page overflow");
      if (!mobile) assert.equal(await evaluate("document.querySelector('.leaderboard-table').scrollWidth<=document.querySelector('.leaderboard-shell').clientWidth+1"), true, "Desktop shows every metric column");
      const shot = await rpc("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(`/tmp/rsc-preliminary-${name}.png`, Buffer.from(shot.data, "base64"));
      await evaluate("location.hash='/leaderboard/sample_loading'");
      await until("document.querySelector('#leaderboard-sample_loading').getBoundingClientRect().top<500");
      assert.equal(await evaluate("document.querySelector('.leaderboard-section').id"), "leaderboard-overall", "Jumping never reorders tables");
      assert.equal(await evaluate("(() => { const target=document.querySelector('#leaderboard-sample_loading').getBoundingClientRect(); const header=document.querySelector('.site-header').getBoundingClientRect(); return target.top>=header.bottom-1 && target.top<=header.bottom+30; })()"), true, name + " task deep link remains below the site header");
      const jumpShot = await rpc("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(`/tmp/rsc-preliminary-jump-${name}.png`, Buffer.from(jumpShot.data, "base64"));
      await evaluate("location.hash='/leaderboard'");
      await until("location.hash==='#/leaderboard'");
      await evaluate("window.scrollTo({top:0,behavior:'instant'})");
    }
    for (const table of snapshot.tables) {
      const row = table.rows.find(item => item.model_name === "AnonymousVLA");
      const expression = `[...document.querySelectorAll('#leaderboard-${table.id} tbody tr')].find(row=>row.querySelector('.leaderboard-model > strong').textContent==='AnonymousVLA')`;
      assert.equal(await evaluate(`(${expression}).querySelector('.leaderboard-model > strong').textContent`), "AnonymousVLA");
      assert.equal(await evaluate(`(${expression}).querySelector('.leaderboard-method').textContent`), "AnonymousVLA");
      assert.equal(await evaluate(`(${expression}).cells[2].textContent.trim()`), row.weighted_score.toFixed(1));
      const expectedInference = row.inference_ms >= 100 ? `${Math.round(row.inference_ms)} ms` : `${row.inference_ms.toFixed(1)} ms`;
      assert.equal(await evaluate(`(${expression}).cells[5].textContent.trim()`), expectedInference);
    }
    await rpc("Emulation.setDeviceMetricsOverride", { width:1440, height:1000, deviceScaleFactor:1, mobile:false });
    await evaluate("location.hash='/leaderboard/sample_loading'");
    await until("document.querySelector('#leaderboard-sample_loading').getBoundingClientRect().top<500");
    assert.equal(await evaluate("document.querySelector('.leaderboard-section').id"), "leaderboard-overall");
    const taskShot = await rpc("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync("/tmp/rsc-preliminary-task.png", Buffer.from(taskShot.data, "base64"));
    await evaluate("window.originalFetch=fetch; window.fetch=async()=>new Response('',{status:503}); window.ROBO_SYN_PRELIMINARY.refresh()");
    await until("!!document.querySelector('[role=alert]')");
    assert.equal(await evaluate("document.querySelector('.leaderboard-table')"), null, "Failure never falls back to old results");
    await evaluate("window.fetch=window.originalFetch; document.querySelector('[data-preliminary-refresh]').click()");
    await until("document.querySelectorAll('.leaderboard-table').length===11");
    assert.equal(requests.some(url => /script\.google\.com|reviewer_private_leaderboard/.test(url)), false);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, reviewed_teams: snapshot.team_count, task_tables_checked: 11,
      anonymous_alias: true, private_api_requests: 0, screenshots: ["desktop", "mobile", "mobile-small"] }));
  } finally {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ id: 999999, method: "Browser.close" }));
      await sleep(500);
    }
    socket?.close();
    chrome.kill("SIGTERM");
    await exited;
    for (let attempt = 0; attempt < 20; attempt++) {
      try { await fs.promises.rm(profile, { recursive: true, force: true }); break; }
      catch (error) {
        if (attempt === 19 || !["ENOTEMPTY", "EBUSY"].includes(error.code)) throw error;
        await sleep(250);
      }
    }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
