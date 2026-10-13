const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "static/js/reviewer-page.js"), "utf8");
const token = "act_offline_adjudication_fixture";
const message = "Submission currently invalid; evaluation paused pending organizer review";
const ids = ["eval_a708a5aa6c3d4a", "eval_ec678b68836c4e"];
const reason = ('Issue79 organizer review\n<script>window.untrustedReason = true</script>\n' + "x".repeat(800) + "\n").repeat(40);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const held = job => Object.assign(job, {
  state: "invalid", evaluation_blocked: true,
  adjudication: { status: "invalid_pending_review", reason, decision_id: "issue79-fixture", participant_commit: "b".repeat(40), decided_at: "2026-10-13T00:00:00Z" },
});

function jobs(email, local = false) {
  return ids.map((evaluation_id, index) => ({
    evaluation_id, submission_id: "sub_fixture_" + index, team_name: index ? "OnceAgain" : "sirius",
    artifact_name: "Fixture policy", email: "participant" + index + "@example.com", reviewer_email: email,
    local_walkthrough: local, state: "ready", bundle_commit: "a".repeat(40),
    bundle_url: "https://github.com/ZhaoRunyi/RoboSynChallenge_eval/tree/submissions/" + evaluation_id,
    policy_dirs: ["policy/fixture"], version_status: "final", hf_check_context: "unchanged", hf_check_status: "passed",
    preparation_attempt: 0, preparation_status: "ready", coverage_status: "verified_all_10", task_checkpoint_links: {},
    task_commands: { click_bell: "bash policy/fixture/eval.sh" },
    results: [{ task: "click_bell", status: "submitted", command: "bash policy/fixture/eval.sh",
      summary: { episodes: 100, success_rate: 25, average_steps: 12 }, artifacts: { sha256: "c".repeat(64), url: "https://example.com/evidence.zip" } }],
    messages: [{ stage: 1, status: "sent", subject: "Preserved organizer email", sent_at: "2026-10-12T00:00:00Z" }],
    workflow: { stages: Array.from({ length: 5 }, () => ({ done: false, checks: {} })) },
  }));
}

function fixture(role, local = false) {
  const email = role === "supervisor" ? "1070055979@qq.com" : role + "@example.com";
  let snapshot = jobs(email, local);
  const calls = [];
  const context = vm.createContext({
    URL, URLSearchParams, structuredClone, console, TextEncoder, crypto: crypto.webcrypto,
    location: { hostname: "127.0.0.1", search: local ? "?review_preview=1" : "", hash: "" },
    window: { ROBO_SYN_CONFIG: { API_BASE_URL: "/offline-api" } },
    document: { querySelector: () => null }, sessionStorage: { getItem: () => null, setItem: () => {} },
    fetch: async (_, options) => {
      const action = options?.body ? JSON.parse(options.body).action : "preview_fixture";
      calls.push(action);
      return { ok: true, json: async () => ({ ok: true, reviewer: { role }, jobs: structuredClone(snapshot),
        reviewer_email: email, reviewer_token_sha256: crypto.createHash("sha256").update(token).digest("hex"), captured_at: "held-fixture", machines: [] }) };
    },
  });
  vm.runInContext(source.replace("window.RSCReviewer = { render, mount };",
    "window.test = {state, request, refresh, nextBlocker, evaluationBlocked, localChanges, commandDrafts, commandDraftKey, pendingSaves, saveStage, holdQueue:promise=>{saveChain=promise;}}; window.RSCReviewer = { render, mount };"), context);
  const test = context.window.test;
  test.state.credentials = { email, token };
  test.state.selected = ids[0];
  return { test, calls, get snapshot() { return snapshot; }, set snapshot(value) { snapshot = value; } };
}

