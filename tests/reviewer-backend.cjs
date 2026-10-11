const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sheets = new Map();
function sheet(name) {
  if (!sheets.has(name)) sheets.set(name, {
    name, cells: [],
    getRange(row, column, height, width) {
      return {
        getValues: () => Array.from({ length: height }, (_, offset) => Array.from({ length: width }, (_, index) => this.cells[row + offset - 1]?.[column + index - 1] ?? "")),
        setValues: (rows) => rows.forEach((values, offset) => { this.cells[row + offset - 1] ??= []; values.forEach((value, index) => { this.cells[row + offset - 1][column + index - 1] = value; }); }),
      };
    },
    getDataRange() { return { getValues: () => this.cells.length ? this.cells : [[]] }; },
    appendRow(values) { this.cells.push(values); },
    setFrozenRows() {},
  });
  return sheets.get(name);
}
const workbook = { getSheetByName: (name) => sheets.get(name), insertSheet: sheet };
const cache = new Map();
const properties = {};
let workbookOpens = 0;
let scriptLocked = false;
let lockWaitHook = null;
const context = vm.createContext({
  console,
  ScriptApp: { getService: () => ({ getUrl: () => "https://script.google.com/macros/s/test/exec" }) },
  SpreadsheetApp: { getActive: () => { workbookOpens += 1; return workbook; }, flush() {} },
  PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties[key] || "", setProperty: (key, value) => { properties[key] = value; }, deleteProperty: key => { delete properties[key]; } }) },
  LockService: { getScriptLock: () => ({ hasLock: () => scriptLocked,
    waitLock() { scriptLocked = true; if (lockWaitHook) lockWaitHook(); },
    releaseLock() { scriptLocked = false; } }) },
  CacheService: { getScriptCache: () => ({ get: key => cache.get(key), put: (key, value) => cache.set(key, value), remove: key => cache.delete(key) }) },
  Utilities: {
    getUuid: () => crypto.randomUUID(),
    DigestAlgorithm: { SHA_256: "sha256" },
    computeDigest: (_, text) => [...crypto.createHash("sha256").update(text).digest()],
  },
});
const base = path.join(__dirname, "../apps-script");
vm.runInContext(["Code.gs", "Reviewer.gs", "ReviewerPool.gs", "ArchiveUpload.gs", "CheckpointAccess.gs", "ReviewResponse.gs", "CutoffProgress.gs", "SubmissionWindow.gs", "SubmissionReceipts.gs", "VersionPolicy.gs", "Scoring.gs"].map(name => fs.readFileSync(path.join(base, name), "utf8")).join("\n"), context);
const call = (expression, args = {}) => vm.runInContext(`${expression}(${JSON.stringify(args)})`, context);
lockWaitHook = () => {
  const target = sheet("ReviewToolUpgrades");
  target.cells = [Array.from(vm.runInContext("REVIEW_TABLES.ReviewToolUpgrades", context))];
};
vm.runInContext('reviewTable_("ReviewToolUpgrades")', context);
lockWaitHook = null;
assert.equal(scriptLocked, false, "Lazy creation releases its own lock");
sheet("ReviewProgress");
vm.runInContext('withReviewLock_(() => { reviewTable_("ReviewProgress"); if (!LockService.getScriptLock().hasLock()) throw new Error("Outer lock released"); })', context);
assert.equal(scriptLocked, false);
sheet("ReviewTaskCommands").cells = [["unexpected"]];
assert.throws(() => vm.runInContext('reviewTable_("ReviewTaskCommands")', context), /headers changed/);
sheets.delete("ReviewTaskCommands");
function insert(name, row) {
  const headers = vm.runInContext(`SHEETS.${name}`, context);
  const target = sheet(name);
  if (!target.cells.length) target.cells.push([...headers]);
  target.appendRow([...headers].map((key) => row[key] ?? ""));
}

insert("Users", { email: "one@example.com", team_name: "Existing team", token_status: "active" });
insert("Submissions", { submission_id: "sub_old", evaluation_id: "eval_old", email: "one@example.com", artifact_name: "Old",
  code_link: "https://github.com/EDEM-AI/RoboSynChallenge", checkpoint_link: "https://huggingface.co/test/old", is_ranked: "true", created_at: "2026-10-01T00:00:00Z" });
const taskNames = vm.runInContext("Object.keys(REVIEW_TASK_STEPS)", context);
const taskLinks = Object.fromEntries(taskNames.map((task) => [task, "https://huggingface.co/test/new"]));
insert("Submissions", { submission_id: "sub_new", evaluation_id: "eval_new", email: "one@example.com", artifact_name: "New",
  code_link: "https://github.com/EDEM-AI/RoboSynChallenge", checkpoint_link: "https://huggingface.co/test/new",
  task_checkpoint_links_json: JSON.stringify(taskLinks), is_ranked: "true", created_at: "2026-10-11T11:00:00Z" });
insert("Submissions", { submission_id: "sub_late", evaluation_id: "eval_late", email: "one@example.com", artifact_name: "Late",
  is_ranked: "true", created_at: "2026-10-12T13:00:00Z" });
insert("Evaluations", { submission_id: "sub_old", evaluation_id: "eval_old", email: "one@example.com" });
insert("Evaluations", { submission_id: "sub_new", evaluation_id: "eval_new", email: "one@example.com" });
insert("Evaluations", { submission_id: "sub_late", evaluation_id: "eval_late", email: "one@example.com" });
const before = JSON.stringify([sheet("Users").cells, sheet("Submissions").cells, sheet("Evaluations").cells]);
const reviewer = vm.runInContext('provisionReviewer("1070055979@qq.com", "admin")', context);
const credentials = { reviewer_email: reviewer.email, reviewer_token: reviewer.token };
vm.runInContext("requireSession_ = () => ({ email: 'one@example.com' }); checkRateLimit_ = () => {};", context);
const submission = {
  artifact_name: "New", title: "Test", short_description: "Complete policy",
  code_link: "https://github.com/example/policy", checkpoint_link: "https://huggingface.co/test/new",
  data_source_text: "Competition data", technical_notes: "All ten tasks documented",
  task_checkpoint_links: taskLinks,
};
assert.equal(Object.keys(call("submissionTaskLinks_", { checkpoint_link: submission.checkpoint_link })).length, 0,
  "Legacy public form remains usable, without claiming ten-task coverage");
assert.equal(Object.keys(call("submissionTaskLinks_", { ...submission, all_tasks_confirmed: true })).length, 10);
assert.throws(() => call("handleSubmitPolicy_", { session_id: "x", submission }), /Confirm that this request covers all 10 tasks/);
assert.throws(() => call("handleSubmitPolicy_", { session_id: "x", submission: {
  ...submission, all_tasks_confirmed: true, task_checkpoint_links: { click_bell: taskLinks.click_bell },
} }), /checkpoint mapping for all 10 tasks/);
assert.throws(() => call("handleSubmitPolicy_", { session_id: "x", submission: {
  ...submission, all_tasks_confirmed: true, task_checkpoint_links: { ...taskLinks, item_assembly: "https://other.example/ckpt" },
} }), /Checkpoint link must be/);
assert.equal(sheet("Reviewers").cells[1][1].length, 64);
assert(!JSON.stringify(sheet("Reviewers").cells).includes(reviewer.token));
assert.throws(() => call("reviewQueue_", { reviewer_email: reviewer.email, reviewer_token: "act_" + "0".repeat(64) }), /Invalid reviewer credentials/);
assert.equal(call("reviewQueue_", credentials).jobs.length, 1, "Organizer overview includes unassigned requests");
let queue = vm.runInContext(`reviewQueue_(${JSON.stringify(credentials)}, true)`, context);
assert.equal(queue.jobs.length, 1);
assert.equal(queue.jobs[0].evaluation_id, "eval_new");
assert.equal(queue.jobs[0].team_name, "Existing team");
assert.equal(queue.jobs[0].coverage_status, "declared_all_10");
assert.equal(Object.keys(queue.jobs[0].task_checkpoint_links).length, 10);
const bundleCommit = "a".repeat(40);
assert.throws(() => call("reviewAssign_", { ...credentials, evaluation_id: "eval_new" }), /No active evaluators/);
call("reviewAssign_", { ...credentials, evaluation_id: "eval_new", assign_to: reviewer.email });
const capability = call("reviewIssueUploadAccess_", { ...credentials, evaluation_id: "eval_new" });
assert(!JSON.stringify(sheet("ReviewUploadAccess").cells).includes(capability.upload_token));
assert.throws(() => call("reviewUploadContext_", { evaluation_id: "eval_new", upload_token: "upl_bad" }), /Invalid or expired/);
assert.throws(() => call("reviewSendIssue_", { evaluation_id: "eval_new", upload_token: capability.upload_token }), /Email is required/);
call("reviewPrepare_", { ...credentials, evaluation_id: "eval_new", bundle_commit: bundleCommit,
  bundle_url: "https://github.com/ZhaoRunyi/RoboSynChallenge_eval/tree/submissions/eval_new", policy_dirs: ["policy/act"] });
