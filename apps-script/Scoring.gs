/** Official episode-level scoring; uncalibrated inference references stay unset. */
function reviewConfigureScoring_(payload) {
  return withReviewLock_(() => {
    const viewer = reviewerIdentity_(payload);
    if (viewer.role !== "admin") throw new Error("Organizer access required.");
    const reference = payload.reference;
    const tasks = Object.keys(REVIEW_TASK_STEPS);
    const published = reference?.reference_mode === "published_act_benchmark";
    const publishedValid = published && reference.source_url === "https://github.com/EDEM-AI/RoboSynChallenge/blob/" + reference.official_commit + "/evaluation_results/released_checkpoint_results.json" &&
      reference.seconds_per_call === 0.011607777797617019 && reference.action_horizon === 50;
    if (!reference || reference.schema !== 1 || !/RTX\s*5090/i.test(reference.gpu || "") ||
        !/^[a-f0-9]{40}$/.test(reference.official_commit || "") || !/^[a-f0-9]{64}$/.test(reference.report_sha256 || "") ||
        reference.timing_scope !== "trusted_policy_rpc_wall_time_excluding_simulator" ||
        (published ? !publishedValid : !reference.seconds_per_action_step || Object.keys(reference.seconds_per_action_step).length !== 10 ||
        tasks.some((task) => !Number.isFinite(reference.seconds_per_action_step[task]) || reference.seconds_per_action_step[task] <= 0))) {
      throw new Error("Provide the pinned published RTX 5090 ACT benchmark, or complete measured references, with report hash and timing scope.");
    }
    const safe = { schema: 1, gpu: reference.gpu, official_commit: reference.official_commit,
      report_sha256: reference.report_sha256, timing_scope: reference.timing_scope,
      ...(published ? { reference_mode: "published_act_benchmark", source_url: reference.source_url,
        seconds_per_call: reference.seconds_per_call, action_horizon: reference.action_horizon }
        : { seconds_per_action_step: Object.fromEntries(tasks.map(task => [task, reference.seconds_per_action_step[task]])) }) };
    const current = config_("REVIEW_ACT_SCORING_REFERENCE", "");
    if (current && archiveRecordHash_(JSON.parse(current)) !== archiveRecordHash_(safe)) throw new Error("The competition scoring reference is already frozen; do not replace it mid-evaluation.");
    PropertiesService.getScriptProperties().setProperty("REVIEW_ACT_SCORING_REFERENCE", JSON.stringify(safe));
    return { ok: true, reference_sha256: safe.report_sha256 };
  });
}

function reviewScoredSummary_(record) {
  const episodes = Array.isArray(record.episodes) ? record.episodes : [];
  const count = episodes.length, horizon = REVIEW_TASK_STEPS[record.task];
  const average = values => values.reduce((sum, value) => sum + value, 0) / count;
  const totalsReady = count > 0 && episodes.every(ep => Number.isInteger(ep.inference_calls) && ep.inference_calls > 0 && Number.isFinite(ep.inference_total_ms) && ep.inference_total_ms >= 0);
  const successRate = count ? average(episodes.map(ep => ep.success === true ? 100 : 0)) : null;
  const actionEfficiency = count && horizon ? average(episodes.map(ep => Math.max(0, 1 - ep.action_steps / horizon) * 100)) : null;
  const reference = parseJson_(config_("REVIEW_ACT_SCORING_REFERENCE", ""), {});
  const baseline = reference.seconds_per_action_step?.[record.task];
  const published = reference.reference_mode === "published_act_benchmark" && Number.isFinite(reference.seconds_per_call) && reference.seconds_per_call > 0 && Number.isInteger(reference.action_horizon) && reference.action_horizon > 0;
  const scored = totalsReady && (published || Number.isFinite(baseline) && baseline > 0) && episodes.every(ep => ep.action_steps > 0);
  const referenceTime = ep => published ? Math.ceil(ep.action_steps / reference.action_horizon) * reference.seconds_per_call : baseline * ep.action_steps;
  const inferenceEfficiency = scored ? average(episodes.map(ep => Math.max(0, 1 - (ep.inference_total_ms / 1000) / referenceTime(ep)) * 100)) : null;
  const totalMs = totalsReady ? episodes.reduce((sum, ep) => sum + ep.inference_total_ms, 0) : null;
  const calls = totalsReady ? episodes.reduce((sum, ep) => sum + ep.inference_calls, 0) : 0;
  return { episodes: count, success_rate: successRate,
    average_steps: count ? average(episodes.map(ep => Number(ep.action_steps || 0))) : null,
    inference_ms: totalsReady ? totalMs / calls : count ? average(episodes.map(ep => ep.inference_ms)) : null,
    total_inference_seconds: totalsReady ? totalMs / 1000 : null,
    inference_per_episode_ms: totalsReady ? totalMs / count : null,
    action_efficiency: actionEfficiency, inference_efficiency: inferenceEfficiency,
    weighted_score: scored ? 0.75 * successRate + 0.20 * actionEfficiency + 0.05 * inferenceEfficiency : null,
    score_status: scored ? published ? "published_act_reference" : "calibrated" : totalsReady ? "awaiting_5090_act_reference" : "missing_inference_totals",
    scoring_reference_sha256: scored ? reference.report_sha256 : "" };
}

function reviewOverallSummary_(results) {
  const summaries = Object.keys(REVIEW_TASK_STEPS).map(task => results.find(row => row.task === task)?.summary);
  const complete = summaries.every(row => row?.episodes === 100);
  const average = key => complete && summaries.every(row => Number.isFinite(row[key]))
    ? summaries.reduce((sum, row) => sum + row[key], 0) / 10 : null;
  return { completed_tasks: summaries.filter(Boolean).length, success_rate: average("success_rate"),
    average_steps: average("average_steps"), inference_ms: average("inference_ms"),
    inference_per_episode_ms: average("inference_per_episode_ms"),
    weighted_score: average("weighted_score"), score_status: complete && summaries.every(row => Number.isFinite(row.weighted_score)) ? summaries[0].score_status : "pending" };
}

function reviewParticipantOutcome_(evaluation) {
  const run = reviewRun_(evaluation.evaluation_id);
  if (!run || run.submission_id !== evaluation.submission_id || normalizeEmail_(run.participant_email) !== normalizeEmail_(evaluation.email) ||
      !reviewWorkflow_(run.evaluation_id).stages[4].done) return { task_results: [], overall_summary: null };
  const commands = reviewTaskCommands_(run);
  const results = reviewTaskRows_(run.evaluation_id).filter(row => row.status === "checked").map(row => {
    const record = parseJson_(row.result_json, {});
    return { task: row.task, summary: reviewScoredSummary_(record), eval_command: commands[row.task] || "",
      recorded_eval_command: record.eval_command || "",
      archive_sha256: record.artifacts?.sha256 || "" };
  });
  return { task_results: results, overall_summary: reviewOverallSummary_(results) };
}
