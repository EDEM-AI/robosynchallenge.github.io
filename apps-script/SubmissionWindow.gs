/** Server-owned admission windows, scoped to an existing participant token. */
const POLICY_SUBMISSION_CLOSE_AT = "2026-10-12T12:00:00.000Z";

function submissionAdmission_(user, timestamp) {
  const time = timestamp == null ? Date.now() : timestamp;
  const closed = time >= Date.parse(POLICY_SUBMISSION_CLOSE_AT);
  let grant = null;
  if (closed) {
    const events = reviewRows_("ReviewSubmissionWindows").filter((row) =>
      normalizeEmail_(row.email) === normalizeEmail_(user.email) && row.token_hash === reviewerHash_(user.token));
    const latest = events[events.length - 1];
    if (latest?.status === "granted" && Date.parse(latest.created_at) <= time && time < Date.parse(latest.expires_at)) grant = latest;
  }
  return { allowed: !closed || Boolean(grant), deadline_at: POLICY_SUBMISSION_CLOSE_AT,
    exception: Boolean(grant), exception_expires_at: grant?.expires_at || "", window_id: grant?.window_id || "",
    contact_email: config_("CONTACT_EMAIL", "robosynchallenge@gmail.com") };
}

function handleSubmissionStatus_(payload) {
  const session = requireSession_(payload.session_id);
  const user = findActiveUser_(session.email);
  if (!user) throw new Error("User token is not active.");
  const { window_id, ...status } = submissionAdmission_(user);
  return { ok: true, ...status };
}

function reviewSubmissionWindow_(payload) {
  return withReviewLock_(() => {
    const viewer = reviewerIdentity_(payload);
    if (viewer.role !== "admin") throw new Error("Organizer access required.");
    const user = findActiveUser_(requiredEmail_(payload.participant_email));
    if (!user) throw new Error("Use an existing participant with an active token.");
    const reason = requiredString_(payload.reason, "Reason");
    const revoke = isTruthy_(payload.revoke);
    const expires = revoke ? "" : new Date(String(payload.expires_at || ""));
    if (!revoke && (!Number.isFinite(expires.getTime()) || expires.getTime() <= Date.now())) throw new Error("Provide a future expiry timestamp.");
    const values = { window_id: id_("win"), email: user.email, token_hash: reviewerHash_(user.token),
      status: revoke ? "revoked" : "granted", expires_at: revoke ? "" : expires.toISOString(),
      reason, granted_by: viewer.email, created_at: now_() };
    reviewWrite_("ReviewSubmissionWindows", null, values);
    return { ok: true, participant_email: user.email, status: values.status, expires_at: values.expires_at };
  });
}

function submissionWasAdmitted_(submission, windows) {
  const created = Date.parse(submission.created_at);
  if (!Number.isFinite(created)) return false;
  if (created < Date.parse(POLICY_SUBMISSION_CLOSE_AT)) return true;
  const grant = windows.find((row) => row.window_id === submission.submission_window_id);
  return Boolean(grant && grant.status === "granted" && normalizeEmail_(grant.email) === normalizeEmail_(submission.email) &&
    grant.token_hash === reviewerHash_(submission.token) && Date.parse(grant.created_at) <= created && created < Date.parse(grant.expires_at));
}
