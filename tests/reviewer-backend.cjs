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
const context = vm.createContext({
  console,
  ScriptApp: { getService: () => ({ getUrl: () => "https://script.google.com/macros/s/test/exec" }) },
  SpreadsheetApp: { getActive: () => workbook },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => "" }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: key => cache.get(key), put: (key, value) => cache.set(key, value), remove: key => cache.delete(key) }) },
  Utilities: {
    getUuid: () => crypto.randomUUID(),
    DigestAlgorithm: { SHA_256: "sha256" },
    computeDigest: (_, text) => [...crypto.createHash("sha256").update(text).digest()],
  },
});
const base = path.join(__dirname, "../apps-script");
vm.runInContext(["Code.gs", "Reviewer.gs", "ArchiveUpload.gs", "ReviewResponse.gs"].map(name => fs.readFileSync(path.join(base, name), "utf8")).join("\n"), context);
const call = (expression, args = {}) => vm.runInContext(`${expression}(${JSON.stringify(args)})`, context);
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
assert.equal(call("reviewQueue_", credentials).jobs.length, 0, "Even admin UI sees only assigned requests");
let queue = vm.runInContext(`reviewQueue_(${JSON.stringify(credentials)}, true)`, context);
assert.equal(queue.jobs.length, 1);
assert.equal(queue.jobs[0].evaluation_id, "eval_new");
assert.equal(queue.jobs[0].team_name, "Existing team");
assert.equal(queue.jobs[0].coverage_status, "declared_all_10");
assert.equal(Object.keys(queue.jobs[0].task_checkpoint_links).length, 10);
const bundleCommit = "a".repeat(40);
call("reviewAssign_", { ...credentials, evaluation_id: "eval_new" });
const capability = call("reviewIssueUploadAccess_", { ...credentials, evaluation_id: "eval_new" });
assert(!JSON.stringify(sheet("ReviewUploadAccess").cells).includes(capability.upload_token));
assert.throws(() => call("reviewUploadContext_", { evaluation_id: "eval_new", upload_token: "upl_bad" }), /Invalid or expired/);
assert.throws(() => call("reviewSendIssue_", { evaluation_id: "eval_new", upload_token: capability.upload_token }), /Email is required/);
call("reviewPrepare_", { ...credentials, evaluation_id: "eval_new", bundle_commit: bundleCommit,
  bundle_url: "https://github.com/ZhaoRunyi/RoboSynChallenge_eval/tree/submissions/eval_new", policy_dirs: ["policy/act"] });
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
assert.throws(() => stage(2, { machine_checked: true, reference_checked: false }), /checklist/);
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
context.archiveGraph_ = (path, method, body) => {
  graphCalls.push({ path, method, body });
  if (path.endsWith("createUploadSession")) return {uploadUrl:"https://upload.example/session", expirationDateTime:new Date(Date.now()+3600000).toISOString()};
  if (path.endsWith("evidence.zip")) return {size:123,webUrl:"https://tenant.sharepoint.com/latest/evidence.zip","@microsoft.graph.downloadUrl":"https://download.example/file"};
  return {id:"json"};
};
context.archiveTarget_ = (run, task) => "/drives/test/items/" + run.evaluation_id + "-" + task + "-latest";
const uploadPayload = {evaluation_id:"eval_new",upload_token:capability.upload_token,result,size:123};
const uploadSession = call("archiveStart_", uploadPayload);
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
assert.throws(() => call("archiveStart_", uploadPayload), /Accepted results are locked/);
assert.equal(JSON.stringify([sheet("Users").cells, sheet("Submissions").cells, sheet("Evaluations").cells]), before);
queue = call("reviewQueue_", credentials);
assert.equal(queue.jobs[0].results[0].status, "checked");
insert("Users", { email: "legacy@example.com", team_name: "Legacy team" });
insert("Submissions", { submission_id: "sub_legacy", evaluation_id: "eval_legacy", email: "legacy@example.com",
  artifact_name: "Legacy", checkpoint_link: "https://huggingface.co/test/legacy", is_ranked: "true",
  created_at: "2026-10-10T00:00:00Z" });