const cloneAccess = { evaluation_id: "eval_new", upload_token: capability.upload_token, bundle_commit: bundleCommit };
assert.throws(() => call("reviewCheckpointCredential_", { ...credentials, evaluation_id: "eval_new", bundle_commit: bundleCommit }), /Private clone capability/);
assert.throws(() => call("reviewCheckpointCredential_", { ...cloneAccess, upload_token: "upl_bad" }), /Invalid or expired/);
assert.throws(() => call("reviewCheckpointCredential_", { ...cloneAccess, bundle_commit: "b".repeat(40) }), /another prepared commit/);
assert.throws(() => call("reviewCheckpointCredential_", cloneAccess), /not configured/);
assert.throws(() => call("reviewConfigureCheckpointAccess_", { ...cloneAccess, hf_token: "hf_synthetic" }), /Email is required/);
context.UrlFetchApp = { fetch: (url, options) => {
  assert.equal(url, "https://huggingface.co/api/whoami-v2");
  assert.equal(options.headers.Authorization, "Bearer hf_synthetic");
  return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ type: "user", name: "RoboSynChallenge", auth: {accessToken: {role:"read"}} }) };
} };
assert.equal(call("reviewConfigureCheckpointAccess_", { ...credentials, hf_token: "hf_synthetic" }).configured, true);
assert.equal(call("reviewCheckpointCredential_", cloneAccess).hf_token, "hf_synthetic");
const readOnlyFetcher = context.UrlFetchApp;
for (const accessToken of [{role:"write"}, {role:"fineGrained", fineGrained:{scoped:[{permissions:["repo.content.read","repo.write"]}]}}, {}]) {
  context.UrlFetchApp = {fetch: () => ({getResponseCode: () => 200, getContentText: () => JSON.stringify({type:"user",name:"RoboSynChallenge",auth:{accessToken}})})};
  assert.throws(() => call("reviewConfigureCheckpointAccess_", {...credentials,hf_token:"hf_synthetic"}), /read-only/);
  assert.throws(() => call("reviewCheckpointCredential_", cloneAccess), /read-only/);
}
context.UrlFetchApp = readOnlyFetcher;
assert(!JSON.stringify(call("reviewQueue_", credentials)).includes("hf_synthetic"), "Shared HF token must never reach the reviewer page or Sheet queue");
assert(!JSON.stringify([...sheets.values()].map(value => value.cells)).includes("hf_synthetic"));
const stage = (index, checks, extra = {}) => call("reviewCompleteStage_", { ...credentials, evaluation_id: "eval_new", stage: index, checks, ...extra });
const hfReport = Object.fromEntries(taskNames.map(task => [task, { url: taskLinks[task], revision: "c".repeat(40), accessible: true, files_checked: 3 }]));
// Access checks are recorded before attaching the bundle by the real preparer.
vm.runInContext(`reviewWrite_("ReviewAccessChecks", null, { evaluation_id: "eval_new", report_json: JSON.stringify(${JSON.stringify(hfReport)}), checked_at: now_() })`, context);
assert.throws(() => stage(1, { commit_verified: true, policy_entrypoints: true, dependencies: true }), /previous stages/);
assert.throws(() => stage(0, {}), /checklist/);
stage(0, { repository_access: true, checkpoint_access: true, ten_tasks: true });
stage(1, { commit_verified: true, policy_entrypoints: true, dependencies: true });
const report = { schema: 1, kind: "render_first_frame_comparison", reference_sha256: "c".repeat(64),
  task_coverage: Object.fromEntries(taskNames.map((task) => [task, true])), results: taskNames.flatMap((task) =>
    ["cam_high", "cam_left_wrist", "cam_right_wrist"].map((camera) => ({ task, camera, ssim: 0.999, psnr_db: 50, identical_pixels: false })) ) };
assert.equal(call("reviewSavePreflight_", { ...credentials, evaluation_id: "eval_new", machine_id: "test-machine", report }).status, "pending_thresholds");
stage(2, {});
assert.equal(call("reviewWorkflow_", "eval_new").stages[2].checks.environment_check_waived, true);
assert.equal(call("reviewWorkflow_", "eval_new").stages[2].checks.machine_checked, undefined, "A waiver is not a fabricated successful check");
vm.runInContext('config_ = (key, fallback) => key === "REVIEW_RENDER_THRESHOLDS" ? JSON.stringify({ssim_min: 0.98, psnr_min_db: 35}) : fallback', context);
assert.equal(call("reviewSavePreflight_", { ...credentials, evaluation_id: "eval_new", machine_id: "test-machine", report }).status, "passed");
stage(2, { machine_checked: true, reference_checked: true });
assert.throws(() => call("reviewSaveCommand_", { ...credentials, evaluation_id: "eval_new", task: "item_assembly", command: "python eval.py --token hf_" + "a".repeat(20) }), /tokens or passwords/);
call("reviewSaveCommand_", { ...credentials, evaluation_id: "eval_new", task: "item_assembly", command: "python tools/run_task_evaluation.py --task item_assembly" });
for (const task of taskNames.filter(name => name !== "item_assembly")) call("reviewSaveCommand_", { ...credentials, evaluation_id: "eval_new", task, command: "python tools/run_task_evaluation.py --task " + task });
const seedList = Array.from({ length: 100 }, (_, index) => index);
const seedHash = crypto.createHash("sha256").update(JSON.stringify(seedList)).digest("hex");
vm.runInContext(`REVIEW_SEED_HASHES.item_assembly = "${seedHash}"`, context);
const result = { schema: 1, evaluation_id: "eval_new", submission_id: "sub_new", bundle_commit: bundleCommit,
  task: "item_assembly", policy_dir: "policy/act", seed_list_sha256: seedHash, eval_command: "python tools/run_task_evaluation.py --task item_assembly",
  episodes: seedList.map((seed, index) => ({ index, seed, success: index < 30, action_steps: 500, inference_ms: 4.5 })),
  artifacts: { url: "https://tenant.sharepoint.com/evidence.zip", sha256: "b".repeat(64) } };
assert.throws(() => call("reviewSubmitResult_", { ...credentials, evaluation_id: "eval_new", result: { ...result, episodes: result.episodes.slice(1) } }), /100 episodes/);
assert.throws(() => call("reviewSubmitResult_", { ...credentials, evaluation_id: "eval_new", result: {
  ...result, episodes: result.episodes.map((episode) => episode.index ? episode : { ...episode, seed: 999 }),
} }), /frozen task seed list/);
assert.equal(call("reviewSubmitResult_", { ...credentials, evaluation_id: "eval_new", result }).summary.success_rate, 30);
assert.throws(() => call("reviewSubmitResult_", { evaluation_id: "eval_new", upload_token: capability.upload_token, result }), /verified ZIP session/);
vm.runInContext('reviewWrite_("ReviewArchiveUploads", null, { evaluation_id: "eval_new", task: "item_assembly", upload_id: "arc_test", expected_sha256: "b".repeat(64), size: 123, status: "uploading", expires_at: new Date(Date.now()+3600000).toISOString() })', context);
assert.throws(() => call("reviewSubmitResult_", { ...credentials, evaluation_id: "eval_new", result }), /Finish verifying/);
vm.runInContext(`reviewWrite_("ReviewArchiveUploads", 2, {evaluation_id:"eval_new", status:"verified",record_hash:archiveRecordHash_(${JSON.stringify(result)})})`, context);
assert.equal(call("reviewSubmitResult_", { evaluation_id: "eval_new", upload_token: capability.upload_token, result }).ok, true);
assert.equal(sheet("ReviewArchiveUploads").cells[1][5], "completed");
const graphCalls = [];
context.UrlFetchApp = { fetch: () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ nextExpectedRanges: ["0-"], expirationDateTime: new Date(Date.now() + 3600000).toISOString() }) }) };
const originalGraph = context.archiveGraph_;
const originalConfig = context.config_;
context.config_ = (key, fallback) => ({ ARCHIVE_MS_DRIVE_ID: "private-drive", ARCHIVE_MS_ROOT_ITEM_ID: "private-folder" })[key] || fallback;
context.archiveGraph_ = (path) => path.includes("/items/")
  ? { name: "RoboSynChallenge_eval", folder: {} }
  : { quota: { total: 100, remaining: 90, used: 10, deleted: 0, state: "normal" }, secret: "never-return-this" };
