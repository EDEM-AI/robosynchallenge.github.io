const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const job = done => ({ evaluation_id: "eval_fixture", workflow: {
  stages: Array.from({ length: 5 }, (_, index) => ({ done: index < done, checks: {} }))
} });

function fixture() {
  const calls = [], meter = {}, caption = {}, listeners = {};
  const progress = { querySelector: selector => selector === "progress" ? meter : caption };
  const root = { querySelector: selector => selector === ".reviewer-progress" ? progress : null };
  let jobs = [job(3)], response = null, error = null;
  const context = vm.createContext({
    URL, URLSearchParams, structuredClone, console,
    location: { hostname: "example.test", search: "", hash: "" },
    window: { ROBO_SYN_CONFIG: { API_BASE_URL: "https://backend.example.test" } },
    document: { hidden: false, querySelector: () => root, addEventListener: (name, fn) => { listeners[name] = fn; } },
    sessionStorage: { getItem: () => null },
    fetch: async (_, options) => {
      calls.push(JSON.parse(options.body));
      if (error) throw error;
      if (response) return response;
      return { ok: true, json: async () => ({ ok: true, reviewer: { role: "supervisor" }, jobs: structuredClone(jobs) }) };
    }
  });
  let source = fs.readFileSync(path.join(__dirname, "../static/js/reviewer-page.js"), "utf8");
  source = source.replace("window.RSCReviewer = { render, mount };",
    "window.test = {state, refresh, refreshProgress, progressJobs:()=>progressJobs}; window.RSCReviewer = { render, mount };");
  vm.runInContext(source, context);
  const test = context.window.test;
  test.state.credentials = { email: "1070055979@qq.com", token: "fixture" };
  test.state.role = "supervisor";
  test.state.view = "private-leaderboard";
  test.state.jobs = [job(0)];
  return { context, test, calls, meter, caption, setJobs: value => { jobs = value; },
    setResponse: value => { response = value; }, setError: value => { error = value; } };
}

async function main() {
  const f = fixture();
  f.setJobs([job(5), job(3), { ...job(5), local_walkthrough: true }]);
  const workspace = f.test.state.jobs;
  f.test.state.drafts.set("fixture", { dependencies: true });
  await f.test.refreshProgress();
  assert.equal(f.meter.max, 10);
  assert.equal(f.meter.value, 8);
  assert.equal(f.caption.textContent, "1 / 2 requests completed · 8 / 10 stages");
  assert.equal(f.test.state.jobs, workspace, "Background progress must not replace editable workspace state");
  assert.equal(f.test.state.drafts.get("fixture").dependencies, true);
  assert.deepEqual(f.calls.map(x => x.action), ["reviewer_queue"], "Only a read request is allowed");

  f.setJobs([]);
  await f.test.refreshProgress();
  assert.equal(f.meter.max, 1);
  assert.equal(f.meter.value, 0);
  assert.equal(f.caption.textContent, "0 / 0 requests completed · 0 / 0 stages");

  f.setError(new Error("Network failed"));
  await f.test.refreshProgress();
  assert.equal(f.caption.textContent, "0 / 0 requests completed · 0 / 0 stages", "Errors preserve the last valid counters");
  f.setError(null);
  const before = f.calls.length;
  f.context.document.hidden = true;
  await f.test.refreshProgress();
  f.context.document.hidden = false;
  f.test.state.busy = true;
  await f.test.refreshProgress();
  f.test.state.busy = false;
  assert.equal(f.calls.length, before, "Hidden or busy pages do not issue extra reads");

  let release;
  f.setResponse(new Promise(resolve => { release = resolve; }));
  const pending = f.test.refreshProgress();
  await f.test.refreshProgress();
  assert.equal(f.calls.length, before + 1, "Slow requests must not overlap");
  f.test.state.credentials = null;
  release({ ok: true, json: async () => ({ ok: true, jobs: [job(5)] }) });
  await pending;
  assert.equal(f.meter.value, 0, "A response arriving after logout must be discarded");

  const stale = fixture();
  let releaseOld;
  stale.setResponse(new Promise(resolve => { releaseOld = resolve; }));
  const oldRead = stale.test.refreshProgress();
  stale.test.state.view = "workspace";
  stale.setResponse(null);
  stale.setJobs([job(5)]);
  await stale.test.refresh();
  releaseOld({ ok: true, json: async () => ({ ok: true, jobs: [job(1)] }) });
  await oldRead;
  assert.equal(stale.test.progressJobs()[0].workflow.stages.filter(s => s.done).length, 5,
    "An older background response cannot roll back a newer full refresh");
  console.log("Progress refresh: read-only counts, demo exclusion, drafts preserved, failures, visibility, overlap, logout and stale responses passed.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