insert("Evaluations", { submission_id: "sub_legacy", evaluation_id: "eval_legacy", email: "legacy@example.com" });
assert(!call("reviewQueue_", credentials).jobs.some((job) => job.evaluation_id === "eval_legacy"));
const legacySnapshot = JSON.stringify(sheet("Submissions").cells);
call("reviewAssign_", { ...credentials, evaluation_id: "eval_legacy" });
call("reviewPreparationFailed_", { ...credentials, evaluation_id: "eval_legacy", message: "No deploy_policy.py found under policy/" });
assert.equal(call("reviewQueue_", credentials).jobs.find(job => job.evaluation_id === "eval_legacy").preparation_status, "failed");
call("reviewRetryPreparation_", { ...credentials, evaluation_id: "eval_legacy" });
assert.equal(call("reviewQueue_", credentials).jobs.find(job => job.evaluation_id === "eval_legacy").preparation_status, "pending");
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
const legacyAccess = call("reviewIssueUploadAccess_", { ...credentials, evaluation_id: "eval_legacy" });
assert.equal(call("reviewPrepare_", { ...credentials, evaluation_id: "eval_legacy",
  bundle_commit: bundleCommit, bundle_url: "https://github.com/ZhaoRunyi/RoboSynChallenge_eval/tree/submissions/eval_legacy",
  policy_dirs: ["policy/act"] }).ok, true);
assert.equal(JSON.stringify(sheet("Submissions").cells), legacySnapshot);
vm.runInContext("sendEvaluationRequestNotification_ = () => {}; sendAdminDigest_ = () => {};", context);
context.MailApp = { sendEmail() {} };
const created = call("handleSubmitPolicy_", { session_id: "x", submission: {
  ...submission, all_tasks_confirmed: true,
} });
assert.equal(Object.keys(created.submission.task_checkpoint_links).length, 10);
assert.equal(JSON.parse(sheet("Submissions").cells.at(-1).at(-1)).item_assembly, taskLinks.item_assembly);
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
const responseParams = Object.fromEntries(responseUrl.searchParams);
assert(!JSON.stringify(sheet("ReviewResponseLinks").cells).includes(responseParams.token));
assert.throws(() => call("requireReviewResponse_", { ...responseParams, token: "rsp_" + "0".repeat(64) }), /not active/);
const originalSnapshot = JSON.stringify(sheet("Submissions").cells);
context.HtmlService = { createHtmlOutput: text => text };
call("handleReviewResponseSubmit_", { ...responseParams, response_kind: "confirm", notes: "The original code is correct." });
assert.equal(JSON.stringify(sheet("Submissions").cells), originalSnapshot);
assert.throws(() => call("handleReviewResponseSubmit_", { ...responseParams, response_kind: "confirm", notes: "Second reply" }), /already been recorded/);
vm.runInContext('reviewWrite_("ReviewCorrections", 2, {evaluation_id:"eval_new", deadline_at:"2020-01-01T00:00:00Z"})', context);
assert.throws(() => call("requireReviewResponse_", responseParams), /expired/);
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
assert.throws(() => call("handleReviewResponseSubmit_", correctionFields), /already been submitted/);
assert.throws(() => call("reviewUploadContext_", { evaluation_id: "eval_legacy", upload_token: legacyAccess.upload_token }), /Invalid or expired/);
const correctedJob = call("reviewQueue_", credentials).jobs.find(job => job.evaluation_id === "eval_legacy");
assert.equal(correctedJob.code_link, correctedLink);
assert.equal(correctedJob.preparation_attempt, 1);
assert.equal(correctedJob.bundle_commit, "");
assert.equal(correctedJob.preparation_status, "pending");
assert.throws(() => call("reviewAccessCheck_", { ...credentials, evaluation_id: "eval_legacy", report: { ...hfReport, click_bell: { ...hfReport.click_bell, files_checked: 0 } } }), /receipts matching/);
assert.throws(() => call("reviewAccessCheck_", { ...credentials, evaluation_id: "eval_legacy", report: { ...hfReport, click_bell: { ...hfReport.click_bell, url: "https://huggingface.co/other/model" } } }), /receipts matching/);
call("reviewAccessCheck_", { ...credentials, evaluation_id: "eval_legacy", report: hfReport });
call("reviewPrepare_", { ...credentials, evaluation_id: "eval_legacy", bundle_commit: "8".repeat(40),
  bundle_url: "https://github.com/ZhaoRunyi/RoboSynChallenge_eval/tree/submissions/eval_legacy-correction1", policy_dirs: ["policy/act"] });
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
console.log("Reviewer backend: assigned-only authorization, five-stage gates, machine thresholds, ten-task validation, email idempotency/quota, and participant table isolation passed.");