async function logicChecks() {
  for (const role of ["evaluator", "admin", "supervisor", "tester"]) {
    const f = fixture(role), t = f.test;
    await t.refresh();
    if (["supervisor", "tester"].includes(role)) {
      await t.request("reviewer_complete_stage", { evaluation_id: ids[0], stage: 0, checks: { ten_tasks: true } });
      await t.request("reviewer_save_command", { evaluation_id: ids[0], task: "click_bell", command: "stale simulated command" });
      assert.equal(t.localChanges.size, 1);
    }
    t.state.drafts.set(ids[0] + ":0", { ten_tasks: true });
    t.state.drafts.set(ids[1] + ":0", { ten_tasks: true });
    t.commandDrafts.set(t.commandDraftKey(f.snapshot[0], "click_bell"), "stale command");
    t.commandDrafts.set(t.commandDraftKey(f.snapshot[1], "click_bell"), "other request command");
    const evidence = JSON.stringify([f.snapshot[0].results, f.snapshot[0].messages]);
    held(f.snapshot[0]);
    await t.refresh();
    assert.equal(t.localChanges.size, 0, "Same commit/context holds discard simulated test progress");
    assert.equal(t.state.jobs[0].workflow.stages[0].done, false);
    assert.equal(t.state.jobs[0].task_commands.click_bell, "bash policy/fixture/eval.sh");
    assert.equal(t.state.drafts.has(ids[0] + ":0"), false);
    assert.equal(t.state.drafts.has(ids[1] + ":0"), true);
    assert.equal(t.commandDrafts.size, 1, "Only held request's command drafts are discarded");
    assert.equal(JSON.stringify([t.state.jobs[0].results, t.state.jobs[0].messages]), evidence);
    const before = f.calls.length;
    for (let stage = 0; stage < 5; stage++) {
      t.state.stage = stage;
      assert.equal(t.nextBlocker(t.state.jobs[0]), message, "Real holds override organizer walkthrough gates");
    }
    for (const action of ["reviewer_save_checks", "reviewer_complete_stage", "reviewer_verify_coverage", "reviewer_save_command",
      "reviewer_check_result", "reviewer_retry_preparation", "reviewer_approve_version_exception", "reviewer_future_mutation"]) {
      await assert.rejects(t.request(action, { evaluation_id: ids[0], stage: 0, checks: {} }), { message });
    }
    await assert.rejects(t.request("reviewer_submission_window", { participant_email: f.snapshot[0].email }), { message });
    await t.saveStage();
    assert.equal(f.calls.length, before, "Held mutations never reach simulation or backend");
    await t.request("reviewer_send_issue", { evaluation_id: ids[0], stage: 0, body: "Offline fixture email" });
    if (["supervisor", "tester"].includes(role)) {
      assert.equal(f.calls.length, before, "Non-recording accounts still cannot send real email");
      assert.equal(t.localChanges.size, 0, "Email simulation must not overlay a held server job");
    } else assert.equal(f.calls.at(-1), "reviewer_send_issue");
    await t.request("reviewer_mail_status");
    assert.equal(f.calls.at(-1), "reviewer_mail_status");
  }
  const f = fixture("evaluator"), t = f.test;
  await t.refresh();
  for (const signal of [{ state: "invalid" }, { evaluation_blocked: true }, { adjudication: { status: "invalid_pending_review" } }]) {
    const job = { ...f.snapshot[0], ...signal };
    assert.equal(t.evaluationBlocked(job), true, "Each hold signal independently blocks evaluation");
  }
  assert.equal(t.evaluationBlocked(f.snapshot[0]), false);
  let resume;
  t.holdQueue(new Promise(resolve => { resume = resolve; }));
  t.state.drafts.set(ids[0] + ":0", { ten_tasks: true });
  const queued = t.saveStage();
  assert.equal(t.pendingSaves.size, 1);
  const ready = structuredClone(f.snapshot);
  held(f.snapshot[0]);
  await t.refresh();
  assert.equal(t.pendingSaves.size, 0);
  f.snapshot = ready;
  await t.refresh();
  resume();
  await queued;
  assert(!f.calls.includes("reviewer_save_checks"), "Queued pre-hold saves cannot replay even after hold release");
  t.state.drafts.set(ids[0] + ":0", { ten_tasks: true });
  f.snapshot[0].state = "running";
  await t.refresh();
  assert.equal(t.state.drafts.get(ids[0] + ":0").ten_tasks, true, "Ordinary non-hold state changes retain drafts");
  t.holdQueue(new Promise(resolve => { resume = resolve; }));
  const firstSave = t.saveStage();
  t.state.drafts.set(ids[0] + ":0", { ten_tasks: false });
  const lastSave = t.saveStage();
  resume();
  await Promise.all([firstSave, lastSave]);
  assert.equal(f.calls.filter(action => action === "reviewer_save_checks").length, 2, "Unheld queued saves still run in order");
  assert.equal(t.state.jobs[0].workflow.stages[0].checks.ten_tasks, false);
  const local = fixture("supervisor", true);
  await local.test.refresh();
  assert.equal(local.test.nextBlocker(local.test.state.jobs[0]), "", "Unheld local demo remains freely navigable");
  await local.test.request("reviewer_complete_stage", { evaluation_id: ids[0], stage: 0, checks: {} });
  await local.test.refresh();
  assert.equal(local.test.state.jobs[0].workflow.stages[0].done, true);
  held(local.test.state.jobs[0]);
  await assert.rejects(local.test.request("reviewer_complete_stage", { evaluation_id: ids[0], stage: 1 }), { message });
}

