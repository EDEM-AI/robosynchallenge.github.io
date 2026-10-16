const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function fixture() {
  const data = new Map(), properties = {}, reads = [];
  const forbidden = () => { throw new Error("Unexpected write or external API"); };
  let context;
  const workbook = { getSheetByName(name) {
    reads.push(name);
    if (!data.has(name)) return null;
    return { getDataRange: () => ({ getValues: () => {
      const headers = vm.runInContext(`REVIEW_TABLES.${name} || SHEETS.${name}`, context);
      return [[...headers], ...data.get(name).map(row => headers.map(key => row[key] ?? ""))];
    } }) };
  }, insertSheet: forbidden };
  context = vm.createContext({ console, SpreadsheetApp: { getActive: () => workbook },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties[key] || "", setProperty: forbidden, deleteProperty: forbidden }) },
    UrlFetchApp: { fetch: forbidden }, MailApp: { sendEmail: forbidden },
    Utilities: { DigestAlgorithm: { SHA_256: "sha256" }, Charset: { UTF_8: "UTF-8" },
      computeDigest: (_, value) => [...crypto.createHash("sha256").update(value).digest()] } });
  const base = path.join(__dirname, "../apps-script");
  vm.runInContext(["Code.gs", "Reviewer.gs", "SubmissionWindow.gs", "Scoring.gs", "PrivateLeaderboard.gs"]
    .map(name => fs.readFileSync(path.join(base, name), "utf8")).join("\n"), context);
  const tasks = [...vm.runInContext("Object.keys(REVIEW_TASK_STEPS)", context)];
  const token = "act_" + "1".repeat(64), email = "reviewer@example.test";
  const credentials = { reviewer_email: email, reviewer_token: token };
  data.set("Reviewers", [{ email, token_sha256: crypto.createHash("sha256").update(token).digest("hex"), role: "admin", active: "true" }]);
  const seeds = Array.from({ length: 100 }, (_, index) => index);
  const seedHash = crypto.createHash("sha256").update(JSON.stringify(seeds)).digest("hex");
  vm.runInContext(`Object.keys(REVIEW_SEED_HASHES).forEach(task => REVIEW_SEED_HASHES[task] = ${JSON.stringify(seedHash)})`, context);
  const reference = { seconds_per_action_step: Object.fromEntries(tasks.map(task => [task, 0.01])) };
  properties.REVIEW_ACT_SCORING_REFERENCE = JSON.stringify(reference);
  const insert = (name, row) => { if (!data.has(name)) data.set(name, []); data.get(name).push(row); return row; };
  function job(id, options = {}) {
    const participant = id + "@example.test", submission = "sub_" + id;
    insert("Users", { email: participant, team_name: options.team || "Team " + id, token_status: "active" });
    insert("Submissions", { email: participant, submission_id: submission, evaluation_id: id, artifact_name: options.model || "Model " + id,
      is_ranked: "true", created_at: "2026-10-01T00:00:00Z", token: "secret-submission-token", technical_notes: "secret-command" });
    insert("Evaluations", { email: participant, submission_id: submission, evaluation_id: id, published: "false", status: "pending" });
    insert("ReviewRuns", { evaluation_id: id, submission_id: submission, participant_email: participant, reviewer_email: "someone-else@example.test",
      state: options.blocked ? "invalid" : "evaluating", bundle_commit: "a".repeat(40), policy_dirs_json: '["policy/test"]' });
    insert("ReviewProgress", { evaluation_id: id, stages_json: JSON.stringify(Array.from({ length: 5 }, (_, index) => ({ done: index < (options.stages ?? 4) }))) });
    tasks.slice(0, options.count ?? 10).forEach(task => {
      insert("ReviewTaskResults", { evaluation_id: id, submission_id: submission, task, status: options.stages === 5 ? "checked" : "submitted",
        result_json: JSON.stringify({ schema: 1, evaluation_id: id, submission_id: submission, task, bundle_commit: "a".repeat(40), policy_dir: "policy/test",
          eval_command: "python private_command.py", seed_list_sha256: seedHash, artifacts: { url: "https://secret.example/archive", sha256: "b".repeat(64) },
          episodes: seeds.map(index => ({ index, seed: index, success: index < (options.success ?? 80), action_steps: 100, inference_ms: 0.1, inference_calls: 10, inference_total_ms: 1 })) }) });
    });
  }
  const call = (payload = credentials) => JSON.parse(JSON.stringify(context.reviewPrivateLeaderboard_(payload)));
  return { data, properties, context, tasks, credentials, token, reads, job, call, insert };
}

