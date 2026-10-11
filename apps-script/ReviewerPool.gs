/** Active evaluator accounts are the pool. Observers and organizers never enter it. */
function reviewPoolPolicy_() {
  const saved = parseJson_(config_("REVIEW_POOL_POLICY", ""), {});
  return { enabled: saved.enabled === true, minimum_evaluators: Number(saved.minimum_evaluators || 2) };
}

function reviewPoolSnapshot_(payload) {
  const workbook = spreadsheet_();
  const viewer = reviewerIdentity_(payload, workbook);
  if (viewer.role !== "admin") throw new Error("Organizer access required.");
  const snapshot = reviewReadTables_(workbook, ["Users", "Submissions", "Evaluations", "Reviewers", "ReviewRuns",
    "ReviewProgress", "ReviewTaskResults", "ReviewTaskCommands", "ReviewArchiveUploads", "ReviewSubmissionWindows"]).rows;
  const runs = new Map(snapshot.ReviewRuns.map(row => [String(row.evaluation_id), row]));
  const jobs = latestReviewSubmissions_(workbook, snapshot.ReviewSubmissionWindows, snapshot).map(job => {
    const id = String(job.evaluation.evaluation_id);
    const run = runs.get(id);
    if (run && String(run.submission_id) !== String(job.submission.submission_id)) throw new Error("Assignment submission identity changed.");
    const workflow = reviewWorkflow_(id, snapshot.ReviewProgress);
    const completed = run?.state === "checked" || workflow.stages[4].done;
    const locked = completed || workflow.stages.slice(1).some(stage => stage.done || Object.values(stage.checks).some(value => value === true)) ||
      snapshot.ReviewTaskResults.some(row => String(row.evaluation_id) === id && row.status !== "superseded") ||
      snapshot.ReviewTaskCommands.some(row => String(row.evaluation_id) === id) ||
      snapshot.ReviewArchiveUploads.some(row => String(row.evaluation_id) === id);
    return { ...job, run, locked, completed };
  });
  return { viewer, jobs, accounts: snapshot.Reviewers };
}

function reviewPoolReport_(snapshot, extra) {
  const accounts = snapshot.accounts.map(account => {
    const jobs = snapshot.jobs.filter(job => normalizeEmail_(job.run?.reviewer_email) === normalizeEmail_(account.email));
    return { email: normalizeEmail_(account.email), role: account.role, active: isTruthy_(account.active),
      in_pool: account.role === "evaluator" && isTruthy_(account.active), assigned: jobs.length,
      active_requests: jobs.filter(job => !job.completed).length,
      locked: jobs.filter(job => job.locked && !job.completed).length,
      completed: jobs.filter(job => job.completed).length };
  }).sort((a, b) => a.email.localeCompare(b.email));
  return { ok: true, policy: reviewPoolPolicy_(), accounts, latest_requests: snapshot.jobs.length,
    unassigned: snapshot.jobs.filter(job => !job.run?.reviewer_email).length, ...extra };
}

function reviewPool_(payload) {
  return reviewPoolReport_(reviewPoolSnapshot_(payload));
}

function reviewMoveEvaluatorEmail_(payload) {
  return withReviewLock_(() => {
    const viewer = reviewerIdentity_(payload);
    if (viewer.role !== "admin") throw new Error("Organizer access required.");
    const previous = requiredEmail_(payload.previous_email);
    const email = requiredEmail_(payload.email);
    if (previous === email) throw new Error("Choose a different email.");
    const accounts = reviewRows_("Reviewers");
    const old = accounts.find(row => normalizeEmail_(row.email) === previous);
    const target = accounts.find(row => normalizeEmail_(row.email) === email);
    if (!old || old.role !== "evaluator" || (target && (target.role !== "evaluator" || target.token_sha256 !== old.token_sha256))) throw new Error("Evaluator identity conflicts with the target account.");
    if (isTruthy_(old.active) || !target) reviewWrite_("Reviewers", target?._rowNumber, {
      email, token_sha256: old.token_sha256, role: "evaluator", active: "true", created_at: target?.created_at || old.created_at });
    // This is the same evaluator changing email, not reassignment of local work.
    const runs = reviewRows_("ReviewRuns").filter(row => normalizeEmail_(row.reviewer_email) === previous);
    runs.forEach(run => {
      reviewWrite_("ReviewAssignments", null, { evaluation_id: run.evaluation_id, previous_reviewer: previous,
        reviewer_email: email, reason: "Same evaluator changed login email; token and progress retained", changed_by: viewer.email, changed_at: now_() });
      reviewWrite_("ReviewRuns", run._rowNumber, { evaluation_id: run.evaluation_id, reviewer_email: email, updated_at: now_() });
    });
    reviewWrite_("Reviewers", old._rowNumber, { email: previous, active: "false" });
    return { ok: true, email, previous_email: previous, moved: runs.length, token_retained: true };
  });
}

