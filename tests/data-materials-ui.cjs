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
  for (const type of ["real", "sim"]) {
    const panel = new RegExp(`<article class="data-panel data-panel-${type}">[\\s\\S]*?<\\/article>`);
    assert.equal(source.match(panel)[0], original.match(panel)[0], `${type} data panel remains unchanged`);
  }
  const materials = new Function("return " + source.match(/const FINAL_ROUND_MATERIALS = (\[[\s\S]*?\n  \]);/)[1])();
  assert.deepEqual(materials.map(item => item.id), ["cam_high", "cam_wrist", "mounting_plate"]);
  assert.equal(new Set(materials.map(item => item.url)).size, 3);
  for (const item of materials) {
    assert.match(item.url, /^https:\/\/drive\.google\.com\/drive\/folders\/[\w-]+$/);
    assert.match(item.title + item.detail + item.format, /^[\x20-\x7e]+$/);
  }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "rsc-materials-chrome-"));
  const chrome = spawn("google-chrome", ["--headless=new", "--no-sandbox", "--disable-gpu", "--disable-background-networking",
    "--remote-allow-origins=*", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
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
        const allowed = paused.request.url.startsWith(base + "/") || /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(paused.request.url);
        rpc(allowed ? "Fetch.continueRequest" : "Fetch.fulfillRequest", { requestId: paused.requestId,
          ...(allowed ? {} : { responseCode: 204, body: "" }) }).catch(() => {});
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
      throw new Error("Timed out: " + expression);
    };
    await rpc("Page.enable");
    await rpc("Runtime.enable");
    await rpc("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
    for (const [width, height, mobile, name] of [[1440, 1000, false, "desktop"], [390, 844, true, "mobile"], [320, 740, true, "mobile-small"]]) {
      await rpc("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
      await rpc("Page.navigate", { url: base + "/#/data" });
      await until("document.querySelectorAll('.material-row').length===3 && document.querySelectorAll('.material-row svg').length===6");
      await evaluate("document.fonts.ready");
      await until("[...document.querySelectorAll('.data-panel > img')].every(img=>img.complete && img.naturalWidth>0)");
      assert.equal(await evaluate("document.querySelectorAll('.data-columns > .data-panel').length"), 3);
      assert.equal(await evaluate("document.querySelector('.data-columns > .data-panel:last-child').classList.contains('data-panel-materials')"), true);
      assert.deepEqual(await evaluate("[...document.querySelectorAll('.material-row')].map(a=>a.href)"), materials.map(item => item.url));
      assert.equal(await evaluate("[...document.querySelectorAll('.material-row')].every(a=>a.target==='_blank' && a.rel.includes('noopener') && a.title)"), true);
      assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"), true, name + " page fits");
      assert.equal(await evaluate("[...document.querySelectorAll('.material-row,.material-info')].every(el=>el.scrollWidth<=el.clientWidth+1)"), true, name + " labels fit");
      assert.equal(await evaluate("/coming soon|placeholder|future|TBD/i.test(document.querySelector('.data-panel-materials').innerText)"), false);
      await evaluate("document.querySelector('.data-panel-materials').scrollIntoView({block:'start',behavior:'instant'});window.scrollBy({top:-document.querySelector('.site-header').getBoundingClientRect().height-18,behavior:'instant'})");
      const screenshot = await rpc("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(`/tmp/rsc-materials-${name}.png`, Buffer.from(screenshot.data, "base64"));
      const rect = await evaluate("(()=>{const r=document.querySelector('.data-panel-materials').getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1}})()");
      const panelScreenshot = await rpc("Page.captureScreenshot", { format: "png", clip: rect, captureBeyondViewport: true });
      fs.writeFileSync(`/tmp/rsc-materials-panel-${name}.png`, Buffer.from(panelScreenshot.data, "base64"));
      await evaluate("document.querySelector('.material-row').focus()");
      assert.equal(await evaluate("document.activeElement.matches('.material-row')"), true);
      await rpc("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
      await rpc("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
      assert.equal(await evaluate("document.activeElement.dataset.material"), "cam_wrist");
    }
    assert.equal(requests.some(url => /script\.google\.com/.test(url)), false, "No production backend requests");
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, resources: materials.length, existing_data_unchanged: true, viewports: [1440, 390, 320], file_bodies_downloaded: 0 }));
  } finally {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ id: 999999, method: "Browser.close" }));
    await sleep(300);
    socket?.close();
    if (chrome.exitCode === null) chrome.kill("SIGTERM");
    await exited;
    await fs.promises.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