const storageStatus = call("archiveStatus_", credentials);
assert.equal(storageStatus.accessible, true);
assert.equal(storageStatus.quota.remaining, 90);
assert(!JSON.stringify(storageStatus).includes("private-drive"));
assert(!JSON.stringify(storageStatus).includes("never-return-this"));
const storageReviewer = vm.runInContext('provisionReviewer("storage@example.com", "evaluator")', context);
assert.throws(() => call("archiveStatus_", { reviewer_email: storageReviewer.email, reviewer_token: storageReviewer.token }), /Organizer access/);
assert.throws(() => call("archiveStatus_", {}), /Email is required/);
context.archiveGraph_ = originalGraph;
context.config_ = originalConfig;
vm.runInContext('reviewWrite_("Reviewers", reviewRows_("Reviewers").find(row => row.email === "storage@example.com")._rowNumber, { active: "false" })', context);
let cloudManifest;
context.archiveGraph_ = (path, method, body) => {
  graphCalls.push({ path, method, body });
  if (path.endsWith("result.json:/content")) { cloudManifest = JSON.parse(body); return {id:"json"}; }
  if (path.endsWith("/json/content")) return cloudManifest;
  if (path.endsWith("createUploadSession")) return {uploadUrl:"https://upload.example/session", expirationDateTime:new Date(Date.now()+3600000).toISOString()};
  if (path.endsWith("evidence.zip")) return {size:123,webUrl:"https://tenant.sharepoint.com/latest/evidence.zip","@microsoft.graph.downloadUrl":"https://download.example/file"};
  return {id:"json"};
};
context.archiveTarget_ = (run, task) => "/drives/test/items/" + run.evaluation_id + "-" + task + "-latest";
const uploadPayload = {evaluation_id:"eval_new",upload_token:capability.upload_token,result,size:123};
// The prior completed registration is recovered rather than silently overwritten.
cloudManifest = result;
vm.runInContext(`reviewWrite_("ReviewArchiveUploads",2,{evaluation_id:"eval_new",status:"completed",record_hash:archiveRecordHash_(${JSON.stringify(result)})})`, context);
assert.equal(call("archiveStart_", uploadPayload).phase, "register");
vm.runInContext('reviewWrite_("ReviewArchiveUploads",2,{evaluation_id:"eval_new",status:"superseded"})', context);
const uploadSession = call("archiveStart_", uploadPayload);
cache.delete("archive-session:" + uploadSession.upload_id);
assert.equal(call("archiveStart_", uploadPayload).upload_id, uploadSession.upload_id, "Same active upload reused, never create a second overwrite session");
assert.throws(() => call("archiveStart_", {...uploadPayload,result:{...result,artifacts:{...result.artifacts,sha256:"c".repeat(64)}}}), /Another upload/);
assert.throws(() => call("archiveFinish_", {...uploadPayload,upload_id:uploadSession.upload_id,verified_sha256:"wrong"}), /checksum/);
assert.equal(call("archiveDownload_", {...uploadPayload,upload_id:uploadSession.upload_id}).download_url, "https://download.example/file");
const finalized = call("archiveFinish_", {...uploadPayload,upload_id:uploadSession.upload_id,verified_sha256:result.artifacts.sha256});
assert(finalized.result.artifacts.url.endsWith("latest/evidence.zip"));
assert(graphCalls.some(call => call.path.endsWith("result.json:/content")), "Cloud manifest is written only after verification");
assert.throws(() => call("reviewSubmitResult_", {...uploadPayload,result:{...finalized.result,artifacts:{...finalized.result.artifacts,url:"https://attacker.example/zip"}}}), /differs from the verified/);
assert.equal(call("reviewSubmitResult_", {...uploadPayload,result:finalized.result}).ok, true);
assert.throws(() => stage(3, { all_runs: true, archives_uploaded: true }), /every task/);
for (const task of taskNames) {
  vm.runInContext(`REVIEW_SEED_HASHES.${task} = "${seedHash}"`, context);
  call("reviewSubmitResult_", { ...credentials, evaluation_id: "eval_new", result: { ...result, task, eval_command: "python tools/run_task_evaluation.py --task " + task,
    episodes: result.episodes.map((episode) => ({ ...episode, action_steps: 100 })) } });
}
stage(3, { all_runs: true, archives_uploaded: true });
assert.throws(() => call("reviewCheckResult_", { ...credentials, evaluation_id: "eval_new", task: "item_assembly", decision: "checked" }), /checksum/);
for (const task of taskNames) assert.equal(call("reviewCheckResult_", { ...credentials, evaluation_id: "eval_new", task, decision: "checked", checks: { video: true, trajectory: true, checksum: true } }).status, "checked");
stage(4, { videos_checked: true, trajectories_checked: true, hashes_checked: true });
assert.equal(call("reviewWorkflow_", "eval_new").stages.filter((item) => item.done).length, 5);
assert.equal(call("archiveStart_", uploadPayload).phase, "register", "Already accepted identical evidence is recoverable without rewriting it");
assert.equal(JSON.stringify([sheet("Users").cells, sheet("Submissions").cells, sheet("Evaluations").cells]), before);
queue = call("reviewQueue_", credentials);
assert.equal(queue.jobs[0].results[0].status, "checked");
insert("Users", { email: "legacy@example.com", team_name: "Legacy team" });
insert("Submissions", { submission_id: "sub_legacy", evaluation_id: "eval_legacy", email: "legacy@example.com",
  artifact_name: "Legacy", checkpoint_link: "https://huggingface.co/test/legacy", is_ranked: "true",
  created_at: "2026-10-10T00:00:00Z" });
insert("Evaluations", { submission_id: "sub_legacy", evaluation_id: "eval_legacy", email: "legacy@example.com" });
assert(call("reviewQueue_", credentials).jobs.some((job) => job.evaluation_id === "eval_legacy"), "Global overview includes unassigned legacy requests");
const legacySnapshot = JSON.stringify(sheet("Submissions").cells);
call("reviewAssign_", { ...credentials, evaluation_id: "eval_legacy", assign_to: reviewer.email });
call("reviewPreparationFailed_", { ...credentials, evaluation_id: "eval_legacy", message: "No deploy_policy.py found under policy/" });
assert.equal(call("reviewQueue_", credentials).jobs.find(job => job.evaluation_id === "eval_legacy").preparation_status, "failed");
call("reviewRetryPreparation_", { ...credentials, evaluation_id: "eval_legacy" });
assert.equal(call("reviewQueue_", credentials).jobs.find(job => job.evaluation_id === "eval_legacy").preparation_status, "pending");
const validation = { ...credentials, evaluation_id: "eval_legacy", bundle_commit: "c".repeat(40),
  participant_commit: "d".repeat(40), private_base_commit: "e".repeat(40), policy_dirs: ["policy/custom/nested"],
  bundle_url: "https://github.com/ZhaoRunyi/RoboSynChallenge_eval/tree/validation/eval_legacy-" + "d".repeat(12) + "-" + "e".repeat(12),
  selection: { revision: "d".repeat(40), authored_at: "2020-01-01T00:00:00Z", committed_at: "2020-01-01T00:00:00Z",
    cutoff_at: new Date(Math.min(Date.now() - 10000, Date.parse("2026-10-12T12:00:00Z"))).toISOString().replace(".000Z", "Z") } };
// Validation alone must never grant formal evaluation or shared-account access.
assert.throws(() => call("reviewPrepareCode_", { ...validation, bundle_url: validation.bundle_url + "-wrong" }), /does not match/);
assert.throws(() => call("reviewPrepareCode_", { ...validation, policy_dirs: ["policy/../tools"] }), /metadata/);
assert.equal(call("reviewPrepareCode_", validation).status, "code_ready");
let validationJob = call("reviewQueue_", credentials).jobs.find(job => job.evaluation_id === "eval_legacy");
assert.equal(validationJob.code_bundle_commit, validation.bundle_commit);
assert.equal(validationJob.bundle_commit, "");
assert.equal(validationJob.coverage_status, "legacy_unverified");
assert.throws(() => call("reviewCompleteStage_", { ...credentials, evaluation_id: "eval_legacy", stage: 0,
  checks: { repository_access: true, checkpoint_access: true, ten_tasks: true } }), /10 task|prepared|preparation/);
assert.throws(() => call("reviewCheckpointCredential_", { ...credentials, evaluation_id: "eval_legacy",
  bundle_commit: validation.bundle_commit }), /Private clone capability/);
assert.throws(() => call("reviewPrepare_", { ...credentials, evaluation_id: "eval_legacy",
  bundle_commit: bundleCommit, bundle_url: "https://github.com/ZhaoRunyi/RoboSynChallenge_eval/tree/submissions/eval_legacy",
  policy_dirs: ["policy/act"] }), /Verify all 10 tasks/);
const evaluator = vm.runInContext('provisionReviewer("evaluator@example.com", "evaluator")', context);
assert.throws(() => call("reviewAssign_", { reviewer_email: evaluator.email, reviewer_token: evaluator.token,
  evaluation_id: "eval_new" }), /Only an organizer can assign/);
assert.equal(call("reviewQueue_", { reviewer_email: evaluator.email, reviewer_token: evaluator.token }).jobs.length, 0);
assert.throws(() => call("reviewOwnedRun_", { reviewer_email: evaluator.email, reviewer_token: evaluator.token, evaluation_id: "eval_new" }), /not assigned/);
assert.throws(() => call("reviewPreparationFailed_", { reviewer_email: evaluator.email, reviewer_token: evaluator.token,
  evaluation_id: "eval_legacy", message: "fake" }), /not assigned/);
assert.throws(() => call("reviewRetryPreparation_", { reviewer_email: evaluator.email, reviewer_token: evaluator.token,
  evaluation_id: "eval_legacy" }), /not assigned/);
assert.throws(() => call("reviewVerifyCoverage_", { reviewer_email: evaluator.email, reviewer_token: evaluator.token,
  evaluation_id: "eval_legacy", coverage_confirmed: true, task_checkpoint_links: taskLinks }), /not assigned/);
assert.throws(() => call("reviewVerifyCoverage_", { ...credentials, evaluation_id: "eval_legacy",
  task_checkpoint_links: taskLinks }), /Confirm/);
call("reviewVerifyCoverage_", { ...credentials, evaluation_id: "eval_legacy", coverage_confirmed: true,
  task_checkpoint_links: taskLinks });
const verified = call("reviewQueue_", credentials).jobs.find((job) => job.evaluation_id === "eval_legacy");
assert.equal(verified.coverage_status, "verified_all_10");
assert.equal(verified.coverage_verified_by, credentials.reviewer_email);
assert.equal(verified.hf_check_status, "pending");
call("reviewCheckpointCheck_", { ...credentials, evaluation_id: "eval_legacy", task_checkpoint_links: taskLinks,
  status: "failed", message: "click_bell: HTTP 403", cutoff_at: "2026-10-10T00:00:00Z" });
let hfJob = call("reviewQueue_", credentials).jobs.find(job => job.evaluation_id === "eval_legacy");
assert.equal(hfJob.hf_check_status, "failed");
assert.equal(hfJob.code_bundle_commit, validation.bundle_commit, "HF failure must not hide the composed code");
assert.equal(hfJob.preparation_status, "code_ready");
call("reviewRetryPreparation_", { ...credentials, evaluation_id: "eval_legacy" });
assert.equal(call("reviewQueue_", credentials).jobs.find(job => job.evaluation_id === "eval_legacy").hf_check_status, "pending");
const accessReport = Object.fromEntries(taskNames.map(task => [task, { url: taskLinks[task], revision: "f".repeat(40), accessible: true, files_checked: 2 }]));
call("reviewAccessCheck_", { ...credentials, evaluation_id: "eval_legacy", report: accessReport });
assert.equal(call("reviewQueue_", credentials).jobs.find(job => job.evaluation_id === "eval_legacy").hf_check_status, "passed");
const validationFlowBefore = call("reviewWorkflow_", "eval_legacy");
assert.equal(call("reviewCompleteStage_", { ...credentials, evaluation_id: "eval_legacy", stage: 0,
  checks: { repository_access: false, checkpoint_access: true, ten_tasks: true } }).workflow.stages[0].done, true,
  "Verified validation code and HF checks allow submission check before the deadline freeze; the script owns repository_access");
