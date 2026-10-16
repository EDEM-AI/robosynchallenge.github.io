/** Completed uploads keep their exact evaluation generation, independently of final review. */
function reviewAssertCompletedSnapshotMutable_(evaluationId) {
  if (reviewWorkflow_(evaluationId).stages[3].done) throw new Error("Evaluation upload is complete; its code, results and progress are frozen.");
}

function reviewPreparationClaimKey_(evaluationId) { return "REVIEW_PREPARATION_CLAIM_" + evaluationId; }

function reviewPreparationClaim_(evaluationId) {
  return parseJson_(PropertiesService.getScriptProperties().getProperty(reviewPreparationClaimKey_(evaluationId)), null);
}

function reviewAssertPreparationMutable_(payload, evaluationId) {
  reviewAssertCompletedSnapshotMutable_(evaluationId);
  const claim = reviewPreparationClaim_(evaluationId);
  if (claim && claim.operation_id !== payload.preparation_operation) throw new Error("An automatic code update is in progress; retry after it finishes.");
}

function reviewAssertAutomaticPreparationMutable_(payload, evaluationId) {
  reviewAssertPreparationMutable_(payload, evaluationId);
  if (reviewWorkflow_(evaluationId).stages[1].done || reviewTaskRows_(evaluationId).length ||
      reviewRows_("ReviewArchiveUploads").some(row => row.evaluation_id === evaluationId && row.status !== "superseded") ||
      reviewRows_("ReviewTaskCommands").some(row => row.evaluation_id === evaluationId && row.command)) {
    throw new Error("Evaluation has started; automatic tool updates preserve its existing code and partial results.");
  }
}

function reviewFinishPreparationClaim_(payload, evaluationId) {
  const claim = reviewPreparationClaim_(evaluationId);
  if (claim && claim.operation_id === payload.preparation_operation) {
    PropertiesService.getScriptProperties().deleteProperty(reviewPreparationClaimKey_(evaluationId));
  }
}

function reviewClaimPreparation_(payload, release) {
  return withReviewLock_(() => {
    const {viewer, run} = reviewOwnedRun_(payload, true);
    if (viewer.role !== "admin") throw new Error("Organizer access required.");
    if (!/^[a-f0-9]{64}$/.test(payload.preparation_operation || "")) throw new Error("Use an immutable preparation operation ID.");
    const previous = reviewPreparationClaim_(run.evaluation_id);
    if (release) {
      if (previous && previous.operation_id !== payload.preparation_operation) throw new Error("Another publisher owns this operation.");
      reviewFinishPreparationClaim_(payload, run.evaluation_id);
      return {ok:true, released:true};
    }
    reviewAssertAutomaticPreparationMutable_(payload, run.evaluation_id);
    const job = reviewQueue_(payload, true).jobs.find(item => item.evaluation_id === run.evaluation_id);
    const expected = run.bundle_commit || job.code_bundle_commit || "";
    if (payload.expected_bundle_commit !== expected || payload.context_json !== reviewCheckpointContext_(job)) throw new Error("Prepared request changed before publication.");
    if (previous && (previous.expected_bundle_commit !== expected || previous.context_json !== payload.context_json)) throw new Error("Unresolved publication requires recovery before continuing.");
    // An unresolved claim never expires into permission to finish stage four while a push may still be running.
    PropertiesService.getScriptProperties().setProperty(reviewPreparationClaimKey_(run.evaluation_id), JSON.stringify({
      operation_id:payload.preparation_operation, expected_bundle_commit:expected,
      context_json:payload.context_json, claimed_at:previous?.claimed_at || now_(), updated_at:now_()}));
    return {ok:true, claimed:true};
  });
}
