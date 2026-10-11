(() => {
  "use strict";
  const STORAGE = "rsc-reviewer-credentials-v1";
  const PREVIEW_STORAGE = "rsc-reviewer-preview-workflow-v4";
  const API = String(window.ROBO_SYN_CONFIG?.API_BASE_URL || "").trim();
  const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname) && new URLSearchParams(location.search).has("review_preview");
  const TASKS = ["click_bell", "drawer_open_place", "mixer_operating", "table_rearrangement", "water_pouring", "handle_basket", "items_handover", "item_assembly", "manipulate_pipette", "sample_loading"];
  const STEPS = { click_bell: 361, drawer_open_place: 900, mixer_operating: 500, table_rearrangement: 361, water_pouring: 500, handle_basket: 500, items_handover: 350, item_assembly: 500, manipulate_pipette: 1000, sample_loading: 500 };
  const STAGES = [
    { title: "Preparation receipt", description: "Review the automatically prepared code receipt and ten-task mapping. Repository access and policy structure have already been checked during preparation; runtime compatibility is checked in the next stages.",
      checks: { repository_access: "The automatic preparation receipt is available and matches this request.", checkpoint_access: "I reviewed the recorded task-to-checkpoint mapping.", ten_tasks: "All ten tasks have a documented entrypoint and checkpoint." },
      issue: "We could not complete the submission access check. Please confirm repository access and provide the checkpoint and entrypoint mapping for all ten tasks." },
    { title: "Evaluation code", description: "Clone the prepared private branch into its evaluation-specific directory. Follow the repository README and the policy entrypoint documentation.",
      checks: { commit_verified: "My checkout matches the pinned evaluation commit.", policy_entrypoints: "I have identified the correct policy directory and entrypoint for each task.", dependencies: "The policy dependencies are installed in an isolated environment." },
      issue: "We could not prepare or start your policy. Please check the complete policy/ tree, documented entrypoints and dependencies. Use the response form below for confirmation or the single permitted correction, including an immutable GitHub commit and all ten task checkpoints." },
    { title: "Environment check", description: "Run the built-in environment check. Continue only when the command prints ENVIRONMENT CHECK PASSED and exits successfully.",
      checks: { machine_checked: "The built-in environment check printed ENVIRONMENT CHECK PASSED with exit code 0.", reference_checked: "The official expert planning, rendering comparison and action/state smoke check passed." },
      issue: "Evaluation is paused while we investigate an environment or runtime issue. No participant-side changes are requested unless the details below identify a policy issue." },
    { title: "Result upload", description: "Evaluate all ten tasks using the frozen seeds. Upload each task's JSON manifest after saving its videos, states, and actions in the private evidence archive.",
      checks: { all_runs: "All ten tasks were evaluated with the pinned code and frozen seed packet.", archives_uploaded: "All evidence archives are uploaded and accessible to the organizers." },
      issue: "Evaluation could not finish with the submitted policy. Please review the affected task and error below. Use the response form to confirm the current code or submit your single permitted correction with all ten task checkpoints." },
    { title: "Result review", description: "Review each task's evidence and checksum before accepting it. This records the reviewer decision; it does not publish anything on the public leaderboard.",
      checks: { videos_checked: "I reviewed the videos and task outcomes for all ten tasks.", trajectories_checked: "I checked the saved state/action trajectories and episode coverage.", hashes_checked: "The downloaded archives match their recorded SHA256 checksums." },
      issue: "We found an issue while reviewing the evaluation evidence. Please check the affected task and details below, and reply with clarification or a corrected immutable submission." },
  ];
  const ISSUE_TEMPLATES = [
    [
      ["repository_access", "Private repository access", "We cannot read the submitted GitHub repository using the preparation account. Please grant the organizer-designated account read access and confirm the exact repository and commit URL. The account must accept its invitation before preparation can proceed."],
      ["missing_code", "Incomplete code", "The repository is missing required policy files or task entrypoints. Please provide the complete policy/ tree, including eval.sh, deploy_policy.yml and deploy_policy.py for the relevant adapters, and document all ten task entrypoints."],
      ["missing_checkpoints", "Missing or inaccessible checkpoints", "We could not access all ten task checkpoints. Please check the Hugging Face URLs, private/gated access, required model files and task-to-checkpoint mapping. Identify shared checkpoints explicitly."]
    ],
    [
      ["composition_failed", "Code preparation failed", "Automatic preparation of your policy/ tree failed. Please review the error below and confirm the required files and directories."],
      ["dependencies", "Dependencies or installation failed", "We could not install or import the policy using the repository instructions. Please confirm the Python/CUDA versions, dependency versions, installation commands and required assets."],
      ["cannot_start", "Policy cannot start", "The documented policy entrypoint could not start in the official environment. Please verify the run command, adapter entrypoints, configuration and checkpoint loading."]
    ],
    [
      ["environment_pause", "Organizer environment check paused", "Evaluation is paused while the organizers investigate the official environment check. No changes to your submission are requested at this time."]
    ],
    [
      ["runtime_failure", "Policy runtime error", "The policy encountered a runtime error during evaluation. Please review the affected task, command and error below."],
      ["invalid_actions", "Invalid action output", "The policy returned actions with an incompatible shape, non-finite values or incorrect units. Please check the official action interface for the affected task without modifying the official environment."],
      ["checkpoint_loading", "Checkpoint loading failed", "The policy could not load the specified checkpoint. Please verify the task mapping, model configuration, file completeness and loading command."]
    ],
    [
      ["evidence_missing", "Incomplete task evidence", "The task evidence is incomplete or inconsistent. Please clarify the task setup and policy output below. Organizer archive/upload issues will be handled by the organizers and do not require policy changes."],
      ["task_mapping", "Task or checkpoint mismatch", "We found a mismatch between the documented task entrypoint/checkpoint and the evaluated policy. Please confirm the intended mapping and clarify the affected task."]
    ]
  ];
  const state = { credentials: null, role: "", jobs: [], selected: "", stage: 0, task: TASKS[0], policyDir: "", busy: false, error: "", toast: "", preview: null, drafts: new Map(), emailDraft: null, search: "" };
  try { state.credentials = JSON.parse(sessionStorage.getItem(STORAGE) || "null"); } catch { /* Require sign-in. */ }
  const escape = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const label = (value) => String(value || "").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  const safeHref = (value) => { try { const url = new URL(String(value)); return url.protocol === "https:" ? url.href : "#"; } catch { return "#"; } };
  const icon = (name) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const button = (action, name, symbol, extra = "") => `<button type="button" class="button button-secondary" data-review-action="${action}" ${extra}>${icon(symbol)}${name}</button>`;
  const root = () => document.querySelector("[data-reviewer-root]");
  const selected = () => state.jobs.find((job) => job.evaluation_id === state.selected);
  const flow = (job) => job.workflow || { stages: STAGES.map(() => ({ done: false, checks: {} })), machine_id: "" };
  const doneCount = (job) => flow(job).stages.filter((stage) => stage.done).length;
  const firstOpen = (job) => { const index = flow(job).stages.findIndex((stage) => !stage.done); return index < 0 ? 4 : index; };
  const draftKey = (job) => job.evaluation_id + ":" + state.stage;
  const draft = (job) => {
    if (!state.drafts.has(draftKey(job))) state.drafts.set(draftKey(job), { ...flow(job).stages[state.stage].checks, machine_id: flow(job).machine_id || job.machines?.find((machine) => machine.status === "passed")?.machine_id || "" });
    return state.drafts.get(draftKey(job));
  };
  const versionSuffix = (job) => `${job.preparation_attempt ? "-correction1" : ""}${job.version_generation ? "-exception" + job.version_generation : ""}`;
  const cloneCommand = (job) => `git clone --single-branch --branch submissions/${job.evaluation_id}${versionSuffix(job)} https://github.com/ZhaoRunyi/RoboSynChallenge_eval.git ${cloneDirectory(job)}\ngit -C ${cloneDirectory(job)} checkout --detach ${job.bundle_commit}`;
  const cloneDirectory = (job) => `RoboSynChallenge_${job.evaluation_id}${versionSuffix(job).replace(/-/g, "_")}`;
  const resultFor = (job, task) => (job.results || []).find((result) => result.task === task);
  const nextBlocker = (job) => {
    if (LOCAL && job.local_walkthrough) return "";
    const checks = draft(job);
    if (Object.keys(STAGES[state.stage].checks).some((key) => checks[key] !== true)) return "Complete the checklist";
    if (state.stage === 0 && job.coverage_status === "legacy_unverified") return "Organizer verification required";
    if (job.version_status === "provisional") return "Validation only; formal versions will be frozen after the deadline";
    if (state.stage <= 1 && !job.bundle_commit) return "Prepared code required";
    if (state.stage === 3 && TASKS.some((task) => !job.task_commands?.[task])) return "Record all 10 actual evaluation commands";
    if (state.stage === 3 && TASKS.some((task) => !["submitted", "checked"].includes(resultFor(job, task)?.status))) return "Upload all 10 task results";
    if (state.stage === 4 && TASKS.some((task) => resultFor(job, task)?.status !== "checked")) return "Accept all 10 task results";
    return "";
  };

  async function request(action, fields = {}) {
    if (LOCAL) return previewAction(action, fields);
    if (!API) throw new Error("Reviewer backend is not configured.");
    const response = await fetch(API, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, reviewer_email: state.credentials.email, reviewer_token: state.credentials.token, ...fields }) });
    const data = await response.json();
    if (!response.ok || data.ok === false) throw new Error(data.error || "Reviewer request failed.");
    return data;
  }
  const hash = async (text) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  function persistPreview() {
    sessionStorage.setItem(PREVIEW_STORAGE, JSON.stringify({ captured_at: state.preview.captured_at, jobs: state.preview.jobs, machines: state.preview.machines }));
  }
  async function previewAction(action, fields) {
    if (!state.preview) {
      const response = await fetch("../static/reviewer-preview.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Local preview data is missing.");
      state.preview = await response.json();
      try {
        const saved = JSON.parse(sessionStorage.getItem(PREVIEW_STORAGE) || "null");
        if (saved?.captured_at === state.preview.captured_at) { state.preview.jobs = saved.jobs; state.preview.machines = saved.machines; }
      } catch { /* Start a new local preview. */ }
      state.preview.machines ||= [];
      state.preview.jobs.forEach((job) => { job.workflow ||= { stages: STAGES.map(() => ({ done: false, checks: {} })), machine_id: "" }; });
    }
    if (state.credentials.email !== state.preview.reviewer_email || await hash(state.credentials.token) !== state.preview.reviewer_token_sha256) throw new Error("Invalid reviewer credentials.");
    if (action === "reviewer_login") return { ok: true, reviewer: { email: state.credentials.email, role: "admin" } };
    if (action === "reviewer_queue") return { ok: true, reviewer: { email: state.credentials.email, role: "admin" },
      jobs: state.preview.jobs.filter((job) => job.reviewer_email === state.credentials.email).map((job) => ({ ...job, machines: state.preview.machines })) };
    if (action === "reviewer_submission_window") return { ok: true, status: fields.revoke ? "revoked" : "granted" };
    const job = state.preview.jobs.find((item) => item.evaluation_id === fields.evaluation_id && item.reviewer_email === state.credentials.email);
    if (!job) throw new Error("This request is not assigned to you.");
    if (job.local_walkthrough) {
      if (["reviewer_complete_stage", "reviewer_save_checks"].includes(action)) {
        const stage = job.workflow.stages[fields.stage];
        if (stage) { stage.checks = fields.checks || {}; if (action === "reviewer_complete_stage") stage.done = true; }
        if (fields.stage === 4 && action === "reviewer_complete_stage") job.state = "checked";
      }
      if (action === "reviewer_check_result") {
        const row = resultFor(job, fields.task);
        if (row) row.status = "checked";
      }
      persistPreview();
      return { ok: true };
    }
    if (action === "reviewer_verify_coverage") {
      if (job.bundle_commit || !fields.coverage_confirmed || Object.keys(fields.task_checkpoint_links || {}).length !== 10 ||
          TASKS.some((task) => !/^https:\/\/huggingface\.co\/\S+$/i.test(String(fields.task_checkpoint_links?.[task] || "")))) throw new Error("Confirm all ten task checkpoints first.");
      job.task_checkpoint_links = fields.task_checkpoint_links; job.coverage_status = "verified_all_10"; job.coverage_verified_by = state.credentials.email;
    } else if (action === "reviewer_prepare") {
      if (job.coverage_status === "legacy_unverified" || !/^[a-f0-9]{40}$/.test(fields.bundle_commit) ||
          fields.bundle_url !== "https://github.com/ZhaoRunyi/RoboSynChallenge_eval/tree/submissions/" + job.evaluation_id + versionSuffix(job) ||
          !fields.policy_dirs?.length || fields.policy_dirs.some((dir) => !/^policy(?:\/[A-Za-z0-9_.-]+)*$/.test(dir) || dir.split("/").some((part) => [".", ".."].includes(part)))) throw new Error("Prepared code metadata is invalid.");
      job.bundle_url = fields.bundle_url; job.bundle_commit = fields.bundle_commit; job.policy_dirs = fields.policy_dirs; job.state = "ready";
      job.preparation_status = "ready"; job.preparation_error = "";
    } else if (action === "reviewer_approve_version_exception") {
      if (!fields.argument_reviewed || !String(fields.reason || "").trim() || !String(job.preparation_error).includes("NO_LEGAL_VERSION")) throw new Error("Review and record the participant argument first.");
      job.version_generation = (job.version_generation || 0) + 1;
      job.version_cutoff_at = new Date().toISOString(); job.preparation_status = "pending"; job.preparation_error = "";
    } else if (action === "reviewer_reassign") {
      if (job.workflow.stages[1].done || !fields.assign_to || !fields.reason) throw new Error("Reassignment is only available before local work.");
      job.reviewer_email = fields.assign_to;
    } else if (action === "reviewer_retry_preparation") {
      if (job.bundle_commit) throw new Error("Prepared code already exists.");
      job.preparation_status = "pending"; job.preparation_error = "";
    } else if (["reviewer_complete_stage", "reviewer_save_checks"].includes(action)) {
      if (!Number.isInteger(fields.stage) || fields.stage < 0 || fields.stage > 4 || job.workflow.stages.slice(0, fields.stage).some((stage) => !stage.done)) throw new Error("Complete the previous stages first.");
      if (action === "reviewer_complete_stage") {
        if (Object.keys(STAGES[fields.stage].checks).some((key) => fields.checks?.[key] !== true)) throw new Error("Complete every checklist item.");
        if (fields.stage === 0 && job.coverage_status === "legacy_unverified") throw new Error("Verify all ten task checkpoints first.");
        if (fields.stage === 1 && !job.bundle_commit) throw new Error("Prepared code is missing.");
        if (fields.stage === 3 && TASKS.some((task) => !["submitted", "checked"].includes(resultFor(job, task)?.status))) throw new Error("Upload all ten results first.");
        if (fields.stage === 4 && TASKS.some((task) => resultFor(job, task)?.status !== "checked")) throw new Error("Accept all ten task results first.");
      }
      const stage = job.workflow.stages[fields.stage];
      if (!stage.done) { stage.checks = fields.checks; stage.done = action === "reviewer_complete_stage"; if (stage.done) stage.completed_at = new Date().toISOString(); }
      if (fields.stage === 2) job.workflow.machine_id = fields.machine_id;
      if (fields.stage === 4 && stage.done) job.state = "checked";
    } else if (action === "reviewer_preflight") {
      const report = fields.report;
      if (!/^[A-Za-z0-9_.-]{1,80}$/.test(fields.machine_id || "") || report?.schema !== 1 || report.kind !== "render_first_frame_comparison" ||
          TASKS.some((task) => report.task_coverage?.[task] !== true || ["cam_high", "cam_left_wrist", "cam_right_wrist"].some((camera) => !report.results?.some((row) => row.task === task && row.camera === camera)))) throw new Error("Preflight must cover all ten tasks and three cameras.");
      // Preview-only thresholds do not configure or bypass the production backend.
      const passed = report.results.every((row) => Number.isFinite(row.ssim) && row.ssim >= 0.98 && (row.identical_pixels === true || Number.isFinite(row.psnr_db) && row.psnr_db >= 35));
      state.preview.machines = state.preview.machines.filter((machine) => machine.machine_id !== fields.machine_id);
      state.preview.machines.push({ machine_id: fields.machine_id, status: passed ? "passed" : "failed", report_sha256: await hash(JSON.stringify(report)) });
    } else if (action === "reviewer_validate_result") {
      if (job.workflow.stages.slice(0, 3).some((stage) => !stage.done) || resultFor(job, fields.result?.task)?.status === "checked") throw new Error("Complete the earlier stages; accepted task evidence is locked.");
    } else if (action === "reviewer_submit_result") {
      if (job.workflow.stages.slice(0, 3).some((stage) => !stage.done)) throw new Error("Complete the first three stages.");
      const record = fields.result;
      if (!record?.eval_command || job.task_commands?.[record.task] !== record.eval_command) throw new Error("Save the actual task evaluation command first; it must match the result JSON.");
      if (record?.schema !== 1 || !TASKS.includes(record.task) || record.evaluation_id !== job.evaluation_id || record.submission_id !== job.submission_id ||
          record.bundle_commit !== job.bundle_commit || !job.policy_dirs.includes(record.policy_dir) || record.episodes?.length !== 100 ||
          !/^https:\/\//.test(record.artifacts?.url || "") || !/^[a-f0-9]{64}$/.test(record.artifacts?.sha256 || "")) throw new Error("Result identity, 100 episodes, or evidence is missing.");
      if (new Set(record.episodes.map((row) => row.index)).size !== 100 || record.episodes.some((row) => !Number.isInteger(row.index) || row.index < 0 || row.index > 99 ||
          !Number.isInteger(row.seed) || row.seed < 0 || row.seed > 2147483647 || typeof row.success !== "boolean" || !Number.isInteger(row.action_steps) ||
          row.action_steps < 0 || row.action_steps > STEPS[record.task] || !Number.isFinite(row.inference_ms) || row.inference_ms < 0)) throw new Error("Invalid episode values.");
      const ordered = [...record.episodes].sort((a, b) => a.index - b.index).map((row) => row.seed);
      if (await hash(JSON.stringify(ordered)) !== record.seed_list_sha256) throw new Error("Episode seed hash mismatch.");
      if (resultFor(job, record.task)?.status === "checked") throw new Error("Accepted results are locked.");
      job.results = (job.results || []).filter((row) => row.task !== record.task);
      job.results.push({ task: record.task, status: "submitted", artifacts: record.artifacts, summary: { episodes: 100, success_rate: record.episodes.filter((row) => row.success).length, average_steps: record.episodes.reduce((sum, row) => sum + row.action_steps, 0) / 100 } });
      job.state = "reviewing";
    } else if (action === "reviewer_check_result") {
      if (!job.workflow.stages[3].done || ["video", "trajectory", "checksum"].some((key) => fields.checks?.[key] !== true)) throw new Error("Complete upload and evidence checks first.");
      const row = resultFor(job, fields.task);
      if (!row || row.status !== "submitted") throw new Error("No submitted result to check.");
      row.status = fields.decision;
    } else if (action === "reviewer_save_command") {
      if (!TASKS.includes(fields.task) || !String(fields.command || "").trim() || resultFor(job, fields.task)) throw new Error("Provide the actual command before uploading the task result.");
      job.task_commands ||= {}; job.task_commands[fields.task] = String(fields.command).trim();
    } else if (action === "reviewer_send_issue") {
      job.messages ||= [];
      if (!job.messages.some((message) => message.message_id === fields.message_id)) job.messages.push({ message_id: fields.message_id, stage: fields.stage, subject: fields.subject, status: "preview_only", sent_at: new Date().toISOString() });
    } else throw new Error("Unknown local preview action.");
    persistPreview();
    return { ok: true };
  }

  function render() {
    return `<section class="reviewer-page"><div class="shell" data-reviewer-root><div data-reviewer-content></div></div></section>`;
  }
  function heading(signedIn) {
    return `<div class="reviewer-heading"><div><h1>Evaluation workspace</h1><span class="reviewer-mode">${LOCAL ? "Local preview · No emails sent" : "Preliminary simulation"}</span></div>${signedIn ? `<div class="reviewer-toolbar"><span>${escape(state.credentials.email)}</span><button class="reviewer-icon" data-review-action="refresh" title="Refresh requests" aria-label="Refresh requests">${icon("refresh-cw")}</button><button class="reviewer-icon" data-review-action="logout" title="Sign out" aria-label="Sign out">${icon("log-out")}</button></div>` : ""}</div>`;
  }
  function checks(job) {
    const values = draft(job);
    return `${state.stage === 4 ? scoreSummary(job) : ""}<div class="reviewer-checks"><h4>Completion checklist</h4>${Object.entries(STAGES[state.stage].checks).map(([key, text]) => `<label class="reviewer-check"><input type="checkbox" data-stage-check="${key}" ${values[key] ? "checked" : ""} ${flow(job).stages[state.stage].done ? "disabled" : ""}><span>${text}</span></label>`).join("")}</div>${admissionControls(job)}`;
  }
  const notice = (text, success = false) => `<div class="reviewer-notice ${success ? "success" : ""}">${text}</div>`;
  const metric = (value, unit = "", digits = 1) => Number.isFinite(value) ? Number(value).toFixed(digits) + unit : "Pending";
  const commandBox = (text, title) => `<div class="reviewer-command"><code data-copy-command>${escape(text)}</code><button class="reviewer-icon" data-review-action="copy" title="${escape(title)}" aria-label="${escape(title)}">${icon("copy")}</button></div>`;
  function scoreSummary(job) {
    const overall = job.overall_summary || {};
    const row = resultFor(job, state.task);
    return `<h4>Ten-task average</h4><dl class="reviewer-meta"><div><dt>Success rate</dt><dd>${metric(overall.success_rate, "%")}</dd></div><div><dt>Action steps</dt><dd>${metric(overall.average_steps)}</dd></div><div><dt>Inference / episode</dt><dd>${metric(overall.inference_per_episode_ms, " ms")}</dd></div><div><dt>Weighted score</dt><dd>${metric(overall.weighted_score)}</dd></div></dl>${!["calibrated", "published_act_reference"].includes(overall.score_status) ? notice("Final weighted score awaits complete ten-task evidence and the pinned published RTX 5090 ACT reference. Uncalibrated values are not published.") : ""}${row && job.task_commands?.[state.task] ? commandBox(job.task_commands[state.task], "Copy recorded evaluation command") : ""}${row ? commandBox(`printf '%s  %s\\n' '${row.artifacts?.sha256}' '${job.evaluation_id}-${state.task}-evidence.zip' | sha256sum --check`, "Copy downloaded archive checksum check") : ""}`;
  }
  function runCommands(job) {
    const dirs = job.policy_dirs || [];
    const dir = dirs.includes(state.policyDir) ? state.policyDir : dirs.length === 1 ? dirs[0] : "";
    const target = `results/${state.task}`;
    const command = `cd ${cloneDirectory(job)}\npython tools/run_task_evaluation.py --task ${state.task} --submission-id ${job.submission_id} --policy-dir ${dir || "SELECT_POLICY_DIRECTORY"} --seeds "\${RSC_SEED_PACKET:?Set the organizer seed packet path}" --checkpoints "\${RSC_CHECKPOINTS:?Set the downloaded checkpoint directory}" --policy-image "\${RSC_POLICY_IMAGE:?Set the approved image@sha256 digest}" --output ${target}`;
    return `<div class="reviewer-task-picker"><label>Task<select data-task-picker>${TASKS.map(task => `<option value="${task}" ${task === state.task ? "selected" : ""}>${label(task)}</option>`).join("")}</select></label><label>Detected policy entrypoint<select data-policy-picker required><option value="">Select entrypoint</option>${dirs.map(value => `<option value="${escape(value)}" ${value === dir ? "selected" : ""}>${escape(value)}</option>`).join("")}</select></label></div>${!dir ? notice("Choose the documented entrypoint for this task before copying the run command.") : commandBox(command, "Copy task evaluation command")}${notice("The official collector runs 100 frozen episodes, records the actual command, generates task JSON + ZIP and automatically uploads verified evidence to OneDrive. Configure model-specific arguments with --model-config and --checkpoint-relative when required by the adapter. Checkpoints, seeds and the approved dependency image stay outside participant code.")}${commandBox(`cd ${cloneDirectory(job)}\npython tools/check_upload.py`, "Copy storage check command")}${commandBox(`cd ${cloneDirectory(job)}\npython tools/upload_evidence.py --manifest ${target}/package/${job.evaluation_id}-${state.task}-result.json --archive ${target}/package/${job.evaluation_id}-${state.task}-evidence.zip`, "Copy upload retry command")}`;
  }
  function admissionControls(job) {
    if (state.role !== "admin" || !job || job.local_walkthrough) return "";
    return `<details class="reviewer-notes"><summary>Organizer: individual submission window</summary><form class="reviewer-form" data-review-form="admission"><label>Registered participant email<input name="participant_email" type="email" value="${escape(job.email)}" required></label><label>Expiry (your browser local time)<input name="expires_at" type="datetime-local"></label><label>Reason<input name="reason" maxlength="500" required></label><label class="reviewer-confirm"><input type="checkbox" name="revoke">Revoke this participant's exception</label><button class="button button-secondary">${icon("save")}Save individual window</button></form></details>`;
  }
  function versionControls(job) {
    if (job.local_walkthrough) return "";
    const report = job.version_report?.code;
    const metadata = report ? notice(`Version selection: ${escape(job.version_status)}<br>Commit: <code>${escape(report.revision)}</code><br>Committed: ${escape(report.committed_at)}<br>Cutoff: ${escape(report.cutoff_at)}`) : "";
    const appeal = String(job.preparation_error || "").includes("NO_LEGAL_VERSION") ? `<form class="reviewer-form" data-review-form="version-exception"><h4>Approve participant argument</h4><label>Accepted email argument and reason<textarea name="reason" required maxlength="6000"></textarea></label><label class="reviewer-confirm"><input type="checkbox" name="argument_reviewed" required>I reviewed the participant's email argument and approve one rebuild using versions available now.</label><button class="button button-secondary">${icon("check")}Approve / Queue rebuild</button></form>` : "";
    const transfer = state.role === "admin" && !flow(job).stages[1].done ? `<details class="reviewer-notes"><summary>Organizer: reassign before local work</summary><form class="reviewer-form" data-review-form="reassign"><label>Active reviewer email<input name="assign_to" type="email" required></label><label>Reason<input name="reason" required maxlength="500"></label><button class="button button-secondary">${icon("arrow-right-left")}Reassign</button></form></details>` : "";
    return metadata + appeal + transfer;
  }
  function taskTable(job, checkpoints = false) {
    return `<table class="reviewer-task-table"><thead><tr><th>Task</th>${checkpoints ? "<th>Checkpoint</th><th>Max steps</th>" : "<th>Episodes</th><th>Success</th><th>Steps</th><th>Inference / episode</th><th>Score</th><th>Status</th>"}</tr></thead><tbody>${TASKS.map((task) => {
      const row = resultFor(job, task);
      const access = job.hf_access?.[task];
      return `<tr><td><strong>${escape(label(task))}</strong></td>${checkpoints ? `<td><a target="_blank" rel="noreferrer" href="${escape(safeHref(job.task_checkpoint_links?.[task]))}">Hugging Face ${icon("external-link")}</a><br><small>${access?.accessible ? `${Number(access.files_checked)} files checked · <code>${escape(access.revision.slice(0, 12))}</code>` : "Access check pending"}</small></td><td>${STEPS[task]}</td>` : `<td>${row?.summary?.episodes || "—"} / 100</td><td>${metric(row?.summary?.success_rate, "%")}</td><td>${metric(row?.summary?.average_steps)}</td><td>${metric(row?.summary?.inference_per_episode_ms, " ms")}</td><td>${metric(row?.summary?.weighted_score)}</td><td class="${row?.status === "checked" ? "checked" : ""}">${escape(label(row?.status || "Not uploaded"))}</td>`}</tr>`;
    }).join("")}</tbody></table>`;
  }
  function stageContent(job) {
    return stageContentDetails(job) + (state.stage === 0 ? versionControls(job) : "");
  }
  function stageContentDetails(job) {
    if (state.stage === 0) return `${job.bundle_commit ? notice("Automatic preparation succeeded. Frozen bundle: <code>" + escape(job.bundle_commit) + "</code>. Participant policy/ is retained; environment code comes from the private official base.", true) : codeStage(job)}<dl class="reviewer-meta"><div><dt>Participant</dt><dd>${escape(job.email)}</dd></div><div><dt>Submission ID</dt><dd>${escape(job.submission_id)}</dd></div><div><dt>Submitted</dt><dd>${escape(job.created_at)}</dd></div><div><dt>Task coverage</dt><dd>${job.coverage_status === "legacy_unverified" ? "Task mapping required" : "All 10 task checkpoints recorded"}</dd></div></dl><div class="reviewer-links"><a href="${escape(safeHref(job.code_link))}" target="_blank" rel="noreferrer">${icon("github")}Participant repository</a><a href="${escape(safeHref(job.checkpoint_link))}" target="_blank" rel="noreferrer">${icon("external-link")}Checkpoint repository</a></div>${job.coverage_status !== "legacy_unverified" ? taskTable(job, true) : `${notice("This historical request does not yet have an audited ten-task mapping. The assigned reviewer must record it before evaluation.")}${`<form class="reviewer-form" data-review-form="verify"><h3>Verify historical request</h3><div class="reviewer-verify-grid">${TASKS.map((task) => `<label>${label(task)}<input type="url" name="${task}" value="${escape(job.checkpoint_link || "")}" required></label>`).join("")}</div><label class="reviewer-confirm"><input type="checkbox" name="coverage_confirmed" required>I inspected the submission and verified all ten tasks.</label><button class="button button-secondary">${icon("check")}Record verification</button></form>`}`}`;
    if (state.stage === 1) return `${codeStage(job)}${job.bundle_commit ? commandBox(`cd ${cloneDirectory(job)}\npython tools/download_checkpoints.py --output /path/to/checkpoints --token-file /path/to/private/hf.token`, "Copy pinned checkpoint download example") + notice("The evaluator runs downloads and prepares checkpoint paths. This example uses frozen HF revisions and writes the checksum receipt required by the collector. Keep the token outside the clone and participant container. Participants are responsible for adapter configuration and dependencies; record the exact command and configuration used.") : ""}`;
    if (state.stage === 2) return `<div class="reviewer-command"><code data-copy-command>cd ${escape(cloneDirectory(job))}
python tools/check_environment.py</code><button class="reviewer-icon" data-review-action="copy" title="Copy environment check command" aria-label="Copy environment check command">${icon("copy")}</button></div>${notice("Expected: ENVIRONMENT CHECK PASSED (exit code 0). Requires organizer-installed fixed reference scenes and approved thresholds in the private repository. Missing references, unset thresholds or failed checks stop the command. No machine ID, metric input or report upload is required.")}`;
    if (state.stage === 3) return `${runCommands(job)}<details class="reviewer-notes"><summary>Actual commands / manual upload fallback</summary>${taskCommands(job)}<form class="reviewer-form" data-review-form="onedrive"><h4>Upload ZIP to OneDrive</h4><div class="reviewer-verify-grid"><label>Task evidence ZIP<input type="file" name="evidence_zip" accept=".zip,application/zip" required></label><label>Matching task JSON<input type="file" name="evidence_manifest" accept=".json,application/json" required></label></div><label class="reviewer-confirm"><input type="checkbox" name="restart">Cancel an unfinished upload and restart the same ZIP.</label><button class="button button-secondary">${icon("upload-cloud")}${LOCAL ? "Check preview ZIP" : "Upload ZIP"}</button><div data-upload-status role="status"></div><progress data-upload-progress max="1" value="0" hidden></progress></form><hr><form class="reviewer-form" data-review-form="result"><label>Task result JSON<input type="file" name="result_file" accept=".json,application/json" required></label><button class="button button-secondary">${icon("upload")}Validate and upload JSON</button></form></details>${notice("No extra Microsoft sign-in is needed. Both upload methods use evaluation_id/task/latest. ZIPs go directly to OneDrive, not through Google Sheets. Accepted results are locked.")}${taskTable(job)}`;
    const row = resultFor(job, state.task);
    return `<div class="reviewer-task-picker"><select data-task-picker aria-label="Task to review">${TASKS.map((task) => `<option value="${task}" ${task === state.task ? "selected" : ""}>${label(task)} · ${label(resultFor(job, task)?.status || "Not uploaded")}</option>`).join("")}</select><span>${(job.results || []).filter((result) => result.status === "checked").length} / 10 accepted</span></div>${row ? `<dl class="reviewer-meta"><div><dt>Episodes</dt><dd>${row.summary.episodes} / 100</dd></div><div><dt>Success rate</dt><dd>${Number(row.summary.success_rate).toFixed(1)}%</dd></div><div><dt>Average action steps</dt><dd>${Number(row.summary.average_steps).toFixed(1)} / ${STEPS[state.task]}</dd></div><div><dt>Archive SHA256</dt><dd>${escape(row.artifacts?.sha256 || "")}</dd></div></dl><div class="reviewer-links"><a href="${escape(safeHref(row.artifacts?.url))}" target="_blank" rel="noreferrer">${icon("folder-open")}Open task evidence</a></div>${row.status === "checked" ? notice("This task result has been reviewed and accepted.", true) : `<form data-review-form="accept" class="reviewer-form"><label class="reviewer-confirm"><input type="checkbox" name="video" required>I reviewed task videos and success/failure outcomes.</label><label class="reviewer-confirm"><input type="checkbox" name="trajectory" required>I checked episode state/action trajectories.</label><label class="reviewer-confirm"><input type="checkbox" name="checksum" required>The downloaded archive matches the recorded SHA256.</label><button class="button button-secondary">${icon("check")}Accept this task result</button></form>`}` : notice("No manifest has been uploaded for this task.")}${taskTable(job)}`;
  }
  function codeStage(job) {
    const instructions = "";
    if (!job.bundle_commit) return `${notice(job.preparation_status === "failed"
      ? `Automatic code preparation failed.<br>${escape(job.preparation_error || "The submitted policy could not be prepared.")}<br>Use Issue / Send email to request clarification. This stage stays blocked until preparation succeeds.`
      : "Waiting for the automatic preparation script. It copies the participant's entire policy/ tree onto the official held-out environment. Do not clone the participant's environment for evaluation.")}${instructions}${job.preparation_status === "failed" ? `<div class="reviewer-retry">${button("retry-code", "Retry after participant follow-up", "refresh-cw")}</div>` : ""}`;
    return `<div class="reviewer-code"><div class="reviewer-links"><a target="_blank" rel="noreferrer" href="${escape(safeHref(job.bundle_url))}">${icon("git-branch")}Prepared private branch</a></div><div class="reviewer-command"><code data-copy-command>${escape(cloneCommand(job))}</code><button class="reviewer-icon" data-review-action="copy" title="Copy clone and checkout commands" aria-label="Copy clone and checkout commands">${icon("copy")}</button></div><dl class="reviewer-meta"><div><dt>Automatically pinned commit</dt><dd>${escape(job.bundle_commit)}</dd></div><div><dt>Detected evaluation entrypoints</dt><dd>${escape(job.policy_dirs.join(", "))}</dd></div></dl>${notice("The entire policy/ tree is preserved, including shared files and nested folders. The script detects evaluation entrypoints; no directory names or commit SHA need to be entered here.", true)}${instructions}${taskTable(job, true)}</div>`;
  }
  function taskCommands(job) {
    return `<form class="reviewer-form" data-review-form="commands"><h4>Actual task evaluation commands <span class="reviewer-required">*</span></h4><div class="reviewer-command-fields">${TASKS.map((task) => `<label>${escape(label(task))}<textarea name="command_${task}" rows="2" maxlength="4000" ${resultFor(job, task) ? "readonly" : ""} required>${escape(job.task_commands?.[task] || "")}</textarea></label>`).join("")}</div><button class="button button-secondary">${icon("save")}Save commands</button></form>`;
  }
  function previewSamples(job) {
    if (!LOCAL) return "";
    const base = "../static/reviewer-demo-files/";
    if (state.stage <= 1 && !job.bundle_commit) return notice("Local acceptance sample only: the following receipt simulates a prepared branch; it does not create a GitHub branch.") + button("demo-code", "Load preview code receipt", "file-json");
    if (state.stage === 1 && job.bundle_commit === "a".repeat(40)) return notice("Simulated local code receipt. This is not a real prepared GitHub commit; use it only to test this preview.");
    if (state.stage === 3 && job.bundle_commit === "a".repeat(40)) return `<details class="reviewer-notes"><summary>Local sample manifests (not competition results)</summary><div class="reviewer-samples">${TASKS.map(task => `<a href="${base}${escape(job.evaluation_id)}/${task}-result.json" download>${label(task)} ${icon("download")}</a>`).join("")}</div></details>`;
    return "";
  }
  function newEmail(job, template = "stage") {
    const blank = template === "blank";
    const issue = ISSUE_TEMPLATES[state.stage].find((item) => item[0] === template)?.[2] || STAGES[state.stage].issue;
    return { stage: state.stage, template, message_id: "msg_" + crypto.randomUUID().replace(/-/g, ""),
      subject: blank ? "" : "RoboSynChallenge evaluation update: " + job.evaluation_id,
      body: blank ? "" : `Dear ${job.team_name},\n\n${issue}\n\nEvaluation ID: ${job.evaluation_id}\nTask / issue details:\n${state.stage <= 1 ? job.preparation_error || "" : ""}\n\n${state.stage === 2 ? "No participant action is required unless separately requested." : "Use the response link to confirm or submit your single code correction within 24 hours of the first issue notification. Corrections must include an immutable GitHub commit URL and all ten task checkpoints."}\n\nRoboSynChallenge organizers` };
  }
  function composer(job) {
    if (!state.emailDraft) return "";
    const email = state.emailDraft;
    return `<section class="reviewer-composer" data-mail-composer><div class="reviewer-composer-head"><h3>Participant email</h3><button class="reviewer-icon" data-review-action="close-email" title="Close email draft" aria-label="Close email draft">${icon("x")}</button></div><form class="reviewer-form" data-review-form="email"><div class="reviewer-verify-grid"><label>Recipient<input value="${escape(job.email)}" readonly></label><label>Template<select data-email-template><option value="stage" ${email.template === "stage" ? "selected" : ""}>General stage issue</option>${ISSUE_TEMPLATES[email.stage].map(([key, title]) => `<option value="${key}" ${email.template === key ? "selected" : ""}>${title}</option>`).join("")}<option value="blank" ${email.template === "blank" ? "selected" : ""}>Blank email</option></select></label></div><label>Subject<input name="subject" value="${escape(email.subject)}" maxlength="200" required></label><label>Message<textarea name="body" rows="9" required>${escape(email.body)}</textarea></label><div class="reviewer-mail-actions"><button class="button button-primary">${icon("send")}${LOCAL ? "Record preview email" : "Send email"}</button><span>${LOCAL ? "Saved locally; nothing is sent." : "Recipient is fixed to the registered participant."}</span></div></form></section>`;
  }
  function jobDetail(job) {
    if (!job) return `<div class="reviewer-empty">No requests are currently assigned to you.</div>`;
    const workflow = flow(job);
return `<article class="reviewer-detail"><header class="reviewer-detail-head"><div><span class="reviewer-id" data-evaluation-id>${escape(job.evaluation_id)}</span><h2>${escape(job.team_name)}</h2><p>${escape(job.artifact_name)} · ${escape(job.email)}</p></div><span class="reviewer-state ${doneCount(job) === 5 ? "completed" : ""}">${doneCount(job) === 5 ? "Completed" : doneCount(job) + " / 5 stages complete"}</span></header><nav class="reviewer-stage-nav" aria-label="Evaluation stages">${STAGES.map((stage, index) => `<button type="button" data-review-stage="${index}" aria-current="${state.stage === index ? "step" : "false"}" class="${state.stage === index ? "active" : ""} ${workflow.stages[index].done ? "done" : ""}" ${index > firstOpen(job) ? "disabled" : ""}><span class="reviewer-step-number">${workflow.stages[index].done ? icon("check") : index + 1}</span><span>${stage.title}</span></button>`).join("")}</nav><div class="reviewer-stage-body"><div class="reviewer-stage-title"><h3>${STAGES[state.stage].title}</h3><span>Step ${state.stage + 1} of 5</span></div><p class="reviewer-description">${STAGES[state.stage].description}</p>${state.error ? `<p class="reviewer-error" role="alert">${escape(state.error)}</p>` : ""}${state.toast ? `<p class="reviewer-toast" role="status">${escape(state.toast)}</p>` : ""}${job.correction ? notice("Participant response: " + escape(job.correction.status) + " · Deadline (UTC): " + escape(job.correction.deadline_at) + "<br>" + escape(job.correction.notes || "")) : ""}${stageContent(job)}${previewSamples(job)}${checks(job)}${composer(job)}${job.messages?.length ? `<div class="reviewer-mail-log"><h4>Email history</h4>${job.messages.map((message) => `<p>${escape(STAGES[message.stage]?.title)} · ${escape(label(message.status))} · ${escape(message.sent_at || "")}<br>${escape(message.subject)}</p>`).join("")}</div>` : ""}</div><footer class="reviewer-footer">${button("previous", "Previous stage", "arrow-left", state.stage === 0 ? "disabled" : "")}${button("email", "Issue / Send email", "mail")}<button type="button" class="button button-primary" data-review-action="next" ${state.busy || (!workflow.stages[state.stage].done && nextBlocker(job)) ? "disabled" : ""} title="${escape(workflow.stages[state.stage].done ? "Stage already completed" : nextBlocker(job))}">${state.stage === 4 ? "Complete review" : "Complete / Next stage"}${icon(state.stage === 4 ? "check" : "arrow-right")}</button></footer></article>`;
  }
  function paint() {
    const content = root()?.querySelector("[data-reviewer-content]");
    if (!content) return;
    if (!state.credentials) content.innerHTML = `${heading(false)}<div class="reviewer-login-layout"><form data-review-form="login" class="reviewer-form reviewer-login"><h2>Reviewer sign in</h2><p>Preliminary simulation evaluation</p>${state.error ? `<p class="reviewer-error" role="alert">${escape(state.error)}</p>` : ""}<label>Email<input type="email" name="email" autocomplete="username" value="${LOCAL ? "1070055979@qq.com" : ""}" required></label><label>Evaluation token<input type="password" name="token" autocomplete="current-password" placeholder="Your assigned evaluation token" required></label><button class="button button-primary" ${state.busy ? "disabled" : ""}>${icon("log-in")}Sign in</button></form><div class="reviewer-login-media"><img src="../static/assets/task-vis-1.png" alt="RoboSynChallenge simulation task environments"><p>RoboSynChallenge · Simulation tasks</p></div></div><div class="reviewer-login-meta"><span>${LOCAL ? "Local reviewer preview" : "Restricted evaluator access"}</span><a href="../#/leaderboard">Public leaderboard</a></div>`;
    else {
      const realJobs = state.jobs.filter((job) => !job.local_walkthrough);
      const complete = realJobs.filter((job) => doneCount(job) === 5).length;
      const units = realJobs.reduce((sum, job) => sum + doneCount(job), 0);
      content.innerHTML = `${heading(true)}<div class="reviewer-progress"><strong>My evaluation progress</strong><progress max="${Math.max(1, realJobs.length * 5)}" value="${units}" aria-label="Overall evaluation progress"></progress><span>${complete} / ${realJobs.length} requests completed · ${units} / ${realJobs.length * 5} stages</span></div><div class="reviewer-layout"><aside class="reviewer-sidebar"><div class="reviewer-sidebar-head"><h2>Assigned requests</h2><span>${realJobs.length}${LOCAL ? " + demo" : ""}</span></div><input class="reviewer-search" type="search" placeholder="Search team or request" aria-label="Search assigned requests" value="${escape(state.search)}"><div class="reviewer-queue">${queueHtml()}</div></aside>${jobDetail(selected())}</div>`;
      if (LOCAL && selected()?.local_walkthrough) {
        const message = document.createElement("div");
        message.className = "reviewer-notice";
        message.textContent = "Local walkthrough only. You can skip every field, checklist and upload. No emails, prepared branches, or Sheet records are created.";
        content.querySelector(".reviewer-stage-body").prepend(message);
      }
    }
    markRequiredFields(content);
    window.lucide?.createIcons();
  }
  function markRequiredFields(content) {
    content.querySelectorAll("[required], [data-stage-check], [name=saved_machine]").forEach((field) => {
      field.setAttribute("aria-required", "true");
      const label = field.closest("label");
      if (!label || label.querySelector(".reviewer-required")) return;
      let caption = label.querySelector("span");
      if (!caption) {
        caption = document.createElement("span");
        caption.className = "reviewer-field-label";
        const textNodes = [...label.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
        if (!textNodes.length) return;
        textNodes[0].before(caption);
        textNodes.forEach((node) => caption.append(node));
      }
      const marker = document.createElement("span");
      marker.className = "reviewer-required";
      marker.textContent = " *";
      marker.setAttribute("aria-hidden", "true");
      caption.append(marker);
    });
  }
  function queueHtml() {
    return state.jobs.filter((job) => (job.team_name + " " + job.artifact_name + " " + job.evaluation_id).toLowerCase().includes(state.search.toLowerCase())).map((job) => `<button type="button" class="reviewer-job ${job.evaluation_id === state.selected ? "selected" : ""}" data-review-job="${escape(job.evaluation_id)}"><strong>${escape(job.team_name)}</strong><span>${escape(job.artifact_name)}</span><small><span>${doneCount(job) === 5 ? "Completed" : STAGES[firstOpen(job)].title}</span><span>${doneCount(job)} / 5</span></small><progress value="${doneCount(job)}" max="5" aria-label="Request progress"></progress></button>`).join("") || `<p class="reviewer-empty">No assigned requests match.</p>`;
  }
  async function refresh() {
    const response = await request("reviewer_queue");
    state.role = response.reviewer?.role || "";
    state.jobs = response.jobs || [];
    if (!selected()) { state.selected = state.jobs[0]?.evaluation_id || ""; state.stage = selected() ? firstOpen(selected()) : 0; }
  }
  async function perform(action) {
    if (state.busy) return;
    state.busy = true;
    root()?.querySelectorAll("button").forEach((element) => { element.disabled = true; });
    try { state.error = ""; await action(); await refresh(); }
    catch (error) { if (!sessionStorage.getItem(STORAGE)) state.credentials = null; state.error = error.message || String(error); }
    finally { state.busy = false; paint(); }
  }
  function saveStage() {
    const job = selected();
    if (!job || flow(job).stages[state.stage].done || state.stage > firstOpen(job)) return Promise.resolve();
    const values = draft(job);
    return request("reviewer_save_checks", { evaluation_id: job.evaluation_id, stage: state.stage, checks: values, machine_id: values.machine_id || "" });
  }
  function openEmail() {
    state.emailDraft ||= newEmail(selected());
    paint();
    root().querySelector("[data-mail-composer]")?.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  function mount() {
    const element = root();
    element.addEventListener("click", (event) => {
      const jobButton = event.target.closest("[data-review-job]");
      if (jobButton && !state.busy) {
        perform(async () => { await saveStage(); state.selected = jobButton.dataset.reviewJob; state.stage = firstOpen(selected()); state.emailDraft = null; state.toast = ""; });
        return;
      }
      const stageButton = event.target.closest("[data-review-stage]");
      if (stageButton && !stageButton.disabled) { perform(async () => { await saveStage(); state.stage = Number(stageButton.dataset.reviewStage); state.emailDraft = null; state.toast = ""; }); return; }
      const action = event.target.closest("[data-review-action]")?.dataset.reviewAction;
      if (!action || state.busy) return;
      if (action === "logout") { sessionStorage.removeItem(STORAGE); state.credentials = null; state.jobs = []; state.selected = ""; state.emailDraft = null; state.drafts.clear(); state.error = ""; paint(); }
      if (action === "refresh") perform(async () => { await saveStage(); });
      if (action === "copy") {
        const text = event.target.closest(".reviewer-command")?.querySelector("code")?.textContent || "";
        navigator.clipboard.writeText(text).then(() => { state.toast = "Command copied."; paint(); }).catch(() => { state.error = "Clipboard access unavailable. Select and copy the command."; paint(); });
      }
      if (action === "previous" && state.stage > 0) perform(async () => { await saveStage(); state.stage -= 1; state.emailDraft = null; state.toast = ""; });
      if (action === "email") openEmail();
      if (action === "retry-code") perform(async () => { await request("reviewer_retry_preparation", { evaluation_id: selected().evaluation_id }); state.toast = "Preparation retry queued. Refresh after the organizer's script runs."; });
      if (action === "demo-code" && LOCAL) perform(async () => {
        const job = selected();
        const response = await fetch("../static/reviewer-demo-files/" + encodeURIComponent(job.evaluation_id) + "/code-receipt.json");
        if (!response.ok) throw new Error("Generate the local acceptance files first.");
        await request("reviewer_prepare", { evaluation_id: job.evaluation_id, ...await response.json() });
      });
      if (action === "close-email") { state.emailDraft = null; paint(); }
      if (action === "next") perform(async () => {
        const job = selected();
        const values = draft(job);
        if (!flow(job).stages[state.stage].done) await request("reviewer_complete_stage", { evaluation_id: job.evaluation_id, stage: state.stage, checks: values, machine_id: values.machine_id || "" });
        if (state.stage < 4) { state.stage += 1; state.toast = ""; } else state.toast = "Review completed. Results remain private until organizer publication.";
        state.emailDraft = null;
      });
    });
    element.addEventListener("input", (event) => {
      if (event.target.matches(".reviewer-search")) { state.search = event.target.value; element.querySelector(".reviewer-queue").innerHTML = queueHtml(); return; }
      if (event.target.matches("[data-stage-check]")) {
        draft(selected())[event.target.dataset.stageCheck] = event.target.checked;
        const next = element.querySelector("[data-review-action=next]");
        next.disabled = Boolean(nextBlocker(selected())); next.title = nextBlocker(selected());
      }
      if (event.target.closest("[data-review-form=email]") && ["subject", "body"].includes(event.target.name)) state.emailDraft[event.target.name] = event.target.value;
    });
    element.addEventListener("change", (event) => {
      if (event.target.matches("[data-task-picker]")) { state.task = event.target.value; paint(); }
      if (event.target.matches("[data-policy-picker]")) { state.policyDir = event.target.value; paint(); }
      if (event.target.matches("[data-email-template]")) {
        const stage = state.emailDraft.stage; state.emailDraft = newEmail(selected(), event.target.value); state.emailDraft.stage = stage; paint();
        element.querySelector("[data-mail-composer]")?.scrollIntoView({ block: "start" });
      }
      if (event.target.name === "saved_machine") {
        draft(selected()).machine_id = event.target.value;
        const next = element.querySelector("[data-review-action=next]"); next.disabled = Boolean(nextBlocker(selected())); next.title = nextBlocker(selected());
      }
    });
    element.addEventListener("submit", (event) => {
      const form = event.target;
      if (!form.matches("[data-review-form]")) return;
      event.preventDefault();
      const data = new FormData(form);
      const type = form.dataset.reviewForm;
      if (type === "version-exception") perform(async () => {
        await request("reviewer_approve_version_exception", { evaluation_id: selected().evaluation_id,
          reason: String(data.get("reason") || ""), argument_reviewed: data.has("argument_reviewed") });
        state.toast = "Argument approval recorded. Rebuild queued.";
      });
      if (type === "reassign") perform(async () => {
        await request("reviewer_reassign", { evaluation_id: selected().evaluation_id, assign_to: String(data.get("assign_to") || ""), reason: String(data.get("reason") || "") });
        state.selected = ""; state.toast = "Request reassigned.";
      });
      if (type === "login") {
        state.credentials = { email: String(data.get("email") || "").trim().toLowerCase(), token: String(data.get("token") || "") };
        perform(async () => { await request("reviewer_login"); sessionStorage.setItem(STORAGE, JSON.stringify(state.credentials)); });
        return;
      }
      const job = selected();
      if (type === "admission") perform(async () => {
        const revoke = data.has("revoke");
        const date = new Date(String(data.get("expires_at") || ""));
        if (!revoke && (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now())) throw new Error("Select a future expiry timestamp.");
        await request("reviewer_submission_window", { participant_email: String(data.get("participant_email") || "").trim(),
          expires_at: revoke ? "" : date.toISOString(), reason: String(data.get("reason") || "").trim(), revoke });
        state.toast = LOCAL ? "Preview only: no submission window changed." : revoke ? "Individual exception revoked." : "Individual submission window saved for the current participant token.";
      });
      if (type === "commands") perform(async () => {
        const commands = Object.fromEntries(TASKS.map((task) => [task, String(data.get("command_" + task) || "").trim()]));
        if (Object.values(commands).some((value) => !value)) throw new Error("The actual command is required for every task.");
        for (const task of TASKS) if (!resultFor(job, task)) await request("reviewer_save_command", { evaluation_id: job.evaluation_id, task, command: commands[task] });
        state.toast = "Actual evaluation commands saved.";
      });
      if (type === "verify") perform(() => request("reviewer_verify_coverage", { evaluation_id: job.evaluation_id, coverage_confirmed: data.has("coverage_confirmed"), task_checkpoint_links: Object.fromEntries(TASKS.map((task) => [task, String(data.get(task) || "").trim()])) }));
      if (type === "onedrive") perform(async () => {
        const file = data.get("evidence_zip");
        const json = data.get("evidence_manifest");
        if (!file?.size || !json?.size || json.size > 45000) throw new Error("Select the evidence ZIP and its matching JSON (under 45 KB).");
        const record = JSON.parse(await json.text());
        if (record.evaluation_id !== job.evaluation_id || record.submission_id !== job.submission_id || record.bundle_commit !== job.bundle_commit || !TASKS.includes(record.task)) throw new Error("The evidence belongs to a different evaluation, commit or task.");
        const progress = (title, fraction) => {
          const text = element.querySelector("[data-upload-status]");
          const meter = element.querySelector("[data-upload-progress]");
          if (text) text.textContent = title;
          if (meter) { meter.hidden = false; meter.value = fraction; }
        };
        if (LOCAL) {
          const checksum = await RSCOneDrive.hashBlob(file, value => progress("Checking preview ZIP", value));
          if (checksum !== record.artifacts?.sha256) throw new Error("Selected ZIP SHA256 does not match the JSON.");
          state.toast = "Local ZIP checksum checked. Microsoft is not connected; no ZIP or JSON was uploaded.";
          return;
        }
        const ready = await RSCOneDrive.upload({ file, record, request, progress, restart: form.querySelector('[name="restart"]')?.checked === true });
        await request("reviewer_submit_result", { evaluation_id: job.evaluation_id, result: ready });
        state.toast = label(ready.task) + " ZIP uploaded, SHA256 verified and JSON registered.";
      });
      if (type === "result") perform(async () => {
        const file = data.get("result_file");
        if (!file?.size || file.size > 45000) throw new Error("Select a JSON manifest smaller than 45 KB.");
        const record = JSON.parse(await file.text());
        { await request("reviewer_submit_result", { evaluation_id: job.evaluation_id, result: record }); state.toast = label(record.task) + " manifest uploaded and validated."; }
      });
      if (type === "accept") perform(() => request("reviewer_check_result", { evaluation_id: job.evaluation_id, task: state.task, decision: "checked", note: "", checks: { video: data.has("video"), trajectory: data.has("trajectory"), checksum: data.has("checksum") } }));
      if (type === "email") perform(async () => {
        const email = state.emailDraft;
        await request("reviewer_send_issue", { evaluation_id: job.evaluation_id, message_id: email.message_id, stage: email.stage, subject: String(data.get("subject") || "").trim(), body: String(data.get("body") || "").trim() });
        state.emailDraft = null; state.toast = LOCAL ? "Preview email recorded locally. No email was sent." : "Email sent and recorded.";
      });
    });
    paint();
    if (state.credentials) perform(async () => {});
  }
  window.RSCReviewer = { render, mount };
})();
