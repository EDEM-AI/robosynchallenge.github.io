/** Sheet-backed preliminary evaluation handoff. No participant identities are created here. */
const REVIEW_TABLES = {
  Reviewers: ["email", "token_sha256", "role", "active", "created_at"],
  ReviewRuns: ["evaluation_id", "submission_id", "participant_email", "reviewer_email", "state",
    "bundle_url", "bundle_commit", "policy_dirs_json", "assigned_at", "updated_at",
    "task_checkpoint_links_json", "coverage_verified_at", "coverage_verified_by"],
  ReviewTaskResults: ["evaluation_id", "submission_id", "task", "reviewer_email", "result_json",
    "status", "review_note", "updated_at"],
  ReviewProgress: ["evaluation_id", "stages_json", "machine_id", "updated_at"],
  ReviewMachines: ["reviewer_email", "machine_id", "report_json", "report_sha256", "status", "updated_at"],
  ReviewMessages: ["evaluation_id", "message_id", "reviewer_email", "stage", "recipient", "subject", "body", "status", "created_at", "sent_at"],
  ReviewPreparation: ["evaluation_id", "status", "message", "updated_at"],
  ReviewCodePreparations: ["evaluation_id", "submission_id", "code_link", "participant_commit", "private_base_commit", "bundle_url", "bundle_commit", "policy_dirs_json", "selection_json", "attempt", "generation", "updated_at"],
  ReviewUploadAccess: ["evaluation_id", "token_hash", "expires_at", "revoked", "created_at"],
  ReviewArchiveUploads: ["evaluation_id", "task", "upload_id", "expected_sha256", "size", "status", "expires_at", "updated_at", "record_hash"],
  ReviewTaskCommands: ["evaluation_id", "task", "bundle_commit", "command", "reviewer_email", "updated_at"],
  ReviewAccessChecks: ["evaluation_id", "report_json", "checked_at"],
  ReviewCheckpointChecks: ["evaluation_id", "context_json", "status", "message", "cutoff_at", "updated_at"],
  ReviewCheckpointSources: ["evaluation_id", "context_json", "status", "report_json", "message", "checked_at"],
  ReviewResponseLinks: ["evaluation_id", "message_id", "token_hash", "status", "created_at", "response_kind", "response_json", "responded_at"],
  ReviewCorrections: ["evaluation_id", "participant_email", "deadline_at", "status", "code_link", "task_checkpoint_links_json", "notes", "responded_at", "previous_bundle_commit", "updated_at", "correction_count", "response_status", "response_at"],
  ReviewSubmissionWindows: ["window_id", "email", "token_hash", "status", "expires_at", "reason", "granted_by", "created_at"],
  ReviewVersionChecks: ["evaluation_id", "status", "report_json", "checked_at"],
  ReviewVersionDecisions: ["evaluation_id", "cutoff_at", "reason", "approved_by", "approved_at", "generation"],
  ReviewAssignments: ["evaluation_id", "previous_reviewer", "reviewer_email", "reason", "changed_by", "changed_at"],
  ReviewProgressBackups: ["backup_id", "evaluation_id", "table_name", "row_key", "part", "snapshot_json", "reason", "created_at"],
  ReviewToolUpgrades: ["evaluation_id", "base_commit", "previous_bundle_commit", "selection_json", "backup_id", "updated_at"],
};
const REVIEW_TASK_STEPS = {
  click_bell: 361, drawer_open_place: 900, mixer_operating: 500, table_rearrangement: 361,
  water_pouring: 500, handle_basket: 500, items_handover: 350, item_assembly: 500,
  manipulate_pipette: 1000, sample_loading: 500,
};
const REVIEW_SEED_HASHES = {
  click_bell: "5e108dabef5880b19d94bda7915098ecb5721ad401516f53f357f51c19a937aa",
  drawer_open_place: "ac0dfab95c7cf945bf7c7157e82f0d75ab1f08891ff10b5b2f2ddee83006cc74",
  handle_basket: "34909c5afd60d68aa0d12f6066a8f8b88e94ab321673739e04653bf61668e0d2",
  item_assembly: "850516df6e6481f6be4fbd9d65ed2b512bde8fa89d67ff780bfa891bc7e854f0",
  items_handover: "5ebc46ac96c1ac12a3774292014028783f71b2e1347c1f1fa431f8d821cecc86",
  manipulate_pipette: "0f54070f2f03357b9e4846c4b5b3e4cdce94a96bd9bf248bfa49c71b252c96fb",
  mixer_operating: "22ab31fc8c4461ff99aad7ca3614861e0d9314bc518f8f8817c6b400036cb370",
  sample_loading: "745dc13202ca5a75ffce62d44452129a0bebe79bcfd03405fb99dadde3fc8800",
  table_rearrangement: "ad479b03691b7d85ea2d62888409dbf8c873675f16f23c5646cd77a7ec6ab546",
  water_pouring: "f616b2bf8109aab4b816fb22b5df5707bb74c13c873519092cb459430c2f3a66",
};
const REVIEW_DEADLINE_MS = Date.parse("2026-10-12T12:00:00Z");
const REVIEW_PRIVATE_REPO = "ZhaoRunyi/RoboSynChallenge_eval";

function reviewTable_(name, workbook) {
  const ss = workbook || spreadsheet_();
  const headers = REVIEW_TABLES[name];
  let sheet = ss.getSheetByName(name);
  let actual = sheet?.getRange(1, 1, 1, headers.length).getValues()[0];
  if (!sheet || actual.every(value => value === "")) {
    // Concurrent queue reads may see a new tab before its header is committed.
    const lock = LockService.getScriptLock();
    const ownsLock = !lock.hasLock();
    if (ownsLock) lock.waitLock(15000);
    try {
      sheet = ss.getSheetByName(name) || ss.insertSheet(name);
      actual = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
      if (actual.every(value => value === "") && sheet.getDataRange().getValues().length <= 1) {
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        sheet.setFrozenRows(1);
        SpreadsheetApp.flush();
        actual = headers;
      }
    } finally {
      if (ownsLock) lock.releaseLock();
    }
  }
  if (actual.join("\u0000") !== headers.join("\u0000")) throw new Error(name + " headers changed; review before writing.");
  return sheet;
}

function reviewRows_(name, workbook) {
  const ss = workbook || spreadsheet_();
  const sheet = ss.getSheetByName(name) || reviewTable_(name, ss);
  const headers = REVIEW_TABLES[name];
  const values = sheet.getDataRange().getValues();
  if (headers.some((header, index) => values[0]?.[index] !== header)) throw new Error(name + " headers changed; review before reading.");
  return values.slice(1).map((cells, index) => {
    const row = { _rowNumber: index + 2 };
    headers.forEach((header, column) => { row[header] = cells[column]; });
    return row;
  }).filter((row) => headers.some((header) => row[header] !== ""));
}

function reviewReadTables_(workbook, names) {
  // Read one fresh snapshot, not a cross-user cache. Authentication is checked separately.
  if (typeof workbook.getId === "function") {
    const query = names.map(name => "ranges=" + encodeURIComponent("'" + name + "'")).join("&");
    let response;
    try {
      response = UrlFetchApp.fetch("https://sheets.googleapis.com/v4/spreadsheets/" + encodeURIComponent(workbook.getId()) +
        "/values:batchGet?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING&" + query,
        { headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    } catch (error) { /* Fall back when the Sheets REST API is unavailable. */ }
    if (response?.getResponseCode() === 200) {
      const ranges = JSON.parse(response.getContentText()).valueRanges;
      if (!Array.isArray(ranges) || ranges.length !== names.length) throw new Error("Incomplete evaluation snapshot; refresh again.");
      return { mode: "batch", rows: Object.fromEntries(names.map((name, index) => {
        const headers = REVIEW_TABLES[name] || SHEETS[name];
        const values = ranges[index].values || [];
        if (headers.some((header, column) => values[0]?.[column] !== header)) throw new Error(name + " headers changed; review before reading.");
        return [name, values.slice(1).map((cells, offset) => Object.fromEntries([
          ["_rowNumber", offset + 2], ...headers.map((header, column) => [header, cells[column] ?? ""]),
        ])).filter(row => headers.some(header => row[header] !== ""))];
      })) };
    }
  }
  return { mode: "spreadsheet", rows: Object.fromEntries(names.map(name => [name,
    REVIEW_TABLES[name] ? reviewRows_(name, workbook) : rows_(name, workbook)])) };
}

function reviewWrite_(name, rowNumber, values) {
  const sheet = reviewTable_(name);
  const headers = REVIEW_TABLES[name];
  if (!rowNumber) {
    sheet.appendRow(headers.map((header) => values[header] ?? ""));
    return;
  }
  const range = sheet.getRange(rowNumber, 1, 1, headers.length);
  const cells = range.getValues()[0];
  if (name !== "Reviewers" && String(cells[0]) !== String(values.evaluation_id)) {
    throw new Error("Evaluation row changed; no update was written.");
  }
  headers.forEach((header, index) => {
    if (Object.prototype.hasOwnProperty.call(values, header)) cells[index] = values[header];
  });
  range.setValues([cells]);
}

function reviewerHash_(token) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token))
    .map((value) => (value & 255).toString(16).padStart(2, "0")).join("");
}

