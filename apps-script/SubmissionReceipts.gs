/** Durable retry identities; mail errors never undo an accepted submission. */
const POLICY_RECEIPT_HEADERS = ["retry_key", "fingerprint", "email", "submission_id", "evaluation_id", "created_at", "window_id", "notification_status", "notification_error"];

function policyReceiptTable_() {
  const ss = spreadsheet_();
  let sheet = ss.getSheetByName("SubmissionReceipts");
  if (!sheet) {
    sheet = ss.insertSheet("SubmissionReceipts");
    sheet.getRange(1, 1, 1, POLICY_RECEIPT_HEADERS.length).setValues([POLICY_RECEIPT_HEADERS]);
    sheet.setFrozenRows(1);
  }
  if (sheet.getRange(1, 1, 1, POLICY_RECEIPT_HEADERS.length).getValues()[0].join("\u0000") !== POLICY_RECEIPT_HEADERS.join("\u0000")) throw new Error("SubmissionReceipts headers changed.");
  return sheet;
}

function policyReceiptRows_() {
  return policyReceiptTable_().getDataRange().getValues().slice(1).map((cells, index) =>
    Object.fromEntries([["_rowNumber", index + 2], ...POLICY_RECEIPT_HEADERS.map((header, col) => [header, cells[col]])]));
}

function policyReceipt_(key) {
  return policyReceiptRows_().find(row => row.retry_key === key) || null;
}

function policyReceiptWrite_(row, values) {
  const sheet = policyReceiptTable_();
  if (!row) { sheet.appendRow(POLICY_RECEIPT_HEADERS.map(header => values[header] ?? "")); return; }
  const range = sheet.getRange(row, 1, 1, POLICY_RECEIPT_HEADERS.length);
  const cells = range.getValues()[0];
  if (cells[0] !== values.retry_key) throw new Error("Submission receipt row changed.");
  POLICY_RECEIPT_HEADERS.forEach((header, col) => { if (Object.prototype.hasOwnProperty.call(values, header)) cells[col] = values[header]; });
  range.setValues([cells]);
}
function reviewAuditSubmissionLinks_(payload) {
  return withReviewLock_(() => {
    if (reviewerIdentity_(payload).role !== "admin") throw new Error("Organizer access required.");
    const submissions = rows_("Submissions"), evaluations = rows_("Evaluations");
    const issues = [], repaired = [];
    submissions.forEach(sub => {
      const matches = evaluations.filter(ev => ev.evaluation_id === sub.evaluation_id || ev.submission_id === sub.submission_id);
      if (matches.length === 1 && matches[0].evaluation_id === sub.evaluation_id && matches[0].submission_id === sub.submission_id && normalizeEmail_(matches[0].email) === normalizeEmail_(sub.email)) return;
      const issue = { submission_id: sub.submission_id, evaluation_id: sub.evaluation_id, kind: matches.length ? "identity_conflict" : "missing_evaluation", repaired: false };
      if (!matches.length && isTruthy_(payload.repair) && /^sub_[a-z0-9]+$/i.test(sub.submission_id) && /^eval_[a-z0-9]+$/i.test(sub.evaluation_id) &&
          submissions.filter(other => other.submission_id === sub.submission_id || other.evaluation_id === sub.evaluation_id).length === 1 && sub.artifact_name && sub.title && sub.created_at &&
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail_(sub.email)) && /^https:\/\/github\.com\//.test(sub.code_link) && /^https:\/\/huggingface\.co\//.test(sub.checkpoint_link)) {
        appendRow_("Evaluations", { evaluation_id: sub.evaluation_id, submission_id: sub.submission_id, email: sub.email,
          artifact_name: sub.artifact_name, title: sub.title, status: "submitted", episodes_json: "[]", result_status: "pending", updated_at: now_() });
        issue.repaired = true;
        repaired.push(sub.evaluation_id);
      }
      issues.push(issue);
    });
    evaluations.filter(ev => !submissions.some(sub => sub.submission_id === ev.submission_id)).forEach(ev => issues.push({ evaluation_id: ev.evaluation_id, submission_id: ev.submission_id, kind: "orphan_evaluation", repaired: false }));
    return { ok: true, submission_count: submissions.length, evaluation_count: evaluations.length + repaired.length,
      submitting_accounts: new Set(submissions.map(sub => normalizeEmail_(sub.email)).filter(Boolean)).size,
      eligible_latest_requests: latestReviewSubmissions_().length, issues, repaired, checked_at: now_() };
  });
}
function processPendingPolicyNotifications_() {
  return withReviewLock_(() => {
    policyReceiptRows_().filter(row => row.notification_status === "pending").slice(0, 20).forEach(receipt => {
      const sub = findRow_("Submissions", "submission_id", receipt.submission_id);
      const ev = findRow_("Evaluations", "evaluation_id", receipt.evaluation_id);
      if (!sub || !ev || sub.evaluation_id !== receipt.evaluation_id || ev.submission_id !== receipt.submission_id || normalizeEmail_(sub.email) !== receipt.email || normalizeEmail_(ev.email) !== receipt.email) return;
      notifyPolicyReceipt_(receipt, sub, ev);
    });
  });
}
