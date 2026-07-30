/**
 * RoboSynChallenge Apps Script backend.
 *
 * Store these Script Properties before deployment:
 * - SPREADSHEET_ID: Google Sheet id that stores all backend tabs.
 * - ADMIN_EMAILS: comma-separated fixed admin email whitelist.
 * - APPROVED_LABEL: Gmail approval label name, default "RSC Approved".
 * - REJECTED_LABEL: Gmail rejection label name, default "RSC Rejected".
 * - REQUESTED_LABEL: Gmail pending request label name, default "RSC Requested".
 * - PROCESSED_LABEL: Gmail processed label name, default "RSC Processed".
 * - EVAL_DONE_LABEL: Gmail evaluation done label name, default "RSC Eval Done".
 * - EVAL_NOT_DONE_LABEL: Gmail evaluation not-done label name, default "RSC Eval Not Done".
 * - CONTACT_EMAIL: public contact email, default "robosynchallenge@gmail.com".
 * - WEB_APP_URL: optional deployed Web App URL for action buttons.
 * - WECHAT_QR_FILE_ID: optional Google Drive file id for the internal WeChat QR code image.
 * - WECHAT_QR_FILE_NAME: optional Google Drive filename for the internal WeChat QR code image.
 */

const SHEETS = {
  AccessRequests: [
    "request_id",
    "email",
    "full_name",
    "team_name",
    "affiliation",
    "intended_use",
    "gmail_thread_id",
    "status",
    "reviewer_notes",
    "attachment_names",
    "token",
    "token_status",
    "processed_at",
    "created_at",
    "updated_at",
    "misc",
    "review_token",
    "notification_decision",
    "notification_status",
    "notification_due_at",
    "notification_sent_at",
    "notification_draft_id",
    "notification_draft_subject",
  ],
  Users: [
    "email",
    "full_name",
    "team_name",
    "affiliation",
    "intended_use",
    "token",
    "token_hint",
    "token_status",
    "token_action",
    "issued_at",
    "revoked_at",
    "regenerated_at",
    "updated_at",
  ],
  Sessions: ["session_id", "email", "expires_at", "created_at", "revoked"],
  Submissions: [
    "submission_id",
    "evaluation_id",
    "email",
    "token",
    "artifact_name",
    "title",
    "short_description",
    "code_link",
    "checkpoint_link",
    "data_source_text",
    "technical_notes",
    "is_ranked",
    "status",
    "created_at",
  ],
  Evaluations: [
    "evaluation_id",
    "submission_id",
    "email",
    "artifact_name",
    "title",
    "evaluation_stage",
    "status",
    "schedule_at",
    "published",
    "published_at",
    "success_rate",
    "action_steps",
    "real_time",
    "notes",
    "leaderboard_notes",
    "episodes_json",
    "updated_at",
    "inference_time",
    "eval_time",
    "videos_link",
    "result_status",
    "result_sent_at",
  ],
  FullNameUpdates: [
    "update_id",
    "email",
    "token",
    "token_status",
    "current_full_name",
    "new_full_name",
    "invite_status",
    "invite_sent_at",
    "expires_at",
    "completed_at",
    "updated_at",
    "source",
    "misc",
  ],
  DigestLog: ["id", "reason", "sent_to", "created_at"],
  Errors: ["id", "where", "message", "stack", "created_at"],
};

const SESSION_HOURS = 24;
const REVIEW_ATTACHMENT_LIMIT_BYTES = 10 * 1024 * 1024;
const NOTIFICATION_GRACE_MINUTES = 30;
const REQUESTED_LABEL_SYNC_LIMIT = 20;
const ERROR_EMAIL_THROTTLE_SECONDS = 60 * 60;
const GMAIL_QUOTA_ERROR_EMAIL_THROTTLE_SECONDS = 6 * 60 * 60;
const DEFAULT_WECHAT_QR_FILE_NAME = "RCS_wechat_QRcode_test.jpg";
const FULL_NAME_UPDATE_DAYS = 14;
const FULL_NAME_UPDATE_TEST_EMAIL = "224040356@link.cuhk.edu.cn";

function doGet(e) {
  try {
    const action = String(e?.parameter?.rsc_action || e?.parameter?.action || "");
    if (action === "full_name_update") return handleFullNameUpdatePage_(e.parameter);
    if (action === "access_decision") return handleAccessDecisionPage_(e.parameter);
    return json_({ ok: true, service: "RoboSynChallenge backend", time: new Date().toISOString() });
  } catch (error) {
    recordError_("doGet", error);
    return html_("RoboSynChallenge action failed", `<p>${escapeHtml_(error.message || error)}</p>`);
  }
}

function doPost(e) {
  try {
    const payload = parsePayload_(e);
    const action = String(payload.rsc_action || payload.action || "");
    if (action === "health") return json_({ ok: true, time: new Date().toISOString() });
    if (action === "request_access") return json_(handleRequestAccess_(payload));
    if (action === "send_access_notification") return handleSendAccessNotification_(payload);
    if (action === "update_full_name") return handleFullNameUpdateSubmit_(payload);
    if (action === "login") return json_(handleLogin_(payload));
    if (action === "my_submissions") return json_(handleMySubmissions_(payload));
    if (action === "submit_policy") return json_(handleSubmitPolicy_(payload));
    if (action === "leaderboard") return json_(handleLeaderboard_());
    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    recordError_("doPost", error);
    return json_({ ok: false, error: String(error.message || error) });
  }
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("RoboSyn Backend")
    .addItem("Initialize sheets", "initializeSheets")
    .addItem("Run Gmail processing now", "processLabeledRequests")
    .addItem("Manual issue access token", "manualIssueAccessToken")
    .addItem("Reset test data", "resetTestData")
    .addItem("Process token actions", "processTokenActions")
    .addItem("Send full name update test", "sendFullNameUpdateTestInvite")
    .addItem("Send full name update invites", "sendFullNameUpdateInvitesNow")
    .addItem("Send admin digest", "sendAdminDigestNow")
    .addItem("Install backend triggers", "installBackendTriggers")
    .addToUi();
}

function initializeSheets() {
  Object.keys(SHEETS).forEach((name) => getSheet_(name));
  ensureLabels_();
}

function installTenMinuteTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === "processLabeledRequests")
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger("processLabeledRequests").timeBased().everyHours(3).create();
}

function installBackendTriggers() {
  const handlers = new Set(["processLabeledRequests", "onSheetEdit"]);
  ScriptApp.getProjectTriggers()
    .filter((trigger) => handlers.has(trigger.getHandlerFunction()))
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger("processLabeledRequests").timeBased().everyHours(3).create();
  ScriptApp.newTrigger("onSheetEdit").forSpreadsheet(spreadsheet_()).onEdit().create();
}

function processLabeledRequests() {
  initializeSheets();
  syncRequestedLabels_({ onlyPending: true, limit: REQUESTED_LABEL_SYNC_LIMIT });
  processReviewLabel_(config_("APPROVED_LABEL", "RSC Approved"), "approved");
  processReviewLabel_(config_("REJECTED_LABEL", "RSC Rejected"), "rejected");
  processEvalLabel_(config_("EVAL_DONE_LABEL", "RSC Eval Done"), "done");
  processEvalLabel_(config_("EVAL_NOT_DONE_LABEL", "RSC Eval Not Done"), "not_done");
  processTokenActions();
  processPendingNotifications();
}

function processTokenActions() {
  const users = rows_("Users");
  users.forEach((user) => {
    const action = String(user.token_action || "").trim().toLowerCase();
    if (!action) return;
    try {
      if (action === "revoke") {
        updateRow_("Users", user._rowNumber, {
          token_status: "revoked",
          revoked_at: now_(),
          token_action: "",
          updated_at: now_(),
        });
        revokeSessions_(user.email);
        sendAdminDigest_("token revoked", { email: user.email });
      } else if (action === "regenerate") {
        const token = generateToken_();
        updateRow_("Users", user._rowNumber, {
          token,
          token_hint: tokenHint_(token),
          token_status: "active",
          token_action: "",
          regenerated_at: now_(),
          updated_at: now_(),
        });
        revokeSessions_(user.email);
        MailApp.sendEmail({
          to: user.email,
          subject: "RoboSynChallenge access token regenerated",
          body: `Your RoboSynChallenge access token was regenerated.\n\n${token}`,
          htmlBody: `<p>Your RoboSynChallenge access token was regenerated.</p><p><code>${escapeHtml_(token)}</code></p>`,
        });
        sendAdminDigest_("token regenerated", { email: user.email });
      }
    } catch (error) {
      recordError_("processTokenActions", error);
    }
  });
}

function sendAdminDigestNow() {
  sendAdminDigest_("manual digest", {});
}

function setProductionProperties(settings) {
  const allowedKeys = [
    "SPREADSHEET_ID",
    "ADMIN_EMAILS",
    "APPROVED_LABEL",
    "REJECTED_LABEL",
    "REQUESTED_LABEL",
    "PROCESSED_LABEL",
    "EVAL_DONE_LABEL",
    "EVAL_NOT_DONE_LABEL",
    "CONTACT_EMAIL",
    "WEB_APP_URL",
    "WECHAT_QR_FILE_ID",
    "WECHAT_QR_FILE_NAME",
    "SITE_LOGIN_URL",
  ];
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    throw new Error("settings must be an object.");
  }
  const values = {};
  Object.keys(settings).forEach((key) => {
    if (!allowedKeys.includes(key)) throw new Error(`Unsupported property: ${key}`);
    const value = String(settings[key] ?? "").trim();
    if (value) values[key] = value;
  });
  PropertiesService.getScriptProperties().setProperties(values, false);
  return { ok: true, updated: Object.keys(values) };
}

function onSheetEdit(e) {
  try {
    const range = e?.range;
    const sheet = range?.getSheet();
    const sheetName = sheet?.getName();
    if (!["AccessRequests", "Users", "Submissions", "Evaluations", "FullNameUpdates"].includes(sheetName)) return;
    if (range.getRow() === 1) return;

    const headers = SHEETS[sheetName] || [];
    const column = headers[range.getColumn() - 1] || `column_${range.getColumn()}`;
    if (sheetName === "Users" && column === "token_action") {
      processTokenActions();
      return;
    }

    sendAdminDigest_(`sheet edit: ${sheetName}`, {
      sheet: sheetName,
      row: range.getRow(),
      column,
    });
  } catch (error) {
    recordError_("onSheetEdit", error);
  }
}

