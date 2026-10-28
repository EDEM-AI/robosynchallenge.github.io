const assert = require("node:assert/strict");
const { spawn, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const base = process.argv[2] || "http://127.0.0.1:8042";
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "static/js/pages-app.js"), "utf8");
  const original = execFileSync("git", ["show", "HEAD:static/js/pages-app.js"], { cwd: root, encoding: "utf8" });
  const extract = value => value.match(/const FAQ_ITEMS = (\[[\s\S]*?\n  \]);/)[1];
  assert.equal(extract(source), extract(original), "All preliminary questions and answers remain unchanged");
  const questions = new Function("return " + extract(original))().map(item => item.question);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "rsc-faq-chrome-"));
  const chrome = spawn("google-chrome", ["--headless=new", "--no-sandbox", "--disable-gpu",
    "--disable-background-networking", "--remote-allow-origins=*", "--remote-debugging-port=0",
    `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  const exited = new Promise(resolve => chrome.once("exit", resolve));
  let socket;
  try {
    const portFile = path.join(profile, "DevToolsActivePort");
    for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await sleep(100);
    assert(fs.existsSync(portFile));
    const port = fs.readFileSync(portFile, "utf8").split("\n")[0];
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(pages.find(page => page.type === "page").webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let sequence = 0;
    const pending = new Map(), errors = [], requests = [];
    const rpc = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
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
      for (let i = 0; i < 150; i++) {
        if (await evaluate(expression)) return;
        await sleep(100);
      }
      throw new Error("Timed out: " + expression + "\n" + await evaluate("JSON.stringify({url:location.href,ready:document.readyState,text:document.body.innerText.slice(0,600)})"));
    };
    await rpc("Page.enable");
    await rpc("Runtime.enable");
    await rpc("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
    await rpc("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await rpc("Page.navigate", { url: base + "/#/faq" });
    await until("location.pathname==='/faq/' && location.hash==='#preliminary' && !!document.querySelector('.faq-stage-switch')");
    assert.deepEqual(await evaluate("[...document.querySelectorAll('.faq-content h2')].map(item=>item.textContent.replace(/^Q:\\s*/, '').trim())"), questions);
    assert.equal(await evaluate("document.querySelector('.site-nav a.active').textContent"), "FAQ");
    assert.equal(await evaluate("document.querySelector('.faq-stage-link[aria-current]').textContent"), "Preliminary");
    assert.equal(await evaluate("new URL(document.querySelector('.faq-stage-link:last-child').href).pathname"), "/faq/");
    await evaluate("document.querySelector('.faq-stage-link:last-child').click()");
    await until("location.hash==='#finals' && document.querySelector('.faq-stage-link[aria-current]')?.textContent==='Final Round'");
    assert.equal(await evaluate("document.querySelectorAll('.faq-item').length"), 28);
    assert.equal(await evaluate("document.querySelectorAll('.faq-group-title').length"), 6);
    assert.equal(await evaluate("/TBD|to be confirmed|not yet available/i.test(document.querySelector('.faq-section').innerText)"), false, "Final copy contains no tentative markers");
    assert.equal(await evaluate("document.querySelector('.faq-section [role=status]')"), null);
    await rpc("Page.reload");
    await until("document.querySelector('.faq-stage-link[aria-current]')?.textContent==='Final Round'");
    await evaluate("history.back()");
    await until("location.hash==='#preliminary' && document.querySelectorAll('.faq-item').length>0");
    await evaluate("history.forward()");
    await until("location.hash==='#finals' && document.querySelector('.faq-stage-link[aria-current]')?.textContent==='Final Round'");
    await evaluate("location.hash=''");
    await until("location.pathname==='/faq/' && location.hash==='#preliminary' && document.querySelectorAll('.faq-item').length===16");
    for (const [width, height, mobile, name] of [[1440, 1000, false, "desktop"], [390, 844, true, "mobile"], [320, 740, true, "mobile-small"]]) {
      await rpc("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
      for (const stage of ["preliminary", "finals"]) {
        await rpc("Page.navigate", { url: base + "/faq/#" + stage });
        await until(`document.querySelector('.faq-stage-link[aria-current]')?.getAttribute('href')==='faq/#${stage}'`);
        assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"), true, name + " has no page overflow");
        assert.equal(await evaluate("[...document.querySelectorAll('.faq-stage-link')].every(link=>link.scrollWidth<=link.clientWidth && link.getBoundingClientRect().height>=44)"), true, "Stage labels fit stable tap targets");
        assert.equal(await evaluate("(() => {const [a,b]=[...document.querySelectorAll('.faq-stage-link')].map(link=>link.getBoundingClientRect());return a.right<=b.left && Math.abs(a.width-b.width)<1 && a.top===b.top;})()"), true, "Balanced, nonoverlapping stage controls");
        const screenshot = await rpc("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(`/tmp/rsc-faq-${stage}-${name}.png`, Buffer.from(screenshot.data, "base64"));
      }
    }
    await rpc("Page.navigate", { url: base + "/faq/?default-check=1" });
    await until("location.hash==='#preliminary' && document.querySelectorAll('.faq-item').length>0");
    await evaluate("document.querySelector('.brand').click()");
    await until("location.pathname==='/' && location.hash==='#/home' && !!document.querySelector('.site-nav a[href=\"faq/#preliminary\"]')");
    await evaluate("document.querySelector('.site-nav a[href=\"faq/#preliminary\"]').click()");
    await until("location.pathname==='/faq/' && location.hash==='#preliminary' && document.querySelectorAll('.faq-item').length>0");
    assert.equal(requests.some(url => /script\.google\.com/.test(url)), false, "Local preview never calls production backend");
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, preliminary_questions: questions.length, finals_questions: 28, finals_sections: 6,
      direct_links: true, default_preliminary: true, history: true, screenshots: ["desktop", "mobile", "mobile-small"] }));
  } finally {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ id: 999999, method: "Browser.close" }));
      await sleep(500);
    }
    socket?.close();
    if (chrome.exitCode === null) chrome.kill("SIGTERM");
    await exited;
    await fs.promises.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