assert.throws(() => call("reviewCompleteStage_", { ...credentials, evaluation_id: "eval_legacy", stage: 1,
  checks: { commit_verified: true, policy_entrypoints: true, dependencies: true } }), /Prepared evaluation code/);
vm.runInContext(`reviewStoreWorkflow_(reviewRun_("eval_legacy"), ${JSON.stringify(validationFlowBefore)})`, context);
const changedLinks = { ...taskLinks, click_bell: "https://huggingface.co/test/changed" };
const oldContext = call("reviewQueue_", credentials).jobs.find(job => job.evaluation_id === "eval_legacy").hf_check_context;
call("reviewVerifyCoverage_", { ...credentials, evaluation_id: "eval_legacy", coverage_confirmed: true, task_checkpoint_links: changedLinks });
hfJob = call("reviewQueue_", credentials).jobs.find(job => job.evaluation_id === "eval_legacy");
assert.equal(hfJob.hf_check_status, "pending");
assert.equal(Object.keys(hfJob.hf_access).length, 0, "Changing task URLs must invalidate the previous success receipt");
assert.throws(() => call("reviewAccessCheck_", { ...credentials, evaluation_id: "eval_legacy", report: accessReport, context_json: oldContext }), /changed while/);
assert.throws(() => call("reviewCheckpointCheck_", { ...credentials, evaluation_id: "eval_legacy", task_checkpoint_links: taskLinks, status: "checking" }), /current ten-task/);
assert.throws(() => call("reviewAccessCheck_", { ...credentials, evaluation_id: "eval_legacy", report: accessReport }), /matching/);
call("reviewVerifyCoverage_", { ...credentials, evaluation_id: "eval_legacy", coverage_confirmed: true, task_checkpoint_links: taskLinks });
call("reviewAccessCheck_", { ...credentials, evaluation_id: "eval_legacy", report: accessReport });
const legacyAccess = call("reviewIssueUploadAccess_", { ...credentials, evaluation_id: "eval_legacy" });
assert.equal(call("reviewPrepare_", { ...credentials, evaluation_id: "eval_legacy",
  bundle_commit: bundleCommit, bundle_url: "https://github.com/ZhaoRunyi/RoboSynChallenge_eval/tree/submissions/eval_legacy",
  policy_dirs: ["policy/act"] }).ok, true);
assert.equal(JSON.stringify(sheet("Submissions").cells), legacySnapshot);
vm.runInContext("sendEvaluationRequestNotification_ = () => {}; sendAdminDigest_ = () => {};", context);
context.MailApp = { sendEmail() {} };
insert("Users", {email: "submit-test@example.com", token_status: "active"});
vm.runInContext("requireSession_ = () => ({email: 'submit-test@example.com'});", context);
insert("Submissions", { submission_id: "sub_smoke", evaluation_id: "eval_smoke", email: "one@example.com",
  is_ranked: "false", short_description: "Organizer pipeline validation" });
