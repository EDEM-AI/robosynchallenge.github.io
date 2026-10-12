/** Back up selected inputs and progress before invalidating evidence. */
function reviewBackupProgress_(run, reason) {
  const backupId = "backup_" + Utilities.getUuid().replace(/-/g, "");
  const tables = ["ReviewRuns", "ReviewProgress", "ReviewTaskResults", "ReviewTaskCommands", "ReviewCodePreparations",
    "ReviewVersionChecks", "ReviewCorrections", "ReviewAccessChecks", "ReviewCheckpointChecks", "ReviewPreparation",
    "ReviewUploadAccess", "ReviewArchiveUploads", "ReviewToolUpgrades"];
  tables.forEach(name => reviewRows_(name).filter(row => row.evaluation_id === run.evaluation_id).forEach(row => {
    const data = JSON.stringify(row);
    for (let offset = 0; offset < data.length; offset += 20000) {
      reviewWrite_("ReviewProgressBackups", null, { backup_id: backupId, evaluation_id: run.evaluation_id,
        table_name: name, row_key: String(row._rowNumber), part: offset / 20000,
        snapshot_json: data.slice(offset, offset + 20000), reason, created_at: now_() });
    }
  }));
  SpreadsheetApp.flush();
  return backupId;
}

/** Repeatable organizer maintenance: preserve submitted versions, not a new participant revision. */
function reviewMigrateBundle_(payload) {
  return withReviewLock_(() => {
    const {viewer, run} = reviewOwnedRun_(payload, true);
    if (viewer.role !== "admin") throw new Error("Organizer access required.");
    const job = reviewQueue_(payload, true).jobs.find(item => item.evaluation_id === run.evaluation_id);
    const formal = Boolean(run.bundle_commit);
    const previous = run.bundle_commit || job.code_bundle_commit;
    const code = reviewRows_("ReviewCodePreparations").find(row => row.evaluation_id === run.evaluation_id);
    if (payload.bundle_commit === previous && payload.private_base_commit === code?.private_base_commit) return {ok:true, duplicate:true};
    if (payload.context_json !== reviewCheckpointContext_(job) || payload.formal !== formal || payload.expected_bundle_commit !== previous) {
      throw new Error("Prepared request changed during organizer upgrade; retry with fresh inputs.");
    }
    if (![payload.bundle_commit, payload.private_base_commit, payload.participant_commit].every(value => /^[a-f0-9]{40}$/.test(String(value || ""))) ||
        payload.participant_commit !== code?.participant_commit || !Array.isArray(payload.policy_dirs) || !payload.policy_dirs.length ||
        JSON.stringify([...payload.policy_dirs].sort()) !== JSON.stringify(parseJson_(code.policy_dirs_json, []).sort()) ||
        (formal && !/^upl_[a-f0-9]{64}$/.test(payload.scoped_upload_token || ""))) throw new Error("Organizer upgrade must preserve the pinned participant policy.");
    const reason = "Official evaluation tools/reference upgraded; participant code and checkpoints unchanged. Previous progress and evidence backed up; clone the updated eval branch.";
    const backupId = reviewBackupProgress_(run, reason);
    if (formal) {
      const workflow = reviewWorkflow_(run.evaluation_id);
      const version = reviewRows_("ReviewVersionChecks").find(row => row.evaluation_id === run.evaluation_id);
      const access = reviewRows_("ReviewAccessChecks").find(row => row.evaluation_id === run.evaluation_id);
      const checkpoint = reviewRows_("ReviewCheckpointChecks").find(row => row.evaluation_id === run.evaluation_id);
      reviewResetParticipantProgress_(run, job.task_checkpoint_links, reason);
      const reset = reviewWorkflow_(run.evaluation_id);
      reset.stages[0] = workflow.stages[0];
      reviewStoreWorkflow_(run, reset);
      if (version) reviewWrite_("ReviewVersionChecks", version._rowNumber, version);
      if (access) reviewWrite_("ReviewAccessChecks", access._rowNumber, access);
      if (checkpoint) reviewWrite_("ReviewCheckpointChecks", checkpoint._rowNumber, checkpoint);
      const capability = reviewRows_("ReviewUploadAccess").find(row => row.evaluation_id === run.evaluation_id);
      reviewWrite_("ReviewUploadAccess", capability?._rowNumber, {evaluation_id:run.evaluation_id,
        token_hash:reviewerHash_(payload.scoped_upload_token), expires_at:new Date(Date.now()+60*86400000).toISOString(), revoked:"", created_at:now_()});
    }
    const url = "https://github.com/" + REVIEW_PRIVATE_REPO + "/tree/" + run.evaluation_id;
    reviewWrite_("ReviewCodePreparations", code._rowNumber, {...code, bundle_url:url,
      bundle_commit:payload.bundle_commit, private_base_commit:payload.private_base_commit, updated_at:now_()});
    if (formal) reviewWrite_("ReviewRuns", run._rowNumber, {evaluation_id:run.evaluation_id, bundle_url:url,
      bundle_commit:payload.bundle_commit, policy_dirs_json:JSON.stringify(payload.policy_dirs), state:"ready", updated_at:now_()});
    reviewPreparationStatus_(run.evaluation_id, formal ? "ready" : "code_ready", "");
    return {ok:true, state:"upgraded", backup_id:backupId};
  });
}

