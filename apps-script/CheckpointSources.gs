/** Preliminary source access is independent of the reviewer-confirmed task mapping. */
function reviewCheckpointSourceContext_(job) {
  return JSON.stringify([job.submission_id, Number(job.preparation_attempt || 0), Number(job.version_generation || 0),
    job.version_cutoff_at, String(job.checkpoint_link || "")]);
}

function reviewCheckpointSourceCheck_(payload) {
  return withReviewLock_(() => {
    const {viewer, run} = reviewOwnedRun_(payload, true);
    if (viewer.role !== "admin") throw new Error("Organizer preparation access required.");
    const job = reviewQueue_(payload, true).jobs.find(item => item.evaluation_id === run.evaluation_id);
    return reviewStoreCheckpointSource_(payload, job);
  });
}

function reviewCheckpointSourcesBatch_(payload) {
  return withReviewLock_(() => {
    if (reviewerIdentity_(payload).role !== "admin") throw new Error("Organizer preparation access required.");
    if (!Array.isArray(payload.checks) || payload.checks.length > 20 || JSON.stringify(payload.checks).length > 45000) throw new Error("Invalid source access batch.");
    const jobs = new Map(reviewQueue_(payload, true).jobs.map(job => [job.evaluation_id, job]));
    const results = payload.checks.map(check => {
      const job = jobs.get(check.evaluation_id);
      if (!job || job.coverage_status !== "legacy_unverified" || check.context_json !== reviewCheckpointSourceContext_(job)) return {evaluation_id:check.evaluation_id, status:"stale_inputs"};
      return {evaluation_id:job.evaluation_id, ...reviewStoreCheckpointSource_(check, job)};
    });
    return {ok:true, results};
  });
}

function reviewStoreCheckpointSource_(payload, job) {
    if (job.coverage_status !== "legacy_unverified" || payload.context_json !== reviewCheckpointSourceContext_(job)) {
      throw new Error("Checkpoint source inputs changed; refresh before recording source access.");
    }
    if (!["passed", "failed", "retry"].includes(payload.status)) throw new Error("Invalid source access status.");
    const report = payload.report || [];
    if (!Array.isArray(report) || report.length > 20 || JSON.stringify(report).length > 20000 ||
        (payload.status === "passed" && (!report.length || report.some(row => row.accessible !== true ||
          !/^https:\/\/huggingface\.co\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/.*)?$/.test(row.url || "") ||
          !/^[a-f0-9]{40}$/.test(row.revision || "") || !Number.isInteger(row.files_checked) || row.files_checked < 1)))) {
      throw new Error("Invalid Hugging Face source receipt.");
    }
    const old = reviewRows_("ReviewCheckpointSources").find(row => row.evaluation_id === job.evaluation_id);
    reviewWrite_("ReviewCheckpointSources", old?._rowNumber, {evaluation_id:job.evaluation_id,
      context_json:payload.context_json, status:payload.status, report_json:JSON.stringify(report),
      message:String(payload.message || "").slice(0,1500), checked_at:now_()});
    return {ok:true, status:payload.status};
}
