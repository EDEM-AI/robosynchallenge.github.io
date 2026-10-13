/** Each issue email authorizes a response round, without changing team identity. */
function reviewCorrectionAttempt_(correction) {
  return correction?.status === "corrected" ? Math.max(1, Number(correction.correction_count || 1)) : 0;
}

function reviewMigrateResponseSchema_(payload) {
  if (reviewerIdentity_(payload).role !== "admin") throw new Error("Organizer access required.");
  return withReviewLock_(() => {
    const ss = spreadsheet_();
    ["ReviewResponseLinks", "ReviewCorrections"].forEach(name => {
      const sheet = ss.getSheetByName(name);
      if (!sheet) { reviewTable_(name, ss); return; }
      const headers = REVIEW_TABLES[name];
      const oldLength = name === "ReviewResponseLinks" ? 5 : 10;
      const actual = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
      if (actual.some((value, index) => index < oldLength ? value !== headers[index] : value !== "" && value !== headers[index])) throw new Error(name + " unexpected headers; migration stopped.");
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    });
    return { ok: true };
  });
}

function reviewIssueDeadline_(payload, viewer) {
  if (!payload.response_deadline_at) return "";
  if (viewer.role !== "admin") throw new Error("Only organizers can set an issue response deadline.");
  const value = String(payload.response_deadline_at);
  const timestamp = Date.parse(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(timestamp) || timestamp <= Date.now()) {
    throw new Error("Response deadline must be a future UTC timestamp.");
  }
  return new Date(timestamp).toISOString();
}

function reviewResponseDeadline_(link) {
  return parseJson_(link.response_json, {}).response_deadline_at || "";
}

function reviewResponsePolicy_(deadline) {
  return deadline ? `Submit your confirmation or correction before ${deadline} (UTC). This deadline applies to this response round. A further issue email can open another round; use the latest email's form.` :
    "There is no 24-hour deadline or overall correction limit. Each new issue email opens a new response round. Use the latest email's form.";
}

function reviewCreateResponseLink_(run, messageId, deadline) {
  const token = "rsp_" + Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  const previous = reviewRows_("ReviewResponseLinks").find(row => row.message_id === messageId);
  reviewWrite_("ReviewResponseLinks", previous?._rowNumber, { evaluation_id: run.evaluation_id, message_id: messageId,
    token_hash: reviewerHash_(token), status: "sending", created_at: now_(),
    response_kind: "", responded_at: "",
    response_json: deadline ? JSON.stringify({response_deadline_at: deadline}) : "" });
  return { url: `${getWebAppUrl_()}?rsc_action=review_response&evaluation_id=${encodeURIComponent(run.evaluation_id)}&token=${encodeURIComponent(token)}` };
}

function reviewActivateResponseLink_(run, messageId) {
  reviewRows_("ReviewResponseLinks").filter(row => row.evaluation_id === run.evaluation_id && row.status === "active" && row.message_id !== messageId)
    .forEach(row => reviewWrite_("ReviewResponseLinks", row._rowNumber, { evaluation_id: run.evaluation_id, status: "superseded" }));
  const link = reviewRows_("ReviewResponseLinks").find((row) => row.message_id === messageId);
  reviewWrite_("ReviewResponseLinks", link._rowNumber, { evaluation_id: run.evaluation_id, status: "active" });
  const correction = reviewRows_("ReviewCorrections").find(row => row.evaluation_id === run.evaluation_id);
  reviewWrite_("ReviewCorrections", correction?._rowNumber, { evaluation_id: run.evaluation_id, participant_email: run.participant_email,
    deadline_at: reviewResponseDeadline_(link), status: correction?.status || "awaiting", response_status: "awaiting", updated_at: now_() });
}