function reviewUpgradeTools_(payload) {
  return withReviewLock_(() => {
    const {viewer, run} = reviewOwnedRun_(payload, true);
    if (viewer.role !== "admin") throw new Error("Organizer access required.");
    const base = String(payload.base_commit || "");
    if (!/^[a-f0-9]{40}$/.test(base)) throw new Error("Pin the official tools commit.");
    const previous = reviewRows_("ReviewToolUpgrades").find(row => row.evaluation_id === run.evaluation_id);
    if (previous?.base_commit === base) return {ok: true, state: "already_queued", backup_id: previous.backup_id};
    const job = reviewQueue_(payload, true).jobs.find(item => item.evaluation_id === run.evaluation_id);
    if (job.bundle_commit && job.code_base_commit === base) {
      reviewWrite_("ReviewToolUpgrades", previous?._rowNumber, {evaluation_id: run.evaluation_id, base_commit: base,
        previous_bundle_commit: run.bundle_commit, selection_json: JSON.stringify({...job.version_report,
          preparation_attempt: job.preparation_attempt, version_generation: job.version_generation}),
        backup_id: "", updated_at: now_()});
      return {ok: true, state: "already_current", backup_id: ""};
    }
    if (String(payload.expected_bundle_commit || "") !== String(run.bundle_commit || "")) throw new Error("Prepared code changed; refresh before maintenance.");
    const reason = "Official recording/upload tools upgraded. Use the new clone; prior evidence and progress are backed up.";
    const backupId = reviewBackupProgress_(run, reason);
    const workflow = reviewWorkflow_(run.evaluation_id);
    const version = reviewRows_("ReviewVersionChecks").find(row => row.evaluation_id === run.evaluation_id);
    const access = reviewRows_("ReviewAccessChecks").find(row => row.evaluation_id === run.evaluation_id);
    const selection = job.bundle_commit ? {...job.version_report, preparation_attempt: job.preparation_attempt, version_generation: job.version_generation} : {};
    if (job.bundle_commit && !/^[a-f0-9]{40}$/.test(selection.code?.revision || "")) throw new Error("Cannot upgrade without the original pinned participant revision.");
    reviewResetParticipantProgress_(run, job.task_checkpoint_links, reason);
    // The submission access check remains valid: only the organizer tools changed.
    const reset = reviewWorkflow_(run.evaluation_id);
    reset.stages[0] = workflow.stages[0];
    reviewStoreWorkflow_(run, reset);
    if (version) reviewWrite_("ReviewVersionChecks", version._rowNumber, {...version, evaluation_id: run.evaluation_id});
    if (access) reviewWrite_("ReviewAccessChecks", access._rowNumber, {...access, evaluation_id: run.evaluation_id});
    reviewWrite_("ReviewToolUpgrades", previous?._rowNumber, {evaluation_id: run.evaluation_id, base_commit: base,
      previous_bundle_commit: run.bundle_commit, selection_json: JSON.stringify(selection), backup_id: backupId, updated_at: now_()});
    return {ok: true, state: "queued", backup_id: backupId};
  });
}

