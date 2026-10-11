#!/usr/bin/env node
// Synthetic local acceptance files only; never use these for competition results.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const preview = JSON.parse(fs.readFileSync(path.join(__dirname, "../static/reviewer-preview.json"), "utf8"));
const tasks = ["click_bell", "drawer_open_place", "mixer_operating", "table_rearrangement", "water_pouring", "handle_basket", "items_handover", "item_assembly", "manipulate_pipette", "sample_loading"];
const root = path.join(__dirname, "../static/reviewer-demo-files");
fs.mkdirSync(root, { recursive: true, mode: 0o700 });
const write = (target, value) => fs.writeFileSync(target, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
const seeds = Array.from({ length: 100 }, (_, index) => index);
const seedHash = crypto.createHash("sha256").update(JSON.stringify(seeds)).digest("hex");
write(path.join(root, "preflight-report.json"), {
  schema: 1, kind: "render_first_frame_comparison", reference_sha256: "c".repeat(64),
  local_synthetic_sample: true, task_coverage: Object.fromEntries(tasks.map(task => [task, true])),
  results: tasks.flatMap(task => ["cam_high", "cam_left_wrist", "cam_right_wrist"].map(camera => ({ task, camera, ssim: 0.999, psnr_db: 50 }))),
});
for (const job of preview.jobs) {
  if (!/^eval_[A-Za-z0-9]+$/.test(job.evaluation_id)) throw new Error("Unexpected evaluation ID");
  const directory = path.join(root, job.evaluation_id);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  write(path.join(directory, "code-receipt.json"), { bundle_url: "https://github.com/ZhaoRunyi/RoboSynChallenge_eval/tree/submissions/" + job.evaluation_id,
    bundle_commit: "a".repeat(40), policy_dirs: ["policy/test"], local_synthetic_sample: true });
  for (const task of tasks) write(path.join(directory, task + "-result.json"), {
    schema: 1, evaluation_id: job.evaluation_id, submission_id: job.submission_id, task,
    bundle_commit: "a".repeat(40), policy_dir: "policy/test", seed_list_sha256: seedHash,
    eval_command: "python run.py --task " + task,
    local_synthetic_sample: true,
    episodes: seeds.map((seed, index) => ({ index, seed, success: index < 30, action_steps: 100, inference_ms: 4 })),
    artifacts: { url: "https://example.invalid/preview-evidence.zip", sha256: "b".repeat(64) },
  });
}
console.log(JSON.stringify({ synthetic: true, requests: preview.jobs.length, output: root }));