function requireReviewResponse_(params, allowUsed) {
  const token = String(params.token || "");
  if (!/^rsp_[a-f0-9]{64}$/.test(token)) throw new Error("Invalid response link.");
  const link = reviewRows_("ReviewResponseLinks").find((row) => row.evaluation_id === params.evaluation_id &&
    (row.status === "active" || allowUsed && row.status === "used") && row.token_hash === reviewerHash_(token));
  const correction = reviewRows_("ReviewCorrections").find((row) => row.evaluation_id === params.evaluation_id);
  if (!link || !correction) throw new Error("This response link is not active. Contact the organizers.");
  if (reviewAdjudication_(params.evaluation_id)?.status === "invalid_pending_review") throw new Error("This evaluation is paused pending organizer review. Please reply directly to the latest eligibility notice; this form cannot change the decision.");
  // Only an explicit per-link deadline applies; historical 24-hour limits remain disabled.
  const deadline = reviewResponseDeadline_(link);
  if (link.status !== "used" && deadline && Date.now() >= Date.parse(deadline)) throw new Error("This response deadline has passed. Contact the organizers; no new response was saved.");
  if (link.status !== "used" && !correction.response_status && ["confirmed", "corrected"].includes(correction.status)) throw new Error("This response has already been recorded. Use the next issue email's form.");
  const job = reviewJob_(params.evaluation_id), run = reviewRun_(params.evaluation_id);
  if (!run || normalizeEmail_(job.submission.email) !== normalizeEmail_(correction.participant_email)) throw new Error("The response does not match the registered participant.");
  return { correction, job, run, link };
}

function reviewResponseRecorded_(link) {
  return html_("Response recorded", `<p>Your response has already been recorded for <strong>${escapeHtml_(link.evaluation_id)}</strong>${link.responded_at ? ` at ${escapeHtml_(link.responded_at)} (UTC)` : ""}. No new evaluation request is needed.</p><p>This response link cannot change the saved reply. The system processes the recorded response automatically; use a new issue email's form only if the organizers request further changes.</p>`);
}

function handleReviewResponsePage_(params) {
  const { correction, job, link } = requireReviewResponse_(params, true);
  if (link.status === "used") return reviewResponseRecorded_(link);
  const links = reviewTaskLinks_(parseJson_(correction.status === "corrected" ? correction.task_checkpoint_links_json : job.submission.task_checkpoint_links_json, {})) || {};
  return html_("Evaluation response", `<p><strong>${escapeHtml_(job.user.team_name || job.user.full_name)}</strong></p>
    <p>Use this issue email's form to confirm your submission or provide corrected code and checkpoints for all 10 tasks. ${escapeHtml_(reviewResponsePolicy_(reviewResponseDeadline_(link)))} Team details cannot be changed.</p>
    <p>Checkpoint fields accept Hugging Face URLs or account/repository names. Preserve any documented revision/subdirectory. For restricted access, use gated models and grant the individual RoboSynChallenge user access; private-repository invitations and participant tokens are not supported.</p>
    <form method="post" action="${escapeHtml_(getWebAppUrl_())}">
      <input type="hidden" name="action" value="review_response_submit">
      <input type="hidden" name="evaluation_id" value="${escapeHtml_(params.evaluation_id)}">
      <input type="hidden" name="token" value="${escapeHtml_(params.token)}">
      <label><input style="width:auto" type="radio" name="response_kind" value="confirm" checked> Confirm the current submission is correct</label>
      <label><input style="width:auto" type="radio" name="response_kind" value="correct"> Submit corrected code and checkpoints</label>
      <label>Corrected immutable GitHub commit URL (required for a correction)</label>
      <input name="code_link" value="${escapeHtml_(correction.code_link || "")}" placeholder="https://github.com/OWNER/REPO/tree/FULL_COMMIT_SHA">
      ${Object.keys(REVIEW_TASK_STEPS).map((task) => `<label>${escapeHtml_(task)} checkpoint (required for a correction)</label><input name="checkpoint_${task}" value="${escapeHtml_(links[task] || job.submission.checkpoint_link || "")}">`).join("")}
      <label>Response notes <span style="color:#a33a1f">*</span></label><textarea name="notes" maxlength="6000" required></textarea>
      <button type="submit">Submit response</button>
    </form>`);
}

