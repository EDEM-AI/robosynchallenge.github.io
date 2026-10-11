const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function main() {
  const tokenFile = process.env.RSC_REVIEWER_PREVIEW_TOKEN_FILE;
  assert(tokenFile, "RSC_REVIEWER_PREVIEW_TOKEN_FILE is required");
  const token = fs.readFileSync(tokenFile, "utf8").trim();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "rsc-review-chrome-"));
  const chrome = spawn("google-chrome", ["--headless=new", "--no-sandbox", "--disable-gpu", "--remote-allow-origins=*",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--window-size=1440,900", "about:blank"], { stdio: "ignore" });
  let socket;
  try {
    const portFile = path.join(profile, "DevToolsActivePort");
    for (let index = 0; index < 100 && !fs.existsSync(portFile); index += 1) await sleep(100);
    assert(fs.existsSync(portFile), "Chrome DevTools did not start");
    const port = fs.readFileSync(portFile, "utf8").split("\n")[0];
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(pages.find((page) => page.type === "page").webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let id = 0;
    const pending = new Map();
    socket.onmessage = (event) => { const message = JSON.parse(event.data); if (pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id); pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
    } };
    const rpc = (method, params = {}) => new Promise((resolve, reject) => { const current = ++id; pending.set(current, { resolve, reject }); socket.send(JSON.stringify({ id: current, method, params })); });
    const evaluate = async (expression) => {
      const result = await rpc("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const until = async (expression) => { for (let index = 0; index < 100; index += 1) {
      if (await evaluate(expression)) return;
      await sleep(100);
    } throw new Error("Timed out waiting for " + expression); };
    await rpc("Page.enable");
    await rpc("Page.navigate", { url: "http://127.0.0.1:8032/eval_backend/?review_preview=1" });
    await until("!!document.querySelector('[data-review-form=login]')");
    assert.equal(await evaluate("document.querySelectorAll('[data-review-form=login] .reviewer-required').length"), 2);
    assert.equal(await evaluate("[...document.querySelectorAll('[data-review-form=login] [required]')].every(input => input.getAttribute('aria-required') === 'true')"), true);
    assert.equal(await evaluate("document.querySelectorAll('.reviewer-job').length"), 0);
    await evaluate(`document.querySelector('[name=token]').value = ${JSON.stringify("act_" + "0".repeat(64))}`);
    await evaluate("document.querySelector('[data-review-form=login]').requestSubmit()");
    await until("!!document.querySelector('.reviewer-error')");
    assert.equal(await evaluate("document.querySelectorAll('.reviewer-job').length"), 0);
    await evaluate(`document.querySelector('[name=token]').value = ${JSON.stringify(token)}`);
    await evaluate("document.querySelector('[data-review-form=login]').requestSubmit()");
    await until("document.querySelectorAll('.reviewer-job').length > 0");
    const count = await evaluate("document.querySelectorAll('.reviewer-job').length");
    assert.equal(await evaluate("document.querySelector('[data-evaluation-id]').textContent"), "eval_LOCALWALKTHROUGH");
    for (let index = 0; index < 5; index += 1) {
      assert.equal(await evaluate("document.querySelector('[data-review-action=next]').disabled"), false);
      await evaluate("document.querySelector('[data-review-action=next]').click()");
      if (index < 4) await until(`document.querySelector('[data-review-stage="${index+1}"]')?.classList.contains('active')`);
      else await until("document.querySelector('.reviewer-state')?.textContent === 'Completed'");
    }
    assert.equal(await evaluate("document.querySelector('.reviewer-progress progress').value"), 0, "Demo must not count toward real progress");
    await evaluate("document.querySelectorAll('.reviewer-job')[1].click()");
    await until("document.querySelector('[data-evaluation-id]').textContent !== 'eval_LOCALWALKTHROUGH'");
    await evaluate("document.fonts.ready.then(() => true)");
    const screenshot = async (name) => { const shot = await rpc("Page.captureScreenshot", { format: "png" }); fs.writeFileSync("/tmp/rsc-review-" + name + ".png", Buffer.from(shot.data, "base64")); };
    await screenshot("queue-desktop");
    for (const width of [1280, 1440, 1920]) {
      await rpc("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
      await sleep(150);
      const geometry = await evaluate("(() => { const pane = document.querySelector('.reviewer-detail').getBoundingClientRect(); const footer = document.querySelector('.reviewer-footer').getBoundingClientRect(); const nav = document.querySelector('.reviewer-stage-nav').getBoundingClientRect(); const buttons = [...document.querySelectorAll('.reviewer-footer button')].map(b => b.getBoundingClientRect()); return { overflow: document.documentElement.scrollWidth > innerWidth, footerVisible: footer.bottom <= innerHeight, nonOverlap: nav.bottom < footer.top, aligned: buttons.every(b => Math.abs(b.top - buttons[0].top) < 1) }; })()");
      assert.deepEqual(geometry, { overflow: false, footerVisible: true, nonOverlap: true, aligned: true });
    }
    assert.equal(await evaluate("document.querySelector('[data-review-action=next]').disabled"), true);
    assert.equal(await evaluate("document.querySelector('[data-review-stage=\"1\"]').disabled"), true);
    await evaluate("document.querySelector('[data-review-action=email]').click()");
    await until("!!document.querySelector('[data-mail-composer]')");
    assert.equal(await evaluate("document.querySelectorAll('[data-review-form=email] .reviewer-required').length"), 2);
    assert.equal(await evaluate("document.querySelector('[data-review-form=email] input[readonly]').closest('label').querySelector('.reviewer-required') === null"), true);
    await sleep(700);
    assert.equal(await evaluate("document.querySelector('[data-review-form=email] input[readonly]').value.includes('@')"), true);
    await screenshot("email-desktop");
    await evaluate("document.querySelector('[data-email-template]').value = 'blank'; document.querySelector('[data-email-template]').dispatchEvent(new Event('change', {bubbles:true}))");
    assert.equal(await evaluate("document.querySelector('[data-review-form=email] [name=body]').value"), "");
    await evaluate("document.querySelector('[data-review-form=email] [name=subject]').value='Local test'; document.querySelector('[data-review-form=email] [name=body]').value='A local preview message.'; document.querySelector('[data-review-form=email]').requestSubmit()");
    await until("document.querySelector('.reviewer-toast')?.textContent.includes('No email was sent')");
    await evaluate("document.querySelectorAll('[data-review-form=verify] input[type=url]').forEach((input) => { input.value = 'https://huggingface.co/test/ckpt'; }); document.querySelector('[data-review-form=verify] [name=coverage_confirmed]').checked = true; document.querySelector('[data-review-form=verify]').requestSubmit()");
    await until("document.querySelector('.reviewer-meta')?.textContent.includes('All 10 task checkpoints recorded')");
    const evaluationId = await evaluate("document.querySelector('[data-evaluation-id]').textContent.trim()");
    const submissionId = await evaluate("document.querySelectorAll('.reviewer-meta dd')[1].textContent.trim()");
    const finishStage = async (index) => {
      await evaluate("document.querySelectorAll('[data-stage-check]').forEach(input => { input.checked=true; input.dispatchEvent(new Event('input',{bubbles:true})); })");
      await until("!document.querySelector('[data-review-action=next]').disabled");
      await evaluate("document.querySelector('[data-review-action=next]').click()");
      if (index < 4) await until(`document.querySelector('[data-review-stage="${index+1}"]')?.classList.contains('active')`);
      else await until("document.querySelector('.reviewer-state')?.textContent === 'Completed'");
    };
    const bundleCommit = "a".repeat(40);
    await evaluate(`(() => { const key = 'rsc-reviewer-preview-workflow-v4'; const saved = JSON.parse(sessionStorage.getItem(key)); const job = saved.jobs.find(job => job.evaluation_id === ${JSON.stringify(evaluationId)}); job.bundle_commit = ${JSON.stringify(bundleCommit)}; job.bundle_url='https://github.com/ZhaoRunyi/RoboSynChallenge_eval/tree/submissions/'+job.evaluation_id; job.policy_dirs=['policy/test']; sessionStorage.setItem(key, JSON.stringify(saved)); })()`);
    await rpc("Page.reload");
    await until("!!document.querySelector('.reviewer-job')");
    await evaluate(`document.querySelector('[data-review-job="${evaluationId}"]').click()`);
    await finishStage(0);
    await evaluate(`(() => { const key = 'rsc-reviewer-preview-workflow-v4'; const saved = JSON.parse(sessionStorage.getItem(key)); const job = saved.jobs.find(job => job.evaluation_id === ${JSON.stringify(evaluationId)}); job.bundle_commit=''; job.bundle_url=''; job.preparation_status = 'failed'; job.preparation_error = 'No deploy_policy.py found under policy/'; sessionStorage.setItem(key, JSON.stringify(saved)); })()`);
    await rpc("Page.reload");
    await until("!!document.querySelector('.reviewer-job')");
    await evaluate(`document.querySelector('[data-review-job="${evaluationId}"]').click()`);
    await until("!!document.querySelector('[data-review-action=retry-code]')");
    assert.equal(await evaluate("document.querySelector('[data-review-action=next]').disabled"), true);
    await evaluate("document.querySelector('[data-review-action=email]').click()");
    assert.equal(await evaluate("document.querySelector('[data-review-form=email] [name=body]').value.includes('No deploy_policy.py')"), true);
    await screenshot("preparation-failed-desktop");
    await evaluate("document.querySelector('[data-review-action=close-email]').click(); document.querySelector('[data-review-action=retry-code]').click()");
    await until("!document.querySelector('[data-review-action=retry-code]')");
    assert.equal(await evaluate("document.querySelector('[data-review-form=prepare]') === null && document.querySelector('[name=bundle_commit]') === null && document.querySelector('[name=policy_dirs]') === null"), true);
    assert.equal(await evaluate("document.querySelector('[data-review-action=next]').disabled"), true);
    await evaluate("document.querySelector('[data-review-action=demo-code]').click()");
    await until("!!document.querySelector('.reviewer-code')");
    await screenshot("code-desktop");
    await finishStage(1);
    const taskNames = ["click_bell", "drawer_open_place", "mixer_operating", "table_rearrangement", "water_pouring", "handle_basket", "items_handover", "item_assembly", "manipulate_pipette", "sample_loading"];
    const upload = async (form, field, value) => {
      await evaluate(`(() => { const form = document.querySelector('[data-review-form=${form}]'); const transfer = new DataTransfer(); transfer.items.add(new File([${JSON.stringify(JSON.stringify(value))}], 'manifest.json', { type: 'application/json' })); form.querySelector('[name=${field}]').files = transfer.files; form.requestSubmit(); })()`);
    };
    const report = { schema: 1, kind: "render_first_frame_comparison", reference_sha256: "c".repeat(64),
      task_coverage: Object.fromEntries(taskNames.map(task => [task, true])), results: taskNames.flatMap(task =>
        ["cam_high", "cam_left_wrist", "cam_right_wrist"].map(camera => ({ task, camera, ssim: 0.999, psnr_db: 50 }))) };
    assert.equal(await evaluate("document.querySelector('[name=machine_id]') === null && document.querySelector('[name=preflight_file]') === null"), true);
    assert.equal(await evaluate("document.querySelector('.reviewer-command code').textContent.includes('python tools/check_environment.py')"), true);
    assert.equal(await evaluate("document.body.textContent.includes('Participant setup instructions')"), false);
    await screenshot("environment-desktop");
    await finishStage(2);
    assert.equal(await evaluate("document.querySelectorAll('[data-review-form=commands]').length"),1);
    assert.equal(await evaluate("[...document.querySelectorAll('.reviewer-command code')].some(el=>el.textContent.includes('run_task_evaluation.py'))"),true);
    await evaluate("navigator.clipboard.writeText=async text=>{window.copiedCommand=text}; [...document.querySelectorAll('.reviewer-command')].find(el=>el.textContent.includes('check_upload.py')).querySelector('button').click()");
    await until("window.copiedCommand?.includes('check_upload.py')");
    assert.equal(await evaluate("window.copiedCommand.includes('run_task_evaluation.py')"),false);
    await screenshot("upload-desktop");
    await evaluate("document.querySelector('details.reviewer-notes').open=true");
    await evaluate("document.querySelectorAll('[data-review-form=commands] textarea').forEach(input => input.value='python run.py --task '+input.name.replace('command_', '')); document.querySelector('[data-review-form=commands]').requestSubmit()");
    await until("document.querySelector('.reviewer-toast')?.textContent.includes('commands saved')");
    const seeds = Array.from({ length: 100 }, (_, index) => index);
    for (const task of taskNames) {
      const manifest = { schema: 1, evaluation_id: evaluationId, submission_id: submissionId,
        bundle_commit: bundleCommit, task, policy_dir: "policy/test", eval_command: "python run.py --task " + task,
        seed_list_sha256: crypto.createHash("sha256").update(JSON.stringify(seeds)).digest("hex"),
        episodes: seeds.map((seed, index) => ({ index, seed, success: index < 30, action_steps: 100, inference_ms: 4 })),
        artifacts: { url: "https://tenant.sharepoint.com/test-evidence.zip", sha256: "b".repeat(64) } };
      await upload("result", "result_file", manifest);
      await until(`document.querySelector('.reviewer-toast')?.textContent.includes(${JSON.stringify(task.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase()))})`);
    }
    await finishStage(3);
    for (const task of taskNames) {
      await evaluate(`(() => { const picker = document.querySelector('[data-task-picker]'); picker.value=${JSON.stringify(task)}; picker.dispatchEvent(new Event('change',{bubbles:true})); })()`);
      await evaluate("document.querySelectorAll('[data-review-form=accept] input[type=checkbox]').forEach(input => input.checked=true); document.querySelector('[data-review-form=accept]').requestSubmit()");
      await until("document.querySelector('.reviewer-notice.success')?.textContent.includes('accepted')");
    }
    await finishStage(4);
    await screenshot("completed-desktop");
    await rpc("Page.reload");
    await until("document.querySelector('.reviewer-state')?.textContent === 'Completed'");
    await evaluate("document.querySelector('[data-review-action=logout]').click()");
    await until("!!document.querySelector('[data-review-form=login]')");
    await screenshot("login-desktop");
    assert.equal(await evaluate("document.querySelector('.reviewer-login-media img').naturalWidth > 0"), true);
    console.log(JSON.stringify({ jobs: count, desktop_viewports: [1280,1440,1920], local_flow: "five stages completed; gates, inline email, ten results, and reload persistence verified", screenshots: "/tmp/rsc-review-*-desktop.png" }));

  } finally {
    if (socket) socket.close();
    chrome.kill("SIGTERM");
    await new Promise((resolve) => { if (chrome.exitCode !== null) resolve(); else chrome.once("exit", resolve); });
    await sleep(250);
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
