const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

let clock = Date.parse("2026-10-16T08:00:00Z");
class Clock extends Date { static now() { return clock; } }
const users = new Map([
  ["approved@example.invalid", { email: "approved@example.invalid", token: "synthetic-approved", token_status: "active" }],
  ["other@example.invalid", { email: "other@example.invalid", token: "synthetic-other", token_status: "active" }],
]);
const tables = { ReviewSubmissionWindows: [], Submissions: [], Evaluations: [] };
const receipts = new Map();
let sequence = 0;
const context = vm.createContext({
  Date: Clock,
  normalizeEmail_: email => String(email).toLowerCase(),
  requiredEmail_: email => { assert(users.has(email)); return email; },
  requiredString_: value => { assert(value); return value; },
  requiredUrl_: value => value,
  requiredHuggingFaceUrl_: value => value,
  submissionTaskLinks_: submission => submission.task_checkpoint_links,
  reviewerHash_: value => crypto.createHash("sha256").update(value).digest("hex"),
  findActiveUser_: email => users.get(email),
  findRow_: (table, key, value) => table === "Users" ? users.get(value) : tables[table].find(row => row[key] === value),
  reviewRows_: table => tables[table],
  reviewWrite_: (table, _, row) => tables[table].push(row),
  appendRow_: (table, row) => tables[table].push(row),
  withReviewLock_: callback => callback(),
  reviewerIdentity_: payload => ({ role: payload.role || "admin", email: "organizer@example.invalid" }),
  requireSession_: payload => ({ email: payload }),
  isTruthy_: value => value === true,
  id_: prefix => prefix + "_" + (++sequence),
  now_: () => new Date(clock).toISOString(),
  config_: (_, fallback) => fallback,
  checkRateLimit_: () => {},
  policyReceipt_: key => receipts.get(key),
  policyReceiptWrite_: (_, row) => receipts.set(row.retry_key, { ...row, notification_status: "sent" }),
  notifyPolicyReceipt_: () => {},
  publicSubmission_: value => value,
  publicEvaluation_: value => value,
});
const base = path.join(__dirname, "../apps-script");
const source = fs.readFileSync(path.join(base, "Code.gs"), "utf8");
vm.runInContext(source.match(/const POLICY_SUBMISSION_INTAKE_CLOSED = [^;]+;/)[0] +
  source.match(/const POLICY_SUBMISSION_CLOSED_MESSAGE = [^;]+;/)[0] +
  fs.readFileSync(path.join(base, "SubmissionWindow.gs"), "utf8") +
  source.slice(source.indexOf("function handleSubmitPolicy_("), source.indexOf("function notifyPolicyReceipt_(")), context);
const call = (name, payload) => vm.runInContext(`${name}(${JSON.stringify(payload)})`, context);
const approved = "approved@example.invalid", other = "other@example.invalid";
assert.equal(call("handleSubmissionStatus_", { session_id: approved }).allowed, false);
assert.throws(() => call("reviewSubmissionWindow_", { role: "evaluator", participant_email: approved }), /Organizer access/);
assert.throws(() => call("reviewSubmissionWindow_", { participant_email: approved, reason: "Expired", expires_at: "2026-10-15T00:00:00Z" }), /future expiry/);
const expiry = "2026-10-26T12:00:00.000Z";
call("reviewSubmissionWindow_", { participant_email: approved, reason: "Explicit organizer exception", expires_at: expiry });
const status = call("handleSubmissionStatus_", { session_id: approved });
assert.equal(status.allowed, true);
assert.equal(status.exception, true);
assert.equal(status.exception_expires_at, expiry);
assert.equal(call("handleSubmissionStatus_", { session_id: other }).allowed, false);
const submission = { artifact_name: "Synthetic", title: "Test", short_description: "Test",
  code_link: "https://github.com/example/test", checkpoint_link: "https://huggingface.co/example/test",
  technical_notes: "Synthetic", data_source_text: "Synthetic", task_checkpoint_links: { click_bell: "test" } };
assert.throws(() => call("handleSubmitPolicy_", { session_id: other, submission }), /closed/);
const accepted = call("handleSubmitPolicy_", { session_id: approved, submission });
assert.equal(accepted.ok, true);
assert.equal(tables.Submissions.length, 1);
assert(tables.Submissions[0].submission_window_id);
assert.equal(vm.runInContext(`submissionWasAdmitted_(${JSON.stringify(tables.Submissions[0])}, reviewRows_("ReviewSubmissionWindows"))`, context), true);
assert(!JSON.stringify(tables.ReviewSubmissionWindows).includes("synthetic-approved"));
users.get(approved).token = "synthetic-rotated";
assert.equal(call("handleSubmissionStatus_", { session_id: approved }).allowed, false);
users.get(approved).token = "synthetic-approved";
clock = Date.parse(expiry);
assert.equal(call("handleSubmissionStatus_", { session_id: approved }).allowed, false);
assert.throws(() => call("handleSubmitPolicy_", { session_id: approved, submission_key: "expired_attempt_0001", submission }), /closed/);
assert.equal(tables.Submissions.length, 1);
assert.equal(call("handleSubmitPolicy_", { session_id: approved, submission }).already_recorded, true);
clock = Date.parse("2026-10-16T08:00:00Z");
call("reviewSubmissionWindow_", { participant_email: approved, revoke: true, reason: "Revoke synthetic grant" });
assert.equal(call("handleSubmissionStatus_", { session_id: approved }).allowed, false);
assert.equal(call("handleSubmissionStatus_", { session_id: other, exception: true }).allowed, false);
console.log("Submission window: explicit grant, expiry, revocation, token scope, closed public intake and idempotent retries passed; no network calls.");