function handleReviewResponseSubmit_(params) {
  return withReviewLock_(() => {
    const { correction, run, link } = requireReviewResponse_(params, true);
    const notes = requiredString_(params.notes, "Response notes");
    if (link.status === "used") {
      const saved = parseJson_(link.response_json, {});
      const same = link.response_kind === params.response_kind && saved.notes === notes &&
        (params.response_kind !== "correct" || saved.code_link === params.code_link && Object.keys(REVIEW_TASK_STEPS).every(task =>
          saved.task_checkpoint_links?.[task] === params["checkpoint_" + task]));
      if (!same) throw new Error("This response has already been recorded. No new changes were saved. Use the next issue email's form.");
      return reviewResponseRecorded_(link);
    }
    if (params.response_kind === "confirm") {
      reviewWrite_("ReviewCorrections", correction._rowNumber, { evaluation_id: run.evaluation_id,
        status: correction.status === "corrected" ? "corrected" : "confirmed", response_status: "confirmed", notes,
        response_at: now_(), updated_at: now_() });
      if (!run.bundle_commit) {
        reviewPreparationStatus_(run.evaluation_id, "pending", "");
        const checkpoint = reviewRows_("ReviewCheckpointChecks").find(row => row.evaluation_id === run.evaluation_id);
        if (checkpoint?.status === "failed") reviewWrite_("ReviewCheckpointChecks", checkpoint._rowNumber,
          { evaluation_id: run.evaluation_id, status: "pending", message: "", updated_at: now_() });
      }
    } else if (params.response_kind === "correct") {
      const code = requiredString_(params.code_link, "Immutable GitHub commit URL");
      if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/tree\/[a-f0-9]{40}\/?$/i.test(code)) throw new Error("Use a GitHub tree URL with a full 40-character commit SHA.");
      const links = Object.fromEntries(Object.keys(REVIEW_TASK_STEPS).map((task) => [task, requiredHuggingFaceUrl_(params["checkpoint_" + task])]));
      const uploads = reviewRows_("ReviewArchiveUploads").filter((row) => row.evaluation_id === run.evaluation_id);
      if (uploads.some((row) => row.status === "uploading" && Date.parse(row.expires_at) > Date.now())) throw new Error("An evidence upload is in progress. Ask the evaluator to finish it before submitting a correction.");
      reviewBackupProgress_(run, "Participant correction round " + (reviewCorrectionAttempt_(correction) + 1));
      reviewWrite_("ReviewCorrections", correction._rowNumber, { evaluation_id: run.evaluation_id,
        status: "corrected", code_link: code, task_checkpoint_links_json: JSON.stringify(links), notes,
        correction_count: reviewCorrectionAttempt_(correction) + 1, response_status: "corrected", response_at: now_(), deadline_at: "",
        responded_at: now_(), previous_bundle_commit: run.bundle_commit, updated_at: now_() });
      reviewResetParticipantProgress_(run, links, "Participant supplied corrected code/checkpoints. Automatic preparation will rerun; clone the new branch and use its pinned checkpoints before evaluation.");
    } else throw new Error("Choose confirmation or correction.");
    reviewWrite_("ReviewResponseLinks", link._rowNumber, { evaluation_id: run.evaluation_id, status: "used",
      response_kind: params.response_kind, responded_at: now_(), response_json: JSON.stringify({ notes,
        code_link: params.response_kind === "correct" ? params.code_link : "", task_checkpoint_links: params.response_kind === "correct" ? Object.fromEntries(Object.keys(REVIEW_TASK_STEPS).map(task => [task, params["checkpoint_" + task]])) : {},
        previous_bundle_commit: run.bundle_commit, correction_count: reviewCorrectionAttempt_(correction) + (params.response_kind === "correct" ? 1 : 0) }) });
    return html_("Response recorded", "<p>Your response has been recorded. Your registered team details and original submission are unchanged.</p>");
  });
}