async function browserChecks() {
  const snapshots = new Map(), calls = new Map(), mailPayloads = new Map();
  const modes = ["evaluator", "admin", "supervisor", "tester", "observer", "demo"];
  for (const mode of modes) {
    const email = mode === "supervisor" ? "1070055979@qq.com" : mode + "@example.com";
    snapshots.set(mode, jobs(email, mode === "demo"));
    calls.set(mode, []);
    mailPayloads.set(mode, []);
  }
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost"), mode = url.searchParams.get("mode") || "demo";
    const snapshot = snapshots.get(mode);
    if (url.pathname === "/api" || url.pathname === "/static/reviewer-preview.json") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const payload = body ? JSON.parse(body) : { action: "preview_fixture" };
      calls.get(mode).push(payload.action);
      if (payload.action === "reviewer_send_issue") mailPayloads.get(mode).push(payload);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, reviewer: { role: mode }, jobs: snapshot, messages: snapshot.flatMap(job => job.messages),
        reviewer_email: snapshot[0].reviewer_email, reviewer_token_sha256: crypto.createHash("sha256").update(token).digest("hex"), captured_at: "offline-hold", machines: [] }));
      return;
    }
    if (url.pathname.startsWith("/static/")) {
      const allowed = ["/static/css/site.css", "/static/css/reviewer.css", "/static/js/reviewer-page.js", "/static/js/lucide.min.js"];
      if (!allowed.includes(url.pathname)) { res.writeHead(404); res.end(); return; }
      const css = url.pathname.endsWith(".css");
      res.setHeader("Content-Type", css ? "text/css" : "application/javascript");
      let text = fs.readFileSync(path.join(root, url.pathname.slice(1)), "utf8");
      if (css) text = text.replace(/^@import[^\n]+\n/m, "");
      res.end(text);
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="stylesheet" href="/static/css/site.css"><link rel="stylesheet" href="/static/css/reviewer.css">
      <script>window.ROBO_SYN_CONFIG={API_BASE_URL:${JSON.stringify("/api?mode=" + mode)}};
      sessionStorage.clear();sessionStorage.setItem('rsc-reviewer-credentials-v1',${JSON.stringify(JSON.stringify({ email: snapshot[0].reviewer_email, token }))});
      window.setInterval=callback=>{window.holdPoll=callback;return 1;};</script>
      <script src="/static/js/lucide.min.js"></script><script src="/static/js/reviewer-page.js"></script></head><body><main></main>
      <script>document.querySelector('main').innerHTML=RSCReviewer.render();RSCReviewer.mount();</script></body></html>`);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "rsc-hold-chrome-"));
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
      const response = JSON.parse(event.data), waiter = pending.get(response.id);
      if (!waiter) return;
      pending.delete(response.id);
      if (response.error) waiter.reject(new Error(response.error.message)); else waiter.resolve(response.result);
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
      for (let i = 0; i < 120; i++) { if (await evaluate(expression)) return; await sleep(50); }
      throw new Error("Timed out: " + expression);
    };
    await rpc("Page.enable");
    for (const mode of modes) {
      if (!["demo", "supervisor"].includes(mode)) snapshots.get(mode).forEach(held);
      if (mode === "tester") snapshots.get(mode)[1].workflow.stages.forEach(stage => { stage.done = true; });
      if (mode === "admin") {
        const failed = snapshots.get(mode)[1];
        failed.bundle_commit = ""; failed.bundle_url = ""; failed.coverage_status = "legacy_unverified";
        failed.preparation_status = "failed"; failed.preparation_error = "NO_LEGAL_VERSION"; failed.hf_check_status = "failed";
      }
      await rpc("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/eval_backend/?mode=${mode}${mode === "demo" ? "&review_preview=1" : ""}` });
      await until("!!document.querySelector('.reviewer-detail') && !document.querySelector('[data-review-action=refresh]').disabled");
      if (mode === "supervisor") {
        await evaluate("document.querySelector('[data-review-action=next]').click()");
        await until("document.querySelector('[data-review-stage=\"1\"]').classList.contains('active')");
        await evaluate("document.querySelector('[data-review-stage=\"3\"]').click();const input=document.querySelector('[data-task-command]');input.value='stale local command';input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.reviewer-stage-body').scrollTop=10000");
        snapshots.get(mode).forEach(held);
        await evaluate("document.activeElement.blur();document.querySelector('[data-review-action=refresh]').click()");
        await until("!!document.querySelector('[data-evaluation-hold]') && !document.querySelector('[data-review-action=refresh]').disabled");
        assert.equal(await evaluate("document.querySelectorAll('[data-review-stage].done').length"), 0, "Hold refresh discards completed local walkthrough stages");
        assert.equal(await evaluate("document.querySelector('.reviewer-stage-body').scrollTop"), 0, "New hold resets scroll to reveal the error");
        await evaluate("document.querySelector('[data-review-stage=\"3\"]').click()");
        assert.equal(await evaluate("document.querySelector('[data-task-command]').value"), "bash policy/fixture/eval.sh", "Hold refresh discards stale unsaved commands");
      }
      if (mode === "demo") {
        assert.equal(await evaluate("document.querySelector('[data-evaluation-hold]') === null"), true);
        await evaluate("document.querySelector('[data-review-stage=\"2\"]').click()");
        assert.equal(await evaluate("document.querySelector('[data-review-action=next]').disabled"), false);
        await evaluate("document.querySelector('[data-review-action=next]').click()");
        await until("document.querySelector('[data-review-stage=\"3\"]').classList.contains('active')");
        assert.equal(await evaluate("document.querySelector('[data-review-action=copy]').disabled"), false);
        continue;
      }
      assert.equal(await evaluate("document.querySelector('.reviewer-state').textContent"), "Invalid - pending review");
      for (const evaluationId of ids) {
        await evaluate(`document.querySelector('[data-review-job="${evaluationId}"]').click()`);
        for (let stage = 0; stage < 5; stage++) {
          await evaluate(`document.querySelector('[data-review-stage="${stage}"]').click()`);
          assert.equal(await evaluate("document.querySelector('[data-evaluation-hold] [role=alert]').textContent.trim()"), "ERROR: " + message);
          assert.equal(await evaluate("document.querySelector('[data-review-action=next]').disabled"), true);
          assert.equal(await evaluate("[...document.querySelectorAll('.reviewer-detail input, .reviewer-detail textarea, .reviewer-detail button:not([data-review-stage]):not([data-review-action=previous]):not([data-review-action=email]), .reviewer-detail select:not([data-task-picker])')].every(control=>control.disabled)"), true);
          assert.equal(await evaluate("document.querySelector('.reviewer-mail-log').textContent.includes('Preserved organizer email')"), true);
          await evaluate(`(() => {
            navigator.clipboard.writeText=async()=>{window.holdCopied=true;};
            document.querySelectorAll('.reviewer-detail [data-review-action=next], .reviewer-detail [data-review-action=retry-code], .reviewer-detail [data-review-action=copy]').forEach(button=>{button.disabled=false;button.click();});
            document.querySelectorAll('.reviewer-detail [data-review-form]').forEach(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
          })()`);
          assert.equal(await evaluate("!!window.holdCopied"), false, "Tampered copy controls cannot copy runnable commands");
        }
      }
      assert(calls.get(mode).every(action => ["reviewer_queue", "reviewer_mail_status"].includes(action)), "No held evaluation mutations reach offline backend");
      assert.equal(await evaluate("document.querySelector('[data-task-picker]').matches(':disabled')"), mode === "observer");
      await evaluate("document.querySelector('[data-review-stage=\"0\"]').click(); document.querySelector('[data-evaluation-hold] summary').click()");
      assert.equal(await evaluate("document.querySelector('[data-evaluation-hold] details').open"), true, "Hold reason remains inspectable, including for read-only observers");
      assert.equal(await evaluate("document.querySelector('[data-evaluation-hold] p').textContent"), reason);
      assert.equal(await evaluate("!!window.untrustedReason || !!document.querySelector('[data-evaluation-hold] script')"), false);
      for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
        await rpc("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 900 });
        assert.equal(await evaluate("document.documentElement.scrollWidth > innerWidth"), false);
        assert.equal(await evaluate("(() => {const p=document.querySelector('[data-evaluation-hold] p');return p.clientHeight<=161 && p.scrollHeight>p.clientHeight && getComputedStyle(p).overflowY==='auto' && p.tabIndex===0;})()"), true);
        if (mode === "evaluator" && width !== 320) {
          await evaluate("document.querySelector('.reviewer-detail').scrollIntoView({block:'start',behavior:'instant'})");
          const shot = await rpc("Page.captureScreenshot", { format: "png" });
          fs.writeFileSync(`/tmp/rsc-review-hold-${width}.png`, Buffer.from(shot.data, "base64"));
        }
      }
      await rpc("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
      await evaluate("document.querySelector('[data-review-action=email]').click()");
      if (mode === "observer") assert.equal(await evaluate("document.querySelector('[data-mail-composer]') === null"), true);
      else {
        assert.equal(await evaluate("document.querySelector('[data-review-form=email]').closest('fieldset').matches(':disabled')"), false, "Hold does not disable the composer's parent fieldset");
        assert.equal(await evaluate("[...document.querySelectorAll('[data-review-form=email] input, [data-review-form=email] textarea, [data-review-form=email] select, [data-review-form=email] button')].every(control=>!control.matches(':disabled'))"), true, "Composer controls have no inherited disabled state");
        await evaluate("const field=document.querySelector('[data-review-form=email] [name=body]');field.value='';field.focus()");
        assert.equal(await evaluate("document.activeElement===document.querySelector('[data-review-form=email] [name=body]')"), true, "Held email editor is reachable by focus");
        await rpc("Input.insertText", { text: "Offline edited hold email" });
        assert.equal(await evaluate("document.querySelector('[data-review-form=email] [name=body]').value"), "Offline edited hold email");
        await evaluate("document.querySelector('[data-review-form=email] button').click()");
        await until("!document.querySelector('[data-mail-composer]') && !!document.querySelector('.reviewer-toast')");
        assert.equal(calls.get(mode).includes("reviewer_send_issue"), ["evaluator", "admin"].includes(mode));
        if (["evaluator", "admin"].includes(mode)) assert.equal(mailPayloads.get(mode).at(-1).body, "Offline edited hold email");
        assert.equal(await evaluate("document.querySelector('[data-evaluation-hold]') !== null && document.querySelector('[data-review-action=next]').disabled"), true);
      }
      const before = calls.get(mode).length;
      await evaluate("document.activeElement.blur();window.holdPoll()");
      assert.equal(calls.get(mode).length, before, "Held pending jobs do not trigger automatic preparation polling");
      await evaluate("document.querySelector('[data-review-action=downloads]').click()");
      assert.equal(await evaluate("[...document.querySelectorAll('[data-review-action=copy]')].every(button=>!button.matches(':disabled'))"), true, "Bulk tools stay actionable even when all assigned requests are held");
      assert.equal(await evaluate("document.querySelector('.reviewer-description').textContent.includes('0 requests ready')"), true);
      await evaluate("document.querySelector('[data-review-action=workspace]').click()");
      const readyJob = jobs(snapshots.get(mode)[0].reviewer_email)[0];
      readyJob.evaluation_id = "eval_ready_download_fixture";
      readyJob.bundle_url = "https://github.com/ZhaoRunyi/RoboSynChallenge_eval/tree/submissions/" + readyJob.evaluation_id;
      snapshots.get(mode).push(readyJob);
      await evaluate("document.querySelector('[data-review-action=refresh]').click()");
      await until("document.querySelectorAll('[data-review-job]').length===3 && !document.querySelector('[data-review-action=refresh]').disabled");
      await evaluate("document.querySelector('[data-review-action=downloads]').click()");
      assert.equal(await evaluate("document.querySelector('.reviewer-description').textContent.includes('3 assigned requests') && document.querySelector('.reviewer-description').textContent.includes('1 requests ready')"), true, "Only unheld requests count as ready");
      assert.equal(await evaluate("document.querySelector('.reviewer-overview .reviewer-notice.error')===null"), true, "Mixed assigned queue has no blanket invalid-download error");
      assert.equal(await evaluate("[...document.querySelectorAll('[data-review-action=copy]')].every(button=>!button.matches(':disabled'))"), true);
      await evaluate("window.bulkCopied=[];navigator.clipboard.writeText=async text=>{window.bulkCopied.push(text);};document.querySelectorAll('[data-review-action=copy]').forEach(button=>button.click())");
      await until("window.bulkCopied?.length===3");
      assert.equal(await evaluate("window.bulkCopied.some(text=>text.includes('git clone')) && window.bulkCopied.some(text=>text.includes('download_assigned_checkpoints.py') && text.includes('--api-url'))"), true, "Bulk clone/download copy handlers work while held request remains selected");
      await evaluate(`document.querySelector('[data-review-action=workspace]').click();document.querySelector('[data-review-job="${ids[0]}"]').click();document.querySelector('[data-review-stage="1"]').click()`);
      assert.equal(await evaluate("[...document.querySelectorAll('.reviewer-detail [data-review-action=copy]')].every(button=>button.matches(':disabled'))"), true, "Individual held workspace copies remain disabled");
      if (mode !== "observer") {
        await evaluate("document.querySelector('[data-review-job=eval_ready_download_fixture]').click();document.querySelector('[data-review-stage=\"1\"]').click()");
        assert.equal(await evaluate("[...document.querySelectorAll('.reviewer-detail [data-review-action=copy]')].every(button=>!button.matches(':disabled'))"), true, "Ready workspace commands remain actionable beside held requests");
        await evaluate("window.readyCopied='';navigator.clipboard.writeText=async text=>{window.readyCopied=text;};document.querySelector('.reviewer-detail [data-review-action=copy]').click()");
        await until("window.readyCopied.includes('git clone')");
      }
      await evaluate("document.querySelector('[data-review-action=email-status]').click()");
      await until("document.querySelector('.reviewer-mail-table')?.textContent.includes('Preserved organizer email')");
      assert.equal(await evaluate("document.querySelector('.reviewer-mail-table').textContent.includes('Preserved organizer email')"), true);
    }
    console.log("Browser holds: both Issue79 requests, six account/demo modes, safe bounded reasons, browseable evidence/email, disabled and tamper-guarded evaluation/clone/run controls, no automatic retry; desktop/mobile screenshots in /tmp/rsc-review-hold-*.png.");
  } finally {
    const stopped = new Promise(resolve => chrome.once("exit", resolve));
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ id: 999999, method: "Browser.close" })); else chrome.kill();
    await Promise.race([stopped, sleep(5000)]);
    socket?.close();
    if (chrome.exitCode === null) chrome.kill();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
}

(async () => {
  await logicChecks();
  console.log("Hold logic: real signals override walkthroughs; unchanged-context refresh discards only stale held drafts/progress and queued saves; evidence/email preserved; unheld demo unchanged.");
  if (!process.argv.includes("--logic-only")) await browserChecks();
})().catch(error => { console.error(error); process.exitCode = 1; });
