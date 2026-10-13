/** Eligibility decisions are separate from access/preparation errors and keep all evidence. */
function reviewAdjudication_(evaluationId) {
  return reviewRows_("ReviewAdjudications").find(row => row.evaluation_id === evaluationId) || null;
}

function reviewAssertEvaluationAllowed_(evaluationId, action) {
  if (!evaluationId || ["reviewer_queue", "reviewer_preparation_queue", "reviewer_mail_status",
    "reviewer_send_issue", "reviewer_set_adjudication", "reviewer_release_adjudication",
    "reviewer_send_adjudication_notice", "reviewer_evidence_status", "reviewer_upload_health",
    "reviewer_checkpoint_credential"].includes(action)) return;
  if (reviewAdjudication_(evaluationId)?.status === "invalid_pending_review") {
    throw new Error("ERROR: Submission currently invalid; evaluation is paused pending organizer review. No progress, upload, result or preparation change is allowed.");
  }
}

function reviewSetAdjudication_(payload) {
  return withReviewLock_(() => {
    const viewer = reviewerIdentity_(payload);
    if (viewer.role !== "admin") throw new Error("Organizer access required.");
    const job = reviewJob_(payload.evaluation_id), run = reviewRun_(payload.evaluation_id);
    const code = reviewRows_("ReviewCodePreparations").find(row => row.evaluation_id === payload.evaluation_id);
    const id = String(payload.decision_id || ""), reason = String(payload.reason || "").trim();
    const evidence = payload.evidence;
    if (!run || run.submission_id !== job.submission.submission_id || payload.expected_submission_id !== run.submission_id ||
        !/^[a-f0-9]{40}$/.test(payload.participant_commit || "") || code?.participant_commit !== payload.participant_commit) {
      throw new Error("Submission or adopted commit changed; verify the exact current code before adjudication.");
    }
    if (!/^decision_[a-f0-9]{32}$/.test(id) || !reason || reason.length > 6000 || !Array.isArray(evidence) ||
        !evidence.length || evidence.length > 10 || evidence.some(item => !item || typeof item.summary !== "string" ||
        item.summary.length > 2000 || typeof item.url !== "string" ||
        !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/blob\/[a-f0-9]{40}\//.test(item.url) ||
        !item.url.includes("/blob/" + payload.participant_commit + "/"))) {
      throw new Error("Provide a stable decision ID, reason and pinned code evidence.");
    }
    const previous = reviewAdjudication_(run.evaluation_id);
    if (previous?.status === "invalid_pending_review") {
      if (previous.decision_id !== id || previous.reason !== reason || previous.evidence_json !== JSON.stringify(evidence)) throw new Error("An existing decision differs; review it before replacement.");
      return {ok:true, duplicate:true, status:previous.status, decision_id:id, backup_id:previous.backup_id};
    }
    if (previous?.decision_id === id) throw new Error("This decision was released; a new organizer decision ID is required.");
    const backup = reviewBackupProgress_(run, "Eligibility decision " + id + "; evidence and progress preserved");
    const row = {evaluation_id:run.evaluation_id, decision_id:id, submission_id:run.submission_id,
      participant_commit:payload.participant_commit, status:"invalid_pending_review", reason,
      evidence_json:JSON.stringify(evidence), decided_by:viewer.email, decided_at:now_(), backup_id:backup,
      previous_state:run.state, released_by:"", released_at:"", release_reason:""};
    reviewWrite_("ReviewAdjudications", previous?._rowNumber, row);
    reviewWrite_("ReviewRuns", run._rowNumber, {evaluation_id:run.evaluation_id, state:"invalid", updated_at:now_()});
    return {ok:true, status:row.status, decision_id:id, backup_id:backup};
  });
}