function handleRequestAccess_(payload) {
  const request = {
    request_id: requiredRequestId_(payload.request_id),
    email: requiredEmail_(payload.email),
    full_name: requiredFullNameList_(payload.full_name),
    team_name: requiredString_(payload.team_name, "Team name"),
    affiliation: requiredString_(payload.affiliation, "Affiliation"),
    intended_use: requiredString_(payload.intended_use, "Intended use"),
    misc: optionalString_(payload.misc, "Misc"),
  };
  checkRateLimit_("request_access", request.email, 5, 60 * 60 * 1000);

  const activeUser = findActiveUser_(request.email);
  if (activeUser) {
    request.full_name = activeUser.full_name || request.full_name;
    request.review_token = generateActionToken_();
    upsertAccessRequest_(request, "existing_token_sent", { body: "", attachments: [], attachment_names: "" });
    sendExistingTokenReminder_(activeUser, request);
    updateAccessRequest_(request.request_id, {
      token: activeUser.token,
      token_status: "active",
      notification_decision: "existing_token",
      notification_status: "sent",
      notification_sent_at: now_(),
      processed_at: now_(),
      updated_at: now_(),
    });
    sendAdminDigest_("existing token reminder sent", { email: request.email, request_id: request.request_id });
    return { ok: true, request_id: request.request_id, existing_token_sent: true };
  }

  const existing = findRow_("AccessRequests", "request_id", request.request_id);
  if (existing) {
    const existingStatus = String(existing.status || "").toLowerCase();
    if (existingStatus === "approved" || String(existing.token_status || "").toLowerCase() === "active") {
      throw new Error("This access request has already been approved.");
    }
    if (existingStatus === "submitted") {
      return { ok: true, request_id: request.request_id, already_submitted: true };
    }
  }

  request.review_token = existing?.review_token || generateActionToken_();
  upsertAccessRequest_(request, "submitted", { body: "", attachments: [], attachment_names: "" });
  sendAccessRequestNotification_(request);
  return { ok: true, request_id: request.request_id };
}

function handleLogin_(payload) {
  const email = normalizeEmail_(payload.email);
  const token = String(payload.token || "").trim();
  if (!email || !token) throw new Error("Email and token are required.");
  checkRateLimit_("login", email, 20, 10 * 60 * 1000);

  const user = findRow_("Users", "email", email);
  if (!user || user.token_status !== "active" || String(user.token || "") !== token) {
    throw new Error("Invalid email or access token.");
  }
  const sessionId = generateSessionId_();
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString();
  appendRow_("Sessions", {
    session_id: sessionId,
    email,
    expires_at: expiresAt,
    created_at: now_(),
    revoked: "",
  });
  return {
    ok: true,
    session_id: sessionId,
    expires_at: expiresAt,
    user: publicUser_(user),
  };
}

function handleMySubmissions_(payload) {
  const session = requireSession_(payload.session_id);
  const evaluationRows = rows_("Evaluations")
    .filter((row) => normalizeEmail_(row.email) === session.email);
  const evaluationsBySubmissionId = {};
  evaluationRows.forEach((evaluation) => {
    evaluationsBySubmissionId[String(evaluation.submission_id || "")] = evaluation;
  });
  const submissions = rows_("Submissions")
    .filter((row) => normalizeEmail_(row.email) === session.email)
    .map((submission) => publicSubmission_(submission, evaluationsBySubmissionId[String(submission.submission_id || "")]));
  const evaluations = evaluationRows.map(publicEvaluation_);
  return { ok: true, submissions, evaluations };
}

function handleSubmitPolicy_(payload) {
  const session = requireSession_(payload.session_id);
  checkRateLimit_("submit_policy", session.email, 10, 60 * 60 * 1000);
  const user = findRow_("Users", "email", session.email);
  if (!user || user.token_status !== "active") throw new Error("User token is not active.");
  const submission = payload.submission || {};
  const artifactName = requiredString_(submission.artifact_name, "Artifact name");
  const title = requiredString_(submission.title, "Experiment name");
  const shortDescription = requiredString_(submission.short_description, "Short description");
  const codeLink = requiredUrl_(submission.code_link, "Code URL");
  const checkpointLink = requiredHuggingFaceUrl_(submission.checkpoint_link);
  const dataSourceText = requiredString_(submission.data_source_text, "Data source");
  const technicalNotes = requiredString_(submission.technical_notes, "Run and dependency notes");
  const isRanked = isTruthy_(submission.is_ranked);
  const submissionId = id_("sub");
  const evaluationId = id_("eval");
  const createdAt = now_();

  const submissionRow = {
    submission_id: submissionId,
    evaluation_id: evaluationId,
    email: session.email,
    token: user.token,
    artifact_name: artifactName,
    title,
    short_description: shortDescription,
    code_link: codeLink,
    checkpoint_link: checkpointLink,
    data_source_text: dataSourceText,
    technical_notes: technicalNotes,
    is_ranked: String(isRanked),
    status: "submitted",
    created_at: createdAt,
  };
  const evaluationRow = {
    evaluation_id: evaluationId,
    submission_id: submissionId,
    email: session.email,
    artifact_name: artifactName,
    title,
    evaluation_stage: "",
    status: "submitted",
    schedule_at: "",
    published: "",
    published_at: "",
    success_rate: "",
    action_steps: "",
    real_time: "",
    notes: "",
    leaderboard_notes: "",
    episodes_json: "[]",
    updated_at: createdAt,
    inference_time: "",
    eval_time: "",
    videos_link: "",
    result_status: "pending",
    result_sent_at: "",
  };
  appendRow_("Submissions", submissionRow);
  appendRow_("Evaluations", evaluationRow);
  sendEvaluationRequestNotification_(submissionRow, evaluationRow);
  MailApp.sendEmail({
    to: session.email,
    subject: `RoboSynChallenge policy submission received: ${artifactName}`,
    body: `Your policy submission has been recorded.\n\nSubmission ID: ${submissionId}\nEvaluation ID: ${evaluationId}`,
    htmlBody: `<p>Your policy submission has been recorded.</p><p><strong>Submission ID:</strong> ${submissionId}</p><p><strong>Evaluation ID:</strong> ${evaluationId}</p>`,
  });
  sendAdminDigest_("policy submission", { email: session.email, submission_id: submissionId });
  return {
    ok: true,
    submission: publicSubmission_(submissionRow),
    evaluation: publicEvaluation_(evaluationRow),
  };
}

function handleLeaderboard_() {
  const submissionsById = {};
  rows_("Submissions").forEach((submission) => {
    submissionsById[String(submission.submission_id || "")] = submission;
  });
  const rows = rows_("Evaluations")
    .filter((evaluation) => isTruthy_(evaluation.published))
    .map((evaluation) => {
      const submission = submissionsById[String(evaluation.submission_id || "")];
      if (!submission || !isTruthy_(submission.is_ranked)) return null;
      const user = findRow_("Users", "email", normalizeEmail_(evaluation.email));
      return {
        id: submission.submission_id,
        evaluation_id: evaluation.evaluation_id,
        model_name: submission.artifact_name || evaluation.artifact_name,
        username_display: user?.team_name || user?.full_name || evaluation.email,
        affiliation: user?.affiliation || "",
        evaluation_stage: evaluation.evaluation_stage,
        data_regime: submission.data_source_text,
        success_rate: Number(evaluation.success_rate || 0),
        action_steps: Number(evaluation.action_steps || 0),
        real_time: Number(evaluation.real_time || 0),
        rank_badge: "Participant ranked",
        notes: evaluation.leaderboard_notes || evaluation.notes || submission.short_description,
        episodes: parseJson_(evaluation.episodes_json, []),
      };
    })
    .filter(Boolean);
  return { ok: true, rows };
}

function processReviewLabel_(labelName, status) {
  const label = GmailApp.getUserLabelByName(labelName);
  if (!label) return;
  const processedLabel = GmailApp.getUserLabelByName(config_("PROCESSED_LABEL", "RSC Processed"));
  label.getThreads(0, 100).forEach((thread) => {
    if (processedLabel && thread.getLabels().some((item) => item.getName() === processedLabel.getName())) return;
    try {
      const message = thread.getMessages()[0];
      const request = parseAccessRequest_(message);
      request.gmail_thread_id = thread.getId();
      const existing = findRow_("AccessRequests", "request_id", request.request_id);
      const notificationStatus = String(existing?.notification_status || "").toLowerCase();
      if (notificationStatus === "pending" || notificationStatus === "sending" || notificationStatus === "sent") return;
      const draft = findDraftForRequest_(request.request_id);
      const draftPayload = draft ? draftPayload_(draft) : { body: "", attachments: [], attachment_names: "" };
      upsertAccessRequest_(request, status, draftPayload);
      stageAccessDecision_(request, status, draftPayload);
    } catch (error) {
      recordError_(`processReviewLabel:${status}`, error);
    }
  });
}

function stageAccessDecision_(request, decision, draftPayload) {
  const existing = findRow_("AccessRequests", "request_id", request.request_id);
  const normalizedDecision = normalizeDecision_(decision);
  if (String(existing?.notification_status || "") === "sent") return existing;
  const token = normalizedDecision === "approved"
    ? (existing?.token || request.token || generateToken_())
    : "";
  const defaultSubject = defaultAccessNotificationSubject_(request, normalizedDecision);
  updateAccessRequest_(request.request_id, {
    status: `${normalizedDecision}_pending_notification`,
    token,
    token_status: normalizedDecision === "approved" ? "pending" : "rejected_pending_notification",
    reviewer_notes: draftPayload.body || existing?.reviewer_notes || "",
    attachment_names: draftPayload.attachment_names || existing?.attachment_names || "",
    updated_at: now_(),
    notification_decision: normalizedDecision,
    notification_status: "pending",
    notification_due_at: minutesFromNow_(NOTIFICATION_GRACE_MINUTES),
    notification_draft_subject: defaultSubject,
  });
  const updated = findRow_("AccessRequests", "request_id", request.request_id);
  if (updated && !draftIsAvailable_(updated.notification_draft_id)) {
    const defaultMessage = defaultAccessNotificationMessage_(updated, normalizedDecision);
    const draft = createAccessNotificationDraft_(updated, normalizedDecision, defaultSubject, defaultMessage);
    updateAccessRequest_(request.request_id, {
      notification_draft_id: draft.getId(),
      notification_draft_subject: defaultSubject,
      updated_at: now_(),
    });
  }
  return findRow_("AccessRequests", "request_id", request.request_id);
}

function processEvalLabel_(labelName, resultStatus) {
  const label = GmailApp.getUserLabelByName(labelName);
  if (!label) return;
  const processedLabel = GmailApp.getUserLabelByName(config_("PROCESSED_LABEL", "RSC Processed"));
  label.getThreads(0, 100).forEach((thread) => {
    if (processedLabel && thread.getLabels().some((item) => item.getName() === processedLabel.getName())) return;
    try {
      const message = thread.getMessages()[0];
      const request = parseEvalRequest_(message);
      const evaluation = findRow_("Evaluations", "evaluation_id", request.evaluation_id);
      if (!evaluation) throw new Error(`Evaluation not found: ${request.evaluation_id}`);
      const draft = findDraftForRequest_(request.evaluation_id);
      const draftPayload = draft ? draftPayload_(draft) : { body: "", attachments: [], attachment_names: "" };
      if (resultStatus === "done") completeEvaluation_(evaluation, draftPayload);
      else markEvaluationNotDone_(evaluation, draftPayload);
      if (processedLabel) thread.addLabel(processedLabel);
      sendAdminDigest_(`evaluation ${resultStatus}`, { email: evaluation.email, evaluation_id: evaluation.evaluation_id });
    } catch (error) {
      recordError_(`processEvalLabel:${resultStatus}`, error);
    }
  });
}