insert("Evaluations", {submission_id: "sub_smoke", evaluation_id: "eval_smoke", email: "one@example.com"});
const created = call("handleSubmitPolicy_", { session_id: "x", submission: {
  ...submission, all_tasks_confirmed: true, is_ranked: false,
} });
assert.equal(created.submission.is_ranked, true, "Clients cannot opt out of competitive evaluation");
assert.equal(vm.runInContext('findRow_("Submissions", "submission_id", "sub_smoke").is_ranked', context), "false", "Historical test submissions remain untouched");
assert.equal(Object.keys(created.submission.task_checkpoint_links).length, 10);
assert.equal(created.submission.task_checkpoint_links.item_assembly, taskLinks.item_assembly);
const stablePayload = { session_id: "x", submission_key: "stable_retry_00000001", submission: { ...submission, title: "Retry test", all_tasks_confirmed: true } };
const countBeforeRetry = sheet("Submissions").cells.length;
context.MailApp.sendEmail = () => { throw new Error("Daily quota exhausted"); };
const stableFirst = call("handleSubmitPolicy_", stablePayload);
assert.equal(stableFirst.ok, true, "Mail failure does not invalidate stored submission");
assert.equal(stableFirst.notification_status, "needs_review");
assert.equal(call("handleSubmitPolicy_", stablePayload).submission.id, stableFirst.submission.id);
assert.equal(sheet("Submissions").cells.length, countBeforeRetry + 1);
assert.throws(() => call("handleSubmitPolicy_", { ...stablePayload, submission: { ...stablePayload.submission, title: "Changed" } }), /different content/);
const originalAppend = context.appendRow_;
let failEvaluation = true;
context.appendRow_ = (name, values) => {
  if (name === "Evaluations" && failEvaluation) { failEvaluation = false; throw new Error("Temporary Sheet write failure"); }
  return originalAppend(name, values);
};
const interrupted = { ...stablePayload, submission_key: "interrupted_00000001", submission: { ...stablePayload.submission, title: "Interrupted" } };
assert.throws(() => call("handleSubmitPolicy_", interrupted), /Temporary Sheet/);
const halfWritten = sheet("Submissions").cells.length;
const recovered = call("handleSubmitPolicy_", interrupted);
assert.equal(recovered.ok, true);
assert.equal(sheet("Submissions").cells.length, halfWritten, "Missing evaluation is repaired without a second submission");
context.appendRow_ = originalAppend;
context.MailApp = { getRemainingDailyQuota: () => 0, sendEmail: () => { throw new Error("No send expected"); } };
const quotaPayload = { ...stablePayload, submission_key: "quota_pending_00000001", submission: { ...stablePayload.submission, title: "Quota pending" } };
assert.equal(call("handleSubmitPolicy_", quotaPayload).notification_status, "pending");
let queuedMail = 0;
context.MailApp = { getRemainingDailyQuota: () => 10, sendEmail: () => { queuedMail += 1; } };
call("processPendingPolicyNotifications_");
assert.equal(queuedMail, 1);
assert.equal(call("handleSubmitPolicy_", quotaPayload).notification_status, "sent");
call("processPendingPolicyNotifications_");
assert.equal(queuedMail, 1, "Scheduled notification retry does not send twice");
vm.runInContext("requireSession_ = () => ({email: 'one@example.com'});", context);
const sent = [];
context.MailApp = { getRemainingDailyQuota: () => 10, sendEmail: (message) => sent.push(message) };
const issue = { ...credentials, evaluation_id: "eval_new", stage: 0, message_id: "msg_" + "d".repeat(32), subject: "Review question", body: "Please clarify the task mapping.", recipient: "attacker@example.com" };
call("reviewSendIssue_", issue);
call("reviewSendIssue_", issue);
assert.equal(sent.length, 1);
assert.equal(sent[0].to, "one@example.com", "Recipient cannot be changed by the client");
assert(sent[0].htmlBody.includes("Evaluation update"));
context.MailApp.getRemainingDailyQuota = () => 0;
assert.throws(() => call("reviewSendIssue_", { ...issue, message_id: "msg_" + "e".repeat(32) }), /quota exhausted/);
assert.equal(sent.length, 1);
const responseUrl = new URL(sent[0].body.match(/https:\/\/\S+rsc_action=review_response\S+/)[0]);
const responseButton = sent[0].htmlBody.match(/<a href="([^"]+)" style="([^"]+)">Confirm or submit a correction<\/a>/);
assert(responseButton, "Issue email uses an inline-styled correction button");
assert.equal(responseButton[1].replace(/&amp;/g, "&"), responseUrl.href, "Button preserves the original response link");
const approveStyle = call("emailDecisionButtons_", "https://example.com/approve", "https://example.com/deny").match(/<a href="[^"]+" style="([^"]+)">Approve<\/a>/)[1];
assert.equal(responseButton[2], approveStyle, "Correction button matches the original orange Approve button");
assert(sent[0].htmlBody.includes('bgcolor="#e9673f"'), "Email clients can retain the orange button background without CSS stylesheets");
const responseParams = Object.fromEntries(responseUrl.searchParams);
assert(!JSON.stringify(sheet("ReviewResponseLinks").cells).includes(responseParams.token));
assert.throws(() => call("requireReviewResponse_", { ...responseParams, token: "rsp_" + "0".repeat(64) }), /not active/);
const originalSnapshot = JSON.stringify(sheet("Submissions").cells);
context.HtmlService = { createHtmlOutput: text => text };
call("handleReviewResponseSubmit_", { ...responseParams, response_kind: "confirm", notes: "The original code is correct." });
assert.equal(JSON.stringify(sheet("Submissions").cells), originalSnapshot);
assert.throws(() => call("handleReviewResponseSubmit_", { ...responseParams, response_kind: "confirm", notes: "Second reply" }), /already been recorded/);
assert(call("handleReviewResponsePage_", responseParams).includes("already been recorded"));
const confirmationState = JSON.stringify([sheet("ReviewCorrections").cells, sheet("ReviewProgress").cells]);
assert(call("handleReviewResponseSubmit_", { ...responseParams, response_kind: "confirm", notes: "The original code is correct." }).includes("already been recorded"));
assert.equal(JSON.stringify([sheet("ReviewCorrections").cells, sheet("ReviewProgress").cells]), confirmationState);
vm.runInContext('reviewWrite_("ReviewCorrections", 2, {evaluation_id:"eval_new", deadline_at:"2020-01-01T00:00:00Z"})', context);
context.MailApp.getRemainingDailyQuota = () => 10;
call("reviewSendIssue_", { ...issue, message_id: "msg_" + "2".repeat(32) });
const reopenedParams = Object.fromEntries(new URL(sent.at(-1).body.match(/https:\/\/\S+rsc_action=review_response\S+/)[0]).searchParams);
vm.runInContext('reviewWrite_("ReviewCorrections", 2, {evaluation_id:"eval_new", deadline_at:"2020-01-01T00:00:00Z"})', context);
assert(call("requireReviewResponse_", reopenedParams), "An old 24-hour deadline no longer blocks the latest issue link");
assert.throws(() => call("requireReviewResponse_", responseParams), /not active/);
context.MailApp.getRemainingDailyQuota = () => 10;
const legacyIssue = { ...issue, evaluation_id: "eval_legacy", message_id: "msg_" + "f".repeat(32) };
call("reviewSendIssue_", legacyIssue);
const legacyParams = Object.fromEntries(new URL(sent.at(-1).body.match(/https:\/\/\S+rsc_action=review_response\S+/)[0]).searchParams);
const beforeCorrection = JSON.stringify([sheet("Users").cells, sheet("Submissions").cells, sheet("Evaluations").cells]);
const correctedLink = "https://github.com/example/policy/tree/" + "9".repeat(40);
const correctionFields = { ...legacyParams, response_kind: "correct", code_link: correctedLink, notes: "One complete fix",
  ...Object.fromEntries(taskNames.map(task => ["checkpoint_" + task, taskLinks[task]])) };
call("handleReviewResponseSubmit_", correctionFields);
assert.equal(JSON.stringify([sheet("Users").cells, sheet("Submissions").cells, sheet("Evaluations").cells]), beforeCorrection);
const correctionState = JSON.stringify([sheet("ReviewCorrections").cells, sheet("ReviewProgressBackups").cells, sheet("ReviewProgress").cells]);
assert(call("handleReviewResponseSubmit_", correctionFields).includes("already been recorded"));
assert.equal(JSON.stringify([sheet("ReviewCorrections").cells, sheet("ReviewProgressBackups").cells, sheet("ReviewProgress").cells]), correctionState, "Identical form retries do not reset progress or create another correction round");
assert.throws(() => call("handleReviewResponseSubmit_", { ...correctionFields, code_link: "https://github.com/example/policy/tree/" + "8".repeat(40) }), /No new changes were saved/);
assert.throws(() => call("handleReviewResponsePage_", { ...legacyParams, token: "rsp_" + "0".repeat(64) }), /not active/);
assert.throws(() => call("reviewUploadContext_", { evaluation_id: "eval_legacy", upload_token: legacyAccess.upload_token }), /Invalid or expired/);
const correctedJob = call("reviewQueue_", credentials).jobs.find(job => job.evaluation_id === "eval_legacy");
assert.equal(correctedJob.code_bundle_commit, "", "A correction must not display the old validation branch");
assert.equal(correctedJob.code_link, correctedLink);
assert.equal(correctedJob.preparation_attempt, 1);
assert.equal(correctedJob.bundle_commit, "");
assert.equal(correctedJob.preparation_status, "pending");
assert.throws(() => call("reviewAccessCheck_", { ...credentials, evaluation_id: "eval_legacy", report: { ...hfReport, click_bell: { ...hfReport.click_bell, files_checked: 0 } } }), /receipts matching/);
assert.throws(() => call("reviewAccessCheck_", { ...credentials, evaluation_id: "eval_legacy", report: { ...hfReport, click_bell: { ...hfReport.click_bell, url: "https://huggingface.co/other/model" } } }), /receipts matching/);
call("reviewAccessCheck_", { ...credentials, evaluation_id: "eval_legacy", report: hfReport });
call("reviewPrepare_", { ...credentials, evaluation_id: "eval_legacy", bundle_commit: "8".repeat(40),
  bundle_url: "https://github.com/ZhaoRunyi/RoboSynChallenge_eval/tree/submissions/eval_legacy-correction1", policy_dirs: ["policy/act"] });
call("reviewSendIssue_", { ...legacyIssue, message_id: "msg_" + "3".repeat(32) });
const secondParams = Object.fromEntries(new URL(sent.at(-1).body.match(/https:\/\/\S+rsc_action=review_response\S+/)[0]).searchParams);
const awaitingCorrection = call("reviewQueue_", credentials).jobs.find(job => job.evaluation_id === "eval_legacy");
assert.equal(awaitingCorrection.code_link, correctedLink, "Sending follow-up mail must not revert the effective code");
assert.equal(awaitingCorrection.preparation_attempt, 1);
const previousResponseAt = awaitingCorrection.version_cutoff_at;
call("handleReviewResponseSubmit_", { ...secondParams, response_kind: "confirm", notes: "Please check the corrected code again" });
const confirmedCorrection = call("reviewQueue_", credentials).jobs.find(job => job.evaluation_id === "eval_legacy");
assert.equal(confirmedCorrection.preparation_attempt, 1);
assert.equal(confirmedCorrection.version_cutoff_at, previousResponseAt, "Confirmation must not change frozen checkpoint cutoff");
call("reviewSendIssue_", { ...legacyIssue, message_id: "msg_" + "4".repeat(32) });
const thirdParams = Object.fromEntries(new URL(sent.at(-1).body.match(/https:\/\/\S+rsc_action=review_response\S+/)[0]).searchParams);
vm.runInContext('reviewStoreWorkflow_(reviewRun_("eval_legacy"), {machine_id:"verified-machine",stages:REVIEW_STAGES.map((_,i)=>({done:true,checks:{},completed_at:"2026-10-11T00:00:00Z"}))})', context);
call("handleReviewResponseSubmit_", { ...correctionFields, ...thirdParams, code_link: "https://github.com/example/policy/tree/" + "7".repeat(40), notes: "Second complete correction" });
const roundTwo = call("reviewQueue_", credentials).jobs.find(job => job.evaluation_id === "eval_legacy");
assert.equal(roundTwo.preparation_attempt, 2);
assert.equal(roundTwo.bundle_commit, "");
assert.equal(roundTwo.workflow.stages[2].done, true, "Keep the machine environment test, but reset participant-dependent progress");
assert(roundTwo.workflow.stages.filter((_, i) => i !== 2).every(stage => !stage.done));
assert.equal(roundTwo.workflow.machine_id, "verified-machine");
assert.equal(roundTwo.reviewer_email, correctedJob.reviewer_email);
assert.equal(JSON.stringify([sheet("Users").cells, sheet("Submissions").cells, sheet("Evaluations").cells]), beforeCorrection);
call("reviewAccessCheck_", { ...credentials, evaluation_id: "eval_legacy", report: hfReport });
assert.throws(() => call("reviewPrepare_", { ...credentials, evaluation_id: "eval_legacy", bundle_commit: "6".repeat(40),
  bundle_url: "https://github.com/ZhaoRunyi/RoboSynChallenge_eval/tree/submissions/eval_legacy-correction1", policy_dirs: ["policy/act"] }), /does not match/);
call("reviewPrepare_", { ...credentials, evaluation_id: "eval_legacy", bundle_commit: "6".repeat(40),
  bundle_url: "https://github.com/ZhaoRunyi/RoboSynChallenge_eval/tree/submissions/eval_legacy-correction2", policy_dirs: ["policy/act"] });
assert.equal(call("reviewRows_", "ReviewResponseLinks").filter(row => row.evaluation_id === "eval_legacy" && row.status === "used").length, 3, "Each response round retains its own audit record");
insert("Users", { email: "assigned-legacy@example.com", team_name: "Assigned legacy team" });
insert("Submissions", { submission_id: "sub_assigned", evaluation_id: "eval_assigned", email: "assigned-legacy@example.com",
  checkpoint_link: "https://huggingface.co/test/legacy", is_ranked: "true", created_at: "2026-10-10T00:00:00Z" });
insert("Evaluations", { submission_id: "sub_assigned", evaluation_id: "eval_assigned", email: "assigned-legacy@example.com" });
call("reviewAssign_", { ...credentials, evaluation_id: "eval_assigned", assign_to: evaluator.email });
const assignedSnapshot = JSON.stringify([sheet("Users").cells, sheet("Submissions").cells, sheet("Evaluations").cells]);
call("reviewVerifyCoverage_", { reviewer_email: evaluator.email, reviewer_token: evaluator.token,
  evaluation_id: "eval_assigned", coverage_confirmed: true, task_checkpoint_links: taskLinks });
const assignedJob = call("reviewQueue_", { reviewer_email: evaluator.email, reviewer_token: evaluator.token }).jobs[0];
assert.equal(assignedJob.coverage_verified_by, evaluator.email);
assert.equal(assignedJob.coverage_status, "verified_all_10");
assert.equal(JSON.stringify([sheet("Users").cells, sheet("Submissions").cells, sheet("Evaluations").cells]), assignedSnapshot);
context.PropertiesService = { getScriptProperties: () => ({ getProperty: key => properties[key] || "",
  setProperty: (key, value) => { properties[key] = value; }, deleteProperty: key => { delete properties[key]; } }) };
context.config_ = (key, fallback) => properties[key] || fallback;
const closing = Date.parse("2026-10-12T12:00:00Z");
assert.equal(vm.runInContext(`submissionAdmission_({email:"one@example.com",token:"existing"},${closing - 1}).allowed`, context), true);
assert.equal(vm.runInContext(`submissionAdmission_({email:"one@example.com",token:"existing"},${closing}).allowed`, context), false);
vm.runInContext('updateRow_("Users",2,{token:"existing",token_status:"active"})', context);
assert.throws(() => call("reviewSubmissionWindow_", { reviewer_email: evaluator.email, reviewer_token: evaluator.token,
  participant_email: "one@example.com", expires_at: "2030-01-01", reason: "Test" }), /Organizer access/);
const grant = call("reviewSubmissionWindow_", { ...credentials, participant_email: "one@example.com", expires_at: "2030-01-01T00:00:00Z", reason: "Approved extension" });
assert.equal(grant.status, "granted");
const admitted = vm.runInContext(`submissionAdmission_({email:"one@example.com",token:"existing"},${closing + 1000})`, context);
assert.equal(admitted.allowed, true);
assert.equal(admitted.exception, true);
assert.equal(vm.runInContext(`submissionAdmission_({email:"one@example.com",token:"regenerated"},${closing + 1000}).allowed`, context), false);
assert(!JSON.stringify(sheet("ReviewSubmissionWindows").cells).includes('"existing"'));
assert.equal(vm.runInContext(`submissionWasAdmitted_(${JSON.stringify({ email:"one@example.com", token:"existing", created_at: new Date(closing+1000).toISOString(), submission_window_id:admitted.window_id })},reviewRows_("ReviewSubmissionWindows"))`, context), true);
call("reviewSubmissionWindow_", { ...credentials, participant_email: "one@example.com", revoke: true, reason: "Closed extension" });
assert.equal(vm.runInContext(`submissionAdmission_({email:"one@example.com",token:"existing"},${closing + 1000}).allowed`, context), false);
vm.runInContext(`savedClock = Date.now; Date.now = () => ${closing + 1000}`, context);
const countBeforeClosed = sheet("Submissions").cells.length;
vm.runInContext("requireSession_ = () => ({email: 'submit-test@example.com'});", context);
assert.throws(() => call("handleSubmitPolicy_", { session_id: "x", submission_key: "new_after_cutoff_key", submission: { ...submission, all_tasks_confirmed: true } }), /closed/i);
assert.equal(call("handleSubmitPolicy_", { session_id: "x", submission: { ...submission, all_tasks_confirmed: true } }).submission.id, created.submission.id, "Accepted retry remains idempotent after cutoff");
assert.equal(sheet("Submissions").cells.length, countBeforeClosed);
vm.runInContext("requireSession_ = () => ({email: 'one@example.com'});", context);
vm.runInContext("Date.now = savedClock", context);

const measured = { schema:1, gpu:"RTX 5090", official_commit:"a".repeat(40), report_sha256:"b".repeat(64),
  timing_scope:"trusted_policy_rpc_wall_time_excluding_simulator", seconds_per_action_step:Object.fromEntries(taskNames.map(task => [task,0.1])) };
assert.throws(() => call("reviewConfigureScoring_", { reviewer_email:evaluator.email, reviewer_token:evaluator.token, reference:measured }), /Organizer access/);
const scoringRecord = { task:"item_assembly", episodes:[{success:true,action_steps:100,inference_ms:100,inference_calls:50,inference_total_ms:5000},
  {success:false,action_steps:500,inference_ms:500,inference_calls:50,inference_total_ms:25000}] };
assert.equal(call("reviewScoredSummary_", scoringRecord).weighted_score, null);
call("reviewConfigureScoring_", { ...credentials, reference:measured });
const scored = call("reviewScoredSummary_", scoringRecord);
assert.equal(scored.success_rate,50);
assert.equal(scored.action_efficiency,40);
assert.equal(scored.inference_ms,300);
assert.equal(scored.inference_efficiency,50);
assert.equal(scored.weighted_score,48);
assert.throws(() => call("reviewConfigureScoring_", { ...credentials, reference:{...measured,report_sha256:"c".repeat(64)} }), /already frozen/);
assert.equal(call("reviewOverallSummary_", [{task:"item_assembly",summary:{...scored,episodes:100}}]).weighted_score,null);
assert.equal(call("reviewOverallSummary_", taskNames.map(task => ({task,summary:{...scored,episodes:100}}))).weighted_score,48);
delete properties.REVIEW_ACT_SCORING_REFERENCE;
const publishedReference = { schema:1, reference_mode:"published_act_benchmark", gpu:"RTX 5090", official_commit:"a".repeat(40),
  report_sha256:"b".repeat(64), source_url:"https://github.com/EDEM-AI/RoboSynChallenge/blob/"+"a".repeat(40)+"/evaluation_results/released_checkpoint_results.json",
  timing_scope:"trusted_policy_rpc_wall_time_excluding_simulator",seconds_per_call:0.011607777797617019,action_horizon:50 };
assert.throws(() => call("reviewConfigureScoring_", {...credentials,reference:{...publishedReference,action_horizon:1}}), /pinned published/);
call("reviewConfigureScoring_", {...credentials,reference:publishedReference});
const publishedScore = call("reviewScoredSummary_", {task:"click_bell",episodes:[{success:true,action_steps:51,inference_ms:1,inference_calls:1,inference_total_ms:1}]});
assert.equal(publishedScore.score_status,"published_act_reference");
assert(Math.abs(publishedScore.inference_efficiency-(1-0.001/(2*publishedReference.seconds_per_call))*100)<1e-9,
  "Corresponding ACT calls are ceiling(action steps / 50), not episode mean latency or participant calls");
const ownOutcome = call("reviewParticipantOutcome_", {evaluation_id:"eval_new",submission_id:"sub_new",email:"one@example.com"});
assert.equal(ownOutcome.task_results.length,10);
assert(ownOutcome.task_results.every(row=>row.eval_command && row.archive_sha256));
assert(!JSON.stringify(ownOutcome).includes('"seed"'));
assert.equal(call("reviewParticipantOutcome_", {evaluation_id:"eval_new",submission_id:"sub_new",email:"attacker@example.com"}).task_results.length,0);
assert.equal(scored.inference_per_episode_ms, 15000);
assert.throws(() => call("reviewReassign_", { ...credentials, evaluation_id: "eval_new", assign_to: evaluator.email, reason: "Too late" }), /locked/);
call("reviewReassign_", { ...credentials, evaluation_id: "eval_assigned", assign_to: reviewer.email, reason: "Before local handoff" });
assert.equal(call("reviewQueue_", { reviewer_email: evaluator.email, reviewer_token: evaluator.token }).jobs.length, 0);
assert.equal(sheet("ReviewAssignments").cells[1][1], evaluator.email);
call("reviewPreparationFailed_", { ...credentials, evaluation_id: "eval_assigned", message: "NO_LEGAL_VERSION: checkpoint missing before deadline" });
assert.throws(() => call("reviewApproveVersionException_", { ...credentials, evaluation_id: "eval_assigned", reason: "Evidence reviewed" }), /Confirm/);
call("reviewSendIssue_", { ...issue, evaluation_id: "eval_assigned", message_id: "msg_" + "1".repeat(32) });
assert(sent.at(-1).body.includes("manual reviewer approval"));
assert(!sent.at(-1).body.includes("rsc_action=review_response"), "No-legal-version email must not bypass manual argument approval");
call("reviewApproveVersionException_", { ...credentials, evaluation_id: "eval_assigned", reason: "Participant timestamp evidence accepted", argument_reviewed: true });
assert.equal(call("reviewQueue_", credentials).jobs.find(job => job.evaluation_id === "eval_assigned").version_generation, 1);
const versionCutoff = call("reviewQueue_", credentials).jobs.find(job => job.evaluation_id === "eval_assigned").version_cutoff_at;
const versionReport = { code: { revision: "a".repeat(40), authored_at: "2026-10-01T00:00:00Z", committed_at: "2026-10-01T00:00:00Z", cutoff_at: versionCutoff },
  hf: Object.fromEntries(taskNames.map(task => [task, { ...hfReport[task], committed_at: "2026-10-01T00:00:00Z", cutoff_at: versionCutoff }])) };
call("reviewVersionCheck_", { ...credentials, evaluation_id: "eval_assigned", status: "final", report: versionReport });
assert.throws(() => call("reviewVersionCheck_", { ...credentials, evaluation_id: "eval_assigned", status: "final", report: {
  ...versionReport, hf: { ...versionReport.hf, click_bell: { ...versionReport.hf.click_bell, committed_at: versionCutoff } },
} }), /timestamps must precede/);
assert.equal(call("reviewQueue_", credentials).jobs.find(job => job.evaluation_id === "eval_assigned").version_status, "final");
const audit = call("reviewAuditSubmissionLinks_", credentials);
assert.equal(audit.issues.length, 0);
assert.throws(() => call("reviewAuditSubmissionLinks_", { reviewer_email: evaluator.email, reviewer_token: evaluator.token }), /Organizer access/);
const observer = vm.runInContext('provisionReviewer("observer@example.com", "observer")', context);
const observerCredentials = { reviewer_email: observer.email, reviewer_token: observer.token };
assert.equal(call("reviewerIdentity_", observerCredentials).role, "observer");
const dispatch = (action, payload) => vm.runInContext(`handleReviewerAction_(${JSON.stringify(action)}, ${JSON.stringify(payload)})`, context);
const supervisor = vm.runInContext('provisionReviewer("supervisor@example.com", "supervisor")', context);
const supervisorCredentials = {reviewer_email:supervisor.email, reviewer_token:supervisor.token};
assert.equal(dispatch("reviewer_queue", supervisorCredentials).jobs.length, call("reviewQueue_", credentials).jobs.length);
assert.equal(call("reviewOwnedRun_", {...supervisorCredentials, evaluation_id:"eval_assigned"}).run.evaluation_id,"eval_assigned");
assert.equal(call("reviewSaveChecks_", {...supervisorCredentials, evaluation_id:"eval_assigned",stage:0,checks:{}}).ok,true);
for (const action of ["reviewer_preparation_queue", "reviewer_configure_storage", "reviewer_provision_account", "reviewer_pool"]) {
  assert.throws(() => dispatch(action, supervisorCredentials), /Organizer/);
}
assert.equal(dispatch("reviewer_login", observerCredentials).reviewer.role, "observer");
assert.equal(dispatch("reviewer_queue", observerCredentials).jobs.length, call("reviewQueue_", credentials).jobs.length);
for (const action of ["reviewer_assign", "reviewer_complete_stage", "reviewer_send_issue", "reviewer_preparation_queue", "reviewer_configure_storage", "reviewer_provision_account", "reviewer_ensure_run"]) {
  assert.throws(() => dispatch(action, observerCredentials), /Read-only access/);
}
assert.throws(() => call("reviewProvisionAccount_", { ...credentials, email: reviewer.email, role: "evaluator", eval_token: reviewer.token }), /at least one/);
assert.throws(() => call("reviewProvisionAccount_", { ...credentials, email: reviewer.email, role: "observer", eval_token: reviewer.token }), /Release.*assignments/);
assert.throws(() => call("reviewReleaseAssignments_", { ...credentials, email: reviewer.email, reason: "Observer migration" }), /locked/);
insert("Users", { email: "pending@example.com", team_name: "Pending team", token_status: "active" });
insert("Submissions", { submission_id: "sub_pending", evaluation_id: "eval_pending", email: "pending@example.com", is_ranked: "true", created_at: "2026-10-11T11:00:00Z" });
insert("Evaluations", { submission_id: "sub_pending", evaluation_id: "eval_pending", email: "pending@example.com" });
call("reviewEnsureRun_", { ...credentials, evaluation_id: "eval_pending" });
call("reviewEnsureRun_", { ...credentials, evaluation_id: "eval_pending" });
assert.equal(call("reviewQueue_", credentials).jobs.find(job => job.evaluation_id === "eval_pending").reviewer_email, "");
assert.throws(() => call("reviewAssign_", { ...credentials, evaluation_id: "eval_pending", assign_to: observer.email }), /read-only/);
assert.throws(() => call("reviewAssign_", { ...credentials, evaluation_id: "eval_pending", assign_to: supervisor.email }), /non-assigned/);
call("reviewAssign_", { ...credentials, evaluation_id: "eval_pending" });
assert.equal(call("reviewQueue_", credentials).jobs.find(job => job.evaluation_id === "eval_pending").reviewer_email, evaluator.email);
assert.throws(() => call("reviewReassign_", { ...credentials, evaluation_id: "eval_pending", assign_to: observer.email, reason: "Bad role" }), /read-only/);
assert.equal(call("reviewReleaseAssignments_", { ...credentials, email: evaluator.email, reason: "View-only account" }).released, 1);
assert.equal(call("reviewQueue_", credentials).jobs.find(job => job.evaluation_id === "eval_pending").reviewer_email, "");
const invitation = { ...credentials, email: observer.email, eval_token: observer.token, invitation_id: "invite_" + "d".repeat(32) };
const mailCount = sent.length;
assert.equal(call("reviewSendInvitation_", invitation).status, "sent");
assert.equal(sent.at(-1).to, observer.email);
assert(sent.at(-1).htmlBody.includes("https://robosyn-bench.net/eval_backend/"));
assert(sent.at(-1).htmlBody.includes(observer.token));
assert.equal(call("reviewSendInvitation_", invitation).duplicate, true);
assert.equal(sent.length, mailCount + 1);
assert(!JSON.stringify(properties).includes(observer.token));
const globalMail = dispatch("reviewer_mail_status", observerCredentials).messages;
assert.equal(globalMail.length, call("reviewMailStatus_", credentials).messages.length);
assert(globalMail.length > 0);
assert(globalMail.every(message => message.gmail_url.startsWith("https://mail.google.com/mail/u/?authuser=")));
assert(globalMail.every(message => !Object.hasOwn(message, "body") && !Object.hasOwn(message, "response_token")));
assert.equal(call("reviewMailStatus_", { reviewer_email: evaluator.email, reviewer_token: evaluator.token }).messages.length, 0);
workbookOpens = 0;
call("reviewQueue_", observerCredentials);
assert.equal(workbookOpens, 1, "Queue reads share one workbook without caching authorization or stale rows");
const savedHeader = sheet("ReviewRuns").cells[0][0];
sheet("ReviewRuns").cells[0][0] = "wrong_header";
assert.throws(() => call("reviewQueue_", observerCredentials), /headers changed/);
sheet("ReviewRuns").cells[0][0] = savedHeader;
const includedMail = call("reviewQueue_", { ...observerCredentials, include_mail_status: true });
assert.equal(JSON.stringify(includedMail.messages), JSON.stringify(globalMail));
assert(!JSON.stringify(includedMail).includes("hf_synthetic"));
// A fresh authenticated batch replaces seventeen separate data reads.
workbook.getId = () => "workbook_test";
context.ScriptApp.getOAuthToken = () => "synthetic-google";
let batchCalls = 0;
context.UrlFetchApp = { fetch(url, options) {
  assert.equal(options.headers.Authorization, "Bearer synthetic-google");
  const parsed = new URL(url);
  assert.equal(parsed.hostname, "sheets.googleapis.com");
  batchCalls += 1;
  const valueRanges = parsed.searchParams.getAll("ranges").map(range => {
    const name = range.match(/^'([^']+)'/)[1];
    const values = sheet(name).cells.map(row => [...row]);
    return { values };
  });
  return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ valueRanges }) };
} };
assert.equal(call("reviewQueue_", observerCredentials).refresh.read_mode, "batch");
assert.equal(batchCalls, 1);
assert.throws(() => call("reviewQueue_", { ...observerCredentials, reviewer_token: "act_" + "0".repeat(64) }), /credentials/);
assert.equal(batchCalls, 1, "Failed authentication must not trigger a bulk read");
sheet("ReviewRuns").cells[0][0] = "bad";
assert.throws(() => call("reviewQueue_", observerCredentials), /headers changed/);
sheet("ReviewRuns").cells[0][0] = savedHeader;
context.UrlFetchApp = { fetch: () => ({ getResponseCode: () => 403 }) };
assert.equal(call("reviewQueue_", observerCredentials).refresh.read_mode, "spreadsheet");
delete workbook.getId;
// Pool updates cannot activate an observer, change participant data, or move started work.
assert.throws(() => dispatch("reviewer_pool", observerCredentials), /Read-only/);
assert.throws(() => call("reviewPool_", { reviewer_email: evaluator.email, reviewer_token: evaluator.token }), /Organizer/);
assert.throws(() => call("reviewSetPool_", { ...credentials, email: observer.email, active: true }), /existing evaluator/);
assert.equal(call("reviewBalancePool_", credentials).state, "disabled");
call("reviewSetPool_", { ...credentials, enabled: true, minimum_evaluators: 2 });
assert.equal(call("reviewBalancePool_", credentials).state, "waiting_evaluators");
const secondEvaluator = vm.runInContext('provisionReviewer("second@example.com", "evaluator")', context);
for (let index = 0; index < 7; index += 1) {
  const email = `pool${index}@example.com`, id = `eval_pool${index}`, sub = `sub_pool${index}`;
  insert("Users", { email, team_name: `Pool ${index}` });
  insert("Submissions", { submission_id: sub, evaluation_id: id, email, is_ranked: "true", created_at: "2026-10-11T12:00:00Z" });
  insert("Evaluations", { submission_id: sub, evaluation_id: id, email });
}
const participantData = JSON.stringify([sheet("Users").cells, sheet("Submissions").cells, sheet("Evaluations").cells]);
const balanced = call("reviewBalancePool_", credentials);
assert.equal(balanced.state, "balanced");
assert.equal(balanced.unassigned, 0);
assert(balanced.changed > 0);
assert.equal(balanced.accounts.find(account => account.email === observer.email).assigned, 0);
assert(Math.abs(balanced.accounts.find(account => account.email === evaluator.email).active_requests -
  balanced.accounts.find(account => account.email === secondEvaluator.email).active_requests) <= 1);
