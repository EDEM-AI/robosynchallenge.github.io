/** Deadline exceptions require an explicit assigned-reviewer decision and audit reason. */
function reviewVersionCheck_(payload) {
  return withReviewLock_(() => {
    const { viewer, run } = reviewOwnedRun_(payload, true);
    if (viewer.role !== "admin") throw new Error("Only the organizer preparer can report selected versions.");
    if (!["provisional", "final"].includes(payload.status) || JSON.stringify(payload.report || {}).length > 30000) throw new Error("Invalid version selection report.");
    const report = payload.report;
    if (!/^[a-f0-9]{40}$/.test(report?.code?.revision || "") || !Number.isFinite(Date.parse(report?.code?.cutoff_at)) ||
        !reviewTaskLinks_(Object.fromEntries(Object.entries(report.hf || {}).map(([task, row]) => [task, row.url])))) throw new Error("Version report requires code and all ten checkpoints.");
    const limit = Date.parse(report.code.cutoff_at);
    if (![report.code.committed_at, report.code.authored_at].every(value => Number.isFinite(Date.parse(value)) && Date.parse(value) < limit) ||
        Object.values(report.hf).some(row => !/^[a-f0-9]{40}$/.test(row.revision || "") || row.cutoff_at !== report.code.cutoff_at || !Number.isFinite(Date.parse(row.committed_at)) || Date.parse(row.committed_at) >= limit)) throw new Error("Selected code and checkpoint timestamps must precede the recorded cutoff.");
    const job = reviewQueue_(payload, true).jobs.find(item => item.evaluation_id === run.evaluation_id);
    if (payload.context_json && payload.context_json !== reviewCheckpointContext_(job)) throw new Error("Participant inputs changed during version selection.");
    if (payload.status === "final" && report.code.cutoff_at !== job.version_cutoff_at) throw new Error("Final version cutoff does not match the approved submission window.");
    if (payload.status === "final" && Date.now() < Date.parse(job.version_cutoff_at)) throw new Error("Final version selection must wait until the submission window closes.");
    const row = reviewRows_("ReviewVersionChecks").find(item => item.evaluation_id === run.evaluation_id);
    reviewWrite_("ReviewVersionChecks", row?._rowNumber, { evaluation_id: run.evaluation_id, status: payload.status,
      report_json: JSON.stringify(report), checked_at: now_() });
    return { ok: true };
  });
}

function reviewApproveVersionException_(payload) {
  return withReviewLock_(() => {
    const { viewer, run } = reviewOwnedRun_(payload);
    const preparation = reviewRows_("ReviewPreparation").find(row => row.evaluation_id === run.evaluation_id);
    const checkpointError = reviewQueue_(payload, viewer.role === "admin").jobs.find(item => item.evaluation_id === run.evaluation_id)?.hf_check_error || "";
    if (run.bundle_commit || reviewWorkflow_(run.evaluation_id).stages[1].done ||
        !String((preparation?.message || "") + checkpointError).includes("NO_LEGAL_VERSION")) throw new Error("Only a blocked no-legal-version request can receive this exception.");
    const reason = requiredString_(payload.reason, "Accepted argument and approval reason");
    if (!isTruthy_(payload.argument_reviewed)) throw new Error("Confirm that you reviewed the participant's email argument.");
    const old = reviewRows_("ReviewVersionDecisions").find(row => row.evaluation_id === run.evaluation_id);
    reviewWrite_("ReviewVersionDecisions", old?._rowNumber, { evaluation_id: run.evaluation_id, cutoff_at: now_(), reason,
      approved_by: viewer.email, approved_at: now_(), generation: Number(old?.generation || 0) + 1 });
    reviewPreparationStatus_(run.evaluation_id, "pending", "");
    return { ok: true, status: "queued" };
  });
}

function reviewReassign_(payload) {
  return withReviewLock_(() => {
    const { viewer, run } = reviewOwnedRun_(payload, true);
    if (viewer.role !== "admin") throw new Error("Only organizers can reassign requests.");
    if (reviewWorkflow_(run.evaluation_id).stages[1].done || reviewTaskRows_(run.evaluation_id).some(row => row.status !== "superseded")) throw new Error("Local code handoff or evaluation has started; reassignment is locked.");
    const owner = requiredEmail_(payload.assign_to);
    const reason = requiredString_(payload.reason, "Reassignment reason");
    if (!reviewRows_("Reviewers").some(row => normalizeEmail_(row.email) === owner && isTruthy_(row.active) &&
        (["evaluator", "admin"].includes(row.role) || owner === "1070055979@qq.com" && row.role === "supervisor"))) {
      throw new Error("Reviewer is not active or is read-only/non-assigned.");
    }
    reviewWrite_("ReviewAssignments", null, { evaluation_id: run.evaluation_id, previous_reviewer: run.reviewer_email,
      reviewer_email: owner, reason, changed_by: viewer.email, changed_at: now_() });
    reviewWrite_("ReviewRuns", run._rowNumber, { evaluation_id: run.evaluation_id, reviewer_email: owner, updated_at: now_() });
    return { ok: true };
  });
}

function reviewEnsureRun_(payload) {
  return withReviewLock_(() => {
    const viewer = reviewerIdentity_(payload);
    if (viewer.role !== "admin") throw new Error("Organizer access required.");
    const job = reviewJob_(payload.evaluation_id);
    const run = reviewRun_(job.evaluation.evaluation_id);
    if (!run) reviewWrite_("ReviewRuns", null, { evaluation_id: job.evaluation.evaluation_id,
      submission_id: job.submission.submission_id, participant_email: normalizeEmail_(job.submission.email),
      reviewer_email: "", state: "unassigned", updated_at: now_() });
    return { ok: true, evaluation_id: job.evaluation.evaluation_id, reviewer_email: run?.reviewer_email || "" };
  });
}

function reviewReleaseAssignments_(payload) {
  return withReviewLock_(() => {
    const viewer = reviewerIdentity_(payload);
    if (viewer.role !== "admin") throw new Error("Organizer access required.");
    const email = requiredEmail_(payload.email);
    const reason = requiredString_(payload.reason, "Unassignment reason");
    const runs = reviewRows_("ReviewRuns").filter(row => normalizeEmail_(row.reviewer_email) === email);
    if (runs.some(run => reviewWorkflow_(run.evaluation_id).stages[1].done || reviewTaskRows_(run.evaluation_id).some(row => row.status !== "superseded"))) {
      throw new Error("Local code handoff or evaluation has started; unassignment is locked.");
    }
    runs.forEach(run => {
      reviewWrite_("ReviewAssignments", null, { evaluation_id: run.evaluation_id, previous_reviewer: email,
        reviewer_email: "", reason, changed_by: viewer.email, changed_at: now_() });
      reviewWrite_("ReviewRuns", run._rowNumber, { evaluation_id: run.evaluation_id, reviewer_email: "", state: "unassigned", updated_at: now_() });
    });
    return { ok: true, released: runs.length, email };
  });
}
