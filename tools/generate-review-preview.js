#!/usr/bin/env node
// Local preview only. Never commit the generated data file.
const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");

const source = process.argv[2];
if (!source) throw new Error("Pass the read-only source snapshot path.");
const tokenFile = process.argv[3];
if (!tokenFile) throw new Error("Pass a private local token file path outside the website repository.");
const tokenPath = path.resolve(tokenFile);
if (!fs.existsSync(tokenPath)) fs.writeFileSync(tokenPath, `act_${crypto.randomBytes(32).toString("hex")}\n`, { flag: "wx", mode: 0o600 });
const token = fs.readFileSync(tokenPath, "utf8").trim();
if (!/^act_[0-9a-f]{64}$/.test(token)) throw new Error("Invalid local reviewer token file.");
const tokenSha256 = crypto.createHash("sha256").update(token).digest("hex");
const snapshot = JSON.parse(fs.readFileSync(source, "utf8"));
const users = new Map((snapshot.users || []).map((user) => [String(user.email).toLowerCase(), user]));
const latest = new Map();
const deadline = Date.parse("2026-10-12T12:00:00Z");
for (const submission of snapshot.submissions || []) {
  const email = String(submission.email || "").toLowerCase();
  const user = users.get(email);
  const created = Date.parse(submission.created_at);
  if (!user || submission.is_ranked !== true || !Number.isFinite(created) || created > deadline || !submission.evaluation_id ||
      snapshot.evaluations && !snapshot.evaluations.some(evaluation => evaluation.evaluation_id === submission.evaluation_id && evaluation.submission_id === submission.submission_id)) continue;
  const previous = latest.get(email);
  if (!previous || created > Date.parse(previous.created_at) ||
      (created === Date.parse(previous.created_at) && submission.submission_id > previous.submission_id)) latest.set(email, submission);
}
const jobs = snapshot.jobs ? snapshot.jobs.filter(job => !job.local_walkthrough) : [...latest.values()].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((submission) => {
  const user = users.get(String(submission.email).toLowerCase());
  return {
    evaluation_id: submission.evaluation_id, submission_id: submission.submission_id,
    email: String(submission.email).toLowerCase(), team_name: String(user.team_name || user.full_name || ""),
    artifact_name: submission.artifact_name, created_at: submission.created_at,
    code_link: submission.code_link, checkpoint_link: submission.checkpoint_link,
    task_checkpoint_links: submission.task_checkpoint_links || {},
    coverage_status: Object.keys(submission.task_checkpoint_links || {}).length === 10 ? "declared_all_10" : "legacy_unverified",
    technical_notes: submission.technical_notes || "", reviewer_email: "1070055979@qq.com", state: "assigned",
    bundle_url: "", bundle_commit: "", policy_dirs: [], results: [],
  };
});
const target = path.resolve(__dirname, "../static/reviewer-preview.json");
// Local-only fixture ownership must not depend on production assignments.
jobs.forEach(job => { job.reviewer_email = "1070055979@qq.com"; });
jobs.unshift({
  local_walkthrough: true, evaluation_id: "eval_LOCALWALKTHROUGH", submission_id: "sub_LOCALWALKTHROUGH",
  email: "demo@example.invalid", team_name: "流程演示（不计入正式测评）", artifact_name: "Local walkthrough",
  created_at: "", code_link: "https://example.invalid/demo-repository", checkpoint_link: "https://example.invalid/demo-checkpoints",
  task_checkpoint_links: {}, coverage_status: "local_demo", technical_notes: "This synthetic request only demonstrates the review stages.",
  reviewer_email: "1070055979@qq.com", state: "assigned", preparation_status: "ready",
  bundle_url: "https://example.invalid/demo-branch", bundle_commit: "a".repeat(40), policy_dirs: ["policy/demo"],
  results: ["click_bell", "drawer_open_place", "mixer_operating", "table_rearrangement", "water_pouring", "handle_basket", "items_handover", "item_assembly", "manipulate_pipette", "sample_loading"].map(task => ({
    task, status: "submitted", summary: { episodes: 100, success_rate: 30, average_steps: 100 },
    artifacts: { url: "https://example.invalid/demo-evidence.zip", sha256: "b".repeat(64) },
  })),
});
fs.writeFileSync(target, JSON.stringify({ captured_at: snapshot.captured_at, reviewer_email: "1070055979@qq.com", reviewer_token_sha256: tokenSha256, jobs }, null, 2) + "\n", { mode: 0o600 });
console.log(JSON.stringify({ real_requests: jobs.length - 1, local_walkthroughs: 1, target }));