assert.equal(call("reviewBalancePool_", credentials).changed, 0, "Repeated polls must not churn assignments");
const lockedRun = call("reviewQueue_", credentials).jobs.find(job => job.evaluation_id === "eval_pool0");
vm.runInContext(`reviewWrite_("ReviewProgress", null, {evaluation_id:"eval_pool0",stages_json:JSON.stringify([{},{checks:{commit_verified:true}}])})`, context);
call("reviewSetPool_", { ...credentials, email: lockedRun.reviewer_email, active: false, minimum_evaluators: 1 });
const rebalanced = call("reviewBalancePool_", credentials);
assert(rebalanced.locked_outside_pool >= 1, "Keep all started work, including retained environment checks, with its evaluator");
assert.equal(call("reviewQueue_", credentials).jobs.find(job => job.evaluation_id === "eval_pool0").reviewer_email, lockedRun.reviewer_email);
assert.equal(JSON.stringify([sheet("Users").cells, sheet("Submissions").cells, sheet("Evaluations").cells]), participantData);
assert(!JSON.stringify(balanced).includes("token_sha256"));
const accountBeforeMove = call("reviewRows_", "Reviewers").find(row=>row.email===lockedRun.reviewer_email);
const workflowBeforeMove = JSON.stringify(call("reviewWorkflow_", "eval_pool0"));
const moveFields = {...credentials,previous_email:lockedRun.reviewer_email,email:"moved@example.com"};
assert.throws(()=>call("reviewMoveEvaluatorEmail_", {...moveFields,reviewer_email:observer.email,reviewer_token:observer.token}),/Organizer/);
assert(call("reviewMoveEvaluatorEmail_", moveFields).moved > 0);
assert.equal(call("reviewRows_", "Reviewers").find(row=>row.email==="moved@example.com").token_sha256,accountBeforeMove.token_sha256);
assert.equal(call("reviewRows_", "Reviewers").find(row=>row.email===lockedRun.reviewer_email).active,"false");
assert.equal(JSON.stringify(call("reviewWorkflow_", "eval_pool0")),workflowBeforeMove);
assert.equal(call("reviewMoveEvaluatorEmail_", moveFields).moved,0,"Retry does not move progress twice or rotate the token");
assert.throws(()=>call("reviewMoveEvaluatorEmail_", {...moveFields,email:observer.email}),/conflicts/);
insert("Users", {email:"cutoff@example.com",team_name:"Cutoff fixture"});
insert("Submissions", {submission_id:"sub_cutoff",evaluation_id:"eval_cutoff",email:"cutoff@example.com",is_ranked:"true",created_at:"2026-10-10T00:00:00Z",task_checkpoint_links_json:JSON.stringify(taskLinks)});
insert("Evaluations", {submission_id:"sub_cutoff",evaluation_id:"eval_cutoff",email:"cutoff@example.com"});
call("reviewEnsureRun_", {...credentials,evaluation_id:"eval_cutoff"});
const frozenHF = Object.fromEntries(taskNames.map(task => [task,{...hfReport[task],committed_at:"2026-10-10T00:00:00Z",cutoff_at:"2026-10-12T12:00:00.000Z"}]));
const previousVersion = {code:{revision:"4".repeat(40),cutoff_at:"2026-10-11T00:00:00Z"},hf:frozenHF};
vm.runInContext(`reviewWrite_("ReviewVersionChecks", null, {evaluation_id:"eval_cutoff",status:"provisional",report_json:${JSON.stringify(JSON.stringify(previousVersion))}}); reviewStoreWorkflow_(reviewRun_("eval_cutoff"),{machine_id:"keep-machine",stages:REVIEW_STAGES.map((_,i)=>({done:i===0||i===2,checks:{},completed_at:"previous"}))})`, context);
const cutoffJob = call("reviewQueue_", credentials).jobs.find(job => job.evaluation_id === "eval_cutoff");
const progressBeforeFreeze = JSON.stringify(cutoffJob.workflow);
const finalReport = {code:{revision:"4".repeat(40),cutoff_at:"2026-10-12T12:00:00.000Z", authored_at:"2026-10-10T00:00:00Z", committed_at:"2026-10-10T00:00:00Z"},hf:frozenHF};
vm.runInContext(`savedClock=Date.now; Date.now=()=>${closing+1000}`, context);
const reconcileFields = {...credentials,evaluation_id:"eval_cutoff",context_json:cutoffJob.hf_check_context,report:finalReport};
assert.equal(call("reviewReconcileFinalProgress_", reconcileFields).state,"unchanged");
assert.equal(JSON.stringify(call("reviewQueue_",credentials).jobs.find(job=>job.evaluation_id==="eval_cutoff").workflow),progressBeforeFreeze);
assert.equal(call("reviewQueue_",credentials).jobs.find(job=>job.evaluation_id==="eval_cutoff").version_status,"final");
vm.runInContext(`reviewWrite_("ReviewVersionChecks", reviewRows_("ReviewVersionChecks").find(row=>row.evaluation_id==="eval_cutoff")._rowNumber, {status:"provisional",report_json:${JSON.stringify(JSON.stringify(previousVersion))},evaluation_id:"eval_cutoff"})`, context);
const changedReport = {...finalReport,hf:{...frozenHF,click_bell:{...frozenHF.click_bell,revision:"5".repeat(40)}}};
const realWrite = context.reviewWrite_;
context.reviewWrite_ = (name, row, values) => { if(name==="ReviewProgressBackups") throw new Error("Backup write failed"); return realWrite(name,row,values); };
assert.throws(()=>call("reviewReconcileFinalProgress_",{...reconcileFields,report:changedReport}),/Backup write failed/);
assert.equal(JSON.stringify(call("reviewQueue_",credentials).jobs.find(job=>job.evaluation_id==="eval_cutoff").workflow),progressBeforeFreeze,"Never reset if the backup cannot be written");
context.reviewWrite_ = realWrite;
const resetAtFreeze = call("reviewReconcileFinalProgress_",{...reconcileFields,report:changedReport});
assert.equal(resetAtFreeze.reset,true);
const backup = call("reviewRows_","ReviewProgressBackups").filter(row=>row.backup_id===resetAtFreeze.backup_id);
assert(backup.some(row=>row.table_name==="ReviewProgress" && row.snapshot_json.includes("keep-machine")));
assert(backup.some(row=>row.table_name==="ReviewVersionChecks" && row.snapshot_json.includes("provisional")));
const resetWorkflow = call("reviewQueue_",credentials).jobs.find(job=>job.evaluation_id==="eval_cutoff").workflow;
assert.equal(resetWorkflow.stages[0].done,false);
assert.equal(resetWorkflow.stages[2].done,true);
assert.equal(call("reviewReconcileFinalProgress_",{...reconcileFields,report:changedReport}).reset,false,"A retry does not back up/reset the same progress again");
vm.runInContext("Date.now=savedClock",context);
const responseRowsBeforeMigration = JSON.stringify(sheet("ReviewCorrections").cells.slice(1));
sheet("ReviewCorrections").cells[0] = sheet("ReviewCorrections").cells[0].slice(0, 10);
sheet("ReviewResponseLinks").cells[0] = sheet("ReviewResponseLinks").cells[0].slice(0, 5);
assert.throws(() => call("reviewMigrateResponseSchema_", {reviewer_email:observer.email,reviewer_token:observer.token}), /Organizer/);
assert.equal(call("reviewMigrateResponseSchema_", credentials).ok, true);
assert.equal(call("reviewMigrateResponseSchema_", credentials).ok, true);
assert.equal(JSON.stringify(sheet("ReviewCorrections").cells.slice(1)), responseRowsBeforeMigration, "Schema migration only appends headers, never rewrites existing participant responses");
insert("Users", {email:"access-followup@example.com",team_name:"Access follow-up",token_status:"active"});
insert("Submissions", {submission_id:"sub_accessfollow",evaluation_id:"eval_accessfollow",email:"access-followup@example.com",is_ranked:"true",artifact_name:"Access follow-up",code_link:"https://github.com/example/policy",task_checkpoint_links_json:JSON.stringify(taskLinks),created_at:"2026-10-11T12:00:00Z"});
insert("Evaluations", {evaluation_id:"eval_accessfollow",submission_id:"sub_accessfollow",email:"access-followup@example.com"});
call("reviewAssign_", {...credentials,evaluation_id:"eval_accessfollow",assign_to:reviewer.email});
call("reviewCheckpointCheck_", {...credentials,evaluation_id:"eval_accessfollow",task_checkpoint_links:taskLinks,status:"failed",message:"Gated access not granted"});
context.MailApp = {getRemainingDailyQuota:()=>10,sendEmail:message=>sent.push(message)};
call("reviewSendIssue_", {...issue,evaluation_id:"eval_accessfollow",message_id:"msg_"+"a".repeat(32)});
const accessResponse = Object.fromEntries(new URL(sent.at(-1).body.match(/https:\/\/\S+rsc_action=review_response\S+/)[0]).searchParams);
call("handleReviewResponseSubmit_", {...accessResponse,response_kind:"confirm",notes:"Gated access granted; URLs unchanged"});
assert.equal(call("reviewQueue_",credentials).jobs.find(job=>job.evaluation_id==="eval_accessfollow").hf_check_status,"pending","Access-only confirmation queues another HF check without a new submission or correction");
// Official maintenance never chooses a new participant commit and is repeatable.
const toolsFields = {...credentials,evaluation_id:"eval_accessfollow",base_commit:"7".repeat(40),expected_bundle_commit:""};
assert.throws(() => call("reviewUpgradeTools_",{...toolsFields,...supervisorCredentials}), /Organizer/);
vm.runInContext('reviewStoreWorkflow_(reviewRun_("eval_accessfollow"), {stages:REVIEW_STAGES.map((_,i)=>({done:i<3,checks:{},completed_at:"before-upgrade"}))})', context);
const upgraded = call("reviewUpgradeTools_",toolsFields);
assert.equal(upgraded.state,"queued");
assert.equal(call("reviewUpgradeTools_",toolsFields).state,"already_queued");
const upgradedWorkflow = call("reviewWorkflow_","eval_accessfollow");
assert.equal(upgradedWorkflow.stages[0].done,true);
assert.equal(upgradedWorkflow.stages[1].done,false);
assert.equal(upgradedWorkflow.stages[2].done,true);
assert(call("reviewRows_","ReviewProgressBackups").some(row=>row.backup_id===upgraded.backup_id));
const uploadStatus = call("archiveEvidenceStatus_",{...supervisorCredentials,evaluation_id:"eval_accessfollow",task:"click_bell",bundle_commit:""});
assert.equal(uploadStatus.status_code,"RSC_UPLOAD_PENDING");
assert.equal(uploadStatus.backend_registered,false);
const statusCapability = call("reviewIssueUploadAccess_", {...credentials,evaluation_id:"eval_accessfollow"});
const statusClone = {evaluation_id:"eval_accessfollow",upload_token:statusCapability.upload_token,bundle_commit:"",task:"click_bell"};
assert.equal(dispatch("reviewer_evidence_status",statusClone).status_code,"RSC_UPLOAD_PENDING","Clone commands do not require a separate reviewer login");
assert.throws(()=>dispatch("reviewer_upgrade_tools",statusClone),/cannot access/);
assert.throws(()=>dispatch("reviewer_evidence_status",{...statusClone,upload_token:"upl_"+"0".repeat(64)}),/Invalid or expired/);
const capabilityBeforeMaintenance = JSON.stringify(call("reviewRows_","ReviewUploadAccess"));
const progressBeforeMaintenance = JSON.stringify(call("reviewWorkflow_","eval_accessfollow"));
vm.runInContext('reviewWrite_("ReviewRuns", reviewRun_("eval_accessfollow")._rowNumber, {evaluation_id:"eval_accessfollow",bundle_commit:"b".repeat(40)}); originalMaintenanceQueue = reviewQueue_; reviewQueue_ = () => ({jobs:[{evaluation_id:"eval_accessfollow",bundle_commit:"b".repeat(40),code_base_commit:"8".repeat(40),version_report:{},preparation_attempt:0,version_generation:0}]});', context);
assert.equal(call("reviewUpgradeTools_", {...toolsFields,base_commit:"8".repeat(40),expected_bundle_commit:"b".repeat(40)}).state,"already_current");
vm.runInContext('reviewQueue_ = originalMaintenanceQueue', context);
assert.equal(JSON.stringify(call("reviewRows_","ReviewUploadAccess")),capabilityBeforeMaintenance,"Already-current code retains its upload capability");
assert.equal(JSON.stringify(call("reviewWorkflow_","eval_accessfollow")),progressBeforeMaintenance,"Already-current code retains progress");
console.log("Reviewer backend: authorization, stage gates, result validation, corrections, storage, AoE cutoff, token-specific extensions and calibrated scoring passed.");