function reviewSetPool_(payload) {
  return withReviewLock_(() => {
    const snapshot = reviewPoolSnapshot_(payload);
    if (payload.email != null) {
      const email = requiredEmail_(payload.email);
      const account = snapshot.accounts.find(row => normalizeEmail_(row.email) === email);
      if (!account || account.role !== "evaluator") throw new Error("Only an existing evaluator can enter or leave the pool. Provision its account first.");
      if (typeof payload.active !== "boolean") throw new Error("Pool membership must be true or false.");
    }
    const policy = reviewPoolPolicy_();
    if (payload.enabled != null) {
      if (typeof payload.enabled !== "boolean") throw new Error("Automatic balancing must be true or false.");
      policy.enabled = payload.enabled;
    }
    if (payload.minimum_evaluators != null) {
      if (!Number.isInteger(payload.minimum_evaluators) || payload.minimum_evaluators < 1 || payload.minimum_evaluators > 100) throw new Error("Minimum evaluator count must be between 1 and 100.");
      policy.minimum_evaluators = payload.minimum_evaluators;
    }
    if (payload.email != null) {
      const account = snapshot.accounts.find(row => normalizeEmail_(row.email) === normalizeEmail_(payload.email));
      reviewWrite_("Reviewers", account._rowNumber, { active: String(payload.active) });
      account.active = String(payload.active);
    }
    PropertiesService.getScriptProperties().setProperty("REVIEW_POOL_POLICY", JSON.stringify(policy));
    return reviewPoolReport_(snapshot);
  });
}

function reviewBalancePool_(payload) {
  return withReviewLock_(() => {
    const snapshot = reviewPoolSnapshot_(payload);
    const policy = reviewPoolPolicy_();
    const pool = snapshot.accounts.filter(row => row.role === "evaluator" && isTruthy_(row.active))
      .map(row => normalizeEmail_(row.email)).sort();
    if (!policy.enabled || pool.length < policy.minimum_evaluators) return reviewPoolReport_(snapshot, {
      state: policy.enabled ? "waiting_evaluators" : "disabled", changed: 0 });
    const load = new Map(pool.map(email => [email, 0]));
    const movable = [];
    snapshot.jobs.forEach(job => {
      const owner = normalizeEmail_(job.run?.reviewer_email);
      if (job.completed) return;
      if (job.locked || (owner && !pool.includes(owner) && snapshot.accounts.some(row => normalizeEmail_(row.email) === owner && row.role !== "evaluator"))) {
        if (load.has(owner)) load.set(owner, load.get(owner) + 1);
      } else {
        if (load.has(owner)) load.set(owner, load.get(owner) + 1);
        movable.push(job);
      }
    });
    const plan = new Map();
    const assign = (job, owner) => {
      plan.set(String(job.evaluation.evaluation_id), { job, owner });
      load.set(owner, load.get(owner) + 1);
    };
    const leastLoaded = () => [...pool].sort((a, b) => load.get(a) - load.get(b) || a.localeCompare(b))[0];
    // Keep current owners unless a move reduces the active workload imbalance.
    movable.filter(job => !load.has(normalizeEmail_(job.run?.reviewer_email))).forEach(job => assign(job, leastLoaded()));
    while (true) {
      const low = leastLoaded();
      const high = [...pool].filter(email => movable.some(job =>
        (plan.get(String(job.evaluation.evaluation_id))?.owner || normalizeEmail_(job.run?.reviewer_email)) === email))
        .sort((a, b) => load.get(b) - load.get(a) || a.localeCompare(b))[0];
      if (!high) break;
      if (load.get(high) - load.get(low) <= 1) break;
      const candidate = [...movable].reverse().find(job => (plan.get(String(job.evaluation.evaluation_id))?.owner || normalizeEmail_(job.run?.reviewer_email)) === high);
      if (!candidate) break;
      load.set(high, load.get(high) - 1);
      assign(candidate, low);
    }
    let changed = 0;
    plan.forEach(({ job, owner }) => {
      const previous = normalizeEmail_(job.run?.reviewer_email);
      if (previous === owner) return;
      const id = String(job.evaluation.evaluation_id);
      const timestamp = now_();
      reviewWrite_("ReviewRuns", job.run?._rowNumber, { evaluation_id: id, submission_id: job.submission.submission_id,
        participant_email: normalizeEmail_(job.submission.email), reviewer_email: owner,
        state: job.run?.state && job.run.state !== "unassigned" ? job.run.state : "assigned",
        assigned_at: timestamp, updated_at: timestamp });
      reviewWrite_("ReviewAssignments", null, { evaluation_id: id, previous_reviewer: previous, reviewer_email: owner,
        reason: "Automatic evaluator-pool workload balance", changed_by: snapshot.viewer.email, changed_at: timestamp });
      job.run = { ...job.run, reviewer_email: owner };
      changed += 1;
    });
    return reviewPoolReport_(snapshot, { state: "balanced", changed,
      locked_outside_pool: snapshot.jobs.filter(job => job.locked && !job.completed && job.run?.reviewer_email && !pool.includes(normalizeEmail_(job.run.reviewer_email))).length });
  });
}