/** Run from the Apps Script editor; the token is returned once and never stored in plaintext. */
function provisionReviewer(email, role) {
  return provisionReviewerToken_(email, role, generateActionToken_());
}

function provisionReviewerToken_(email, role, token) {
  const normalized = requiredEmail_(email);
  const assignedRole = String(role || "evaluator");
  if (!["evaluator", "admin", "observer", "supervisor"].includes(assignedRole)) throw new Error("Invalid reviewer role.");
  if (!/^act_[0-9a-f]{64}$/i.test(token)) throw new Error("Invalid reviewer token format.");
  const row = reviewRows_("Reviewers").find((item) => normalizeEmail_(item.email) === normalized);
  reviewWrite_("Reviewers", row?._rowNumber, { email: normalized, token_sha256: reviewerHash_(token),
    role: assignedRole, active: "true", created_at: now_() });
  return { email: normalized, role: assignedRole, token };
}

/** One-time bootstrap with a private Script Property; never expose this as a Web App action. */
function installFirstReviewerToken() {
  const properties = PropertiesService.getScriptProperties();
  const token = String(properties.getProperty("REVIEWER_BOOTSTRAP_TOKEN") || "");
  const reviewer = provisionReviewerToken_("1070055979@qq.com", "admin", token);
  properties.deleteProperty("REVIEWER_BOOTSTRAP_TOKEN");
  return { email: reviewer.email, role: reviewer.role };
}

function reviewerIdentity_(payload, workbook) {
  const email = requiredEmail_(payload.reviewer_email);
  const token = String(payload.reviewer_token || "");
  if (!/^act_[0-9a-f]{64}$/i.test(token)) throw new Error("Invalid reviewer credentials.");
  const row = reviewRows_("Reviewers", workbook).find((item) => normalizeEmail_(item.email) === email);
  const expected = String(row?.token_sha256 || "");
  const actual = reviewerHash_(token);
  let mismatch = expected.length !== actual.length ? 1 : 0;
  for (let index = 0; index < actual.length; index += 1) mismatch |= actual.charCodeAt(index) ^ (expected.charCodeAt(index) || 0);
  if (mismatch || !isTruthy_(row?.active)) throw new Error("Invalid reviewer credentials.");
  if (!["admin", "evaluator", "observer", "supervisor"].includes(row.role)) throw new Error("Invalid reviewer role.");
  return { email, role: row.role, non_recording: email === "1070055979@qq.com" };
}

function reviewProvisionAccount_(payload) {
  return withReviewLock_(() => {
    const viewer = reviewerIdentity_(payload);
    if (viewer.role !== "admin") throw new Error("Organizer access required.");
    const email = requiredEmail_(payload.email);
    const role = String(payload.role || "evaluator");
    if (["observer", "supervisor"].includes(role) && reviewRows_("ReviewRuns").some(row => normalizeEmail_(row.reviewer_email) === email)) {
      throw new Error("Release this account's assignments before making it an observer.");
    }
    if (role !== "admin" && reviewRows_("Reviewers").some(row => normalizeEmail_(row.email) === email && row.role === "admin" && isTruthy_(row.active)) &&
        !reviewRows_("Reviewers").some(row => normalizeEmail_(row.email) !== email && row.role === "admin" && isTruthy_(row.active))) {
      throw new Error("Keep at least one active organizer account.");
    }
    const account = provisionReviewerToken_(email, role, String(payload.eval_token || ""));
    return { ok: true, email: account.email, role: account.role };
  });
}

function reviewSendInvitation_(payload) {
  return withReviewLock_(() => {
    const viewer = reviewerIdentity_(payload);
    if (viewer.role !== "admin") throw new Error("Organizer access required.");
    const email = requiredEmail_(payload.email);
    const token = String(payload.eval_token || "");
    const account = reviewerIdentity_({ reviewer_email: email, reviewer_token: token });
    if (account.role === "admin") throw new Error("Automation credentials must not be emailed.");
    const id = String(payload.invitation_id || "");
    if (!/^invite_[a-f0-9]{32}$/.test(id)) throw new Error("Invalid invitation ID.");
    const properties = PropertiesService.getScriptProperties();
    const key = "REVIEW_INVITATION_" + id;
    const fingerprint = reviewerHash_(email + ":" + token + ":" + account.role);
    const previous = parseJson_(properties.getProperty(key), null);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new Error("Invitation ID belongs to different credentials.");
      if (previous.status === "sent") return { ok: true, status: "sent", duplicate: true };
      throw new Error("Invitation delivery needs organizer verification before retrying.");
    }
    if (MailApp.getRemainingDailyQuota() < 1) throw new Error("Daily email quota exhausted. No email was sent.");
    const receipt = { email, role: account.role, fingerprint, status: "sending", created_at: now_() };
    properties.setProperty(key, JSON.stringify(receipt));
    const url = "https://robosyn-bench.net/eval_backend/";
    const access = account.role === "observer" ? "You can view all evaluation requests and progress. This is read-only access; no evaluation tasks are assigned to you." : account.role === "supervisor" ? "You can view and work on all evaluation requests. No tasks are assigned to you and you are not in the automatic assignment pool." : "You can view and work on evaluation requests assigned to you.";
    try {
      MailApp.sendEmail({ to: email, subject: "RoboSynChallenge evaluation workspace access",
        body: `Evaluation workspace: ${url}\nEmail: ${email}\nEvaluation token: ${token}\n\n${access}\n\nKeep this token private. It is separate from participant access tokens.`,
        htmlBody: htmlEmailShell_("Evaluation workspace access", `<p>${escapeHtml_(access)}</p><table><tr><th>Sign in</th><td><a href="${url}">Open evaluation workspace</a></td></tr><tr><th>Email</th><td>${escapeHtml_(email)}</td></tr><tr><th>Evaluation token</th><td><code style="overflow-wrap:anywhere">${escapeHtml_(token)}</code></td></tr></table><p>Keep this token private. It is separate from participant access tokens.</p>`) });
      properties.setProperty(key, JSON.stringify({ ...receipt, status: "sent", sent_at: now_() }));
      return { ok: true, status: "sent", email, role: account.role };
    } catch (error) {
      properties.setProperty(key, JSON.stringify({ ...receipt, status: "delivery_unknown" }));
      throw new Error("Invitation delivery could not be confirmed. Check sent mail before retrying.");
    }
  });
}

function latestReviewSubmissions_(workbook, submissionWindows, snapshot) {
  const read = name => snapshot ? snapshot[name] : rows_(name, workbook);
  const users = new Map(read("Users").map((row) => [normalizeEmail_(row.email), row]));
  const evaluations = new Map(read("Evaluations").map((row) => [String(row.submission_id), row]));
  const latest = new Map();
  const windows = submissionWindows || reviewRows_("ReviewSubmissionWindows", workbook);
  read("Submissions").forEach((submission) => {
    const email = normalizeEmail_(submission.email);
    const created = new Date(submission.created_at).getTime();
    if (!email || !users.has(email) || !isTruthy_(submission.is_ranked) || !submissionWasAdmitted_(submission, windows)) return;
    const evaluation = evaluations.get(String(submission.submission_id));
    const previous = latest.get(email);
    if (!previous || created > previous.created || (created === previous.created && String(submission.submission_id) > String(previous.submission.submission_id))) {
      latest.set(email, { submission, evaluation, user: users.get(email), created });
    }
  });
  // Never silently fall back to an older request when the newest row has a broken link.
  return [...latest.values()].filter(({ submission, evaluation }) => evaluation &&
    normalizeEmail_(evaluation.email) === normalizeEmail_(submission.email) &&
    String(evaluation.evaluation_id) === String(submission.evaluation_id)).sort((a, b) => a.created - b.created);
}

function reviewJob_(evaluationId) {
  const candidate = latestReviewSubmissions_().find((row) => String(row.evaluation.evaluation_id) === String(evaluationId));
  if (!candidate) throw new Error("This is not the latest eligible registered submission.");
  return candidate;
}

function reviewRun_(evaluationId) {
  return reviewRows_("ReviewRuns").find((row) => String(row.evaluation_id) === String(evaluationId)) || null;
}

function reviewTaskRows_(evaluationId) {
  return reviewRows_("ReviewTaskResults").filter((row) => String(row.evaluation_id) === String(evaluationId) && row.status !== "superseded");
}

function reviewCommand_(value) {
  const command = requiredString_(value, "Actual evaluation command");
  if (command.length > 4000 || /(?:hf_[a-zA-Z0-9]{10,}|gh[pousr]_[a-zA-Z0-9]{10,}|github_pat_[a-zA-Z0-9_]+|(?:act|upl)_[a-f0-9]{64}|(?:--(?:access-)?token|--password)\s+[^\s$])/i.test(command)) {
    throw new Error("Do not include access tokens or passwords in the evaluation command. Use environment variables.");
  }
  return command;
}

function reviewTaskCommands_(run) {
  return Object.fromEntries(reviewRows_("ReviewTaskCommands").filter((row) => row.evaluation_id === run.evaluation_id && row.bundle_commit === run.bundle_commit)
    .map((row) => [row.task, row.command]));
}

