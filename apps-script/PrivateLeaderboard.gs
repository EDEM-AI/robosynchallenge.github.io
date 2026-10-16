/** Authenticated, global, read-only reviewer view. Never use the public leaderboard. */
function reviewPrivateLeaderboard_(payload) {
  const workbook = spreadsheet_();
  // reviewerIdentity_ may provision a missing sheet; this endpoint must never do so.
  if (!workbook.getSheetByName("Reviewers")) throw new Error("Invalid reviewer credentials.");
  reviewerIdentity_(payload, workbook);
  const names = ["Users", "Submissions", "Evaluations", "ReviewRuns", "ReviewTaskResults", "ReviewProgress", "ReviewSubmissionWindows", "ReviewAdjudications"];
  const snapshot = Object.fromEntries(names.map(name => {
    const sheet = workbook.getSheetByName(name);
    if (!sheet) return [name, []];
    const headers = REVIEW_TABLES[name] || SHEETS[name];
    const values = sheet.getDataRange().getValues();
    if (headers.some((header, index) => values[0]?.[index] !== header)) throw new Error(name + " headers changed; review before reading.");
    return [name, values.slice(1).map(cells => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])))];
  }));
  const tasks = Object.keys(REVIEW_TASK_STEPS);
  const runs = new Map(snapshot.ReviewRuns.map(row => [String(row.evaluation_id), row]));
  const adjudications = new Map(snapshot.ReviewAdjudications.map(row => [String(row.evaluation_id), row]));
  const results = new Map();
  snapshot.ReviewTaskResults.filter(row => row.status !== "superseded").forEach(row => {
    const key = String(row.evaluation_id);
    if (!results.has(key)) results.set(key, []);
    results.get(key).push(row);
  });
  const tables = ["overall", ...tasks].map(id => ({ id, rows: [] }));
  latestReviewSubmissions_(workbook, snapshot.ReviewSubmissionWindows, snapshot).forEach(({ submission, evaluation, user }) => {
    const id = String(evaluation.evaluation_id), run = runs.get(id);
    if (!run || String(run.submission_id) !== String(submission.submission_id) || normalizeEmail_(run.participant_email) !== normalizeEmail_(evaluation.email)) return;
    const workflow = reviewWorkflow_(id, snapshot.ReviewProgress);
    const blocked = [run.state, evaluation.status, evaluation.state].some(value => ["invalid", "blocked", "invalid_pending_review"].includes(value)) ||
      adjudications.get(id)?.status === "invalid_pending_review";
    const uploaded = workflow.stages.slice(0, 4).every(stage => stage.done);
    const rows = results.get(id) || [];
    const taskResults = tasks.map(task => {
      const candidates = rows.filter(row => row.task === task);
      if (candidates.length !== 1 || !["submitted", "checked"].includes(candidates[0].status) || String(candidates[0].submission_id) !== String(run.submission_id)) return { task, summary: null, checked: false };
      try {
        const record = reviewValidatedResult_({ result: candidates[0].result_json }, run);
        if (record.task !== task) return { task, summary: null, checked: false };
        return { task, summary: reviewScoredSummary_(record), checked: candidates[0].status === "checked" };
      } catch (error) { return { task, summary: null, checked: false }; }
    });
    const complete = taskResults.filter(row => row.summary?.episodes === 100);
    const reviewed = workflow.stages[4].done && complete.length === 10 && taskResults.every(row => row.checked);
    const base = { evaluation_id: id, model_name: String(submission.artifact_name || evaluation.artifact_name || "Untitled"),
      team_name: String(user.team_name || "Team"), completed_tasks: complete.length,
      review_status: blocked ? "blocked" : !uploaded ? "evaluation_in_progress" : reviewed ? "reviewed" : "pending_review" };
    const overall = reviewOverallSummary_(complete);
    const average = key => complete.length === 10 && complete.every(row => Number.isFinite(row.summary[key]))
      ? complete.reduce((sum, row) => sum + row.summary[key], 0) / 10 : null;
    overall.action_efficiency = average("action_efficiency");
    overall.inference_efficiency = average("inference_efficiency");
    overall.total_inference_seconds = complete.length === 10 && complete.every(row => Number.isFinite(row.summary.total_inference_seconds))
      ? complete.reduce((sum, row) => sum + row.summary.total_inference_seconds, 0) : null;
    const add = (table, summary) => {
      const row = { ...base, ...Object.fromEntries(["success_rate", "average_steps", "inference_ms", "inference_per_episode_ms", "total_inference_seconds", "action_efficiency", "inference_efficiency", "weighted_score"]
        .map(key => [key, Number.isFinite(summary?.[key]) ? summary[key] : null])),
        score_status: summary?.score_status || "missing_or_invalid_result", rank: null };
      if (blocked || !uploaded) { row.weighted_score = null; row.score_status = base.review_status; }
      if (table.id === "overall") {
        row.weighted_all = row.weighted_score;
        if (complete.length !== 10) row.score_status = "incomplete_tasks";
        else if (row.weighted_score === null && !blocked && uploaded) row.score_status = "awaiting_complete_scoring";
      }
      table.rows.push(row);
    };
    add(tables[0], overall);
    taskResults.forEach((result, index) => add(tables[index + 1], result.summary));
  });
  tables.forEach(table => reviewPrivateLeaderboardRank_(table.rows));
  return { ok: true, tables };
}

function reviewPrivateLeaderboardRank_(rows) {
  const compareMetric = (left, right, descending) => {
    const a = Number.isFinite(left), b = Number.isFinite(right);
    if (a !== b) return a ? -1 : 1;
    return a ? (descending ? right - left : left - right) : 0;
  };
  const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  rows.sort((a, b) => compareMetric(a.weighted_score, b.weighted_score, true) ||
    compareMetric(a.success_rate, b.success_rate, true) || compareMetric(a.average_steps, b.average_steps, false) ||
    compareMetric(a.inference_ms, b.inference_ms, false) || compareText(a.model_name, b.model_name) || compareText(a.evaluation_id, b.evaluation_id));
  let rank = 0;
  rows.forEach(row => { row.rank = Number.isFinite(row.weighted_score) ? ++rank : null; });
}
