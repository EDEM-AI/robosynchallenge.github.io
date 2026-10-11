/** Single-use correction links never change registered identities or original submissions. */
function reviewCreateResponseLink_(run, messageId) {
  const row = reviewRows_("ReviewCorrections").find((item) => item.evaluation_id === run.evaluation_id);
  const deadline = row?.deadline_at || new Date(Date.now() + 86400000).toISOString();
  const token = "rsp_" + Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  reviewWrite_("ReviewResponseLinks", null, { evaluation_id: run.evaluation_id, message_id: messageId,
    token_hash: reviewerHash_(token), status: "sending", created_at: now_() });
  return { deadline, url: `${getWebAppUrl_()}?rsc_action=review_response&evaluation_id=${encodeURIComponent(run.evaluation_id)}&token=${encodeURIComponent(token)}` };
}

function reviewActivateResponseLink_(run, messageId, deadline) {
  const link = reviewRows_("ReviewResponseLinks").find((row) => row.message_id === messageId);
  reviewWrite_("ReviewResponseLinks", link._rowNumber, { evaluation_id: run.evaluation_id, status: "active" });
  if (!reviewRows_("ReviewCorrections").some((row) => row.evaluation_id === run.evaluation_id)) {
    reviewWrite_("ReviewCorrections", null, { evaluation_id: run.evaluation_id, participant_email: run.participant_email,
      deadline_at: deadline, status: "awaiting", updated_at: now_() });
  }
}

function requireReviewResponse_(params) {
  const token = String(params.token || "");
  if (!/^rsp_[a-f0-9]{64}$/.test(token)) throw new Error("Invalid response link.");
  const link = reviewRows_("ReviewResponseLinks").find((row) => row.evaluation_id === params.evaluation_id &&
    row.status === "active" && row.token_hash === reviewerHash_(token));
  const correction = reviewRows_("ReviewCorrections").find((row) => row.evaluation_id === params.evaluation_id);
  if (!link || !correction) throw new Error("This response link is not active. Contact the organizers.");
  if (!Number.isFinite(Date.parse(correction.deadline_at)) || Date.parse(correction.deadline_at) <= Date.now()) throw new Error("The 24-hour response window has expired.");
  if (correction.status === "corrected") throw new Error("Your one permitted code correction has already been submitted.");
  const job = reviewJob_(params.evaluation_id), run = reviewRun_(params.evaluation_id);
  if (!run || normalizeEmail_(job.submission.email) !== normalizeEmail_(correction.participant_email)) throw new Error("The response does not match the registered participant.");
  return { correction, job, run };
}

function handleReviewResponsePage_(params) {
  const { correction, job } = requireReviewResponse_(params);
  const links = reviewTaskLinks_(parseJson_(job.submission.task_checkpoint_links_json, {})) || {};
  return html_("Evaluation response", `<p><strong>${escapeHtml_(job.user.team_name || job.user.full_name)}</strong></p>
    <p>One code correction is permitted within 24 hours of the first issue notification. Deadline (UTC): <strong>${escapeHtml_(correction.deadline_at)}</strong>.</p>
    <form method="post" action="${escapeHtml_(getWebAppUrl_())}">
      <input type="hidden" name="action" value="review_response_submit">
      <input type="hidden" name="evaluation_id" value="${escapeHtml_(params.evaluation_id)}">
      <input type="hidden" name="token" value="${escapeHtml_(params.token)}">
      <label><input style="width:auto" type="radio" name="response_kind" value="confirm" checked> Confirm the current submission is correct</label>
      <label><input style="width:auto" type="radio" name="response_kind" value="correct"> Submit the one permitted correction</label>
      <label>Corrected immutable GitHub commit URL (required for a correction)</label>
      <input name="code_link" placeholder="https://github.com/OWNER/REPO/tree/FULL_COMMIT_SHA">
      ${Object.keys(REVIEW_TASK_STEPS).map((task) => `<label>${escapeHtml_(task)} checkpoint (required for a correction)</label><input name="checkpoint_${task}" value="${escapeHtml_(links[task] || job.submission.checkpoint_link || "")}">`).join("")}
      <label>Response notes <span style="color:#a33a1f">*</span></label><textarea name="notes" maxlength="6000" required></textarea>
      <button type="submit">Submit response</button>
    </form>`);
}