function reviewSaveCommand_(payload) {
  return withReviewLock_(() => {
    if (payload.upload_token) throw new Error("Enter reviewer-reported commands in the evaluation workspace; uploads never overwrite them.");
    const { viewer, run } = reviewOwnedRun_(payload);
    if (!run.bundle_commit || reviewWorkflow_(run.evaluation_id).stages.slice(0, 3).some((stage) => !stage.done)) throw new Error("Complete code and environment checks first.");
    if (!Object.prototype.hasOwnProperty.call(REVIEW_TASK_STEPS, payload.task)) throw new Error("Unknown task.");
    const command = reviewCommand_(payload.command);
    if (reviewTaskRows_(run.evaluation_id).some((row) => row.task === payload.task && row.status === "checked")) {
      if (reviewTaskCommands_(run)[payload.task] === command) return { ok: true, duplicate: true };
      throw new Error("The reviewer-reported command is locked after result acceptance.");
    }
    const row = reviewRows_("ReviewTaskCommands").find((item) => item.evaluation_id === run.evaluation_id && item.task === payload.task && item.bundle_commit === run.bundle_commit);
    reviewWrite_("ReviewTaskCommands", row?._rowNumber, { evaluation_id: run.evaluation_id, task: payload.task, bundle_commit: run.bundle_commit, command, reviewer_email: run.reviewer_email || viewer.email, updated_at: now_() });
    return { ok: true };
  });
}

function reviewCheckpointContext_(job) {
  return JSON.stringify([job.submission_id, Number(job.preparation_attempt || 0), Number(job.version_generation || 0),
    job.version_cutoff_at, Object.keys(REVIEW_TASK_STEPS).map(task => job.task_checkpoint_links?.[task] || "")]);
}

function reviewCheckpointStatus_(job, status, message, cutoff) {
  const row = reviewRows_("ReviewCheckpointChecks").find(item => item.evaluation_id === job.evaluation_id);
  reviewWrite_("ReviewCheckpointChecks", row?._rowNumber, { evaluation_id: job.evaluation_id,
    context_json: reviewCheckpointContext_(job), status, message, cutoff_at: cutoff || "", updated_at: now_() });
}

function reviewCheckpointCheck_(payload) {
  return withReviewLock_(() => {
    const { viewer, run } = reviewOwnedRun_(payload, true);
    if (viewer.role !== "admin") throw new Error("Only the preparer can record checkpoint checks.");
    const job = reviewQueue_(payload, true).jobs.find(item => item.evaluation_id === run.evaluation_id);
    if (payload.context_json && payload.context_json !== reviewCheckpointContext_(job)) throw new Error("Checkpoint inputs changed while the check was running.");
    if (!job || !reviewTaskLinks_(job.task_checkpoint_links) || !reviewTaskLinks_(payload.task_checkpoint_links) ||
        Object.keys(REVIEW_TASK_STEPS).some(task => payload.task_checkpoint_links[task] !== job.task_checkpoint_links[task]) ||
        !["checking", "failed"].includes(payload.status)) throw new Error("Checkpoint check must match the current ten-task URLs.");
    reviewCheckpointStatus_(job, payload.status, payload.status === "failed" ? requiredString_(payload.message, "Checkpoint failure").slice(0, 1000) : "", payload.cutoff_at);
    return { ok: true };
  });
}

function reviewAccessCheck_(payload) {
  return withReviewLock_(() => {
    const { viewer, run } = reviewOwnedRun_(payload, true);
    if (viewer.role !== "admin" || run.bundle_commit) throw new Error("Only the preparer can record an access check before code handoff.");
    const report = payload.report;
    const job = reviewQueue_(payload, true).jobs.find(item => item.evaluation_id === run.evaluation_id);
    if (payload.context_json && payload.context_json !== reviewCheckpointContext_(job)) throw new Error("Checkpoint inputs changed while the check was running.");
    const links = reviewTaskLinks_(job?.task_checkpoint_links);
    if (!report || JSON.stringify(report).length > 20000 || Object.keys(report).length !== 10 || Object.keys(REVIEW_TASK_STEPS).some((task) =>
      !report[task] || !links || report[task].url !== links[task] || !/^[a-f0-9]{40}$/.test(report[task].revision || "") || report[task].accessible !== true ||
      !Number.isInteger(report[task].files_checked) || report[task].files_checked < 1 || report[task].files_checked > 10000)) throw new Error("Successful Hugging Face access receipts matching all 10 submitted task URLs are required.");
    const safe = Object.fromEntries(Object.keys(REVIEW_TASK_STEPS).map((task) => [task, {
      url: report[task].url, revision: report[task].revision, accessible: true,
      files_checked: Number(report[task].files_checked || 0), gated: Boolean(report[task].gated), private: Boolean(report[task].private),
      cutoff_at: report[task].cutoff_at || "", committed_at: report[task].committed_at || "",
    }]));
    const row = reviewRows_("ReviewAccessChecks").find((item) => item.evaluation_id === run.evaluation_id);
    reviewWrite_("ReviewAccessChecks", row?._rowNumber, { evaluation_id: run.evaluation_id, report_json: JSON.stringify(safe), checked_at: now_() });
    reviewCheckpointStatus_(job, "passed", "", report[Object.keys(REVIEW_TASK_STEPS)[0]].cutoff_at);
    return { ok: true };
  });
}

function reviewTaskLinks_(links) {
  if (!links || typeof links !== "object" || Array.isArray(links) ||
      Object.keys(links).length !== Object.keys(REVIEW_TASK_STEPS).length ||
      Object.keys(REVIEW_TASK_STEPS).some((task) => !Object.prototype.hasOwnProperty.call(links, task))) return null;
  try {
    return Object.fromEntries(Object.keys(REVIEW_TASK_STEPS).map(task => [task, requiredHuggingFaceUrl_(links[task])]));
  } catch (error) { return null; }
}

