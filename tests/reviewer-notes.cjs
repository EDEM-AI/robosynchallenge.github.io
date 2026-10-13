const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const root = path.join(__dirname, "..");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const token = "act_offline_notes_fixture";
const longNotes = [
  "Robo/Praxis correction: immutable policy commit and checkpoint revisions.",
  "python policy/praxis/eval.py --task click_bell --checkpoint /path/to/checkpoints",
  "Install the documented dependencies before running each task.",
  "https://huggingface.co/fixture/checkpoint/resolve/" + "a".repeat(600),
  "<script>window.untrustedNoteExecuted = true</script>",
].join("\n").repeat(100);

function job(mode) {
  const email = mode === "organizer" ? "1070055979@qq.com" : "reviewer@example.com";
  return {
    evaluation_id: "eval_notes_fixture", submission_id: "sub_notes_fixture", team_name: "Robo / Praxis",
    artifact_name: "Participant policy", email: "participant@example.com", reviewer_email: email,
    local_walkthrough: mode === "demo", technical_notes: mode === "empty" ? "" : mode === "short" ? "Run policy/eval.sh\nInstall requirements.txt" : longNotes,
    correction: mode === "empty" ? null : { status: "awaiting", round: 2, deadline_at: "2026-10-20 12:00:00 UTC", notes: mode === "short" ? "Checkpoint URL corrected." : longNotes },
    coverage_status: "legacy_unverified", task_checkpoint_links: {}, task_commands: {}, results: [],
    workflow: { stages: Array.from({ length: 5 }, () => ({ done: false, checks: {} })) },
  };
}