function reviewReleaseAdjudication_(payload) {
  return withReviewLock_(() => {
    const viewer = reviewerIdentity_(payload);
    if (viewer.role !== "admin") throw new Error("Organizer access required.");
    const row = reviewAdjudication_(payload.evaluation_id), run = reviewRun_(payload.evaluation_id);
    const reason = String(payload.reason || "").trim();
    if (!row || !run || row.decision_id !== payload.decision_id || !reason || reason.length > 6000) throw new Error("Specify the current decision and a manual review reason.");
    if (row.status === "released") return {ok:true, duplicate:true, status:"released"};
    reviewWrite_("ReviewAdjudications", row._rowNumber, {evaluation_id:row.evaluation_id, status:"released",
      released_by:viewer.email, released_at:now_(), release_reason:reason});
    reviewWrite_("ReviewRuns", run._rowNumber, {evaluation_id:row.evaluation_id,
      state:run.state === "invalid" ? row.previous_state : run.state, updated_at:now_()});
    return {ok:true, status:"released"};
  });
}

function reviewSendAdjudicationNotice_(payload) {
  return withReviewLock_(() => {
    const viewer = reviewerIdentity_(payload);
    if (viewer.role !== "admin") throw new Error("Organizer access required.");
    const decision = reviewAdjudication_(payload.evaluation_id), job = reviewJob_(payload.evaluation_id);
    if (decision?.status !== "invalid_pending_review" || decision.decision_id !== payload.decision_id) throw new Error("Record the eligibility decision before sending its notice.");
    const id = String(payload.message_id || ""), subject = requiredString_(payload.subject, "Subject"), body = requiredString_(payload.body, "Email body");
    if (!/^msg_[a-f0-9]{32}$/.test(id) || subject.length > 200 || /[\r\n]/.test(subject) || body.length > 12000) throw new Error("Invalid decision notice.");
    const recipient = requiredEmail_(job.submission.email);
    const previous = reviewRows_("ReviewMessages").find(row => row.message_id === id);
    if (previous) {
      if (previous.evaluation_id !== decision.evaluation_id || previous.recipient !== recipient || previous.subject !== subject || previous.body !== body) throw new Error("Message ID belongs to different notice content.");
      if (previous.status === "sent") return {ok:true, status:"sent", duplicate:true, message_id:id};
      if (previous.status !== "not_sent") throw new Error("Check sent mail before retrying uncertain delivery.");
    }
    checkRateLimit_("reviewer_mail", viewer.email, 20, 60 * 60 * 1000);
    reviewWrite_("ReviewMessages", previous?._rowNumber, {evaluation_id:decision.evaluation_id, message_id:id,
      reviewer_email:viewer.email, stage:0, recipient, subject, body, status:"sending", created_at:now_()});
    const row = reviewRows_("ReviewMessages").find(item => item.message_id === id);
    try {
      const receipt = reviewDeliverEmail_({to:recipient, replyTo:config_("CONTACT_EMAIL", "robosynchallenge@gmail.com"),
        subject, body, htmlBody:htmlEmailShell_("Submission eligibility decision", body.split("\n\n").map(part =>
          "<p>" + escapeHtml_(part).replace(/\n/g,"<br>") + "</p>").join(""))});
      if (receipt.gmail_message_id) PropertiesService.getScriptProperties().setProperty("RSC_REVIEW_GMAIL_" + id, receipt.gmail_message_id);
      reviewWrite_("ReviewMessages", row._rowNumber, {evaluation_id:decision.evaluation_id, status:"sent", sent_at:now_()});
      return {ok:true, status:"sent", message_id:id, recipient, transport:receipt.transport};
    } catch (error) {
      reviewWrite_("ReviewMessages", row._rowNumber, {evaluation_id:decision.evaluation_id, status:error.delivery_not_sent ? "not_sent" : "delivery_unknown"});
      throw new Error(error.delivery_not_sent ? "Decision notice was not sent; reuse the same message ID." : "Verify uncertain decision-notice delivery before retrying.");
    }
  });
}