function reviewQueue_(payload, organizer) {
  const started = Date.now();
  const workbook = spreadsheet_();
  const viewer = reviewerIdentity_(payload, workbook);
  if (organizer && viewer.role !== "admin") throw new Error("Organizer access required.");
  const snapshot = reviewReadTables_(workbook, ["Users", "Submissions", "Evaluations", "ReviewRuns", "ReviewTaskResults",
    "ReviewProgress", "ReviewMachines", "ReviewMessages", "ReviewPreparation", "ReviewCodePreparations", "ReviewCorrections",
    "ReviewAccessChecks", "ReviewCheckpointChecks", "ReviewCheckpointSources", "ReviewTaskCommands", "ReviewVersionChecks", "ReviewVersionDecisions", "ReviewSubmissionWindows", "ReviewArchiveUploads", "ReviewToolUpgrades"]);
  const read = name => snapshot.rows[name];
  const runs = new Map(read("ReviewRuns").map((row) => [String(row.evaluation_id), row]));
  const tasks = read("ReviewTaskResults");
  const progress = read("ReviewProgress");
  const machines = read("ReviewMachines").filter((row) => normalizeEmail_(row.reviewer_email) === viewer.email)
    .map((row) => ({ machine_id: row.machine_id, status: row.status, report_sha256: row.report_sha256, updated_at: row.updated_at }));
  const messages = read("ReviewMessages");
  const preparation = new Map(read("ReviewPreparation").map((row) => [String(row.evaluation_id), row]));
  const codePreparations = new Map(read("ReviewCodePreparations").map(row => [String(row.evaluation_id), row]));
  const corrections = new Map(read("ReviewCorrections").map((row) => [String(row.evaluation_id), row]));
  const accessChecks = new Map(read("ReviewAccessChecks").map((row) => [String(row.evaluation_id), row]));
  const checkpointChecks = new Map(read("ReviewCheckpointChecks").map(row => [String(row.evaluation_id), row]));
  const checkpointSources = new Map(read("ReviewCheckpointSources").map(row => [String(row.evaluation_id), row]));
  const commands = read("ReviewTaskCommands");
  const versionChecks = new Map(read("ReviewVersionChecks").map(row => [String(row.evaluation_id), row]));
  const versionDecisions = new Map(read("ReviewVersionDecisions").map(row => [String(row.evaluation_id), row]));
  const windows = read("ReviewSubmissionWindows");
  const upgrades = new Map(read("ReviewToolUpgrades").map(row => [String(row.evaluation_id), row]));
  const archives = read("ReviewArchiveUploads");
  const submissionWindows = new Map(windows.map(row => [row.window_id, row]));
  const jobs = latestReviewSubmissions_(workbook, windows, snapshot.rows).filter(({ evaluation }) => {
    const owner = runs.get(String(evaluation.evaluation_id))?.reviewer_email;
    return organizer || ["admin", "observer", "supervisor"].includes(viewer.role) || normalizeEmail_(owner) === viewer.email;
  }).map(({ submission, evaluation, user }) => {
    const run = runs.get(String(evaluation.evaluation_id));
    const correction = corrections.get(String(evaluation.evaluation_id));
    const attempt = reviewCorrectionAttempt_(correction);
    const decision = versionDecisions.get(String(evaluation.evaluation_id));
    const versionCheck = versionChecks.get(String(evaluation.evaluation_id));
    const declaredLinks = reviewTaskLinks_(parseJson_(submission.task_checkpoint_links_json, {}));
    const verifiedLinks = reviewTaskLinks_(parseJson_(run?.task_checkpoint_links_json, {}));
    const correctedLinks = correction?.status === "corrected" ? reviewTaskLinks_(parseJson_(correction.task_checkpoint_links_json, {})) : null;
    const taskLinks = correctedLinks || declaredLinks || verifiedLinks || {};
    const cutoff = correction?.status === "corrected" && (!decision || Date.parse(decision.approved_at) <= Date.parse(correction.responded_at)) ? correction.responded_at : decision?.cutoff_at ||
      submissionWindows.get(submission.submission_window_id)?.expires_at || POLICY_SUBMISSION_CLOSE_AT;
    const checkpointContext = reviewCheckpointContext_({ submission_id: submission.submission_id,
      preparation_attempt: attempt, version_generation: Number(decision?.generation || 0),
      version_cutoff_at: cutoff, task_checkpoint_links: taskLinks });
    const checkpointRow = checkpointChecks.get(String(evaluation.evaluation_id));
    const checkpointCheck = checkpointRow?.context_json === checkpointContext ? checkpointRow : null;
    const savedAccess = parseJson_(accessChecks.get(String(evaluation.evaluation_id))?.report_json, {});
    const accessCurrent = Object.keys(savedAccess).length === 10 && Object.keys(REVIEW_TASK_STEPS).every(task =>
      savedAccess[task]?.accessible === true && savedAccess[task]?.url === taskLinks[task]) &&
      (!checkpointRow || (checkpointCheck && checkpointCheck.status === "passed"));
    const codeLink = correction?.status === "corrected" ? correction.code_link : submission.code_link;
    const sourceContext = reviewCheckpointSourceContext_({submission_id:submission.submission_id,
      preparation_attempt:attempt, version_generation:Number(decision?.generation || 0), version_cutoff_at:cutoff,
      checkpoint_link:submission.checkpoint_link});
    const sourceRow = checkpointSources.get(String(evaluation.evaluation_id));
    const sourceCheck = sourceRow?.context_json === sourceContext ? sourceRow : null;
    const savedCode = codePreparations.get(String(evaluation.evaluation_id));
    const code = savedCode?.submission_id === submission.submission_id && savedCode?.code_link === codeLink &&
      Number(savedCode.attempt) === attempt && Number(savedCode.generation) === Number(decision?.generation || 0) ? savedCode : null;
    const results = tasks.filter(row => String(row.evaluation_id) === String(evaluation.evaluation_id) && row.status !== "superseded")
      .map(row => ({ task: row.task, status: row.status, note: row.review_note,
        artifacts: parseJson_(row.result_json, {}).artifacts || {}, command: parseJson_(row.result_json, {}).eval_command || "",
        summary: reviewResultSummary_(parseJson_(row.result_json, {})) }));
    return { evaluation_id: evaluation.evaluation_id, submission_id: submission.submission_id,
      email: normalizeEmail_(submission.email), team_name: user.team_name || user.full_name,
      artifact_name: submission.artifact_name, created_at: submission.created_at,
      code_link: correction?.status === "corrected" ? correction.code_link : submission.code_link, checkpoint_link: submission.checkpoint_link,
      correction: correction ? { status: correction.response_status || correction.status, responded_at: correction.response_at || correction.responded_at, notes: correction.notes, round: attempt, deadline_at: correction.deadline_at || "" } : null,
      preparation_attempt: attempt,
      version_cutoff_at: cutoff,
      version_exception: decision ? { reason: decision.reason, approved_by: decision.approved_by, approved_at: decision.approved_at } : null,
      version_generation: Number(decision?.generation || 0), version_status: versionCheck?.status || "pending",
      version_report: parseJson_(versionCheck?.report_json, {}),
      task_commands: run ? Object.fromEntries(commands.filter((row) => row.evaluation_id === run.evaluation_id && row.bundle_commit === run.bundle_commit).map((row) => [row.task, row.command])) : {},
      hf_access: accessCurrent ? savedAccess : {},
      hf_check_status: checkpointCheck?.status === "passed" ? (accessCurrent ? "passed" : "pending") :
        checkpointCheck?.status || (accessCurrent ? "passed" : reviewTaskLinks_(taskLinks) ? "pending" : "awaiting_mapping"),
      hf_check_error: checkpointCheck?.message || "", hf_check_updated_at: checkpointCheck?.updated_at || "",
      hf_check_cutoff_at: checkpointCheck?.cutoff_at || "",
      hf_check_context: checkpointContext,
      hf_sources_context:sourceContext,
      hf_sources:sourceCheck ? {status:sourceCheck.status, report:parseJson_(sourceCheck.report_json, []),
        message:sourceCheck.message, checked_at:sourceCheck.checked_at} : null,
      task_checkpoint_links: taskLinks,
      coverage_status: correctedLinks || declaredLinks ? "declared_all_10" : verifiedLinks ? "verified_all_10" : "legacy_unverified",
      coverage_verified_by: run?.coverage_verified_by || "",
      coverage_verified_at: run?.coverage_verified_at || "",
      technical_notes: submission.technical_notes, reviewer_email: run?.reviewer_email || "",
      overall_summary: reviewOverallSummary_(results),
      state: run?.state || "unassigned", bundle_url: run?.bundle_url || "",
      preparation_status: preparation.get(String(evaluation.evaluation_id))?.status || "pending",
      preparation_error: preparation.get(String(evaluation.evaluation_id))?.message || "",
      preparation_updated_at: preparation.get(String(evaluation.evaluation_id))?.updated_at || "",
      bundle_commit: run?.bundle_commit || "", policy_dirs: parseJson_(run?.policy_dirs_json, []),
      tool_upgrade: upgrades.has(String(evaluation.evaluation_id)) ? {
        base_commit: upgrades.get(String(evaluation.evaluation_id)).base_commit,
        selection: parseJson_(upgrades.get(String(evaluation.evaluation_id)).selection_json, {}),
        backup_id: upgrades.get(String(evaluation.evaluation_id)).backup_id,
      } : null,
      uploads: archives.filter(row => row.evaluation_id === evaluation.evaluation_id && row.status !== "superseded")
        .map(row => ({task: row.task, status: row.status, updated_at: row.updated_at})),
      code_bundle_url: code?.bundle_url || "", code_bundle_commit: code?.bundle_commit || "",
      code_participant_commit: code?.participant_commit || "", code_base_commit: code?.private_base_commit || "",
      code_policy_dirs: parseJson_(code?.policy_dirs_json, []), code_selection: parseJson_(code?.selection_json, {}),
      workflow: reviewWorkflow_(evaluation.evaluation_id, progress),
      machines,
      messages: messages.filter((row) => String(row.evaluation_id) === String(evaluation.evaluation_id))
        .map((row) => ({ message_id: row.message_id, stage: row.stage, status: row.status, subject: row.subject, sent_at: row.sent_at })),
      results };
  });
  return { ok: true, reviewer: viewer, jobs,
    ...(payload.include_mail_status === true ? { messages: reviewMailMessages_(viewer, snapshot.rows) } : {}),
    refresh: { read_mode: snapshot.mode, server_ms: Date.now() - started } };
}

function reviewResultSummary_(record) {
  return reviewScoredSummary_(record);
}

function withReviewLock_(work) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { return work(); } finally { lock.releaseLock(); }
}

function reviewVerifyCoverage_(payload) {
  const reviewer = reviewerIdentity_(payload);
  if (!isTruthy_(payload.coverage_confirmed)) throw new Error("Confirm that the participant submission covers all 10 tasks.");
  const links = reviewTaskLinks_(payload.task_checkpoint_links);
  if (!links) throw new Error("Provide valid checkpoint links for all 10 tasks.");
  return withReviewLock_(() => {
    const job = reviewJob_(payload.evaluation_id);
    if (reviewTaskLinks_(parseJson_(job.submission.task_checkpoint_links_json, {}))) {
      throw new Error("This request already declared all 10 tasks.");
    }
    const run = reviewRun_(job.evaluation.evaluation_id);
    if (!["admin", "supervisor"].includes(reviewer.role) && (!run || normalizeEmail_(run.reviewer_email) !== reviewer.email)) {
      throw new Error("This request is not assigned to you.");
    }
    if (run?.bundle_commit) throw new Error("Coverage cannot be changed after code preparation.");
    reviewWrite_("ReviewRuns", run?._rowNumber, {
      evaluation_id: job.evaluation.evaluation_id, submission_id: job.submission.submission_id,
      participant_email: normalizeEmail_(job.submission.email),
      task_checkpoint_links_json: JSON.stringify(links), coverage_verified_at: now_(),
      coverage_verified_by: reviewer.email, state: run?.state || "unassigned", updated_at: now_(),
    });
    return { ok: true, evaluation_id: job.evaluation.evaluation_id };
  });
}