function reviewResetParticipantProgress_(run, links, reason) {
  const previous = reviewWorkflow_(run.evaluation_id);
  reviewTaskRows_(run.evaluation_id).forEach(row => reviewWrite_("ReviewTaskResults", row._rowNumber,
    { evaluation_id: run.evaluation_id, status: "superseded", updated_at: now_() }));
  reviewRows_("ReviewArchiveUploads").filter(row => row.evaluation_id === run.evaluation_id).forEach(row => {
    PropertiesService.getScriptProperties().deleteProperty(archiveSessionKey_(row.upload_id));
    reviewWrite_("ReviewArchiveUploads", row._rowNumber, { evaluation_id: run.evaluation_id, status: "superseded", updated_at: now_() });
  });
  const access = reviewRows_("ReviewUploadAccess").find(row => row.evaluation_id === run.evaluation_id);
  if (access) reviewWrite_("ReviewUploadAccess", access._rowNumber, { evaluation_id: run.evaluation_id, revoked: "true" });
  reviewWrite_("ReviewRuns", run._rowNumber, { evaluation_id: run.evaluation_id, bundle_commit: "", bundle_url: "",
    policy_dirs_json: "[]", task_checkpoint_links_json: JSON.stringify(links), state: run.reviewer_email ? "assigned" : "unassigned", updated_at: now_() });
  reviewStoreWorkflow_(run, { machine_id: previous.machine_id,
    stages: REVIEW_STAGES.map((_, index) => index === 2 ? previous.stages[2] : ({ done: false, checks: {}, completed_at: "" })) });
  reviewRows_("ReviewTaskCommands").filter(row => row.evaluation_id === run.evaluation_id).forEach(row =>
    reviewWrite_("ReviewTaskCommands", row._rowNumber, { evaluation_id: run.evaluation_id, bundle_commit: "", command: "", updated_at: now_() }));
  const check = reviewRows_("ReviewAccessChecks").find(row => row.evaluation_id === run.evaluation_id);
  if (check) reviewWrite_("ReviewAccessChecks", check._rowNumber, { evaluation_id: run.evaluation_id, report_json: "", checked_at: "" });
  const version = reviewRows_("ReviewVersionChecks").find(row => row.evaluation_id === run.evaluation_id);
  if (version) reviewWrite_("ReviewVersionChecks", version._rowNumber, { evaluation_id: run.evaluation_id, status: "pending", report_json: "", checked_at: "" });
  reviewPreparationStatus_(run.evaluation_id, "pending", reason);
}

function reviewReconcileFinalProgress_(payload) {
  return withReviewLock_(() => {
    const { viewer, run } = reviewOwnedRun_(payload, true);
    if (viewer.role !== "admin") throw new Error("Organizer preparation access required.");
    const job = reviewQueue_(payload, true).jobs.find(item => item.evaluation_id === run.evaluation_id);
    if (payload.context_json !== reviewCheckpointContext_(job)) throw new Error("Participant inputs changed during final progress check.");
    if (Date.now() < Date.parse(job.version_cutoff_at)) throw new Error("Wait until the version cutoff.");
    const selected = payload.report;
    if (!selected || !/^[a-f0-9]{40}$/.test(selected.code?.revision || "") || selected.code.cutoff_at !== job.version_cutoff_at ||
        Object.keys(selected.hf || {}).length !== 10 || Object.keys(REVIEW_TASK_STEPS).some(task => !selected.hf[task]?.accessible ||
        selected.hf[task].url !== job.task_checkpoint_links[task] || !/^[a-f0-9]{40}$/.test(selected.hf[task].revision || "") || selected.hf[task].cutoff_at !== job.version_cutoff_at)) throw new Error("Final progress check requires the current code and all ten checkpoint receipts.");
    const limit = Date.parse(job.version_cutoff_at);
    if (JSON.stringify(selected).length > 30000 || ![selected.code.committed_at, selected.code.authored_at].every(value =>
        Number.isFinite(Date.parse(value)) && Date.parse(value) < limit) || Object.values(selected.hf).some(row =>
        !Number.isFinite(Date.parse(row.committed_at)) || Date.parse(row.committed_at) >= limit ||
        !Number.isInteger(row.files_checked) || row.files_checked < 1 || row.files_checked > 10000)) throw new Error("Invalid final version timestamps or access receipts.");
    const old = reviewRows_("ReviewVersionChecks").find(row => row.evaluation_id === run.evaluation_id);
    if (!old || old.status !== "provisional") return { ok: true, state: "no_provisional_progress", reset: false };
    const prior = parseJson_(old.report_json, {});
    const unchanged = prior.code?.revision === selected.code.revision && Object.keys(REVIEW_TASK_STEPS).every(task =>
      prior.hf?.[task]?.url === selected.hf[task].url && prior.hf[task].revision === selected.hf[task].revision);
    if (unchanged) {
      const access = reviewRows_("ReviewAccessChecks").find(row => row.evaluation_id === run.evaluation_id);
      reviewWrite_("ReviewAccessChecks", access?._rowNumber, { evaluation_id: run.evaluation_id, report_json: JSON.stringify(selected.hf), checked_at: now_() });
      reviewCheckpointStatus_(job, "passed", "", job.version_cutoff_at);
      reviewWrite_("ReviewVersionChecks", old._rowNumber, { evaluation_id: run.evaluation_id, status: "final", report_json: JSON.stringify(selected), checked_at: now_() });
      return { ok: true, state: "unchanged", reset: false };
    }
    const reason = "Deadline freeze selected different code/checkpoint revisions. Prior progress was backed up; use the new clone and pinned checkpoints.";
    const backupId = reviewBackupProgress_(run, reason);
    reviewResetParticipantProgress_(run, job.task_checkpoint_links, reason);
    return { ok: true, state: "reset", reset: true, backup_id: backupId };
  });
}