function sendEvaluationRequestNotification_(submission, evaluation) {
  const contactEmail = config_("CONTACT_EMAIL", "robosynchallenge@gmail.com");
  const doneLabel = config_("EVAL_DONE_LABEL", "RSC Eval Done");
  const notDoneLabel = config_("EVAL_NOT_DONE_LABEL", "RSC Eval Not Done");
  const body = [
    `evaluation_id: ${evaluation.evaluation_id}`,
    `submission_id: ${submission.submission_id}`,
    `email: ${submission.email}`,
    `artifact_name: ${submission.artifact_name}`,
    `title: ${submission.title}`,
    `code_link: ${submission.code_link}`,
    `checkpoint_link: ${submission.checkpoint_link}`,
    `data_source_text: ${submission.data_source_text}`,
    "",
    `To send a completed evaluation result, create a Gmail draft whose subject contains ${evaluation.evaluation_id}.`,
    "The draft body must contain:",
    "success_rate: ",
    "inference_time: ",
    "eval_time: ",
    "videos_link: ",
    "",
    `Then apply the Gmail label: ${doneLabel}`,
    `If evaluation cannot be completed, apply the Gmail label: ${notDoneLabel}`,
  ].join("\n");
  const htmlBody = htmlEmailShell_(
    "RoboSynChallenge evaluation request",
    `
      <p>A participant submitted a policy artifact for organizer evaluation.</p>
      <table>${[
        ["Evaluation ID", evaluation.evaluation_id],
        ["Submission ID", submission.submission_id],
        ["Participant email", submission.email],
        ["Artifact", submission.artifact_name],
        ["Experiment", submission.title],
        ["Code URL", submission.code_link],
        ["Checkpoint URL", submission.checkpoint_link],
        ["Data source", submission.data_source_text],
      ].map(([key, value]) => `<tr><th>${escapeHtml_(key)}</th><td>${escapeHtml_(value)}</td></tr>`).join("")}</table>
      <p><strong>Done flow:</strong> create a Gmail draft with subject containing <code>${escapeHtml_(evaluation.evaluation_id)}</code>, fill the required fields below, then label this thread <code>${escapeHtml_(doneLabel)}</code>.</p>
      <pre>success_rate:
inference_time:
eval_time:
videos_link:</pre>
      <p><strong>Not done flow:</strong> label this thread <code>${escapeHtml_(notDoneLabel)}</code>. A note draft with the same evaluation id is optional.</p>
    `
  );
  MailApp.sendEmail({
    to: contactEmail,
    replyTo: submission.email,
    subject: `RoboSynChallenge evaluation request ${evaluation.evaluation_id}`,
    body,
    htmlBody,
  });
}

function parseEvalRequest_(message) {
  const body = message.getPlainBody();
  const subject = message.getSubject();
  const evaluationId = (subject.match(/eval_[a-z0-9]+/i) || body.match(/eval_[a-z0-9]+/i) || [""])[0];
  if (!evaluationId) throw new Error("Evaluation request is missing evaluation_id.");
  return { evaluation_id: evaluationId };
}

function completeEvaluation_(evaluation, draftPayload) {
  if (!draftPayload.body) throw new Error(`Evaluation ${evaluation.evaluation_id} requires a draft with result fields.`);
  const fields = parseKeyValueBody_(draftPayload.body);
  const successRate = requiredNumberField_(fields.success_rate, "success_rate");
  const inferenceTime = requiredNumberField_(fields.inference_time, "inference_time");
  const evalTime = requiredString_(fields.eval_time, "eval_time");
  const videosLink = requiredUrl_(fields.videos_link, "videos_link");
  updateRow_("Evaluations", evaluation._rowNumber, {
    status: "completed",
    result_status: "done",
    success_rate: successRate,
    inference_time: inferenceTime,
    real_time: inferenceTime,
    eval_time: evalTime,
    videos_link: videosLink,
    notes: draftPayload.body,
    result_sent_at: now_(),
    updated_at: now_(),
  });
  const updated = findRow_("Evaluations", "evaluation_id", evaluation.evaluation_id);
  sendEvaluationDoneEmail_(updated);
}

function markEvaluationNotDone_(evaluation, draftPayload) {
  updateRow_("Evaluations", evaluation._rowNumber, {
    status: "not_done",
    result_status: "not_done",
    notes: draftPayload.body || evaluation.notes || "",
    result_sent_at: now_(),
    updated_at: now_(),
  });
  const updated = findRow_("Evaluations", "evaluation_id", evaluation.evaluation_id);
  sendEvaluationNotDoneEmail_(updated);
}

function parsePayload_(e) {
  if (e?.parameter?.action) return { ...e.parameter };
  const contents = e?.postData?.contents || "{}";
  if (!contents.trim()) return {};
  if (contents.trim().startsWith("{")) return JSON.parse(contents);
  const payload = {};
  contents.split("&").forEach((pair) => {
    const index = pair.indexOf("=");
    const key = index >= 0 ? pair.slice(0, index) : pair;
    const value = index >= 0 ? pair.slice(index + 1) : "";
    if (key) payload[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, " "));
  });
  return payload;
}

function parseAccessRequest_(message) {
  const body = message.getPlainBody();
  const subject = message.getSubject();
  const requestId = (subject.match(/RSC-REQ-2026-[A-Z0-9]+/i) || body.match(/RSC-REQ-2026-[A-Z0-9]+/i) || [""])[0].toUpperCase();
  const fields = {};
  body.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^([a-z_]+)\s*:\s*(.*)$/i);
    if (match) fields[match[1].toLowerCase()] = match[2].trim();
  });
  const email = normalizeEmail_(fields.email);
  if (!requestId) throw new Error("Access request is missing request_id.");
  if (!email) throw new Error(`Access request ${requestId} is missing email.`);
  ["full_name", "team_name", "affiliation", "intended_use"].forEach((key) => {
    if (!String(fields[key] || "").trim()) throw new Error(`Access request ${requestId} is missing ${key}.`);
  });
  return {
    request_id: requestId,
    email,
    full_name: requiredFullNameList_(fields.full_name),
    team_name: fields.team_name || "",
    affiliation: fields.affiliation || "",
    intended_use: fields.intended_use || "",
    misc: fields.misc || "",
  };
}

function sendAccessRequestNotification_(request) {
  const contactEmail = config_("CONTACT_EMAIL", "robosynchallenge@gmail.com");
  const baseUrl = getWebAppUrl_();
  const approveUrl = `${baseUrl}?rsc_action=access_decision&decision=approved&request_id=${encodeURIComponent(request.request_id)}&token=${encodeURIComponent(request.review_token)}`;
  const rejectUrl = `${baseUrl}?rsc_action=access_decision&decision=rejected&request_id=${encodeURIComponent(request.request_id)}&token=${encodeURIComponent(request.review_token)}`;
  const body = [
    `request_id: ${request.request_id}`,
    `email: ${request.email}`,
    `full_name: ${request.full_name}`,
    `team_name: ${request.team_name}`,
    `affiliation: ${request.affiliation}`,
    `intended_use: ${request.intended_use}`,
    `misc: ${request.misc || ""}`,
    "",
    `Approve: ${approveUrl}`,
    `Deny: ${rejectUrl}`,
    "",
    "You may also review this request by applying the RSC Approved or RSC Rejected Gmail label to this thread.",
  ].join("\n");
  const htmlBody = htmlEmailShell_(
    "RoboSynChallenge access request",
    `
      <p>A participant requested an access token.</p>
      <table>${[
        ["Request ID", request.request_id],
        ["Email", request.email],
        ["Full name", request.full_name],
        ["Team name", request.team_name],
        ["Affiliation", request.affiliation],
        ["Intended use", request.intended_use],
        ["Misc", request.misc || "-"],
      ].map(([key, value]) => `<tr><th>${escapeHtml_(key)}</th><td>${escapeHtml_(value)}</td></tr>`).join("")}</table>
      ${emailDecisionButtons_(approveUrl, rejectUrl)}
      <p class="muted">After clicking a decision, you can edit the participant notification. If no manual notification is sent within 30 minutes, the backend sends the default template.</p>
      <p class="muted">Fallback: apply the configured Gmail approval/rejection label to this thread.</p>
    `
  );
  MailApp.sendEmail({
    to: contactEmail,
    replyTo: request.email,
    subject: `RoboSynChallenge participant access request ${request.request_id}`,
    body,
    htmlBody,
  });
  syncRequestedLabelForRequest_(request, { retries: 6, delayMs: 1000 });
}