function reviewAssign_(payload) {
  const reviewer = reviewerIdentity_(payload);
  if (reviewer.role !== "admin") throw new Error("Only an organizer can assign requests.");
  return withReviewLock_(() => {
    const job = reviewJob_(payload.evaluation_id);
    const existing = reviewRun_(job.evaluation.evaluation_id);
    if (existing?.reviewer_email) throw new Error("This request is already assigned.");
    let owner = reviewer.email;
    if (reviewer.role === "admin") {
      const active = reviewRows_("Reviewers").filter((row) => isTruthy_(row.active) && row.role === "evaluator");
      const runs = reviewRows_("ReviewRuns");
      active.sort((a, b) => runs.filter((row) => normalizeEmail_(row.reviewer_email) === normalizeEmail_(a.email) && row.state !== "checked").length -
        runs.filter((row) => normalizeEmail_(row.reviewer_email) === normalizeEmail_(b.email) && row.state !== "checked").length || String(a.email).localeCompare(String(b.email)));
      if (!payload.assign_to && !active.length) throw new Error("No active evaluators. Request remains unassigned.");
      owner = requiredEmail_(payload.assign_to || active[0]?.email);
    }
    if (!reviewRows_("Reviewers").some((row) => normalizeEmail_(row.email) === owner && isTruthy_(row.active) && ["evaluator", "admin"].includes(row.role))) throw new Error("Reviewer is not active or is read-only/non-assigned.");
    reviewWrite_("ReviewRuns", existing?._rowNumber, { evaluation_id: job.evaluation.evaluation_id,
      submission_id: job.submission.submission_id, participant_email: normalizeEmail_(job.submission.email),
      reviewer_email: owner, state: "assigned", assigned_at: now_(), updated_at: now_() });
    return { ok: true, evaluation_id: job.evaluation.evaluation_id, reviewer_email: owner };
  });
}

function reviewOwnedRun_(payload, organizer) {
  const viewer = reviewerIdentity_(payload);
  const job = reviewJob_(payload.evaluation_id);
  const run = reviewRun_(job.evaluation.evaluation_id);
  if (!run || String(run.submission_id) !== String(job.submission.submission_id) ||
      (!(organizer && viewer.role === "admin") && viewer.role !== "supervisor" && normalizeEmail_(run.reviewer_email) !== viewer.email)) throw new Error("This request is not assigned to you.");
  return { viewer, job, run };
}

function reviewPrepare_(payload) {
  return withReviewLock_(() => {
    const { viewer, job, run } = reviewOwnedRun_(payload, true);
    if (viewer.role !== "admin") throw new Error("Only an organizer can attach prepared code.");
    if (reviewWorkflow_(run.evaluation_id).stages[1].done) throw new Error("Prepared code is frozen after the code handoff stage.");
    if (!reviewTaskLinks_(parseJson_(job.submission.task_checkpoint_links_json, {})) &&
        !reviewTaskLinks_(parseJson_(run.task_checkpoint_links_json, {}))) {
      throw new Error("Verify all 10 tasks before attaching prepared code.");
    }
    const commit = String(payload.bundle_commit || "").trim().toLowerCase();
    const url = String(payload.bundle_url || "").trim();
    const dirs = payload.policy_dirs;
    if (!/^[0-9a-f]{40}$/.test(commit) ||
        !url.startsWith("https://github.com/" + REVIEW_PRIVATE_REPO + "/tree/") ||
        !Array.isArray(dirs) || !dirs.length || dirs.length > 30 ||
        dirs.some((dir) => !/^policy(?:\/[A-Za-z0-9_.-]+)*$/.test(dir) || dir.split("/").some((part) => [".", ".."].includes(part)))) throw new Error("Prepared code metadata is invalid.");
    const correction = reviewRows_("ReviewCorrections").find((row) => row.evaluation_id === run.evaluation_id);
    const attempt = reviewCorrectionAttempt_(correction);
    const decision = reviewRows_("ReviewVersionDecisions").find(row => row.evaluation_id === run.evaluation_id);
    const expected = "https://github.com/" + REVIEW_PRIVATE_REPO + "/tree/submissions/" + run.evaluation_id + (attempt ? "-correction" + attempt : "") + (decision ? "-exception" + decision.generation : "");
    const canonical = "https://github.com/" + REVIEW_PRIVATE_REPO + "/tree/" + run.evaluation_id;
    if (url !== canonical && url !== expected && !(url.startsWith(expected + "-snapshot") && /^[a-f0-9]{16}$/.test(url.slice((expected + "-snapshot").length)))) throw new Error("Prepared branch does not match evaluation_id and correction attempt.");
    if (payload.context_json && payload.context_json !== reviewCheckpointContext_(reviewQueue_(payload, true).jobs.find(item => item.evaluation_id === run.evaluation_id))) throw new Error("Participant inputs changed during preparation. Retry with the latest correction.");
    reviewWrite_("ReviewRuns", run._rowNumber, { evaluation_id: run.evaluation_id, bundle_url: url,
      bundle_commit: commit, policy_dirs_json: JSON.stringify([...new Set(dirs)]),
      state: "ready", updated_at: now_() });
    reviewPreparationStatus_(run.evaluation_id, "ready", "");
    return { ok: true, evaluation_id: run.evaluation_id };
  });
}

function reviewPrepareCode_(payload) {
  return withReviewLock_(() => {
    const { viewer, run } = reviewOwnedRun_(payload, true);
    if (viewer.role !== "admin") throw new Error("Only the organizer preparer can attach validation code.");
    if (run.bundle_commit || reviewWorkflow_(run.evaluation_id).stages[1].done) throw new Error("Formal code has already been handed off.");
    const job = reviewQueue_(payload, true).jobs.find(item => item.evaluation_id === run.evaluation_id);
    const selection = payload.selection || {};
    if (payload.context_json && payload.context_json !== reviewCheckpointContext_(job)) throw new Error("Participant inputs changed during code preparation.");
    const dirs = payload.policy_dirs;
    if (![payload.bundle_commit, payload.participant_commit, payload.private_base_commit].every(value => /^[a-f0-9]{40}$/.test(String(value || ""))) ||
        selection.revision !== payload.participant_commit || JSON.stringify(selection).length > 4000 ||
        !Number.isFinite(Date.parse(selection.cutoff_at)) ||
        ![selection.authored_at, selection.committed_at].every(value => Number.isFinite(Date.parse(value)) && Date.parse(value) < Date.parse(selection.cutoff_at)) ||
        Date.parse(selection.cutoff_at) > Math.min(Date.now(), Date.parse(job.version_cutoff_at)) ||
        (Date.now() >= Date.parse(job.version_cutoff_at) && selection.cutoff_at !== job.version_cutoff_at) ||
        !Array.isArray(dirs) || !dirs.length || dirs.length > 30 || dirs.some(dir => !/^policy(?:\/[A-Za-z0-9_.-]+)*$/.test(dir) || dir.split("/").some(part => [".", ".."].includes(part)))) {
      throw new Error("Validation code metadata or selected version is invalid.");
    }
    const suffix = (job.preparation_attempt ? "-correction" + job.preparation_attempt : "") + (job.version_generation ? "-exception" + job.version_generation : "");
    const branch = "validation/" + run.evaluation_id + suffix + "-" + payload.participant_commit.slice(0, 12) + "-" + payload.private_base_commit.slice(0, 12);
    const prefix = "https://github.com/" + REVIEW_PRIVATE_REPO + "/tree/";
    if (payload.bundle_url !== prefix + run.evaluation_id && payload.bundle_url !== prefix + branch) throw new Error("Validation branch does not match this request and selected code.");
    const old = reviewRows_("ReviewCodePreparations").find(row => row.evaluation_id === run.evaluation_id);
    reviewWrite_("ReviewCodePreparations", old?._rowNumber, { evaluation_id: run.evaluation_id, submission_id: run.submission_id,
      code_link: job.code_link, participant_commit: payload.participant_commit, private_base_commit: payload.private_base_commit,
      bundle_url: payload.bundle_url, bundle_commit: payload.bundle_commit, policy_dirs_json: JSON.stringify([...new Set(dirs)]),
      selection_json: JSON.stringify(selection), attempt: job.preparation_attempt, generation: job.version_generation, updated_at: now_() });
    reviewPreparationStatus_(run.evaluation_id, "code_ready", "");
    return { ok: true, evaluation_id: run.evaluation_id, status: "code_ready" };
  });
}

function reviewPreparationStatus_(evaluationId, status, message) {
  const row = reviewRows_("ReviewPreparation").find((item) => String(item.evaluation_id) === String(evaluationId));
  reviewWrite_("ReviewPreparation", row?._rowNumber, { evaluation_id: evaluationId, status, message, updated_at: now_() });
}

function reviewPreparationFailed_(payload) {
  return withReviewLock_(() => {
    const { viewer, run } = reviewOwnedRun_(payload, true);
    if (viewer.role !== "admin") throw new Error("Only the organizer preparer can report code preparation failures.");
    if (run.bundle_commit) throw new Error("Prepared code already exists.");
    if (payload.context_json && payload.context_json !== reviewCheckpointContext_(reviewQueue_(payload, true).jobs.find(item => item.evaluation_id === run.evaluation_id))) throw new Error("Participant inputs changed during code preparation.");
    reviewPreparationStatus_(run.evaluation_id, "failed", requiredString_(payload.message, "Preparation failure").slice(0, 1000));
    return { ok: true };
  });
}