function handleReviewResponseSubmit_(params) {
  return withReviewLock_(() => {
    const { correction, run } = requireReviewResponse_(params);
    const notes = requiredString_(params.notes, "Response notes");
    if (params.response_kind === "confirm") {
      if (correction.status === "confirmed") throw new Error("Your confirmation has already been recorded.");
      reviewWrite_("ReviewCorrections", correction._rowNumber, { evaluation_id: run.evaluation_id,
        status: "confirmed", notes, responded_at: now_(), updated_at: now_() });
    } else if (params.response_kind === "correct") {
      const code = requiredString_(params.code_link, "Immutable GitHub commit URL");
      if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/tree\/[a-f0-9]{40}\/?$/i.test(code)) throw new Error("Use a GitHub tree URL with a full 40-character commit SHA.");
      const links = Object.fromEntries(Object.keys(REVIEW_TASK_STEPS).map((task) => [task, requiredHuggingFaceUrl_(params["checkpoint_" + task])]));
      if (reviewWorkflow_(run.evaluation_id).stages[4].done || reviewTaskRows_(run.evaluation_id).some((row) => row.status === "checked")) throw new Error("Accepted results are locked. Contact the organizers.");
      const uploads = reviewRows_("ReviewArchiveUploads").filter((row) => row.evaluation_id === run.evaluation_id);
      if (uploads.some((row) => row.status === "uploading" && Date.parse(row.expires_at) > Date.now())) throw new Error("An evidence upload is in progress. Ask the evaluator to finish it before submitting a correction.");
      reviewWrite_("ReviewCorrections", correction._rowNumber, { evaluation_id: run.evaluation_id,
        status: "corrected", code_link: code, task_checkpoint_links_json: JSON.stringify(links), notes,
        responded_at: now_(), previous_bundle_commit: run.bundle_commit, updated_at: now_() });
      reviewTaskRows_(run.evaluation_id).forEach((row) => reviewWrite_("ReviewTaskResults", row._rowNumber,
        { evaluation_id: run.evaluation_id, status: "superseded", updated_at: now_() }));
      uploads.forEach((row) => reviewWrite_("ReviewArchiveUploads", row._rowNumber,
        { evaluation_id: run.evaluation_id, status: "superseded", updated_at: now_() }));
      const access = reviewRows_("ReviewUploadAccess").find((row) => row.evaluation_id === run.evaluation_id);
      if (access) reviewWrite_("ReviewUploadAccess", access._rowNumber, { evaluation_id: run.evaluation_id, revoked: "true" });
      reviewWrite_("ReviewRuns", run._rowNumber, { evaluation_id: run.evaluation_id, bundle_commit: "", bundle_url: "",
        policy_dirs_json: "[]", task_checkpoint_links_json: JSON.stringify(links), state: "assigned", updated_at: now_() });
      reviewStoreWorkflow_(run, { machine_id: "", stages: REVIEW_STAGES.map(() => ({ done: false, checks: {}, completed_at: "" })) });
      const check = reviewRows_("ReviewAccessChecks").find((row) => row.evaluation_id === run.evaluation_id);
      if (check) reviewWrite_("ReviewAccessChecks", check._rowNumber, { evaluation_id: run.evaluation_id, report_json: "", checked_at: "" });
      reviewPreparationStatus_(run.evaluation_id, "pending", "Participant submitted the single permitted correction.");
    } else throw new Error("Choose confirmation or correction.");
    return html_("Response recorded", "<p>Your response has been recorded. Your registered team details and original submission are unchanged.</p>");
  });
}