function emailDecisionButtons_(approveUrl, rejectUrl) {
  const buttonBase = "display:inline-block;padding:14px 26px;border-radius:999px;font-family:Arial,sans-serif;font-size:15px;line-height:1.15;font-weight:800;text-decoration:none !important;color:#ffffff !important;";
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;width:auto;margin:20px 0 8px">
      <tr>
        <td bgcolor="#e9673f" style="border:0 !important;padding:0;border-radius:999px;background:#e9673f;box-shadow:0 12px 26px rgba(233,103,63,.22)">
          <a href="${escapeHtml_(approveUrl)}" style="${buttonBase}background:#e9673f;">Approve</a>
        </td>
        <td style="border:0 !important;padding:0 0 0 12px;width:12px">&nbsp;</td>
        <td bgcolor="#142333" style="border:0 !important;padding:0;border-radius:999px;background:#142333">
          <a href="${escapeHtml_(rejectUrl)}" style="${buttonBase}background:#142333;">Deny</a>
        </td>
      </tr>
    </table>
  `;
}

function handleAccessDecisionPage_(params) {
  const request = requireAccessRequestForAction_(params.request_id, params.token);
  const decision = normalizeDecision_(params.decision);
  const draftPayload = { body: request.reviewer_notes || "", attachments: [], attachment_names: request.attachment_names || "" };
  stageAccessDecision_(request, decision, draftPayload);
  const updated = findRow_("AccessRequests", "request_id", request.request_id);
  const defaultMessage = defaultAccessNotificationMessage_(updated, decision);
  const defaultSubject = defaultAccessNotificationSubject_(request, decision);
  return html_(
    decision === "approved" ? "Approve access request" : "Deny access request",
    `
      <p><strong>${escapeHtml_(request.email)}</strong> is marked <strong>${escapeHtml_(decision)}</strong>.</p>
      <p>A Gmail draft has been prepared. If you do nothing, the default notification below will be sent after 30 minutes.</p>
      <table class="detail-table">${[
        ["Request ID", updated.request_id],
        ["Email", updated.email],
        ["Full name", updated.full_name],
        ["Team name", updated.team_name],
        ["Affiliation", updated.affiliation],
        ["Intended use", updated.intended_use],
        ["Draft subject", updated.notification_draft_subject || defaultSubject],
        ["Draft ID", updated.notification_draft_id || "not available"],
      ].map(([key, value]) => `<tr><th>${escapeHtml_(key)}</th><td>${escapeHtml_(value)}</td></tr>`).join("")}</table>
      <form method="post" action="${escapeHtml_(getWebAppUrl_())}">
        <input type="hidden" name="action" value="send_access_notification">
        <input type="hidden" name="request_id" value="${escapeHtml_(request.request_id)}">
        <input type="hidden" name="token" value="${escapeHtml_(request.review_token)}">
        <input type="hidden" name="decision" value="${escapeHtml_(decision)}">
        <label>Subject</label>
        <input name="subject" value="${escapeHtml_(updated.notification_draft_subject || defaultSubject)}" required>
        <label>Email draft</label>
        <textarea name="message" rows="12" required>${escapeHtml_(defaultMessage)}</textarea>
        <div class="action-row">
          <a class="button-link" href="https://mail.google.com/mail/u/0/#drafts" target="_blank" rel="noreferrer">Open Gmail Drafts</a>
          <button type="submit">Send now</button>
        </div>
      </form>
    `
  );
}

function handleSendAccessNotification_(payload) {
  const request = requireAccessRequestForAction_(payload.request_id, payload.token);
  if (String(request.notification_status || "") === "sent") {
    return accessNotificationResultPage_("Notification already sent", `The notification for ${request.email} has already been sent.`, request);
  }
  const decision = normalizeDecision_(payload.decision || request.notification_decision);
  const draftPayload = isTruthy_(payload.use_draft) ? accessNotificationDraftPayload_(request) : null;
  const subject = draftPayload
    ? draftPayload.subject
    : requiredString_(payload.subject, "Subject");
  const message = draftPayload
    ? draftPayload.body
    : requiredString_(payload.message, "Email body");
  sendAccessParticipantNotification_(request, decision, subject, message);
  const updated = findRow_("AccessRequests", "request_id", request.request_id) || request;
  return accessNotificationResultPage_("Notification sent", `The ${decision} notification was sent to ${updated.email}.`, updated);
}

function accessNotificationResultPage_(title, message, request) {
  return html_(
    title,
    `
      <div class="notice">
        <strong>${escapeHtml_(message)}</strong>
      </div>
      <table class="detail-table">${[
        ["Request ID", request.request_id],
        ["Email", request.email],
        ["Status", request.status || "-"],
        ["Notification", request.notification_status || "-"],
        ["Sent at", request.notification_sent_at || "-"],
      ].map(([key, value]) => `<tr><th>${escapeHtml_(key)}</th><td>${escapeHtml_(value)}</td></tr>`).join("")}</table>
      <div class="action-row">
        <a class="button-link" href="https://mail.google.com/mail/u/0/#inbox" target="_blank" rel="noreferrer">Open Gmail</a>
      </div>
    `
  );
}

function processPendingNotifications() {
  const now = Date.now();
  rows_("AccessRequests")
    .filter((request) => String(request.notification_status || "") === "pending")
    .filter((request) => request.notification_due_at && new Date(request.notification_due_at).getTime() <= now)
    .forEach((request) => {
      try {
        const decision = normalizeDecision_(request.notification_decision);
        const subject = request.notification_draft_subject || defaultAccessNotificationSubject_(request, decision);
        sendAccessParticipantNotification_(request, decision, subject, defaultAccessNotificationMessage_(request, decision));
      } catch (error) {
        recordError_("processPendingNotifications", error);
      }
    });
}

function findDraftForRequest_(requestId) {
  return GmailApp.getDrafts().find((draft) => draft.getMessage().getSubject().includes(requestId)) || null;
}

function draftPayload_(draft) {
  const message = draft.getMessage();
  const attachments = message.getAttachments({ includeInlineImages: false, includeAttachments: true });
  const totalBytes = attachments.reduce((total, blob) => total + blob.getBytes().length, 0);
  if (totalBytes > REVIEW_ATTACHMENT_LIMIT_BYTES) {
    return {
      body: `${message.getPlainBody()}\n\n[Attachment limit exceeded. Please use Drive links for files larger than 10 MB total.]`,
      attachments: [],
      attachment_names: attachments.map((blob) => blob.getName()).join(", "),
    };
  }
  return {
    body: message.getPlainBody(),
    attachments,
    attachment_names: attachments.map((blob) => blob.getName()).join(", "),
  };
}

function upsertAccessRequest_(request, status, draftPayload) {
  const existing = findRow_("AccessRequests", "request_id", request.request_id);
  const values = {
    ...request,
    status,
    reviewer_notes: draftPayload.body || "",
    attachment_names: draftPayload.attachment_names || "",
    created_at: existing?.created_at || now_(),
    updated_at: now_(),
    misc: request.misc || existing?.misc || "",
  };
  if (existing) updateRow_("AccessRequests", existing._rowNumber, values);
  else appendRow_("AccessRequests", values);
}

function updateAccessRequest_(requestId, values) {
  const existing = findRow_("AccessRequests", "request_id", requestId);
  if (existing) updateRow_("AccessRequests", existing._rowNumber, values);
}

function upsertUser_(request, token) {
  const existing = findRow_("Users", "email", request.email);
  const values = {
    email: request.email,
    full_name: request.full_name,
    team_name: request.team_name,
    affiliation: request.affiliation,
    intended_use: request.intended_use,
    token,
    token_hint: tokenHint_(token),
    token_status: "active",
    token_action: "",
    issued_at: existing?.issued_at || now_(),
    updated_at: now_(),
  };
  if (existing) updateRow_("Users", existing._rowNumber, values);
  else appendRow_("Users", values);
}

function requireSession_(sessionId) {
  const session = findRow_("Sessions", "session_id", String(sessionId || ""));
  if (!session || isTruthy_(session.revoked)) throw new Error("Session is invalid.");
  if (new Date(session.expires_at).getTime() <= Date.now()) throw new Error("Session has expired.");
  return { email: normalizeEmail_(session.email), session_id: session.session_id };
}

function revokeSessions_(email) {
  rows_("Sessions")
    .filter((session) => normalizeEmail_(session.email) === normalizeEmail_(email))
    .forEach((session) => updateRow_("Sessions", session._rowNumber, { revoked: "true" }));
}

function sendAdminDigest_(reason, context) {
  const admins = config_("ADMIN_EMAILS", "").split(",").map((item) => item.trim()).filter(Boolean);
  if (!admins.length) return;
  SpreadsheetApp.flush();
  const xlsx = exportDigestWorkbook_();
  const htmlBody = [
    "<p>RoboSynChallenge 后端状态已更新。</p>",
    `<p><strong>原因：</strong>${escapeHtml_(reason)}</p>`,
    `<p><strong>上下文：</strong><code>${escapeHtml_(JSON.stringify(context || {}))}</code></p>`,
    `<p><strong>时间：</strong>${now_()}</p>`,
    "<p>附件是精简 XLSX 快照，只包含 AccessTokens 和 Evaluations 两张表。请按敏感材料处理，其中可能包含完整邮箱和 access token。</p>",
  ].join("");
  MailApp.sendEmail({
    to: admins.join(","),
    subject: `RoboSynChallenge 管理汇总 - ${reason}`,
    body: `RoboSynChallenge 后端状态已更新。\n\n原因：${reason}\n上下文：${JSON.stringify(context || {})}\n时间：${now_()}\n\n附件是精简 XLSX 快照，只包含 AccessTokens 和 Evaluations 两张表。请按敏感材料处理，其中可能包含完整邮箱和 access token。`,
    htmlBody,
    attachments: [xlsx],
  });
  appendRow_("DigestLog", {
    id: id_("digest"),
    reason,
    sent_to: admins.join(","),
    created_at: now_(),
  });
}

function sendAdminDigestBestEffort_(reason, context, where) {
  try {
    sendAdminDigest_(reason, context);
  } catch (error) {
    recordError_(where || "sendAdminDigestBestEffort", error);
  }
}

function exportDigestWorkbook_() {
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd-HHmmss");
  const fileBase = `RoboSynChallenge-digest-${timestamp}`;
  const temp = SpreadsheetApp.create(fileBase);
  try {
    const accessSheet = temp.getSheets()[0];
    accessSheet.setName("AccessTokens");
    writeObjectsToSheet_(accessSheet, accessTokenDigestHeaders_(), accessTokenDigestRows_());

    const evaluationSheet = temp.insertSheet("Evaluations");
    writeObjectsToSheet_(evaluationSheet, evaluationDigestHeaders_(), evaluationDigestRows_());

    SpreadsheetApp.flush();
    return exportSpreadsheetAsXlsx_(temp.getId(), `${fileBase}.xlsx`);
  } finally {
    DriveApp.getFileById(temp.getId()).setTrashed(true);
  }
}

function exportFullWorkbook_() {
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd-HHmmss");
  return exportSpreadsheetAsXlsx_(spreadsheet_().getId(), `RoboSynChallenge-full-backup-${timestamp}.xlsx`);
}

function exportSpreadsheetAsXlsx_(spreadsheetId, filename) {
  const response = UrlFetchApp.fetch(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`, {
    headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` },
    muteHttpExceptions: true,
  });
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error(`XLSX export failed with HTTP ${code}: ${response.getContentText()}`);
  }
  return response.getBlob().setName(filename);
}

function writeObjectsToSheet_(sheet, headers, objects) {
  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (objects.length) {
    const values = objects.map((object) => headers.map((header) => object[header] ?? ""));
    sheet.getRange(2, 1, values.length, headers.length).setValues(values);
  }
  sheet.setFrozenRows(1);
}

function accessTokenDigestHeaders_() {
  return [
    ...SHEETS.AccessRequests,
    ...SHEETS.Users.map((header) => `user_${header}`),
  ];
}

function accessTokenDigestRows_() {
  const usersByEmail = {};
  rows_("Users").forEach((user) => {
    usersByEmail[normalizeEmail_(user.email)] = user;
  });
  return rows_("AccessRequests").map((request) => {
    const user = usersByEmail[normalizeEmail_(request.email)] || {};
    const row = {};
    SHEETS.AccessRequests.forEach((header) => {
      row[header] = request[header] ?? "";
    });
    SHEETS.Users.forEach((header) => {
      row[`user_${header}`] = user[header] ?? "";
    });
    return row;
  });
}

function evaluationDigestHeaders_() {
  return [
    ...SHEETS.Evaluations,
    ...SHEETS.Submissions.map((header) => `submission_${header}`),
  ];
}

function evaluationDigestRows_() {
  const submissionsById = {};
  rows_("Submissions").forEach((submission) => {
    submissionsById[String(submission.submission_id || "")] = submission;
  });
  return rows_("Evaluations").map((evaluation) => {
    const submission = submissionsById[String(evaluation.submission_id || "")] || {};
    const row = {};
    SHEETS.Evaluations.forEach((header) => {
      row[header] = evaluation[header] ?? "";
    });
    SHEETS.Submissions.forEach((header) => {
      row[`submission_${header}`] = submission[header] ?? "";
    });
    return row;
  });
}

function getSheet_(name) {
  const ss = spreadsheet_();
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  const headers = SHEETS[name];
  const range = sheet.getRange(1, 1, 1, headers.length);
  const existing = range.getValues()[0];
  if (existing.join("") !== headers.join("")) range.setValues([headers]);
  return sheet;
}

function rows_(name) {
  const sheet = getSheet_(name);
  const values = sheet.getDataRange().getValues();
  const headers = SHEETS[name];
  return values.slice(1).filter((row) => row.some((cell) => cell !== "")).map((row, index) => {
    const object = { _rowNumber: index + 2 };
    headers.forEach((header, col) => {
      object[header] = row[col];
    });
    return object;
  });
}

function appendRow_(name, values) {
  const sheet = getSheet_(name);
  const headers = SHEETS[name];
  sheet.appendRow(headers.map((header) => values[header] ?? ""));
}

function updateRow_(name, rowNumber, values) {
  const sheet = getSheet_(name);
  const headers = SHEETS[name];
  const row = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  headers.forEach((header, index) => {
    if (Object.prototype.hasOwnProperty.call(values, header)) row[index] = values[header];
  });
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([row]);
}

function findRow_(name, key, value) {
  const normalized = String(value || "").trim().toLowerCase();
  return rows_(name).find((row) => String(row[key] || "").trim().toLowerCase() === normalized) || null;
}

function spreadsheet_() {
  const id = config_("SPREADSHEET_ID", "");
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActive();
}

function ensureLabels_() {
  [
    config_("APPROVED_LABEL", "RSC Approved"),
    config_("REJECTED_LABEL", "RSC Rejected"),
    config_("REQUESTED_LABEL", "RSC Requested"),
    config_("PROCESSED_LABEL", "RSC Processed"),
    config_("EVAL_DONE_LABEL", "RSC Eval Done"),
    config_("EVAL_NOT_DONE_LABEL", "RSC Eval Not Done"),
  ].forEach((name) => {
    if (!GmailApp.getUserLabelByName(name)) GmailApp.createLabel(name);
  });
}

function config_(key, fallback) {
  return PropertiesService.getScriptProperties().getProperty(key) || fallback;
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function publicUser_(row) {
  return {
    id: normalizeEmail_(row.email),
    email: normalizeEmail_(row.email),
    username: row.team_name || row.full_name || normalizeEmail_(row.email).split("@")[0],
    team_name: row.team_name || "",
    affiliation: row.affiliation || "",
    role: "participant",
    token_hint: row.token_hint || "",
  };
}

function publicSubmission_(row, evaluation = null) {
  return {
    id: row.submission_id,
    evaluation_id: row.evaluation_id,
    owner_id: normalizeEmail_(row.email),
    display_name: row.artifact_name,
    artifact_name: row.artifact_name,
    checkpoint_link: row.checkpoint_link,
    code_link: row.code_link,
    title: row.title,
    short_description: row.short_description,
    technical_notes: row.technical_notes,
    data_source_text: row.data_source_text,
    is_ranked: isTruthy_(row.is_ranked),
    ranking_label: isTruthy_(row.is_ranked) ? "Ranked" : "Test run",
    status: evaluation?.status || row.status || "submitted",
    evaluation_stage: evaluation?.evaluation_stage || "",
    evaluation_schedule_at: evaluation?.schedule_at || "",
    evaluation_published: isTruthy_(evaluation?.published),
    evaluation_notes: evaluation?.notes || "",
    created_at: row.created_at,
  };
}

function publicEvaluation_(row) {
  return {
    id: row.evaluation_id,
    submission_id: row.submission_id,
    display_name: `${row.artifact_name || "Policy artifact"} | ${row.title || ""}`,
    short_description: row.notes || row.leaderboard_notes || "",
    status: row.status || "submitted",
    evaluation_stage: row.evaluation_stage || "",
    schedule_at: row.schedule_at || "",
    published: isTruthy_(row.published),
    published_at: row.published_at || "",
    success_rate: row.success_rate,
    action_steps: row.action_steps,
    real_time: row.real_time,
    inference_time: row.inference_time || row.real_time,
    eval_time: row.eval_time || "",
    videos_link: row.videos_link || "",
    notes: row.notes || "",
    leaderboard_notes: row.leaderboard_notes || "",
    episodes: parseJson_(row.episodes_json, []),
  };
}

function requireAccessRequestForAction_(requestId, token) {
  const request = findRow_("AccessRequests", "request_id", requiredRequestId_(requestId));
  if (!request) throw new Error("Access request not found.");
  if (!request.review_token || String(request.review_token) !== String(token || "")) {
    throw new Error("This action link is invalid.");
  }
  return request;
}

function normalizeDecision_(value) {
  const decision = String(value || "").toLowerCase();
  if (["approve", "approved"].includes(decision)) return "approved";
  if (["deny", "denied", "reject", "rejected"].includes(decision)) return "rejected";
  throw new Error("Decision must be approved or rejected.");
}

function defaultAccessNotificationSubject_(request, decision) {
  return decision === "approved"
    ? `RoboSynChallenge access approved ${request.request_id}`
    : `RoboSynChallenge access request update ${request.request_id}`;
}

function defaultAccessNotificationMessage_(request, decision) {
  if (decision === "approved") {
    const token = request.token || "{{ACCESS_TOKEN}}";
    return [
      "Your RoboSynChallenge access request has been approved.",
      "",
      `Access token: ${token}`,
      "",
      "Use this token with the same email address to sign in and submit policy artifacts.",
      "",
      `Login here to test your access token: ${siteLoginUrl_()}`,
      "",
      "This is the internal WeChat QR code for your approved team. Please do not forward it or share it with others.",
      request.reviewer_notes ? `\nOrganizer note:\n${request.reviewer_notes}` : "",
    ].join("\n");
  }
  return [
    "Your RoboSynChallenge access request was not approved at this time.",
    "",
    "You may reply to the organizers if additional context is needed.",
    request.reviewer_notes ? `\nOrganizer note:\n${request.reviewer_notes}` : "",
  ].join("\n");
}

function createAccessNotificationDraft_(request, decision, subject, message) {
  const finalMessage = decision === "approved"
    ? approvedAccessEmailText_(injectAccessToken_(message, request.token || generateToken_()))
    : message;
  const inlineImages = decision === "approved" ? wechatQrInlineImages_() : {};
  return GmailApp.createDraft(request.email, subject, finalMessage, {
    htmlBody: htmlEmailShell_(
      decision === "approved" ? "Access approved" : "Access request update",
      `
        <p>${escapeHtml_(finalMessage).replace(/\n/g, "<br>")}</p>
        ${decision === "approved" ? approvedAccessEmailExtraHtml_(Boolean(inlineImages.wechatQr)) : ""}
      `
    ),
    inlineImages,
  });
}

function draftIsAvailable_(draftId) {
  if (!draftId) return false;
  try {
    return Boolean(GmailApp.getDraft(String(draftId)));
  } catch (error) {
    return false;
  }
}

function accessNotificationDraftPayload_(request) {
  if (!request.notification_draft_id) throw new Error("No prepared notification draft is available.");
  const draft = GmailApp.getDraft(String(request.notification_draft_id));
  const message = draft.getMessage();
  return {
    subject: requiredString_(message.getSubject(), "Draft subject"),
    body: requiredString_(message.getPlainBody(), "Draft body"),
  };
}

function deleteAccessDraft_(draftId) {
  if (!draftId) return;
  try {
    GmailApp.getDraft(String(draftId)).deleteDraft();
  } catch (error) {
    recordError_("deleteAccessDraft", error);
  }
}

function sendAccessParticipantNotification_(request, decision, subject, message) {
  const prepared = prepareAccessNotification_(request, decision, message);
  const finalRequest = prepared.request;
  const finalMessage = decision === "approved"
    ? approvedAccessEmailText_(prepared.message)
    : prepared.message;
  const inlineImages = decision === "approved" ? wechatQrInlineImages_() : {};
  const htmlBody = htmlEmailShell_(
    decision === "approved" ? "Access approved" : "Access request update",
    `
      <p>${escapeHtml_(finalMessage).replace(/\n/g, "<br>")}</p>
      ${decision === "approved" ? approvedAccessEmailExtraHtml_(Boolean(inlineImages.wechatQr)) : ""}
    `
  );
  MailApp.sendEmail({
    to: finalRequest.email,
    subject,
    body: finalMessage,
    htmlBody,
    inlineImages,
  });
  finalizeAccessNotification_(finalRequest, decision);
  deleteAccessDraft_(finalRequest.notification_draft_id);
  sendAdminDigest_(`access ${decision} notification sent`, {
    email: finalRequest.email,
    request_id: finalRequest.request_id,
  });
}

function prepareAccessNotification_(request, decision, message) {
  const normalizedDecision = normalizeDecision_(decision);
  if (normalizedDecision === "approved") {
    const existingUser = findRow_("Users", "email", request.email);
    const token = existingUser?.token || request.token || generateToken_();
    const finalRequest = { ...request, token };
    updateAccessRequest_(request.request_id, {
      status: "approved_sending",
      token,
      token_status: "pending",
      updated_at: now_(),
      notification_decision: "approved",
      notification_status: "sending",
    });
    return {
      request: findRow_("AccessRequests", "request_id", request.request_id) || finalRequest,
      message: injectAccessToken_(message, token),
    };
  }
  updateAccessRequest_(request.request_id, {
    status: "rejected_sending",
    token_status: "rejected_pending_notification",
    updated_at: now_(),
    notification_decision: "rejected",
    notification_status: "sending",
  });
  return {
    request: findRow_("AccessRequests", "request_id", request.request_id) || request,
    message,
  };
}

function finalizeAccessNotification_(request, decision) {
  const normalizedDecision = normalizeDecision_(decision);
  if (normalizedDecision === "approved") {
    const token = request.token || generateToken_();
    upsertUser_({ ...request, token }, token);
    updateAccessRequest_(request.request_id, {
      status: "approved",
      token,
      token_status: "active",
      processed_at: now_(),
      notification_status: "sent",
      notification_sent_at: now_(),
      updated_at: now_(),
    });
  } else {
    updateAccessRequest_(request.request_id, {
      status: "rejected",
      token_status: "rejected",
      processed_at: now_(),
      notification_status: "sent",
      notification_sent_at: now_(),
      updated_at: now_(),
    });
  }
  const updated = findRow_("AccessRequests", "request_id", request.request_id) || request;
  finalizeAccessThreadLabels_(updated, normalizedDecision);
}

function injectAccessToken_(message, token) {
  const text = String(message || "");
  if (text.includes("{{ACCESS_TOKEN}}")) return text.replace(/\{\{ACCESS_TOKEN\}\}/g, token);
  if (/access token\s*:/i.test(text)) return text;
  return `${text}\n\nAccess token: ${token}`;
}

function findActiveUser_(email) {
  const user = findRow_("Users", "email", normalizeEmail_(email));
  if (!user || String(user.token_status || "").toLowerCase() !== "active" || !String(user.token || "").trim()) return null;
  return user;
}

function sendExistingTokenReminder_(user, request) {
  const inlineImages = wechatQrInlineImages_();
  const body = approvedAccessEmailText_([
    "Your email already has an active RoboSynChallenge access token.",
    "",
    `Access token: ${user.token}`,
    "",
    "Use this token with the same email address to sign in and submit policy artifacts.",
    "",
    "If you believe this token should be revoked or regenerated, reply to the organizers.",
  ].join("\n"));
  const htmlBody = htmlEmailShell_(
    "Existing access token",
    `
      <p>Your email already has an active RoboSynChallenge access token.</p>
      <table>${[
        ["Email", request.email],
        ["Access token", user.token],
        ["Token status", user.token_status],
      ].map(([key, value]) => `<tr><th>${escapeHtml_(key)}</th><td>${escapeHtml_(value)}</td></tr>`).join("")}</table>
      <p class="muted">Use this token with the same email address to sign in and submit policy artifacts.</p>
      ${approvedAccessEmailExtraHtml_(Boolean(inlineImages.wechatQr))}
    `
  );
  MailApp.sendEmail({
    to: request.email,
    subject: `RoboSynChallenge access token reminder ${request.request_id}`,
    body,
    htmlBody,
    inlineImages,
  });
}

function approvedAccessEmailText_(message) {
  const loginUrl = siteLoginUrl_();
  const lines = [String(message || "").trim()];
  if (!lines[0].includes(loginUrl)) {
    lines.push("", `Login here to test your access token: ${loginUrl}`);
  }
  if (!/WeChat QR code/i.test(lines[0])) {
    lines.push("", "This is the internal WeChat QR code for approved participants. Please do not forward it or share it with others.");
  }
  return lines.join("\n");
}

function approvedAccessEmailExtraHtml_(hasQrImage) {
  return `
    <p class="muted"><a class="login-link" href="${escapeHtml_(siteLoginUrl_())}" target="_blank" rel="noreferrer">Sign in to test your access token</a></p>
    <p class="warning"><strong>This is the internal WeChat QR code.</strong> It is for approved participants only. Do not forward or share it.</p>
    ${hasQrImage ? '<p><img src="cid:wechatQr" alt="RoboSynChallenge internal WeChat QR code" style="display:block;max-width:320px;width:100%;height:auto;border:1px solid #e3ddd2;border-radius:10px"></p>' : ""}
  `;
}

function sendFullNameUpdateTestInvite() {
  initializeSheets();
  const result = sendFullNameUpdateInvitesForEmails_([FULL_NAME_UPDATE_TEST_EMAIL], "test");
  sendAdminDigestBestEffort_("full name update test invite", summarizeInviteResult_(result), "sendFullNameUpdateTestInvite.digest");
  return result;
}

function sendFullNameUpdateInvitesNow() {
  initializeSheets();
  const emails = rows_("Users")
    .filter((user) => String(user.token_status || "").toLowerCase() === "active")
    .map((user) => normalizeEmail_(user.email))
    .filter(Boolean);
  const result = sendFullNameUpdateInvitesForEmails_(emails, "bulk");
  sendAdminDigestBestEffort_("full name update invites", summarizeInviteResult_(result), "sendFullNameUpdateInvitesNow.digest");
  return result;
}

function sendFullNameUpdateInvitesForEmails_(emails, source) {
  const result = { ok: true, source, sent: [], skipped: [], failed: [] };
  const seen = new Set();
  (emails || []).forEach((rawEmail) => {
    const email = normalizeEmail_(rawEmail);
    if (!email || seen.has(email)) return;
    seen.add(email);
    try {
      const user = findRow_("Users", "email", email);
      if (!user) {
        result.skipped.push({ email, reason: "user_not_found" });
        return;
      }
      if (String(user.token_status || "").toLowerCase() !== "active") {
        result.skipped.push({ email, reason: "token_not_active" });
        return;
      }
      const record = upsertFullNameUpdate_(user, source);
      if (String(record.token_status || "").toLowerCase() === "completed") {
        result.skipped.push({ email, reason: "already_completed" });
        return;
      }
      sendFullNameUpdateInvite_(record, user, source);
      updateRow_("FullNameUpdates", record._rowNumber, {
        invite_status: source === "test" ? "test_sent" : "sent",
        invite_sent_at: now_(),
        updated_at: now_(),
      });
      result.sent.push({ email, update_id: record.update_id, expires_at: record.expires_at });
    } catch (error) {
      result.failed.push({ email, error: String(error.message || error) });
      recordError_("sendFullNameUpdateInvitesForEmails", error);
    }
  });
  return result;
}

function summarizeInviteResult_(result) {
  return {
    source: result.source,
    sent: result.sent.length,
    skipped: result.skipped.length,
    failed: result.failed.length,
  };
}

function upsertFullNameUpdate_(user, source) {
  const email = normalizeEmail_(user.email);
  const existing = findRow_("FullNameUpdates", "email", email);
  if (existing && String(existing.token_status || "").toLowerCase() === "completed") return existing;

  const shouldReuse = existing && !isFullNameUpdateExpired_(existing);
  const values = {
    update_id: existing?.update_id || id_("fn"),
    email,
    token: shouldReuse ? existing.token : generateActionToken_(),
    token_status: "pending",
    current_full_name: user.full_name || existing?.current_full_name || "",
    new_full_name: "",
    invite_status: "pending",
    invite_sent_at: shouldReuse ? (existing.invite_sent_at || "") : "",
    expires_at: shouldReuse ? (existing.expires_at || fullNameUpdateExpiresAt_()) : fullNameUpdateExpiresAt_(),
    completed_at: "",
    updated_at: now_(),
    source: source || existing?.source || "",
    misc: "",
  };
  if (existing) updateRow_("FullNameUpdates", existing._rowNumber, values);
  else appendRow_("FullNameUpdates", values);
  return findRow_("FullNameUpdates", "email", email);
}

function sendFullNameUpdateInvite_(record, user, source) {
  const url = fullNameUpdateUrl_(record);
  const deadline = formatDateOnly_(record.expires_at);
  const currentFullName = record.current_full_name || user.full_name || "";
  const body = [
    "Please confirm your RoboSynChallenge team full name record.",
    "",
    `Current full name: ${currentFullName}`,
    "",
    'Rules: use English commas "," to list every team member, include no more than 5 names, and submit only once.',
    `Deadline: ${deadline}`,
    "",
    `Update link: ${url}`,
    "",
    "If you do not update this field before the deadline, the current full name will remain the official record.",
  ].join("\n");
  const htmlBody = htmlEmailShell_(
    "Team full name confirmation",
    `
      <p>Please confirm your RoboSynChallenge team full name record.</p>
      <table>${[
        ["Email", user.email],
        ["Current full name", currentFullName],
        ["Deadline", deadline],
      ].map(([key, value]) => `<tr><th>${escapeHtml_(key)}</th><td>${escapeHtml_(value)}</td></tr>`).join("")}</table>
      <p><strong>Rules:</strong> use English commas <code>,</code> to list every team member, include no more than 5 names, and submit only once.</p>
      <p>If you do not update this field before the deadline, the current full name will remain the official record.</p>
      <div class="actions"><a class="primary" href="${escapeHtml_(url)}" target="_blank" rel="noreferrer">Update full name</a></div>
    `
  );
  MailApp.sendEmail({
    to: user.email,
    subject: source === "test"
      ? "RoboSynChallenge full name confirmation test"
      : "RoboSynChallenge full name confirmation",
    body,
    htmlBody,
  });
}

function handleFullNameUpdatePage_(params) {
  const token = String(params?.token || "").trim();
  const record = findFullNameUpdateByToken_(token);
  if (!record) {
    return fullNameUpdateClosedPage_("Full name update unavailable", "This update link is invalid.", null);
  }
  if (String(record.token_status || "").toLowerCase() === "completed") {
    return fullNameUpdateClosedPage_("Full name already updated", "This full name update link has already been used.", record);
  }
  if (isFullNameUpdateExpired_(record)) {
    markFullNameUpdateExpired_(record);
    return fullNameUpdateClosedPage_("Full name update expired", "This full name update link has expired.", record);
  }
  return fullNameUpdateFormPage_(record, record.current_full_name || "", "");
}

function handleFullNameUpdateSubmit_(payload) {
  const token = String(payload.token || "").trim();
  const record = findFullNameUpdateByToken_(token);
  if (!record) {
    return fullNameUpdateClosedPage_("Full name update unavailable", "This update link is invalid.", null);
  }
  if (String(record.token_status || "").toLowerCase() === "completed") {
    return fullNameUpdateClosedPage_("Full name already updated", "This full name update link has already been used.", record);
  }
  if (isFullNameUpdateExpired_(record)) {
    markFullNameUpdateExpired_(record);
    return fullNameUpdateClosedPage_("Full name update expired", "This full name update link has expired.", record);
  }

  const submittedFullName = String(payload.full_name || "");
  let fullName;
  try {
    fullName = requiredFullNameList_(submittedFullName);
  } catch (error) {
    return fullNameUpdateFormPage_(record, submittedFullName, String(error.message || error));
  }

  const email = normalizeEmail_(record.email);
  const user = findRow_("Users", "email", email);
  if (!user || String(user.token_status || "").toLowerCase() !== "active") {
    return fullNameUpdateClosedPage_("Full name update unavailable", "This update link no longer points to an active participant account.", record);
  }

  const updatedAt = now_();
  updateRow_("Users", user._rowNumber, {
    full_name: fullName,
    updated_at: updatedAt,
  });
  updateAccessRequestsFullName_(email, fullName, updatedAt);
  updateRow_("FullNameUpdates", record._rowNumber, {
    token_status: "completed",
    new_full_name: fullName,
    completed_at: updatedAt,
    updated_at: updatedAt,
    misc: "participant submitted full_name only",
  });
  sendAdminDigestBestEffort_("full name updated", {
    email,
    update_id: record.update_id,
  }, "handleFullNameUpdateSubmit.digest");

  return html_(
    "Full name updated",
    `
      <div class="notice">
        <strong>Your team full name has been updated.</strong>
      </div>
      <table class="detail-table">${[
        ["Email", email],
        ["Previous full name", record.current_full_name || user.full_name || ""],
        ["Updated full name", fullName],
        ["Submitted at", updatedAt],
      ].map(([key, value]) => `<tr><th>${escapeHtml_(key)}</th><td>${escapeHtml_(value)}</td></tr>`).join("")}</table>
    `
  );
}

function fullNameUpdateFormPage_(record, value, errorMessage) {
  const email = normalizeEmail_(record.email);
  const user = findRow_("Users", "email", email);
  const currentFullName = record.current_full_name || user?.full_name || "";
  const inputValue = value || currentFullName;
  return html_(
    "Update team full name",
    `
      <div class="notice">
        <strong>Use English commas to list every team member, with no more than 5 names. This update can be submitted once only.</strong>
        <br>If you do not submit before ${escapeHtml_(formatDateOnly_(record.expires_at))}, the current full name will remain the official record.
      </div>
      ${errorMessage ? `<div class="notice" style="border-color:#f4b4a0;background:#fff3ef;color:#a33a1f"><strong>${escapeHtml_(errorMessage)}</strong></div>` : ""}
      <table class="detail-table">${[
        ["Email", email],
        ["Current full name", currentFullName],
        ["Deadline", formatDateOnly_(record.expires_at)],
      ].map(([key, rowValue]) => `<tr><th>${escapeHtml_(key)}</th><td>${escapeHtml_(rowValue)}</td></tr>`).join("")}</table>
      <form method="post" action="${escapeHtml_(getWebAppUrl_())}">
        <input type="hidden" name="action" value="update_full_name">
        <input type="hidden" name="token" value="${escapeHtml_(record.token)}">
        <label>Full name</label>
        <input name="full_name" value="${escapeHtml_(inputValue)}" placeholder="Name A, Name B" required>
        <div class="action-row">
          <button type="submit">Submit update</button>
        </div>
      </form>
    `
  );
}

function fullNameUpdateClosedPage_(title, message, record) {
  return html_(
    title,
    `
      <div class="notice"><strong>${escapeHtml_(message)}</strong></div>
      ${record ? `<table class="detail-table">${[
        ["Email", normalizeEmail_(record.email)],
        ["Current full name", record.current_full_name || "-"],
        ["New full name", record.new_full_name || "-"],
        ["Status", record.token_status || "-"],
        ["Deadline", record.expires_at ? formatDateOnly_(record.expires_at) : "-"],
      ].map(([key, value]) => `<tr><th>${escapeHtml_(key)}</th><td>${escapeHtml_(value)}</td></tr>`).join("")}</table>` : ""}
    `
  );
}

function findFullNameUpdateByToken_(token) {
  const normalized = String(token || "").trim();
  if (!normalized) return null;
  return findRow_("FullNameUpdates", "token", normalized);
}

function fullNameUpdateUrl_(record) {
  return `${getWebAppUrl_()}?rsc_action=full_name_update&token=${encodeURIComponent(record.token)}`;
}

function fullNameUpdateExpiresAt_() {
  return new Date(Date.now() + FULL_NAME_UPDATE_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function isFullNameUpdateExpired_(record) {
  const expiresAt = new Date(record.expires_at).getTime();
  return !Number.isFinite(expiresAt) || expiresAt <= Date.now();
}

function markFullNameUpdateExpired_(record) {
  if (String(record.token_status || "").toLowerCase() !== "pending") return;
  updateRow_("FullNameUpdates", record._rowNumber, {
    token_status: "expired",
    updated_at: now_(),
  });
}

function updateAccessRequestsFullName_(email, fullName, updatedAt) {
  rows_("AccessRequests")
    .filter((request) => normalizeEmail_(request.email) === normalizeEmail_(email))
    .forEach((request) => {
      updateRow_("AccessRequests", request._rowNumber, {
        full_name: fullName,
        updated_at: updatedAt,
      });
    });
}

function formatDateOnly_(value) {
  try {
    return Utilities.formatDate(new Date(value), Session.getScriptTimeZone(), "yyyy-MM-dd");
  } catch (error) {
    return String(value || "");
  }
}

function syncRequestedLabels_(options = {}) {
  const onlyPending = options.onlyPending !== false;
  const limit = Math.max(0, Number(options.limit || 0));
  let requests = rows_("AccessRequests");
  if (onlyPending) requests = requests.filter(isAccessRequestPending_);
  if (limit > 0) requests = requests.slice(0, limit);
  requests.forEach((request) => {
    try {
      syncRequestedLabelForRequest_(request);
    } catch (error) {
      recordError_("syncRequestedLabels", error);
    }
  });
}

function syncRequestedLabelForRequest_(request, options = {}) {
  try {
    const requestedLabel = GmailApp.getUserLabelByName(config_("REQUESTED_LABEL", "RSC Requested")) || GmailApp.createLabel(config_("REQUESTED_LABEL", "RSC Requested"));
    const thread = findAccessThread_(request, options);
    if (!thread) return;
    if (isAccessRequestPending_(request)) thread.addLabel(requestedLabel);
    else thread.removeLabel(requestedLabel);
    updateAccessRequest_(request.request_id, {
      gmail_thread_id: thread.getId(),
      updated_at: now_(),
    });
  } catch (error) {
    recordError_("syncRequestedLabelForRequest", error);
  }
}

function finalizeAccessThreadLabels_(request, decision) {
  try {
    const decisionLabelName = decision === "approved"
      ? config_("APPROVED_LABEL", "RSC Approved")
      : config_("REJECTED_LABEL", "RSC Rejected");
    const decisionLabel = GmailApp.getUserLabelByName(decisionLabelName) || GmailApp.createLabel(decisionLabelName);
    const processedLabel = GmailApp.getUserLabelByName(config_("PROCESSED_LABEL", "RSC Processed")) || GmailApp.createLabel(config_("PROCESSED_LABEL", "RSC Processed"));
    const requestedLabel = GmailApp.getUserLabelByName(config_("REQUESTED_LABEL", "RSC Requested")) || GmailApp.createLabel(config_("REQUESTED_LABEL", "RSC Requested"));
    const thread = findAccessThread_(request);
    if (!thread) return;
    thread.addLabel(decisionLabel);
    thread.addLabel(processedLabel);
    thread.removeLabel(requestedLabel);
    updateAccessRequest_(request.request_id, {
      gmail_thread_id: thread.getId(),
      updated_at: now_(),
    });
  } catch (error) {
    recordError_("finalizeAccessThreadLabels", error);
  }
}

function findAccessThread_(request, options = {}) {
  if (request.gmail_thread_id) {
    try {
      const thread = GmailApp.getThreadById(String(request.gmail_thread_id));
      if (thread && isAccessRequestThread_(thread, request)) return thread;
    } catch (error) {
      // Fall through to search by request id.
    }
  }
  const contactEmail = config_("CONTACT_EMAIL", "robosynchallenge@gmail.com");
  const subject = `RoboSynChallenge participant access request ${request.request_id}`;
  const retries = Math.max(0, Number(options.retries || 0));
  const delayMs = Math.max(0, Number(options.delayMs || 0));
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0 && delayMs > 0) Utilities.sleep(delayMs);
    const threads = GmailApp.search(`to:${contactEmail} subject:"${subject}"`, 0, 10);
    const thread = threads.find((candidate) => isAccessRequestThread_(candidate, request));
    if (thread) return thread;
  }
  return null;
}

function isAccessRequestThread_(thread, request) {
  const expectedSubject = `RoboSynChallenge participant access request ${request.request_id}`;
  return thread.getMessages().some((message) => {
    if (message.getSubject() !== expectedSubject) return false;
    if (message.getFrom().includes("no-reply@accounts.google.com")) return false;
    if (!message.getPlainBody().includes(`request_id: ${request.request_id}`) && !message.getPlainBody().includes(`Request ID ${request.request_id}`)) return false;
    return true;
  });
}

function isAccessRequestPending_(request) {
  const status = String(request.status || "").toLowerCase();
  const notificationStatus = String(request.notification_status || "").toLowerCase();
  if (notificationStatus === "sent") return false;
  if (status === "approved" || status === "rejected" || status === "existing_token_sent") return false;
  return true;
}

function manualIssueAccessToken() {
  const ui = SpreadsheetApp.getUi();
  const emailResponse = ui.prompt("Manual access token", "Email:", ui.ButtonSet.OK_CANCEL);
  if (emailResponse.getSelectedButton() !== ui.Button.OK) return;
  const email = requiredEmail_(emailResponse.getResponseText());
  const existing = findActiveUser_(email);
  if (existing) {
    ui.alert(`This email already has an active token:\n\n${existing.token}`);
    return;
  }
  const fullNameInput = promptRequired_(ui, "Full name");
  if (fullNameInput === null) return;
  const fullName = requiredFullNameList_(fullNameInput);
  const teamName = promptRequired_(ui, "Team name");
  if (teamName === null) return;
  const affiliation = promptRequired_(ui, "Affiliation");
  if (affiliation === null) return;
  const intendedUse = promptRequired_(ui, "Intended use");
  if (intendedUse === null) return;
  const token = generateToken_();
  const request = {
    request_id: `RSC-REQ-2026-MANUAL${Utilities.getUuid().replace(/-/g, "").slice(0, 6).toUpperCase()}`,
    email,
    full_name: fullName,
    team_name: teamName,
    affiliation,
    intended_use: intendedUse,
    misc: "manual token issue from Sheet menu",
    review_token: generateActionToken_(),
  };
  upsertAccessRequest_(request, "approved", { body: "Manual issue by organizer.", attachments: [], attachment_names: "" });
  updateAccessRequest_(request.request_id, {
    token,
    token_status: "active",
    processed_at: now_(),
    notification_decision: "manual",
    notification_status: "manual",
    notification_sent_at: now_(),
    updated_at: now_(),
  });
  upsertUser_({ ...request, token }, token);
  sendAdminDigest_("manual access token issued", { email, request_id: request.request_id });
  ui.alert(`Access token issued for ${email}:\n\n${token}`);
}

function promptRequired_(ui, label) {
  const response = ui.prompt("Manual access token", `${label}:`, ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return null;
  return requiredString_(response.getResponseText(), label);
}

function resetTestData() {
  initializeSheets();
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    "Reset test data",
    "This will clear AccessRequests, Users, Sessions, Submissions, Evaluations, and FullNameUpdates after sending a full workbook backup to ADMIN_EMAILS. Type RESET to continue.",
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;
  if (String(response.getResponseText() || "").trim() !== "RESET") {
    ui.alert("Reset cancelled. You must type RESET exactly.");
    return;
  }

  const admins = config_("ADMIN_EMAILS", "").split(",").map((item) => item.trim()).filter(Boolean);
  if (!admins.length) {
    ui.alert("Reset cancelled. ADMIN_EMAILS must be configured before clearing test data.");
    return;
  }

  const accessRows = rows_("AccessRequests");
  const evaluationRows = rows_("Evaluations");
  const backup = exportFullWorkbook_();
  MailApp.sendEmail({
    to: admins.join(","),
    subject: "RoboSynChallenge full backup before test data reset",
    body: `A full RoboSynChallenge backend workbook backup is attached.\n\nReset requested at: ${now_()}\n\nNo data has been cleared before this backup email is sent.`,
    htmlBody: [
      "<p>A full RoboSynChallenge backend workbook backup is attached.</p>",
      `<p><strong>Reset requested at:</strong> ${escapeHtml_(now_())}</p>`,
      "<p>No data has been cleared before this backup email is sent.</p>",
    ].join(""),
    attachments: [backup],
  });

  deleteResetDrafts_(accessRows, evaluationRows);
  ["AccessRequests", "Users", "Sessions", "Submissions", "Evaluations", "FullNameUpdates"].forEach(clearSheetData_);
  SpreadsheetApp.flush();
  ui.alert("Test data reset complete. Business data, sessions, and full name update records were cleared; Errors and DigestLog were kept.");
}

function deleteResetDrafts_(accessRows, evaluationRows) {
  const draftIds = new Set();
  const identifiers = new Set();
  accessRows.forEach((row) => {
    if (row.notification_draft_id) draftIds.add(String(row.notification_draft_id));
    if (row.request_id) identifiers.add(String(row.request_id));
  });
  evaluationRows.forEach((row) => {
    if (row.evaluation_id) identifiers.add(String(row.evaluation_id));
  });

  draftIds.forEach((draftId) => deleteAccessDraft_(draftId));
  if (!identifiers.size) return;

  GmailApp.getDrafts().forEach((draft) => {
    try {
      const subject = draft.getMessage().getSubject();
      const shouldDelete = Array.from(identifiers).some((identifier) => subject.includes(identifier));
      if (shouldDelete) draft.deleteDraft();
    } catch (error) {
      recordError_("deleteResetDrafts", error);
    }
  });
}

function clearSheetData_(name) {
  const sheet = getSheet_(name);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;
  const lastColumn = Math.max(sheet.getLastColumn(), (SHEETS[name] || []).length);
  sheet.getRange(2, 1, lastRow - 1, lastColumn).clearContent();
}

function sendEvaluationDoneEmail_(evaluation) {
  const body = [
    "Your RoboSynChallenge evaluation has been completed.",
    "",
    `Evaluation ID: ${evaluation.evaluation_id}`,
    `Submission ID: ${evaluation.submission_id}`,
    `Success rate: ${evaluation.success_rate}`,
    `Inference time: ${evaluation.inference_time || evaluation.real_time}`,
    `Evaluation time: ${evaluation.eval_time}`,
    `Videos link: ${evaluation.videos_link}`,
  ].join("\n");
  const htmlBody = htmlEmailShell_(
    "Evaluation completed",
    `
      <p>Your RoboSynChallenge evaluation has been completed.</p>
      <table>${[
        ["Evaluation ID", evaluation.evaluation_id],
        ["Submission ID", evaluation.submission_id],
        ["Success rate", evaluation.success_rate],
        ["Inference time", evaluation.inference_time || evaluation.real_time],
        ["Evaluation time", evaluation.eval_time],
        ["Videos link", evaluation.videos_link],
      ].map(([key, value]) => `<tr><th>${escapeHtml_(key)}</th><td>${escapeHtml_(value)}</td></tr>`).join("")}</table>
    `
  );
  MailApp.sendEmail({
    to: evaluation.email,
    subject: `RoboSynChallenge evaluation completed ${evaluation.evaluation_id}`,
    body,
    htmlBody,
  });
}

function sendEvaluationNotDoneEmail_(evaluation) {
  const body = [
    "Your RoboSynChallenge evaluation is marked not done.",
    "",
    `Evaluation ID: ${evaluation.evaluation_id}`,
    `Submission ID: ${evaluation.submission_id}`,
    evaluation.notes ? `\nOrganizer note:\n${evaluation.notes}` : "",
  ].join("\n");
  const htmlBody = htmlEmailShell_(
    "Evaluation not done",
    `
      <p>Your RoboSynChallenge evaluation is marked not done.</p>
      <table>${[
        ["Evaluation ID", evaluation.evaluation_id],
        ["Submission ID", evaluation.submission_id],
      ].map(([key, value]) => `<tr><th>${escapeHtml_(key)}</th><td>${escapeHtml_(value)}</td></tr>`).join("")}</table>
      ${evaluation.notes ? `<p>${escapeHtml_(evaluation.notes).replace(/\n/g, "<br>")}</p>` : ""}
    `
  );
  MailApp.sendEmail({
    to: evaluation.email,
    subject: `RoboSynChallenge evaluation update ${evaluation.evaluation_id}`,
    body,
    htmlBody,
  });
}

function parseKeyValueBody_(body) {
  const fields = {};
  String(body || "").split(/\r?\n/).forEach((line) => {
    const match = line.match(/^([a-z_]+)\s*:\s*(.*)$/i);
    if (match) fields[match[1].toLowerCase()] = match[2].trim();
  });
  return fields;
}

function requiredNumberField_(value, label) {
  const text = requiredString_(value, label);
  const number = Number(text);
  if (!Number.isFinite(number)) throw new Error(`${label} must be a number.`);
  return number;
}

function getWebAppUrl_() {
  return config_("WEB_APP_URL", "") || ScriptApp.getService().getUrl();
}

function siteLoginUrl_() {
  return config_("SITE_LOGIN_URL", "https://robosyn-bench.net/#/login");
}

function wechatQrBlob_() {
  const fileName = config_("WECHAT_QR_FILE_NAME", DEFAULT_WECHAT_QR_FILE_NAME);
  const fileId = config_("WECHAT_QR_FILE_ID", "");
  try {
    if (fileName) {
      const fileByName = latestDriveFileByName_(fileName);
      if (fileByName) return fileByName.getBlob().setName("RoboSynChallenge-WeChat-QR.png");
      throw new Error(`Drive file not found by name: ${fileName}`);
    }
    if (fileId) return DriveApp.getFileById(fileId).getBlob().setName("RoboSynChallenge-WeChat-QR.png");
    return null;
  } catch (error) {
    recordError_("wechatQrBlob", error);
    return null;
  }
}

function latestDriveFileByName_(fileName) {
  const files = DriveApp.getFilesByName(String(fileName || "").trim());
  let latest = null;
  while (files.hasNext()) {
    const file = files.next();
    if (!latest || file.getLastUpdated().getTime() > latest.getLastUpdated().getTime()) latest = file;
  }
  return latest;
}

function wechatQrInlineImages_() {
  const qrBlob = wechatQrBlob_();
  return qrBlob ? { wechatQr: qrBlob } : {};
}

function html_(title, bodyHtml) {
  return HtmlService.createHtmlOutput(`
    <!doctype html>
    <html>
      <head>
        <base target="_top">
        <style>
          body { font-family: Arial, sans-serif; color: #142333; margin: 32px; }
          form { display: grid; gap: 12px; max-width: 760px; }
          input, textarea { width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid #ccd4dc; border-radius: 6px; font: inherit; }
          textarea { min-height: 220px; }
          button, .button-link { width: fit-content; display: inline-flex; align-items: center; justify-content: center; min-height: 42px; box-sizing: border-box; padding: 10px 18px; border: 0; border-radius: 999px; background: #e9673f; color: white; font-weight: 800; font: inherit; text-decoration: none; cursor: pointer; }
          .button-link { background: white; color: #142333; border: 1px solid #ccd4dc; }
          .action-row { max-width: 760px; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-top: 4px; }
          .detail-table { max-width: 760px; width: 100%; border-collapse: collapse; margin: 18px 0; background: #fff; }
          .detail-table th { width: 160px; text-align: left; color: #475569; padding: 10px; border-bottom: 1px solid #e3ddd2; }
          .detail-table td { padding: 10px; border-bottom: 1px solid #e3ddd2; }
          .notice { max-width: 760px; box-sizing: border-box; margin: 18px 0; padding: 14px 16px; border: 1px solid #e3ddd2; border-radius: 10px; background: #f8f5ef; line-height: 1.6; }
          .notice a { color: #e9673f; font-weight: 700; }
          hr { max-width: 760px; margin: 22px 0; border: 0; border-top: 1px solid #e3ddd2; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml_(title)}</h1>
        ${bodyHtml}
      </body>
    </html>
  `);
}

function htmlEmailShell_(title, bodyHtml) {
  return `
    <div style="font-family:Arial,sans-serif;color:#142333;line-height:1.55;max-width:720px">
      <h2 style="margin:0 0 12px;font-size:22px;color:#142333">${escapeHtml_(title)}</h2>
      <div style="background:#f8f5ef;border:1px solid #e3ddd2;border-radius:10px;padding:18px">${bodyHtml}</div>
      <p style="color:#65717d;font-size:12px;margin-top:16px">RoboSynChallenge organizer automation</p>
    </div>
    <style>
      table{border-collapse:collapse;width:100%}th{text-align:left;width:160px;color:#475569;padding:8px;border-bottom:1px solid #e3ddd2}td{padding:8px;border-bottom:1px solid #e3ddd2}.actions{margin-top:18px}.actions a{display:inline-block;margin-right:10px;padding:10px 16px;border-radius:999px;text-decoration:none;font-weight:700}.actions .primary{background:#e9673f;color:#fff}.actions .danger{background:#142333;color:#fff}.muted{color:#65717d;font-size:13px}.warning{font-weight:700;color:#a33a1f}.login-link{color:#e9673f;font-weight:700}
    </style>
  `;
}

function minutesFromNow_(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function checkRateLimit_(scope, key, maxEvents, windowMs) {
  const cache = CacheService.getScriptCache();
  const cacheKey = `rate:${scope}:${key}`;
  const count = Number(cache.get(cacheKey) || 0) + 1;
  if (count > maxEvents) throw new Error("Rate limit exceeded. Please try again later.");
  cache.put(cacheKey, String(count), Math.ceil(windowMs / 1000));
}

function generateToken_() {
  return `RSC-${(Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "").slice(0, 32).toUpperCase()}`;
}

function generateSessionId_() {
  return `sess_${Utilities.getUuid().replace(/-/g, "")}`;
}

function generateActionToken_() {
  return `act_${(Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "")}`;
}

function id_(prefix) {
  return `${prefix}_${Utilities.getUuid().replace(/-/g, "").slice(0, 14)}`;
}

function tokenHint_(token) {
  return `${String(token).slice(0, 8)}...${String(token).slice(-4)}`;
}

function normalizeEmail_(value) {
  return String(value || "").trim().toLowerCase();
}

function requiredRequestId_(value) {
  const text = requiredString_(value, "Request id").toUpperCase();
  if (!/^RSC-REQ-2026-[A-Z0-9]+$/.test(text)) throw new Error("Request id is invalid.");
  return text;
}

function requiredEmail_(value) {
  const email = normalizeEmail_(value);
  if (!email) throw new Error("Email is required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Email is invalid.");
  return email;
}

function requiredFullNameList_(value) {
  const text = requiredString_(value, "Full name");
  if (/[，；;]/.test(text)) {
    throw new Error('Full name must use English commas "," to separate team member names.');
  }
  const names = text.split(",").map((item) => item.trim().replace(/\s+/g, " "));
  if (names.some((name) => !name)) {
    throw new Error("Full name cannot contain empty comma-separated entries.");
  }
  if (names.length > 5) {
    throw new Error("Full name can list at most 5 team members.");
  }
  if (names.some((name) => name.length > 120)) {
    throw new Error("Each team member name must be 120 characters or fewer.");
  }
  return names.join(", ");
}

function requiredString_(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required.`);
  if (text.length > 6000) throw new Error(`${label} is too long.`);
  return text;
}

function optionalString_(value, label) {
  const text = String(value || "").trim();
  if (text.length > 6000) throw new Error(`${label} is too long.`);
  return text;
}

function requiredUrl_(value, label) {
  const text = requiredString_(value, label);
  if (!/^https?:\/\/\S+$/i.test(text)) throw new Error(`${label} must be an HTTP(S) URL.`);
  return text;
}

function requiredHuggingFaceUrl_(value) {
  const text = requiredUrl_(value, "Hugging Face checkpoint URL");
  if (!/^https:\/\/huggingface\.co\//i.test(text)) throw new Error("Checkpoint link must be a https://huggingface.co/... URL.");
  return text;
}

function isTruthy_(value) {
  return value === true || String(value || "").toLowerCase() === "true" || String(value || "") === "1" || String(value || "").toLowerCase() === "yes";
}

function parseJson_(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function now_() {
  return new Date().toISOString();
}

function escapeHtml_(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function recordError_(where, error) {
  try {
    const message = String(error.message || error);
    appendRow_("Errors", {
      id: id_("err"),
      where,
      message,
      stack: String(error.stack || ""),
      created_at: now_(),
    });
    const admins = config_("ADMIN_EMAILS", "").split(",").map((item) => item.trim()).filter(Boolean);
    if (admins.length && shouldSendErrorEmail_(where, message)) {
      MailApp.sendEmail({
        to: admins.join(","),
        subject: `RoboSynChallenge backend error - ${where}`,
        body: `后端处理失败。\n\n位置：${where}\n错误：${message}\n\n同类错误邮件已限流；完整记录请查看 Errors 表。`,
        htmlBody: `<p>后端处理失败。</p><p><strong>位置：</strong>${escapeHtml_(where)}</p><p><strong>错误：</strong>${escapeHtml_(message)}</p><p>同类错误邮件已限流；完整记录请查看 Errors 表。</p>`,
      });
    }
  } catch (nested) {
    console.error(nested);
  }
}

function shouldSendErrorEmail_(where, message) {
  try {
    const isGmailQuota = isGmailQuotaError_(message);
    const throttleSeconds = isGmailQuota
      ? GMAIL_QUOTA_ERROR_EMAIL_THROTTLE_SECONDS
      : ERROR_EMAIL_THROTTLE_SECONDS;
    const cacheKey = isGmailQuota
      ? "error_email:gmail_quota"
      : `error_email:${hashText_(`${where}:${message}`)}`;
    const cache = CacheService.getScriptCache();
    if (cache.get(cacheKey)) return false;
    cache.put(cacheKey, "1", throttleSeconds);
    return true;
  } catch (nested) {
    return true;
  }
}

function isGmailQuotaError_(message) {
  return /Service invoked too many times for one day:\s*gmail/i.test(String(message || ""));
}

function hashText_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(value || ""))
    .map((byte) => ((byte + 256) % 256).toString(16).padStart(2, "0"))
    .join("");
}