function reviewRetryPreparation_(payload) {
  return withReviewLock_(() => {
    const { run } = reviewOwnedRun_(payload, true);
    if (run.bundle_commit) throw new Error("Prepared code already exists.");
    reviewPreparationStatus_(run.evaluation_id, "pending", "");
    const checkpoint = reviewRows_("ReviewCheckpointChecks").find(row => row.evaluation_id === run.evaluation_id);
    if (checkpoint?.status === "failed") reviewWrite_("ReviewCheckpointChecks", checkpoint._rowNumber,
      { evaluation_id: run.evaluation_id, status: "pending", message: "", updated_at: now_() });
    return { ok: true };
  });
}

function reviewValidatedResult_(payload, run) {
  const record = typeof payload.result === "string" ? JSON.parse(payload.result) : payload.result;
  if (!record || record.local_synthetic_sample || JSON.stringify(record).length > 45000 || record.schema !== 1 ||
      record.evaluation_id !== run.evaluation_id || record.submission_id !== run.submission_id ||
      record.bundle_commit !== run.bundle_commit || !Object.prototype.hasOwnProperty.call(REVIEW_TASK_STEPS, record.task)) throw new Error("Result identity is invalid.");
  if (!parseJson_(run.policy_dirs_json, []).includes(record.policy_dir)) throw new Error("Policy directory is not in the prepared bundle.");
  reviewCommand_(record.eval_command);
  if (!Array.isArray(record.episodes) || record.episodes.length !== 100) throw new Error("Exactly 100 episodes are required for this task.");
  const horizon = REVIEW_TASK_STEPS[record.task];
  const seen = new Set();
  record.episodes.forEach((episode) => {
    if (typeof episode.index !== "number" || !Number.isInteger(episode.index) || episode.index < 0 || episode.index >= 100 || seen.has(episode.index) ||
        !Number.isInteger(episode.seed) || episode.seed < 0 || episode.seed > 2147483647 ||
        typeof episode.success !== "boolean" || !Number.isInteger(episode.action_steps) || episode.action_steps < 0 || episode.action_steps > horizon ||
        typeof episode.inference_ms !== "number" || !Number.isFinite(episode.inference_ms) || episode.inference_ms < 0) throw new Error("Episode fields are incomplete or out of bounds.");
    seen.add(episode.index);
    if (episode.inference_calls != null || episode.inference_total_ms != null) {
      if (!Number.isInteger(episode.inference_calls) || episode.inference_calls < 1 || !Number.isFinite(episode.inference_total_ms) || episode.inference_total_ms < 0 ||
          Math.abs(episode.inference_ms * episode.inference_calls - episode.inference_total_ms) > Math.max(0.000001, episode.inference_total_ms * 0.000001)) throw new Error("Inference call count and total time are inconsistent.");
    }
  });
  const orderedSeeds = [...record.episodes].sort((left, right) => left.index - right.index).map((episode) => episode.seed);
  const expectedHash = REVIEW_SEED_HASHES[record.task];
  if (record.seed_list_sha256 !== expectedHash || reviewerHash_(JSON.stringify(orderedSeeds)) !== expectedHash) {
    throw new Error("Result seeds do not match the frozen task seed list.");
  }
  if (!record.artifacts || !/^https:\/\//.test(record.artifacts.url || "") || !/^[0-9a-f]{64}$/i.test(record.artifacts.sha256 || "")) throw new Error("Evidence archive URL and SHA256 are required.");
  return record;
}

function reviewValidateResult_(payload) {
  return withReviewLock_(() => {
    const { run } = reviewOwnedRun_(payload);
    const workflow = reviewWorkflow_(run.evaluation_id);
    if (workflow.stages.slice(0, 3).some((stage) => !stage.done)) throw new Error("Complete the first three stages before uploading evidence.");
    const record = reviewValidatedResult_(payload, run);
    if (reviewTaskRows_(run.evaluation_id).some((row) => row.task === record.task && row.status === "checked")) {
      throw new Error("Accepted results are locked; do not overwrite their archives.");
    }
    return { ok: true, task: record.task };
  });
}

function reviewSubmitResult_(payload) {
  return withReviewLock_(() => {
    const { viewer, run } = reviewUploadContext_(payload);
    if (reviewWorkflow_(run.evaluation_id).stages.slice(0, 3).some((stage) => !stage.done)) throw new Error("Complete submission, code, and environment checks before uploading results.");
    const result = reviewValidatedResult_(payload, run);
    const existing = reviewTaskRows_(run.evaluation_id).find((row) => row.task === result.task);
    const upload = reviewRows_("ReviewArchiveUploads").find((row) => row.evaluation_id === run.evaluation_id && row.task === result.task);
    if (upload && ["uploading", "verified"].includes(upload.status) &&
        (upload.status !== "verified" || upload.expected_sha256 !== result.artifacts.sha256)) throw new Error("Finish verifying the current evidence ZIP before registering its JSON.");
    if (payload.upload_token && (!upload || !["verified", "completed"].includes(upload.status))) throw new Error("Upload capability requires a verified ZIP session.");
    if (upload && (upload.status === "verified" || payload.upload_token) && upload.record_hash !== archiveRecordHash_(result)) throw new Error("Result JSON differs from the verified archive manifest.");
    if (existing && ["submitted", "checked"].includes(existing.status) && archiveRecordHash_(parseJson_(existing.result_json, {})) === archiveRecordHash_(result)) {
      if (upload?.status === "verified") reviewWrite_("ReviewArchiveUploads", upload._rowNumber, { evaluation_id: run.evaluation_id, status: "completed", updated_at: now_() });
      return { ok: true, task: result.task, duplicate: true, summary: reviewResultSummary_(result) };
    }
    if (run.state !== "ready" && run.state !== "reviewing") throw new Error("Prepared code is not ready.");
    if (existing?.status === "checked") throw new Error("Checked result cannot be replaced.");
    reviewWrite_("ReviewTaskResults", existing?._rowNumber, { evaluation_id: run.evaluation_id,
      submission_id: run.submission_id, task: result.task, reviewer_email: viewer.email,
      result_json: JSON.stringify(result), status: "submitted", review_note: "", updated_at: now_() });
    reviewWrite_("ReviewRuns", run._rowNumber, { evaluation_id: run.evaluation_id, state: "reviewing", updated_at: now_() });
    if (upload?.status === "verified") reviewWrite_("ReviewArchiveUploads", upload._rowNumber, { evaluation_id: run.evaluation_id, status: "completed", updated_at: now_() });
    return { ok: true, task: result.task, summary: reviewResultSummary_(result) };
  });
}

function reviewCheckResult_(payload) {
  return withReviewLock_(() => {
    const { run } = reviewOwnedRun_(payload);
    if (reviewWorkflow_(run.evaluation_id).stages.slice(0, 4).some((stage) => !stage.done)) throw new Error("Complete result upload stage before checking results.");
    if (payload.decision === "checked" && ["video", "trajectory", "checksum"].some((key) => payload.checks?.[key] !== true)) throw new Error("Check task videos, trajectories, and archive checksum first.");
    const row = reviewTaskRows_(run.evaluation_id).find((item) => item.task === payload.task);
    if (reviewRows_("ReviewArchiveUploads").some((item) => item.evaluation_id === run.evaluation_id && item.task === payload.task && ["uploading", "verified"].includes(item.status))) throw new Error("An evidence upload is unfinished; do not accept the previous result.");
    if (!row || row.status !== "submitted" || !["checked", "needs_correction"].includes(payload.decision)) throw new Error("No submitted result to check.");
    reviewWrite_("ReviewTaskResults", row._rowNumber, { evaluation_id: run.evaluation_id,
      status: payload.decision, review_note: optionalString_(payload.note, "Review note"), updated_at: now_() });
    const all = reviewTaskRows_(run.evaluation_id);
    if (all.length === 10 && all.every((item) => item.task === payload.task ? payload.decision === "checked" : item.status === "checked")) {
      reviewWrite_("ReviewRuns", run._rowNumber, { evaluation_id: run.evaluation_id, state: "checked", updated_at: now_() });
    }
    return { ok: true, task: payload.task, status: payload.decision };
  });
}

const REVIEW_STAGES = [
  { title: "Preparation receipt", checks: ["repository_access", "checkpoint_access", "ten_tasks"] },
  { title: "Evaluation code", checks: ["commit_verified", "policy_entrypoints", "dependencies"] },
  { title: "Environment check", checks: [] },
  { title: "Result upload", checks: ["all_runs", "archives_uploaded"] },
  { title: "Result review", checks: ["videos_checked", "trajectories_checked", "hashes_checked"] },
];

function reviewWorkflow_(evaluationId, progressRows) {
  const row = (progressRows || reviewRows_("ReviewProgress")).find((item) => String(item.evaluation_id) === String(evaluationId));
  const saved = parseJson_(row?.stages_json, []);
  return { machine_id: row?.machine_id || "", stages: REVIEW_STAGES.map((stage, index) => ({
    done: saved[index]?.done === true, checks: saved[index]?.checks || {}, completed_at: saved[index]?.completed_at || "",
  })) };
}

function reviewStageInput_(payload) {
  const index = Number(payload.stage);
  if (!Number.isInteger(index) || index < 0 || index >= REVIEW_STAGES.length) throw new Error("Invalid review stage.");
  return index;
}

function reviewStoreWorkflow_(run, workflow) {
  const row = reviewRows_("ReviewProgress").find((item) => String(item.evaluation_id) === String(run.evaluation_id));
  reviewWrite_("ReviewProgress", row?._rowNumber, { evaluation_id: run.evaluation_id,
    stages_json: JSON.stringify(workflow.stages), machine_id: workflow.machine_id, updated_at: now_() });
}

function reviewUpdateStage_(payload, complete) {
  return withReviewLock_(() => {
    const { viewer, job, run } = reviewOwnedRun_(payload);
    const index = reviewStageInput_(payload);
    const workflow = reviewWorkflow_(run.evaluation_id);
    if (workflow.stages.slice(0, index).some((stage) => !stage.done)) throw new Error("Complete the previous stages first.");
    if (workflow.stages[index].done) return { ok: true, workflow };
    const checks = Object.fromEntries(REVIEW_STAGES[index].checks.map((key) => [key, payload.checks?.[key] === true]));
    const current = index === 0 ? reviewQueue_(payload, viewer.role === "admin").jobs.find(item => item.evaluation_id === run.evaluation_id) : null;
    if (index === 0) checks.repository_access = Boolean(current?.bundle_commit && current.bundle_url || current?.code_bundle_commit && current.code_bundle_url);
    workflow.stages[index].checks = checks;
    if (index === 2) workflow.stages[index].checks.environment_check_waived = true;
    if (complete) {
      if (index === 0 && !checks.repository_access) throw new Error("Automatic code preparation must succeed before continuing.");
      if (index === 0 && current.hf_check_status !== "passed") throw new Error("Automatic Hugging Face access checks must pass for the current 10 task URLs.");
      if (Object.values(checks).some((value) => !value)) throw new Error("Complete every required checklist item.");
      if (index === 0 && !reviewTaskLinks_(parseJson_(job.submission.task_checkpoint_links_json, {})) &&
          !reviewTaskLinks_(parseJson_(run.task_checkpoint_links_json, {}))) throw new Error("All 10 task checkpoints must be declared or verified by an organizer.");
      if (index === 1 && (!run.bundle_commit || !run.bundle_url)) throw new Error("Prepared evaluation code is not available yet.");
      const results = reviewTaskRows_(run.evaluation_id);
      if (index === 3 && Object.keys(reviewTaskCommands_(run)).length !== 10) throw new Error("Record the actual evaluation command for all 10 tasks.");
      if (index === 3 && (results.length !== 10 || Object.keys(REVIEW_TASK_STEPS).some((task) =>
          !results.some((row) => row.task === task && ["submitted", "checked"].includes(row.status))))) throw new Error("Upload a valid result manifest for every task.");
      if (index === 4 && (results.length !== 10 || results.some((row) => row.status !== "checked"))) throw new Error("Review and accept every task result.");
      workflow.stages[index].done = true;
      workflow.stages[index].completed_at = now_();
      if (index === 4) reviewWrite_("ReviewRuns", run._rowNumber, { evaluation_id: run.evaluation_id, state: "checked", updated_at: now_() });
    }
    reviewStoreWorkflow_(run, workflow);
    return { ok: true, workflow };
  });
}

function reviewSaveChecks_(payload) { return reviewUpdateStage_(payload, false); }
function reviewCompleteStage_(payload) { return reviewUpdateStage_(payload, true); }

function reviewSavePreflight_(payload) {
  return withReviewLock_(() => {
    const { viewer } = reviewOwnedRun_(payload);
    const machine = requiredString_(payload.machine_id, "Machine ID");
    if (!/^[A-Za-z0-9_.-]{1,80}$/.test(machine)) throw new Error("Use a short machine ID with letters, numbers, dots, or dashes.");
    const report = payload.report;
    if (!report || report.local_synthetic_sample || JSON.stringify(report).length > 45000 || report.schema !== 1 ||
        report.kind !== "render_first_frame_comparison" || !/^[a-f0-9]{64}$/.test(report.reference_sha256 || "") ||
        Object.keys(REVIEW_TASK_STEPS).some((task) => report.task_coverage?.[task] !== true) ||
        !Array.isArray(report.results) || report.results.length > 200) throw new Error("Upload the complete ten-task preflight-report.json.");
    const thresholds = parseJson_(config_("REVIEW_RENDER_THRESHOLDS", ""), {});
    const calibrated = typeof thresholds.ssim_min === "number" && Number.isFinite(thresholds.ssim_min) && thresholds.ssim_min >= -1 && thresholds.ssim_min <= 1 &&
      typeof thresholds.psnr_min_db === "number" && Number.isFinite(thresholds.psnr_min_db) && thresholds.psnr_min_db >= 0;
    const cameras = ["cam_high", "cam_left_wrist", "cam_right_wrist"];
    if (Object.keys(REVIEW_TASK_STEPS).some((task) => cameras.some((camera) =>
        !report.results.some((row) => row.task === task && row.camera === camera)))) throw new Error("First-frame comparisons must cover all ten tasks and all three cameras.");
    if (report.results.some((row) => !Object.prototype.hasOwnProperty.call(REVIEW_TASK_STEPS, row.task) || !cameras.includes(row.camera) ||
        !Number.isFinite(row.ssim) || row.ssim < -1 || row.ssim > 1 ||
        (row.identical_pixels !== true && (!Number.isFinite(row.psnr_db) || row.psnr_db < 0)))) throw new Error("Invalid SSIM/PSNR measurements.");
    const passed = calibrated && report.results.every((row) => row.ssim >= thresholds.ssim_min &&
      (row.identical_pixels === true || row.psnr_db >= thresholds.psnr_min_db));
    const status = !calibrated ? "pending_thresholds" : passed ? "passed" : "failed";
    const row = reviewRows_("ReviewMachines").find((item) => item.reviewer_email === viewer.email && item.machine_id === machine);
    const headers = REVIEW_TABLES.ReviewMachines;
    const values = { reviewer_email: viewer.email, machine_id: machine, report_json: JSON.stringify(report),
      report_sha256: reviewerHash_(JSON.stringify(report)), status, updated_at: now_() };
    if (row) {
      const range = reviewTable_("ReviewMachines").getRange(row._rowNumber, 1, 1, headers.length);
      const old = range.getValues()[0];
      if (old[0] !== viewer.email || old[1] !== machine) throw new Error("Machine row changed.");
      range.setValues([headers.map((header) => values[header])]);
    } else reviewTable_("ReviewMachines").appendRow(headers.map((header) => values[header]));
    return { ok: true, machine_id: machine, status };
  });
}

function reviewSendIssue_(payload) {
  return withReviewLock_(() => {
    const { viewer, job, run } = reviewOwnedRun_(payload, true);
    const stage = reviewStageInput_(payload);
    const messageId = String(payload.message_id || "");
    if (!/^msg_[a-f0-9]{32}$/.test(messageId)) throw new Error("Invalid message ID.");
    const previous = reviewRows_("ReviewMessages").find((row) => row.message_id === messageId);
    if (previous) {
      if (previous.evaluation_id !== run.evaluation_id || previous.reviewer_email !== viewer.email) throw new Error("Message ID belongs to another request.");
      if (previous.status === "sent") return { ok: true, status: "sent", duplicate: true };
      throw new Error("Delivery needs organizer verification before a retry; do not risk a duplicate email.");
    }
    const subject = requiredString_(payload.subject, "Subject");
    const body = requiredString_(payload.body, "Email body");
    const deadline = reviewIssueDeadline_(payload, viewer);
    if (subject.length > 200 || /[\r\n]/.test(subject)) throw new Error("Invalid subject.");
    if (MailApp.getRemainingDailyQuota() < 1) throw new Error("Daily email quota exhausted. No email was sent.");
    checkRateLimit_("reviewer_mail", viewer.email, 20, 60 * 60 * 1000);
    const recipient = requiredEmail_(job.submission.email);
    reviewWrite_("ReviewMessages", null, { evaluation_id: run.evaluation_id, message_id: messageId,
      reviewer_email: viewer.email, stage, recipient, subject, body, status: "sending", created_at: now_() });
    const row = reviewRows_("ReviewMessages").find((item) => item.message_id === messageId);
    const preparation = reviewRows_("ReviewPreparation").find(item => item.evaluation_id === run.evaluation_id);
    const checkpointError = reviewQueue_(payload, viewer.role === "admin").jobs.find(item => item.evaluation_id === run.evaluation_id)?.hf_check_error || "";
    const needsArgument = stage === 0 && String((preparation?.message || "") + checkpointError).includes("NO_LEGAL_VERSION");
    const response = stage === 2 || needsArgument ? null : reviewCreateResponseLink_(run, messageId, deadline);
    const responsePolicy = reviewResponsePolicy_(deadline);
    const responseText = response ? `\n\nConfirm or submit a correction: ${response.url}\n${responsePolicy} Team and submission identity cannot be changed.` : "";
    const responseButton = response ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;width:auto;margin:20px 0 8px">
        <tr>
          <td bgcolor="#e9673f" style="border:0 !important;padding:0;border-radius:999px;background:#e9673f;box-shadow:0 12px 26px rgba(233,103,63,.22)">
            <a href="${escapeHtml_(response.url)}" style="display:inline-block;padding:14px 26px;border-radius:999px;font-family:Arial,sans-serif;font-size:15px;line-height:1.15;font-weight:800;text-decoration:none !important;color:#ffffff !important;background:#e9673f;">Confirm or submit a correction</a>
          </td>
        </tr>
      </table>` : "";
    try {
      const argumentText = needsArgument ? "\n\nNo eligible pre-deadline code or checkpoint version was found. Reply to this email with your explanation and evidence. Rebuilding requires manual reviewer approval; this message does not grant a code-correction exception." : "";
      MailApp.sendEmail({ to: recipient, replyTo: config_("CONTACT_EMAIL", "robosynchallenge@gmail.com"), subject, body: body + responseText + argumentText,
        htmlBody: htmlEmailShell_("Evaluation update", `<p>${escapeHtml_(body).replace(/\n/g, "<br>")}</p><table><tr><th>Evaluation</th><td>${escapeHtml_(run.evaluation_id)}</td></tr><tr><th>Stage</th><td>${escapeHtml_(REVIEW_STAGES[stage].title)}</td></tr></table>${responseButton}${response ? `<p>${escapeHtml_(responsePolicy)}</p>` : ""}${argumentText ? `<p>${escapeHtml_(argumentText)}</p>` : ""}`) });
      if (response) reviewActivateResponseLink_(run, messageId);
      reviewWrite_("ReviewMessages", row._rowNumber, { evaluation_id: run.evaluation_id, status: "sent", sent_at: now_() });
      return { ok: true, status: "sent", response_deadline_at: response ? deadline : "" };
    } catch (error) {
      reviewWrite_("ReviewMessages", row._rowNumber, { evaluation_id: run.evaluation_id, status: "delivery_unknown" });
      throw new Error("Email delivery could not be confirmed. The organizer must check sent mail before retrying.");
    }
  });
}

function handleReviewerAction_(action, payload) {
  if (normalizeEmail_(payload.reviewer_email) === "1070055979@qq.com") {
    reviewerIdentity_(payload);
    if (!["reviewer_login", "reviewer_queue", "reviewer_mail_status"].includes(action)) {
      throw new Error("Non-recording account: actions are browser-local only; no evaluation or email was changed.");
    }
  }
  const cloneActions = ["reviewer_checkpoint_credential", "reviewer_save_command", "reviewer_submit_result",
    "reviewer_upload_health", "reviewer_evidence_status", "reviewer_start_evidence_upload",
    "reviewer_verify_evidence_upload", "reviewer_finish_evidence_upload"];
  if (payload.upload_token) {
    if (!cloneActions.includes(action)) throw new Error("Private clone capability cannot access this action.");
    reviewUploadContext_(payload);
  } else if (!["reviewer_login", "reviewer_queue", "reviewer_mail_status"].includes(action) && reviewerIdentity_(payload).role === "observer") {
    throw new Error("Read-only access: observers cannot modify evaluations.");
  }
  if (action === "reviewer_mail_status") return reviewMailStatus_(payload);
  if (action === "reviewer_migrate_response_schema") return reviewMigrateResponseSchema_(payload);
  if (action === "reviewer_reconcile_final_progress") return reviewReconcileFinalProgress_(payload);
  if (action === "reviewer_upgrade_tools") return reviewUpgradeTools_(payload);
  if (action === "reviewer_pool") return reviewPool_(payload);
  if (action === "reviewer_move_evaluator_email") return reviewMoveEvaluatorEmail_(payload);
  if (action === "reviewer_set_pool") return reviewSetPool_(payload);
  if (action === "reviewer_balance_pool") return reviewBalancePool_(payload);
  if (action === "reviewer_provision_account") return reviewProvisionAccount_(payload);
  if (action === "reviewer_send_invitation") return reviewSendInvitation_(payload);
  if (action === "reviewer_release_assignments") return reviewReleaseAssignments_(payload);
  if (action === "reviewer_ensure_run") return reviewEnsureRun_(payload);
  if (action === "reviewer_prepare_code") return reviewPrepareCode_(payload);
  if (action === "reviewer_configure_checkpoint_access") return reviewConfigureCheckpointAccess_(payload);
  if (action === "reviewer_checkpoint_credential") return reviewCheckpointCredential_(payload);
  if (action === "reviewer_audit_submission_links") return reviewAuditSubmissionLinks_(payload);
  if (action === "reviewer_reassign") return reviewReassign_(payload);
  if (action === "reviewer_version_check") return reviewVersionCheck_(payload);
  if (action === "reviewer_approve_version_exception") return reviewApproveVersionException_(payload);
  if (action === "reviewer_configure_scoring") return reviewConfigureScoring_(payload);
  if (action === "reviewer_submission_window") return reviewSubmissionWindow_(payload);
  if (action === "reviewer_issue_upload_access") return reviewIssueUploadAccess_(payload);
  if (action === "reviewer_configure_storage") return archiveConfigure_(payload);
  if (action === "reviewer_storage_status") return archiveStatus_(payload);
  if (action === "reviewer_upload_health") return archiveUploadHealth_(payload);
  if (action === "reviewer_evidence_status") return archiveEvidenceStatus_(payload);
  if (action === "reviewer_start_evidence_upload") return archiveStart_(payload);
  if (action === "reviewer_verify_evidence_upload") return archiveDownload_(payload);
  if (action === "reviewer_finish_evidence_upload") return archiveFinish_(payload);
  if (action === "reviewer_storage_config") {
    const { run } = reviewOwnedRun_(payload);
    const config = parseJson_(config_("REVIEW_ONEDRIVE_CONFIG", ""), {});
    const target = config.evaluations?.[run.evaluation_id] || config;
    return { ok: true, storage: { client_id: config.client_id || "", tenant_id: config.tenant_id || "",
      drive_id: target.drive_id || "", root_item_id: target.root_item_id || "",
      evaluation_id: config.evaluations?.[run.evaluation_id] ? run.evaluation_id : "" } };
  }
  if (action === "reviewer_login") {
    checkRateLimit_("reviewer_login", normalizeEmail_(payload.reviewer_email), 20, 10 * 60 * 1000);
    return { ok: true, reviewer: reviewerIdentity_(payload) };
  }
  if (action === "reviewer_queue") return reviewQueue_(payload);
  if (action === "reviewer_preparation_queue") return reviewQueue_(payload, true);
  if (action === "reviewer_complete_stage") return reviewCompleteStage_(payload);
  if (action === "reviewer_validate_result") return reviewValidateResult_(payload);
  if (action === "reviewer_save_checks") return reviewSaveChecks_(payload);
  if (action === "reviewer_preflight") return reviewSavePreflight_(payload);
  if (action === "reviewer_send_issue") return reviewSendIssue_(payload);
  if (action === "reviewer_migrate_bundle") return reviewMigrateBundle_(payload);
  if (action === "reviewer_save_command") return reviewSaveCommand_(payload);
  if (action === "reviewer_access_check") return reviewAccessCheck_(payload);
  if (action === "reviewer_checkpoint_check") return reviewCheckpointCheck_(payload);
  if (action === "reviewer_checkpoint_source_check") return reviewCheckpointSourceCheck_(payload);
  if (action === "reviewer_checkpoint_sources_batch") return reviewCheckpointSourcesBatch_(payload);
  if (action === "reviewer_assign") return reviewAssign_(payload);
  if (action === "reviewer_verify_coverage") return reviewVerifyCoverage_(payload);
  if (action === "reviewer_prepare") return reviewPrepare_(payload);
  if (action === "reviewer_preparation_failed") return reviewPreparationFailed_(payload);
  if (action === "reviewer_retry_preparation") return reviewRetryPreparation_(payload);
  if (action === "reviewer_submit_result") return reviewSubmitResult_(payload);
  if (action === "reviewer_check_result") return reviewCheckResult_(payload);
  throw new Error("Unknown reviewer action.");
}

function reviewMailStatus_(payload) {
  const viewer = reviewerIdentity_(payload);
  return { ok: true, reviewer: viewer, messages: reviewMailMessages_(viewer) };
}

function reviewMailMessages_(viewer, snapshot) {
  const read = name => snapshot ? snapshot[name] : REVIEW_TABLES[name] ? reviewRows_(name) : rows_(name);
  const global = ["admin", "observer", "supervisor"].includes(viewer.role);
  const assigned = new Set(read("ReviewRuns").filter(row => normalizeEmail_(row.reviewer_email) === viewer.email).map(row => row.evaluation_id));
  const users = new Map(read("Users").map(row => [normalizeEmail_(row.email), row]));
  const mailbox = config_("CONTACT_EMAIL", "robosynchallenge@gmail.com");
  return read("ReviewMessages").filter(row => global || assigned.has(row.evaluation_id)).map(row => {
    const email = normalizeEmail_(row.recipient);
    const query = `in:sent to:${email} subject:"${String(row.subject || "").replace(/["\\]/g, " ")}"`;
    return { evaluation_id: row.evaluation_id, message_id: row.message_id,
      team_name: users.get(email)?.team_name || users.get(email)?.full_name || email,
      recipient: email, stage: row.stage, subject: row.subject, status: row.status,
      created_at: row.created_at, sent_at: row.sent_at,
      gmail_url: `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(mailbox)}#search/${encodeURIComponent(query)}` };
  }).sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
}