function main() {
  const f = fixture();
  f.job("eval_b", { model: "Identical" });
  f.job("eval_a", { model: "Identical", stages: 5 });
  f.job("eval_partial", { count: 9 });
  f.job("eval_blocked", { blocked: true, success: 100 });
  f.job("eval_adjudicated", { success: 100 });
  f.insert("ReviewAdjudications", { evaluation_id: "eval_adjudicated", status: "invalid_pending_review" });
  f.job("eval_early", { stages: 3 });
  f.reads.length = 0;
  for (const payload of [{}, { session_id: "participant" }, { ...f.credentials, reviewer_token: "act_" + "0".repeat(64) }]) {
    assert.throws(() => f.call(payload), /email|credentials/i);
  }
  assert(!f.reads.includes("ReviewTaskResults"), "Unauthenticated calls cannot read results");
  const reviewer = f.data.get("Reviewers")[0];
  for (const role of ["admin", "evaluator", "tester", "supervisor", "observer"]) {
    reviewer.role = role;
    assert.equal(f.call().tables[0].rows.length, 6, role + " sees global unpublished results, regardless of assignments");
  }
  reviewer.role = "participant";
  assert.throws(() => f.call(), /role/);
  reviewer.role = "observer"; reviewer.active = "false";
  assert.throws(() => f.call(), /credentials/);
  reviewer.active = "true";
  const before = JSON.stringify([...f.data]);
  const board = f.call();
  assert.equal(JSON.stringify([...f.data]), before, "Read endpoint must not mutate data");
  assert.deepEqual(board.tables.map(table => table.id), ["overall", ...f.tasks]);
  const overall = board.tables[0].rows;
  assert.deepEqual(overall.filter(row => row.rank).map(row => [row.evaluation_id, row.rank]), [["eval_a", 1], ["eval_b", 2]]);
  assert.equal(overall.find(row => row.evaluation_id === "eval_b").review_status, "pending_review");
  assert.equal(overall.find(row => row.evaluation_id === "eval_a").review_status, "reviewed");
  const partial = overall.find(row => row.evaluation_id === "eval_partial");
  assert.equal(partial.completed_tasks, 9);
  assert.equal(partial.weighted_all, null);
  assert.equal(partial.rank, null);
  assert.equal(partial.success_rate, null);
  assert.equal(board.tables[1].rows.find(row => row.evaluation_id === "eval_partial").weighted_score !== null, true);
  for (const id of ["eval_blocked", "eval_adjudicated", "eval_early"]) {
    assert(board.tables.every(table => table.rows.find(row => row.evaluation_id === id).rank === null));
  }
  const text = JSON.stringify(board);
  for (const secret of ["@", "token", "email", "private_command", "secret.example", "bundle_commit", "artifacts", "reviewer_email"]) assert(!text.includes(secret), secret + " must not be exported");
  const record = JSON.parse(f.data.get("ReviewTaskResults")[0].result_json);
  const expected = JSON.parse(JSON.stringify(f.context.reviewScoredSummary_(record)));
  const row = board.tables[1].rows.find(row => row.evaluation_id === "eval_b");
  assert.equal(row.weighted_score, expected.weighted_score);
  assert.equal(row.action_efficiency, expected.action_efficiency);
  assert.equal(row.inference_efficiency, expected.inference_efficiency);
  delete f.properties.REVIEW_ACT_SCORING_REFERENCE;
  const uncalibrated = f.call();
  assert(uncalibrated.tables.every(table => table.rows.every(row => row.rank === null && row.weighted_score === null)));
  assert.equal(uncalibrated.tables[1].rows.find(row => row.evaluation_id === "eval_b").success_rate, 80);
  f.properties.REVIEW_ACT_SCORING_REFERENCE = JSON.stringify({ seconds_per_action_step: Object.fromEntries(f.tasks.map(task => [task, 0.01])) });
  const first = f.data.get("ReviewTaskResults")[0];
  const original = first.result_json;
  for (const mutate of [r => r.episodes.pop(), r => r.episodes[1].index = 0, r => r.bundle_commit = "c".repeat(40),
    r => r.task = "item_assembly", r => r.episodes[0].seed = 999, r => r.episodes[0].action_steps = null,
    r => r.episodes[0].inference_total_ms = 999, r => r.local_synthetic_sample = true]) {
    const changed = JSON.parse(original); mutate(changed); first.result_json = JSON.stringify(changed);
    const invalid = f.call();
    assert.equal(invalid.tables[0].rows.find(row => row.evaluation_id === "eval_b").weighted_all, null);
    assert.equal(invalid.tables[1].rows.find(row => row.evaluation_id === "eval_b").rank, null);
  }
  first.result_json = original;
  const legacy = JSON.parse(original);
  legacy.episodes.forEach(episode => { delete episode.inference_calls; delete episode.inference_total_ms; });
  first.result_json = JSON.stringify(legacy);
  const legacyRow = f.call().tables[1].rows.find(row => row.evaluation_id === "eval_b");
  assert.equal(legacyRow.weighted_score, null);
  assert.equal(legacyRow.inference_per_episode_ms, null);
  assert(Math.abs(legacyRow.inference_ms - 0.1) < 1e-12);
  assert.equal(legacyRow.success_rate, 80, "Legacy metrics remain visible without fabricating a score");
  first.result_json = original;
  f.insert("ReviewTaskResults", { ...first });
  assert.equal(f.call().tables[1].rows.find(row => row.evaluation_id === "eval_b").rank, null, "Ambiguous duplicate task records are not scored");
  f.data.get("ReviewTaskResults").at(-1).status = "superseded";
  assert(f.call().tables[1].rows.find(row => row.evaluation_id === "eval_b").rank);
  f.data.get("ReviewRuns").find(row => row.evaluation_id === "eval_b").submission_id = "wrong";
  assert(!f.call().tables[0].rows.some(row => row.evaluation_id === "eval_b"));
  const rankings = [
    { evaluation_id: "null", weighted_score: null },
    { evaluation_id: "zero", weighted_score: 0 },
    ...["id_b", "id_a"].map(evaluation_id => ({ evaluation_id, model_name: "A", weighted_score: 10, success_rate: 50, average_steps: 10, inference_ms: 1 })),
    { evaluation_id: "success", model_name: "Z", weighted_score: 10, success_rate: 60, average_steps: 100, inference_ms: 100 },
    { evaluation_id: "steps", model_name: "Z", weighted_score: 10, success_rate: 50, average_steps: 9, inference_ms: 100 },
    { evaluation_id: "time", model_name: "Z", weighted_score: 10, success_rate: 50, average_steps: 10, inference_ms: 0 },
    { evaluation_id: "model", model_name: "0", weighted_score: 10, success_rate: 50, average_steps: 10, inference_ms: 1 },
  ];
  f.context.reviewPrivateLeaderboardRank_(rankings);
  assert.deepEqual(rankings.map(row => row.evaluation_id), ["success", "steps", "time", "model", "id_a", "id_b", "zero", "null"]);
  assert.equal(rankings.at(-1).rank, null);
  assert.equal(rankings.at(-2).rank, 7, "A real zero is ranked; a missing score is not zero");
  const shuffled = [...rankings].reverse();
  f.context.reviewPrivateLeaderboardRank_(shuffled);
  assert.deepEqual(shuffled.map(row => row.evaluation_id), rankings.map(row => row.evaluation_id));
  const latest = fixture();
  latest.job("eval_old");
  latest.insert("Submissions", { email: "eval_old@example.test", submission_id: "sub_latest", evaluation_id: "eval_latest", artifact_name: "Latest",
    is_ranked: "true", created_at: "2026-10-02T00:00:00Z" });
  latest.insert("Evaluations", { email: "eval_old@example.test", submission_id: "sub_latest", evaluation_id: "eval_latest" });
  assert.equal(latest.call().tables[0].rows.length, 0, "Do not fall back to scored stale submissions when the latest has no run");
  latest.job("eval_unranked");
  latest.data.get("Submissions").find(row => row.evaluation_id === "eval_unranked").is_ranked = "false";
  assert.equal(latest.call().tables[0].rows.length, 0, "Respect existing latest eligible ranked-submission rules");
  const routed = fixture();
  routed.job("eval_routed");
  // Exercise the one-line integration without editing the shared Reviewer.gs.
  const handler = routed.context.handleReviewerAction_.toString();
  const anchor = "payload = {...payload, action};";
  assert(handler.includes(anchor));
  vm.runInContext("handleReviewerAction_ = " + handler.replace(anchor, anchor + '\n  if (action === "reviewer_private_leaderboard") return reviewPrivateLeaderboard_(payload);'), routed.context);
  for (const role of ["admin", "evaluator", "tester", "supervisor", "observer"]) {
    routed.data.get("Reviewers")[0].role = role;
    assert.equal(routed.context.handleReviewerAction_("reviewer_private_leaderboard", routed.credentials).tables[0].rows.length, 1);
  }
  assert.throws(() => routed.context.handleReviewerAction_("reviewer_private_leaderboard", { upload_token: "private-clone-capability" }), /email|credentials/i);
  routed.properties.REVIEW_ACT_SCORING_REFERENCE = JSON.stringify({ reference_mode: "published_act_benchmark", seconds_per_call: 0.011607777797617019, action_horizon: 50 });
  assert.equal(routed.call().tables[0].rows[0].score_status, "published_act_reference");
  assert.equal(routed.call().tables[0].rows[0].rank, 1);
  f.data.delete("ReviewProgress");
  assert(f.call().tables.every(table => table.rows.every(row => row.rank === null)), "Missing progress cannot yield ranks or create a sheet");
  f.data.delete("Reviewers");
  assert.throws(() => f.call(), /credentials/);
  console.log("PASS private leaderboard: active roles, global private visibility, no writes/secrets, scorer parity, completeness, corrupt/duplicate records, calibration, deterministic ties and null/zero");
}

if (require.main === module) main();
module.exports = { fixture };