async function main() {
  // Serve only local fixtures: this test cannot send email or mutate the real backend.
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const mode = url.searchParams.get("mode") || "demo";
    const fixture = job(mode);
    if (url.pathname === "/api" || url.pathname === "/static/reviewer-preview.json") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        ok: true, reviewer: { role: mode === "organizer" ? "supervisor" : mode }, jobs: [fixture],
        reviewer_email: fixture.reviewer_email,
        reviewer_token_sha256: crypto.createHash("sha256").update(token).digest("hex"),
        captured_at: "offline-notes", machines: [],
      }));
      return;
    }
    if (url.pathname.startsWith("/static/")) {
      const allowed = ["/static/css/site.css", "/static/css/reviewer.css", "/static/js/reviewer-page.js", "/static/js/lucide.min.js"];
      if (!allowed.includes(url.pathname)) { res.writeHead(404); res.end(); return; }
      const isCss = url.pathname.endsWith(".css");
      res.setHeader("Content-Type", isCss ? "text/css" : "application/javascript");
      let source = fs.readFileSync(path.join(root, url.pathname.slice(1)), "utf8");
      if (isCss) source = source.replace(/^@import[^\n]+\n/m, "");
      res.end(source);
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="stylesheet" href="/static/css/site.css"><link rel="stylesheet" href="/static/css/reviewer.css">
      <script>window.ROBO_SYN_CONFIG={API_BASE_URL:${JSON.stringify("/api?mode=" + mode)}};
      sessionStorage.clear();sessionStorage.setItem("rsc-reviewer-credentials-v1",${JSON.stringify(JSON.stringify({ email: fixture.reviewer_email, token }))});</script>
      <script src="/static/js/lucide.min.js"></script><script src="/static/js/reviewer-page.js"></script></head><body><main></main>
      <script>document.querySelector('main').innerHTML=RSCReviewer.render();RSCReviewer.mount();</script></body></html>`);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/eval_backend/`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "rsc-notes-chrome-"));
  const chrome = spawn("google-chrome", ["--headless=new", "--no-sandbox", "--disable-gpu", "--remote-allow-origins=*",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--window-size=1440,900", "about:blank"], { stdio: "ignore" });
  let socket;
  try {
    const portFile = path.join(profile, "DevToolsActivePort");
    for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await sleep(100);
    assert(fs.existsSync(portFile), "Chrome DevTools did not start");
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
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const until = async expression => {
      for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await sleep(50); }
      throw new Error("Timed out: " + expression);
    };
    await rpc("Page.enable");
    for (const mode of ["evaluator", "organizer", "tester", "observer", "demo"]) {
      await rpc("Page.navigate", { url: base + "?mode=" + mode + (mode === "demo" ? "&review_preview=1" : "") });
      await until("!!document.querySelector('.reviewer-detail')");
      assert.equal(await evaluate("document.querySelectorAll('.reviewer-participant-notes').length"), 2);
      assert.equal(await evaluate("[...document.querySelectorAll('.reviewer-participant-notes')].every(note => !note.open)"), true);
      assert.equal(await evaluate("document.querySelector('.reviewer-participant-response').innerText.includes('awaiting') && document.querySelector('.reviewer-participant-response').innerText.includes('Correction round: 2') && document.querySelector('.reviewer-participant-response').innerText.includes('Deadline (UTC)')"), true);
      assert.equal(await evaluate("document.querySelector('.reviewer-participant-notes p').textContent"), longNotes);
      assert.equal(await evaluate("!!window.untrustedNoteExecuted || !!document.querySelector('.reviewer-participant-notes script')"), false);
      await evaluate("document.querySelector('.reviewer-participant-notes summary').focus()");
      await rpc("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", text: "\r", windowsVirtualKeyCode: 13 });
      await rpc("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      assert.equal(await evaluate("document.querySelector('.reviewer-participant-notes').open"), true, "Keyboard users can expand correction notes");
      for (const [width, height] of [[1920, 1080], [1440, 900], [1280, 800], [1024, 768], [768, 1024], [390, 844], [320, 568]]) {
        await rpc("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 768 });
        assert.equal(await evaluate(`(() => {
          const fields=document.createElement('div');fields.className='reviewer-command-fields';
          fields.innerHTML='<label>First</label><label>Second</label>';
          document.querySelector('.reviewer-stage-body').append(fields);
          const columns=getComputedStyle(fields).gridTemplateColumns.split(' ').length;fields.remove();
          return columns===${width <= 900 ? 1 : 2};
        })()`), true, "Mobile command-field columns must not be overridden by later CSS");
        await evaluate("document.querySelectorAll('.reviewer-participant-notes').forEach(note=>note.open=false)");
        const closedHeight = await evaluate("document.querySelector('.reviewer-detail-head').getBoundingClientRect().height");
        await evaluate("document.querySelector('.reviewer-participant-notes summary').click();document.querySelectorAll('.reviewer-participant-notes')[1].querySelector('summary').click()");
        const geometry = await evaluate(`(() => {
          const head=document.querySelector('.reviewer-detail-head').getBoundingClientRect();
          const body=document.querySelector('.reviewer-stage-body').getBoundingClientRect();
          const nav=document.querySelector('.reviewer-stage-nav').getBoundingClientRect();
          const footer=document.querySelector('.reviewer-footer').getBoundingClientRect();
          return { overflow:document.documentElement.scrollWidth>innerWidth, bounded:head.height<=301,
            stageVisible:body.height>=${width > 900 ? 140 : 320}, separated:nav.bottom<=body.top+1 && body.bottom<=footer.top+1,
            footerVisible:${width > 900 ? "footer.bottom<=innerHeight" : "true"},
            notesScrollable:[...document.querySelectorAll('.reviewer-participant-notes p')].every(p=>p.clientHeight<=161 && p.scrollHeight>p.clientHeight && getComputedStyle(p).overflowY==='auto') };
        })()`);
        assert.deepEqual(geometry, { overflow: false, bounded: true, stageVisible: true, separated: true, footerVisible: true, notesScrollable: true }, `${mode} at ${width}x${height}`);
        assert(await evaluate(`document.querySelector('.reviewer-detail-head').getBoundingClientRect().height <= ${closedHeight} + 165`));
        await evaluate("document.querySelectorAll('.reviewer-participant-notes p').forEach(p=>p.scrollTop=p.scrollHeight)");
        assert.equal(await evaluate("[...document.querySelectorAll('.reviewer-participant-notes p')].every(p=>p.scrollTop>0 && p.tabIndex===0 && !!p.getAttribute('aria-label'))"), true);
        if (mode === "evaluator" && [1440, 390].includes(width)) {
          await evaluate("document.querySelectorAll('.reviewer-participant-notes p').forEach(p=>p.scrollTop=0);document.querySelector('.reviewer-detail').scrollIntoView({block:'start'})");
          await sleep(150);
          const shot = await rpc("Page.captureScreenshot", { format: "png" });
          fs.writeFileSync(`/tmp/rsc-review-notes-${width}.png`, Buffer.from(shot.data, "base64"));
        }
      }
      await evaluate("document.querySelector('[data-review-stage=\"2\"]').click()");
      assert.equal(await evaluate("document.querySelector('[data-review-stage=\"2\"]').classList.contains('active') && document.querySelector('.reviewer-stage-title').textContent.includes('Environment check')"), true);
      assert.equal(await evaluate("document.querySelector('.reviewer-participant-notes').open"), false, "Browsing stages resets the header disclosure to compact form");
    }
    for (const mode of ["short", "empty"]) {
      await rpc("Page.navigate", { url: base + "?mode=" + mode });
      await until("!!document.querySelector('.reviewer-detail')");
      assert.equal(await evaluate("document.querySelectorAll('.reviewer-participant-notes').length"), mode === "empty" ? 0 : 2);
      if (mode === "short") {
        await evaluate("document.querySelectorAll('.reviewer-participant-notes').forEach(note=>note.open=true)");
        assert.equal(await evaluate("[...document.querySelectorAll('.reviewer-participant-notes p')].every(p=>p.scrollHeight===p.clientHeight)"), true, "Short notes need no scrolling");
      }
    }
    console.log("Long Robo/Praxis correction and run notes: collapsed, escaped, scrollable, accessible, and stage-safe across five account/demo modes and seven desktop/mobile sizes.");
  } finally {
    socket?.close();
    chrome.kill();
    if (chrome.exitCode === null && chrome.signalCode === null) await new Promise(resolve => chrome.once("exit", resolve));
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
