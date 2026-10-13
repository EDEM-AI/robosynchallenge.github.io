/** Temporary assignments are reversible; tester forms never write production progress. */
function reviewStartTestAssignment_(payload) {
  return withReviewLock_(() => {
    const viewer = reviewerIdentity_(payload);
    if (viewer.role !== "admin") throw new Error("Organizer access required.");
    const target = requiredEmail_(payload.email), previous = requiredEmail_(payload.previous_email);
    const id = String(payload.test_id || ""), ids = payload.evaluation_ids;
    if (!/^test_[a-f0-9]{32}$/.test(id) || !Array.isArray(ids) || ids.length !== 5 || new Set(ids).size !== 5 ||
        ids.some(value => !/^eval_[A-Za-z0-9]+$/.test(value)) || target === previous) throw new Error("Select five distinct current requests and a stable test ID.");
    const account = reviewRows_("Reviewers").find(row => normalizeEmail_(row.email) === target);
    if (account?.role !== "tester" || !isTruthy_(account.active)) throw new Error("Provision an active tester account first.");
    const properties = PropertiesService.getScriptProperties(), key = "REVIEW_TEST_" + id;
    let receipt = parseJson_(properties.getProperty(key), null);
    if (receipt && (receipt.email !== target || receipt.previous_email !== previous || JSON.stringify(receipt.evaluation_ids) !== JSON.stringify(ids))) throw new Error("Test ID belongs to different assignments.");
    if (receipt?.status === "restored") throw new Error("This test was restored; use a new test ID.");
    if (receipt?.status === "active") return {ok:true, duplicate:true, ...receipt};
    const current = reviewQueue_(payload, true).jobs;
    ids.forEach(value => {
      const run = reviewRun_(value);
      if (!run || !current.some(job => job.evaluation_id === value && job.submission_id === run.submission_id) ||
          ![previous, target].includes(normalizeEmail_(run.reviewer_email))) throw new Error("A selected request changed owner or submission; refresh first.");
    });
    receipt = receipt || {test_id:id, email:target, previous_email:previous, evaluation_ids:ids, status:"preparing", backups:{}, submissions:{}, created_at:now_()};
    properties.setProperty(key, JSON.stringify(receipt));
    ids.forEach(value => {
      const run = reviewRun_(value);
      if (!receipt.backups[value]) {
        receipt.backups[value] = reviewBackupProgress_(run, "Temporary browser-local tester assignment " + id);
        receipt.submissions[value] = run.submission_id;
        properties.setProperty(key, JSON.stringify(receipt));
      }
      if (normalizeEmail_(run.reviewer_email) === target) return;
      reviewWrite_("ReviewAssignments", null, {evaluation_id:value, previous_reviewer:previous,
        reviewer_email:target, reason:"Temporary test " + id + "; progress is browser-local", changed_by:viewer.email, changed_at:now_()});
      reviewWrite_("ReviewRuns", run._rowNumber, {evaluation_id:value, reviewer_email:target, updated_at:now_()});
    });
    receipt.status = "active";
    properties.setProperty(key, JSON.stringify(receipt));
    return {ok:true, ...receipt};
  });
}

function reviewRestoreTestAssignment_(payload) {
  return withReviewLock_(() => {
    const viewer = reviewerIdentity_(payload);
    if (viewer.role !== "admin") throw new Error("Organizer access required.");
    const id = String(payload.test_id || "");
    if (!/^test_[a-f0-9]{32}$/.test(id)) throw new Error("Invalid test ID.");
    const properties = PropertiesService.getScriptProperties(), key = "REVIEW_TEST_" + id;
    const receipt = parseJson_(properties.getProperty(key), null);
    if (!receipt) throw new Error("Unknown test assignment.");
    if (receipt.status === "formalized") throw new Error("This reviewer is now a formal evaluator; temporary restoration is disabled.");
    if (receipt.status === "restored") return {ok:true, duplicate:true, ...receipt};
    receipt.evaluation_ids.forEach(value => {
      const run = reviewRun_(value);
      if (!run || run.submission_id !== receipt.submissions[value] ||
          ![receipt.email, receipt.previous_email].includes(normalizeEmail_(run.reviewer_email))) throw new Error("Request owner/submission changed; organizer reconciliation required.");
    });
    receipt.evaluation_ids.forEach(value => {
      const run = reviewRun_(value);
      if (normalizeEmail_(run.reviewer_email) === receipt.previous_email) return;
      // Keep legitimate preparation/HF updates made during the test; restore ownership only.
      reviewWrite_("ReviewRuns", run._rowNumber, {evaluation_id:value, reviewer_email:receipt.previous_email, updated_at:now_()});
      reviewWrite_("ReviewAssignments", null, {evaluation_id:value, previous_reviewer:receipt.email,
        reviewer_email:receipt.previous_email, reason:"Restore temporary test " + id, changed_by:viewer.email, changed_at:now_()});
    });
    const account = reviewRows_("Reviewers").find(row => normalizeEmail_(row.email) === receipt.email);
    if (account?.role === "tester" && !reviewRows_("ReviewRuns").some(row => normalizeEmail_(row.reviewer_email) === receipt.email)) {
      reviewWrite_("Reviewers", account._rowNumber, {email:receipt.email, active:"false"});
    }
    receipt.status = "restored"; receipt.restored_at = now_();
    properties.setProperty(key, JSON.stringify(receipt));
    return {ok:true, ...receipt};
  });
}

function reviewPromoteTestAssignment_(payload) {
  return withReviewLock_(() => {
    const viewer = reviewerIdentity_(payload);
    if (viewer.role !== "admin") throw new Error("Organizer access required.");
    const id = String(payload.test_id || "");
    if (!/^test_[a-f0-9]{32}$/.test(id)) throw new Error("Invalid test ID.");
    const properties = PropertiesService.getScriptProperties(), key = "REVIEW_TEST_" + id;
    const receipt = parseJson_(properties.getProperty(key), null);
    if (!receipt || !["active", "formalized"].includes(receipt.status)) throw new Error("Promote an active test assignment.");
    const account = reviewRows_("Reviewers").find(row => normalizeEmail_(row.email) === receipt.email);
    if (!account || !isTruthy_(account.active) || !["tester", "evaluator"].includes(account.role)) throw new Error("Test account identity changed.");
    receipt.evaluation_ids.forEach(value => {
      if (normalizeEmail_(reviewRun_(value)?.reviewer_email) !== receipt.email) throw new Error("A test request changed owner; reconcile before promotion.");
    });
    const pins = parseJson_(properties.getProperty("REVIEW_FORMAL_ASSIGNMENT_PINS"), {});
    receipt.evaluation_ids.forEach(value => {
      if (pins[value] && pins[value] !== receipt.email) throw new Error("Pinned assignment conflicts with another evaluator.");
      pins[value] = receipt.email;
    });
    // Pin ownership before pool admission; keep the existing credential and progress.
    properties.setProperty("REVIEW_FORMAL_ASSIGNMENT_PINS", JSON.stringify(pins));
    reviewWrite_("Reviewers", account._rowNumber, {email:receipt.email, role:"evaluator", active:"true"});
    const duplicate = receipt.status === "formalized";
    receipt.status = "formalized"; receipt.promoted_at = receipt.promoted_at || now_();
    properties.setProperty(key, JSON.stringify(receipt));
    return {ok:true, status:"formalized", duplicate, email:receipt.email, role:"evaluator", token_retained:true,
      evaluation_ids:receipt.evaluation_ids};
  });
}
