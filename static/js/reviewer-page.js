(() => {
  "use strict";
  const STORAGE = "rsc-reviewer-credentials-v1";
  const PREVIEW_STORAGE = "rsc-reviewer-preview-workflow-v4";
  const API = String(window.ROBO_SYN_CONFIG?.API_BASE_URL || "").trim();
  const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname) && new URLSearchParams(location.search).has("review_preview");
  const TASKS = ["click_bell", "drawer_open_place", "mixer_operating", "table_rearrangement", "water_pouring", "handle_basket", "items_handover", "item_assembly", "manipulate_pipette", "sample_loading"];
  const STEPS = { click_bell: 361, drawer_open_place: 900, mixer_operating: 500, table_rearrangement: 361, water_pouring: 500, handle_basket: 500, items_handover: 350, item_assembly: 500, manipulate_pipette: 1000, sample_loading: 500 };
  const STAGES = [
    { title: "Submission check", description: "Check which checkpoint and policy entrypoint are used for each of the 10 tasks. Code preparation runs automatically, independently of checkpoint mapping. For legacy requests, record the Hugging Face URLs below using the participant's documentation. Saving starts checkpoint access checks. You do not enter a commit SHA or build a branch.",
      checks: { repository_access: "Code preparation completed automatically.", checkpoint_access: "I checked the Hugging Face checkpoint URL for each of the 10 tasks against the participant\'s documentation.", ten_tasks: "I identified the policy directory and evaluation entrypoint for each of the 10 tasks." },
      issue: "We could not complete the submission access check. Please confirm repository access and provide the checkpoint URL and policy entrypoint used for each of the 10 tasks." },
    { title: "Evaluation code", description: "Clone the prepared private branch into its evaluation-specific directory. Follow the repository README and the policy entrypoint documentation.",
      checks: { commit_verified: "My checkout matches the pinned evaluation commit.", policy_entrypoints: "I have identified the correct policy directory and entrypoint for each task.", dependencies: "The policy dependencies are installed in an isolated environment." },
      issue: "We could not prepare or start your policy. Please check the complete policy/ tree, documented entrypoints and dependencies. Use the response form below for confirmation or the correction requested in the latest issue email, including an immutable GitHub commit and checkpoint URLs for all 10 tasks." },
    { title: "Environment check", description: "Run the built-in environment check. Continue only when the command prints ENVIRONMENT CHECK PASSED and exits successfully.",
      checks: { machine_checked: "The built-in environment check printed ENVIRONMENT CHECK PASSED with exit code 0.", reference_checked: "The official expert planning, rendering comparison and action/state smoke check passed." },
      issue: "Evaluation is paused while we investigate an environment or runtime issue. No participant-side changes are requested unless the details below identify a policy issue." },
    { title: "Evaluation and upload", description: "Run each task from the terminal. The official collector generates JSON + ZIP, uploads the ZIP to OneDrive and registers the verified JSON automatically. No browser file upload is needed.",
      checks: { all_runs: "All ten tasks were evaluated with the pinned code and frozen seed packet.", archives_uploaded: "All evidence archives are uploaded and accessible to the organizers." },
      issue: "Evaluation could not finish with the submitted policy. Please review the affected task and error below. Use the response form to confirm the current code or submit your corrected code and checkpoints, including checkpoint URLs for all 10 tasks." },
    { title: "Result review", description: "Review each task's evidence and checksum before accepting it. This records the reviewer decision; it does not publish anything on the public leaderboard.",
      checks: { videos_checked: "I reviewed the videos and task outcomes for all ten tasks.", trajectories_checked: "I checked the saved state/action trajectories and episode coverage.", hashes_checked: "The downloaded archives match their recorded SHA256 checksums." },
      issue: "We found an issue while reviewing the evaluation evidence. Please check the affected task and details below, and reply with clarification or a corrected immutable submission." },
  ];
  const ISSUE_TEMPLATES = [
    [
      ["repository_access", "Private repository access", "We cannot read the submitted GitHub repository using the preparation account. Please grant the organizer-designated account read access and confirm the exact repository and commit URL. The account must accept its invitation before preparation can proceed."],
      ["missing_code", "Incomplete code", "The repository is missing required policy files or task entrypoints. Please provide the complete policy/ tree, including eval.sh, deploy_policy.yml and deploy_policy.py for the relevant adapters, and document all ten task entrypoints."],
      ["missing_checkpoints", "Missing or inaccessible checkpoints", "We could not download checkpoints for all 10 tasks. Please verify each Hugging Face URL or account/repository and its required files. Restricted checkpoints must use gated access: keep the repository visible, enable manual access requests and Add access for the individual user RoboSynChallenge. Private-repository invitations and participant-provided tokens are not supported. Confirm or submit corrections using this issue email's response form."]
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
  const state = { credentials: null, role: "", jobs: [], selected: "", stage: 0, task: TASKS[0], policyDir: "", busy: false, error: "", toast: "", preview: null, drafts: new Map(), emailDraft: null, search: "", pendingSelection: "", view: ["#downloads", "#email-status"].includes(location.hash) ? location.hash.slice(1) : "workspace", mailStatus: [] };
  try { state.credentials = JSON.parse(sessionStorage.getItem(STORAGE) || "null"); } catch { /* Require sign-in. */ }
  let saveChain = Promise.resolve();
  const pendingSaves = new Map();
  const escape = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const label = (value) => String(value || "").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  const safeHref = (value) => { try { const url = new URL(String(value)); return url.protocol === "https:" ? url.href : "#"; } catch { return "#"; } };
  function sourceLinks(value, title, symbol) {
    return String(value || "").split(/[;；\s]+/).map(safeHref).filter(url => url !== "#").map((url) => {
      const parsed = new URL(url);
      return `<a href="${escape(url)}" target="_blank" rel="noreferrer">${icon(symbol)}${escape(title)}: ${escape(parsed.pathname.slice(1))}</a>`;
    }).join("");
  }
  const icon = (name) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const button = (action, name, symbol, extra = "") => `<button type="button" class="button button-secondary" data-review-action="${action}" ${extra}>${icon(symbol)}${name}</button>`;
  const root = () => document.querySelector("[data-reviewer-root]");
  const selected = () => state.jobs.find((job) => job.evaluation_id === state.selected);
  const canEdit = (job) => Boolean(job && (LOCAL || state.role !== "observer" && job.reviewer_email === state.credentials?.email));
  const flow = (job) => job.workflow || { stages: STAGES.map(() => ({ done: false, checks: {} })), machine_id: "" };
  const doneCount = (job) => flow(job).stages.filter((stage) => stage.done).length;
  const firstOpen = (job) => { const index = flow(job).stages.findIndex((stage) => !stage.done); return index < 0 ? 4 : index; };
  const draftKey = (job) => job.evaluation_id + ":" + state.stage;
  const draft = (job) => {
    if (!state.drafts.has(draftKey(job))) state.drafts.set(draftKey(job), { ...flow(job).stages[state.stage].checks, machine_id: flow(job).machine_id || job.machines?.find((machine) => machine.status === "passed")?.machine_id || "" });
    const values = state.drafts.get(draftKey(job));
    // Preparation is a script-owned status, not a reviewer checklist item.
    if (state.stage === 0) values.repository_access = codeVerified(job);
    return values;
  };
  const versionSuffix = (job) => `${job.preparation_attempt ? "-correction" + job.preparation_attempt : ""}${job.version_generation ? "-exception" + job.version_generation : ""}`;
  const cloneBranch = (job) => {
    const match = String(job.bundle_url || "").match(/^https:\/\/github\.com\/ZhaoRunyi\/RoboSynChallenge_eval\/tree\/(submissions\/[A-Za-z0-9_.-]+)$/);
    return match ? match[1] : "";
  };
  const cloneCommand = (job) => `git clone --single-branch --branch ${cloneBranch(job)} https://github.com/ZhaoRunyi/RoboSynChallenge_eval.git ${cloneDirectory(job)}\ngit -C ${cloneDirectory(job)} checkout --detach ${job.bundle_commit}`;
  const cloneDirectory = (job) => `"/path/to/RoboSynChallenge_${job.evaluation_id}${versionSuffix(job).replace(/-/g, "_")}${job.bundle_commit ? "_" + job.bundle_commit.slice(0, 12) : ""}"`;
  const resultFor = (job, task) => (job.results || []).find((result) => result.task === task);
  const codeVerified = (job) => Boolean(job.bundle_commit && job.bundle_url || job.code_bundle_commit && job.code_bundle_url);
  const nextBlocker = (job) => {
    if (LOCAL && job.local_walkthrough) return "";
    const checks = draft(job);
    if (state.stage === 0 && job.coverage_status === "legacy_unverified") return "Record a checkpoint URL for each of the 10 tasks";
    if (state.stage === 0 && !codeVerified(job)) return "Automatic code preparation must succeed before continuing";
    if (state.stage === 1 && !job.bundle_commit) return job.version_status === "provisional"
      ? "Submission checks passed. The runnable evaluation branch is being prepared automatically. No deadline wait or additional reviewer form is required."
      : "The formal evaluation branch is not available yet. Check automatic preparation status.";
    if (state.stage === 1 && !cloneBranch(job)) return "The prepared branch URL is invalid. Contact the organizers; do not guess a branch name.";
    if (state.stage === 0 && job.hf_check_status !== "passed" && !TASKS.every(task => job.hf_access?.[task]?.accessible && job.hf_access[task].url === job.task_checkpoint_links?.[task])) return "Automatic HF access checks must pass for all 10 task URLs";
    if (Object.keys(STAGES[state.stage].checks).some((key) => checks[key] !== true)) return "Complete the reviewer checklist";
    if (state.stage === 3 && TASKS.some((task) => !job.task_commands?.[task])) return "Record all 10 actual evaluation commands";
    if (state.stage === 3 && TASKS.some((task) => !["submitted", "checked"].includes(resultFor(job, task)?.status))) return "Upload all 10 task results";
    if (state.stage === 4 && TASKS.some((task) => resultFor(job, task)?.status !== "checked")) return "Accept all 10 task results";
    return "";
  };

  async function request(action, fields = {}) {
    if (LOCAL) return previewAction(action, fields);
    if (!API) throw new Error("Reviewer backend is not configured.");
    const response = await fetch(API, { method: "POST", keepalive: action === "reviewer_save_checks", headers: { "Content-Type": "text/plain;charset=utf-8" },
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
      if (!response.ok) throw new Error("Workflow demo data is missing.");
      state.preview = await response.json();
      try {
        const saved = JSON.parse(sessionStorage.getItem(PREVIEW_STORAGE) || "null");
        if (saved?.captured_at === state.preview.captured_at) { state.preview.jobs = saved.jobs; state.preview.machines = saved.machines; }
      } catch { /* Start a new local preview. */ }
      state.preview.machines ||= [];
      state.preview.jobs.forEach((job) => { job.workflow ||= { stages: STAGES.map(() => ({ done: false, checks: {} })), machine_id: "" }; });
    }
    if (state.credentials.email !== state.preview.reviewer_email || await hash(state.credentials.token) !== state.preview.reviewer_token_sha256) throw new Error("Invalid reviewer credentials.");
    if (action === "reviewer_mail_status") return { ok: true, messages: state.preview.jobs.flatMap(job => (job.messages || []).map(message => ({ ...message, evaluation_id: job.evaluation_id, team_name: job.team_name, recipient: job.email, gmail_url: "https://mail.google.com/mail/u/?authuser=robosynchallenge%40gmail.com#search/" + encodeURIComponent(`in:sent subject:"${message.subject}"`) }))) };
    if (action === "reviewer_login") return { ok: true, reviewer: { email: state.credentials.email, role: "admin" } };
    if (action === "reviewer_queue") return { ok: true, reviewer: { email: state.credentials.email, role: "admin" },
      jobs: state.preview.jobs.filter((job) => job.reviewer_email === state.credentials.email).map((job) => ({ ...job, machines: state.preview.machines })),
      ...(fields.include_mail_status ? { messages: (await previewAction("reviewer_mail_status", {})).messages } : {}) };
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
          TASKS.some((task) => !/^https:\/\/huggingface\.co\/\S+$/i.test(String(fields.task_checkpoint_links?.[task] || "")))) throw new Error("Record and confirm a checkpoint URL for each of the 10 tasks first.");
      job.task_checkpoint_links = fields.task_checkpoint_links; job.coverage_status = "verified_all_10"; job.coverage_verified_by = state.credentials.email;
      job.hf_check_status = "pending"; job.hf_check_error = ""; job.hf_access = {};
    } else if (action === "reviewer_prepare") {
      if (job.coverage_status === "legacy_unverified" || !/^[a-f0-9]{40}$/.test(fields.bundle_commit) ||
          fields.bundle_url !== "https://github.com/ZhaoRunyi/RoboSynChallenge_eval/tree/submissions/" + job.evaluation_id + versionSuffix(job) ||
          !fields.policy_dirs?.length || fields.policy_dirs.some((dir) => !/^policy(?:\/[A-Za-z0-9_.-]+)*$/.test(dir) || dir.split("/").some((part) => [".", ".."].includes(part)))) throw new Error("Prepared code metadata is invalid.");
      job.bundle_url = fields.bundle_url; job.bundle_commit = fields.bundle_commit; job.policy_dirs = fields.policy_dirs; job.state = "ready";
      job.preparation_status = "ready"; job.preparation_error = "";
    } else if (action === "reviewer_approve_version_exception") {
      if (!fields.argument_reviewed || !String(fields.reason || "").trim() || !String((job.preparation_error || "") + (job.hf_check_error || "")).includes("NO_LEGAL_VERSION")) throw new Error("Review and record the participant argument first.");
      job.version_generation = (job.version_generation || 0) + 1;
      job.version_cutoff_at = new Date().toISOString(); job.preparation_status = "pending"; job.preparation_error = "";
    } else if (action === "reviewer_retry_preparation") {
      if (job.bundle_commit) throw new Error("Prepared code already exists.");
      job.preparation_status = "pending"; job.preparation_error = "";
      if (job.hf_check_status === "failed") { job.hf_check_status = "pending"; job.hf_check_error = ""; }
    } else if (["reviewer_complete_stage", "reviewer_save_checks"].includes(action)) {
      if (!Number.isInteger(fields.stage) || fields.stage < 0 || fields.stage > 4 || job.workflow.stages.slice(0, fields.stage).some((stage) => !stage.done)) throw new Error("Complete the previous stages first.");
      if (action === "reviewer_complete_stage") {
        if (Object.keys(STAGES[fields.stage].checks).some((key) => fields.checks?.[key] !== true)) throw new Error("Complete every checklist item.");
        if (fields.stage === 0 && job.coverage_status === "legacy_unverified") throw new Error("Verify the checkpoint URL for each of the 10 tasks first.");
        if (fields.stage === 0 && (!codeVerified(job) || job.hf_check_status !== "passed")) throw new Error("Automatic code and checkpoint access checks must pass first.");
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
    } else throw new Error("Unknown workflow demo action.");
    persistPreview();
    return { ok: true };
  }

  function render() {
    return `<section class="reviewer-page"><div class="shell" data-reviewer-root><div data-reviewer-content></div></div></section>`;
  }
  function heading(signedIn) {
    return `<div class="reviewer-heading"><div><h1>Evaluation workspace</h1></div>${signedIn ? `<div class="reviewer-toolbar"><span>${escape(state.credentials.email)}</span><button class="reviewer-icon" data-review-action="refresh" title="Refresh requests" aria-label="Refresh requests">${icon("refresh-cw")}</button><button class="reviewer-icon" data-review-action="logout" title="Sign out" aria-label="Sign out">${icon("log-out")}</button></div>` : ""}</div>`;
  }
  function checks(job) {
    const values = draft(job);
    const blocker = !flow(job).stages[state.stage].done && nextBlocker(job);
    return `${state.stage === 4 ? scoreSummary(job) : ""}<div class="reviewer-checks"><h4>Completion checklist</h4>${Object.entries(STAGES[state.stage].checks).filter(([key]) => key !== "repository_access").map(([key, text]) => `<label class="reviewer-check"><input type="checkbox" data-stage-check="${key}" ${values[key] ? "checked" : ""} ${flow(job).stages[state.stage].done ? "disabled" : ""}><span>${text}</span></label>`).join("")}</div>${blocker ? notice("Next stage blocked: " + escape(blocker), false, "warning") : ""}${admissionControls(job)}`;
  }
  const notice = (text, success = false, severity = "info") => `<div class="reviewer-notice ${success ? "success" : severity}">${["warning", "error"].includes(severity) ? `<strong>${severity.toUpperCase()}:</strong> ` : ""}${text}</div>`;
  const step = (number, title, body) => `<section class="reviewer-instruction"><h4><span class="reviewer-instruction-number">${number}</span>${title}</h4>${body}</section>`;
  const metric = (value, unit = "", digits = 1) => Number.isFinite(value) ? Number(value).toFixed(digits) + unit : "Pending";
  const commandBox = (text, title) => `<div class="reviewer-command"><code data-copy-command>${escape(text)}</code><button class="reviewer-icon" data-review-action="copy" title="${escape(title)}" aria-label="${escape(title)}">${icon("copy")}</button></div>`;
  function scoreSummary(job) {
    const overall = job.overall_summary || {};
    const row = resultFor(job, state.task);
    return `<h4>Ten-task average</h4><dl class="reviewer-meta"><div><dt>Success rate</dt><dd>${metric(overall.success_rate, "%")}</dd></div><div><dt>Action steps</dt><dd>${metric(overall.average_steps)}</dd></div><div><dt>Inference / episode</dt><dd>${metric(overall.inference_per_episode_ms, " ms")}</dd></div><div><dt>Weighted score</dt><dd>${metric(overall.weighted_score)}</dd></div></dl>${!["calibrated", "published_act_reference"].includes(overall.score_status) ? notice("Final weighted score awaits complete ten-task evidence and the pinned published RTX 5090 ACT reference. Uncalibrated values are not published.", false, "warning") : ""}${row && job.task_commands?.[state.task] ? commandBox(job.task_commands[state.task], "Copy recorded evaluation command") : ""}${row ? commandBox(`printf '%s  %s\\n' '${row.artifacts?.sha256}' '${job.evaluation_id}-${state.task}-evidence.zip' | sha256sum --check`, "Copy downloaded archive checksum check") : ""}`;
  }
  function runCommands(job) {
    const dirs = job.policy_dirs || [];
    const dir = dirs.includes(state.policyDir) ? state.policyDir : dirs.length === 1 ? dirs[0] : "";
    const target = `results/${state.task}`;
    const command = `cd ${cloneDirectory(job)}\npython tools/run_task_evaluation.py --task ${state.task} --submission-id ${job.submission_id} --policy-dir ${dir || "SELECT_POLICY_DIRECTORY"} --seeds "\${RSC_SEED_PACKET:?Set the organizer seed packet path}" --checkpoints "\${RSC_CHECKPOINTS:?Set the downloaded checkpoint directory}" --policy-image "\${RSC_POLICY_IMAGE:?Set the approved image@sha256 digest}" --output ${target}`;
    const retry = `cd ${cloneDirectory(job)}\npython tools/upload_evidence.py --manifest ${target}/package/${job.evaluation_id}-${state.task}-result.json --archive ${target}/package/${job.evaluation_id}-${state.task}-evidence.zip`;
    return (job.preparation_attempt ? notice(`Participant correction round ${Number(job.preparation_attempt)}: use the new clone directory and its frozen checkpoint index. Do not reuse checkpoints, commands or results from a previous round. Check that each task loads the matching checkpoint revision.`, false, "warning") : "") + step(1, "Check OneDrive access", commandBox(`cd ${cloneDirectory(job)}\npython tools/check_upload.py`, "Copy storage check command") + "<p>Run once before evaluation. The private clone already contains its evaluation-scoped authorization; no Microsoft sign-in is needed.</p>") +
      step(2, "Select a task and run the official collector", `<div class="reviewer-task-picker"><label>Task<select data-task-picker>${TASKS.map(task => `<option value="${task}" ${task === state.task ? "selected" : ""}>${label(task)}</option>`).join("")}</select></label><label>Detected policy entrypoint<select data-policy-picker required><option value="">Select entrypoint</option>${dirs.map(value => `<option value="${escape(value)}" ${value === dir ? "selected" : ""}>${escape(value)}</option>`).join("")}</select></label></div>${!dir ? notice("Choose the documented entrypoint for this task before copying the run command.", false, "warning") : commandBox(command, "Copy task evaluation command")}<p>The collector runs 100 frozen episodes and records the actual command. Set the checkpoint directory, seed packet and approved dependency image on the machine. Add --model-config and --checkpoint-relative when required by the participant's adapter.</p>`) +
      step(3, "Wait for automatic upload; retry only if it fails", "<p>Each task produces JSON + ZIP. The ZIP is uploaded directly to OneDrive under evaluation_id/task/latest. The script verifies SHA256 and registers the JSON and actual command in the backend. Retrying does not rerun the policy.</p>" + commandBox(retry, "Copy upload retry command") + notice("If the uploaded ZIP fails checksum verification, add --restart to the retry command. Do not rerun evaluation or register unfinished JSON. Accepted task results are locked.", false, "warning"));
  }
  function admissionControls(job) {
    const hasIssue = job?.preparation_status === "failed" || job?.hf_check_status === "failed" || ["awaiting", "confirmed"].includes(job?.correction?.status) ||
      job?.results?.some(result => result.status === "needs_correction") ||
      (job?.correction?.status !== "corrected" && job?.messages?.some(message => message.stage !== 2 && message.status === "sent"));
    if (state.role !== "admin" || !job || job.local_walkthrough || doneCount(job) === 5 || !hasIssue) return "";
    return `<details class="reviewer-notes"><summary>Organizer only: allow this participant to submit after the deadline</summary><p>Use only after approving an exception for this participant. This reopens Submit policy for their current access token until the time below. A new eval request can replace the one being reviewed. Issue-email forms allow corrections without a 24-hour deadline; this separate exception is only for a new eval request.</p><form class="reviewer-form" data-review-form="admission"><label>Participant account<input name="participant_email" type="email" value="${escape(job.email)}" readonly></label><label>Allow new eval requests until (your browser local time)<input name="expires_at" type="datetime-local" required></label><label>Reason for the organizer-approved exception<input name="reason" maxlength="500" required></label><label class="reviewer-confirm"><input type="checkbox" name="revoke">Revoke an existing exception instead of reopening submissions</label><button class="button button-secondary">${icon("save")}Save submission exception</button></form></details>`;
  }
  function versionControls(job) {
    if (job.local_walkthrough) return "";
    const report = job.version_report?.code;
    const metadata = report ? notice(`Version selection: ${escape(job.version_status)}<br>Commit: <code>${escape(report.revision)}</code><br>Committed: ${escape(report.committed_at)}<br>Cutoff: ${escape(report.cutoff_at)}`, false, job.version_status === "provisional" ? "warning" : "info") : "";
    const appeal = String((job.preparation_error || "") + (job.hf_check_error || "")).includes("NO_LEGAL_VERSION") ? `<form class="reviewer-form" data-review-form="version-exception"><h4>Approve participant argument</h4><label>Accepted email argument and reason<textarea name="reason" required maxlength="6000"></textarea></label><label class="reviewer-confirm"><input type="checkbox" name="argument_reviewed" required>I reviewed the participant's email argument and approve one rebuild using versions available now.</label><button class="button button-secondary">${icon("check")}Approve / Queue rebuild</button></form>` : "";
    return metadata + appeal;
  }
  function taskTable(job, checkpoints = false) {
    return `<table class="reviewer-task-table"><thead><tr><th>Task</th>${checkpoints ? "<th>Checkpoint</th><th>Max steps</th>" : "<th>Episodes</th><th>Success</th><th>Steps</th><th>Inference / episode</th><th>Score</th><th>Status</th>"}</tr></thead><tbody>${TASKS.map((task) => {
      const row = resultFor(job, task);
      const access = job.hf_access?.[task];
      const accessStatus = access?.accessible
        ? `${Number(access.files_checked)} files checked · <code>${escape(access.revision.slice(0, 12))}</code>`
        : job.hf_check_status === "failed" ? "WARNING: Access not confirmed; see check error below"
          : job.hf_check_status === "checking" ? "Checking checkpoint access" : "Access check queued";
      return `<tr><td><strong>${escape(label(task))}</strong></td>${checkpoints ? `<td><a target="_blank" rel="noreferrer" href="${escape(safeHref(job.task_checkpoint_links?.[task]))}">Hugging Face ${icon("external-link")}</a><br><small>${accessStatus}</small></td><td>${STEPS[task]}</td>` : `<td>${row?.summary?.episodes || "—"} / 100</td><td>${metric(row?.summary?.success_rate, "%")}</td><td>${metric(row?.summary?.average_steps)}</td><td>${metric(row?.summary?.inference_per_episode_ms, " ms")}</td><td>${metric(row?.summary?.weighted_score)}</td><td class="${row?.status === "checked" ? "checked" : ""}">${escape(label(row?.status || "Not uploaded"))}</td>`}</tr>`;
    }).join("")}</tbody></table>`;
  }
  function stageContent(job) {
    return stageContentDetails(job) + (state.stage === 0 ? versionControls(job) : "");
  }
  function stageContentDetails(job) {
    if (state.stage === 0) {
      const identity = `<dl class="reviewer-meta"><div><dt>Participant</dt><dd>${escape(job.email)}</dd></div><div><dt>Submission ID</dt><dd>${escape(job.submission_id)}</dd></div><div><dt>Submitted</dt><dd>${escape(job.created_at)}</dd></div><div><dt>Task checkpoints</dt><dd>${job.coverage_status === "legacy_unverified" ? "10 task checkpoint URLs required" : "Checkpoint URLs recorded for all 10 tasks"}</dd></div></dl><div class="reviewer-links">${sourceLinks(job.code_link, "Code repository", "github")}${sourceLinks(job.checkpoint_link, "Checkpoint", "external-link")}</div>${job.technical_notes ? `<details class="reviewer-notes"><summary>Participant run commands and dependencies</summary><p>${escape(job.technical_notes)}</p></details>` : ""}`;
      const mappingForm = `<form class="reviewer-form" data-review-form="verify"><p>Enter each task's documented Hugging Face URL or account/repository. Use the complete URL when a pinned revision or checkpoint subdirectory is specified. Saving queues a fresh access check; browser login does not prove the download token has access. Do not substitute another model to bypass an access error.</p><div class="reviewer-verify-grid">${TASKS.map(task => `<label>${label(task)}<input type="text" name="${task}" value="${escape(job.task_checkpoint_links?.[task] || "")}" placeholder="https://huggingface.co/account/repository or account/repository" required></label>`).join("")}</div><label class="reviewer-confirm"><input type="checkbox" name="coverage_confirmed" required>I verified every task's checkpoint from the participant's documentation; shared checkpoints are explicitly documented.</label><button class="button button-secondary">${icon("check")}Save task checkpoints</button></form>`;
      const checkpoints = job.coverage_status !== "legacy_unverified" ? taskTable(job, true) +
        (!job.bundle_commit && canEdit(job) ? `<details class="reviewer-notes"><summary>Correct documented task checkpoint URLs</summary>${mappingForm}</details>` : "") :
        notice("This legacy request did not specify each task's checkpoint. Use the participant's documentation; do not guess. Multiple tasks may share a URL only when documented. Ten different models are not required. Unclear documentation: use Issue / Send email.", false, "warning") + mappingForm;
      const preparation = job.bundle_commit ? notice("Code prepared automatically. Evaluation commit: <code>" + escape(job.bundle_commit) + "</code>. Participant policy/ is retained; environment code comes from the private official base.", true) + preparationWarnings(job) : codeStage(job);
      return step(1, "Code preparation / GitHub access", identity + `<div class="reviewer-automatic-status"><h4>Automatic code preparation status</h4>${preparation}</div>`) +
        step(2, "Hugging Face checkpoint access", checkpoints + checkpointStatus(job));
    }
    if (state.stage === 1) return step(1, "Clone the prepared code", codeStage(job)) + (job.bundle_commit ? step(2, "Download the frozen task checkpoints", commandBox(`cd ${cloneDirectory(job)}\nexport RSC_CHECKPOINTS=/path/to/checkpoints\npython tools/download_checkpoints.py --output "$RSC_CHECKPOINTS"`, "Copy pinned checkpoint download command") + "<p>Replace /path/to/checkpoints with the chosen local directory. The command uses the organizer's RoboSynChallenge HF authorization automatically. No personal HF token or login is required. It downloads pinned revisions and writes the checksum receipt; retry the same command if interrupted.</p>") + step(3, "Install the participant's dependencies", "<p>Follow the repository README and policy documentation. Use an isolated dependency image; keep checkpoints, seed packets and clone credentials outside the participant runtime. Check the documented entrypoint for every task.</p>") : "");
    if (state.stage === 2) return step(1, "Run the built-in check", commandBox(`cd ${cloneDirectory(job)}\npython tools/check_environment.py`, "Copy environment check command")) + step(2, "Confirm the result", "<p>Continue only when the terminal prints <strong>ENVIRONMENT CHECK PASSED</strong> and returns exit code 0. The script checks official planning, rendering and state/action capture. No machine ID, metric input or report upload is required.</p>" + notice("Missing official reference scenes, unset SSIM/PSNR thresholds or a failed check block evaluation. Contact the organizers; do not change the official environment to bypass the check.", false, "warning"));
    if (state.stage === 3) return runCommands(job) + step(4, "Refresh and check all 10 task results", "<p>After terminal upload succeeds, use Refresh requests above. Check that every task is Submitted before continuing. The recorded commands will be provided to the participant with the results.</p>" + taskTable(job) + `<details class="reviewer-notes"><summary>Recorded commands / record a custom entrypoint command</summary><p>The collector records commands automatically. Use this form only when a different documented command needs to be recorded before its task result is registered.</p>${taskCommands(job)}</details>`);
    const row = resultFor(job, state.task);
    const picker = `<div class="reviewer-task-picker"><select data-task-picker aria-label="Task to review">${TASKS.map(task => `<option value="${task}" ${task === state.task ? "selected" : ""}>${label(task)} · ${label(resultFor(job, task)?.status || "Not uploaded")}</option>`).join("")}</select><span>${(job.results || []).filter(result => result.status === "checked").length} / 10 accepted</span></div>`;
    const evidence = row ? `<dl class="reviewer-meta"><div><dt>Episodes</dt><dd>${row.summary.episodes} / 100</dd></div><div><dt>Success rate</dt><dd>${Number(row.summary.success_rate).toFixed(1)}%</dd></div><div><dt>Average action steps</dt><dd>${Number(row.summary.average_steps).toFixed(1)} / ${STEPS[state.task]}</dd></div><div><dt>Archive SHA256</dt><dd>${escape(row.artifacts?.sha256 || "")}</dd></div></dl><div class="reviewer-links"><a href="${escape(safeHref(row.artifacts?.url))}" target="_blank" rel="noreferrer">${icon("folder-open")}Open task evidence</a></div>${row.status === "checked" ? notice("This task result has been reviewed and accepted.", true) : `<form data-review-form="accept" class="reviewer-form"><label class="reviewer-confirm"><input type="checkbox" name="video" required>I reviewed task videos and success/failure outcomes.</label><label class="reviewer-confirm"><input type="checkbox" name="trajectory" required>I checked episode state/action trajectories.</label><label class="reviewer-confirm"><input type="checkbox" name="checksum" required>The downloaded archive matches the recorded SHA256.</label><button class="button button-secondary">${icon("check")}Accept this task result</button></form>`}` : notice("No manifest has been uploaded for this task.", false, "warning");
    return step(1, "Select the task to review", picker) + step(2, "Check evidence and accept this task", "<p>Inspect the videos and trajectories, then compare the downloaded ZIP with its recorded SHA256. Repeat for all 10 tasks.</p>" + evidence) + step(3, "Check the complete result table", taskTable(job));
  }
  function codeStage(job) {
    const instructions = preparationWarnings(job);
    if (!job.bundle_commit && job.code_bundle_commit) return notice(`Code composed automatically. The participant's entire policy/ tree is preserved on the official held-out base.<br><a target="_blank" rel="noreferrer" href="${escape(safeHref(job.code_bundle_url))}">Open private validation branch</a><br>Commit: <code>${escape(job.code_bundle_commit)}</code><br>Detected entrypoints: ${escape((job.code_policy_dirs || []).join(", "))}`, true) + instructions + notice(job.preparation_status === "failed" ? `Checkpoint / evaluation preparation failed.<br>${escape(job.preparation_error || "")}<br>Use Issue / Send email, then retry after participant follow-up.` : "Complete the ten-task checkpoint mapping and access checks. The runnable evaluation branch is then prepared automatically; evaluation does not wait for the submission deadline.", false, job.preparation_status === "failed" ? "error" : "warning") + (job.preparation_status === "failed" ? `<div class="reviewer-retry">${button("retry-code", "Retry after participant follow-up", "refresh-cw")}</div>` : "");
    if (!job.bundle_commit) return `${notice(job.preparation_status === "failed"
      ? `Automatic code preparation failed.<br>${escape(job.preparation_error || "The submitted policy could not be prepared.")}<br>Use Issue / Send email to request clarification. This stage stays blocked until preparation succeeds.`
      : "Code preparation is queued or running automatically; it does not wait for task checkpoint URLs. The script keeps the participant's complete policy/ folder and uses the official held-out environment for everything else. Refresh to see the result. No reviewer code-preparation form is required.", false, job.preparation_status === "failed" ? "error" : "info")}${instructions}${job.preparation_status === "failed" ? `<div class="reviewer-retry">${button("retry-code", "Retry after participant follow-up", "refresh-cw")}</div>` : ""}`;
    if (!cloneBranch(job)) return notice("The prepared branch URL is invalid. Contact the organizers; no clone command has been generated.", false, "error");
    return `<div class="reviewer-code">${job.version_status === "provisional" ? notice("This pinned branch is ready for evaluation now. After the deadline, unchanged code and checkpoint revisions keep all progress. Changed versions are backed up and the affected stages reset automatically; use the new branch and checkpoint index after a reset.", false, "warning") : ""}<div class="reviewer-links"><a target="_blank" rel="noreferrer" href="${escape(safeHref(job.bundle_url))}">${icon("git-branch")}Prepared evaluation branch</a></div><div class="reviewer-command"><code data-copy-command>${escape(cloneCommand(job))}</code><button class="reviewer-icon" data-review-action="copy" title="Copy clone and checkout commands" aria-label="Copy clone and checkout commands">${icon("copy")}</button></div><p>Replace <code>/path/to</code> with your chosen parent directory in every command. Running <code>git clone</code> creates only the specified evaluation folder; opening this page or copying a command creates nothing.</p><dl class="reviewer-meta"><div><dt>Evaluation commit (set automatically)</dt><dd>${escape(job.bundle_commit)}</dd></div><div><dt>Detected evaluation entrypoints</dt><dd>${escape(job.policy_dirs.join(", "))}</dd></div></dl>${notice("The entire policy/ tree is preserved, including shared files and nested folders. The script detects evaluation entrypoints; no directory names or commit SHA need to be entered here.", true)}${instructions}</div>`;
  }
  function preparationWarnings(job) {
    const warnings = job.code_selection?.preparation_warnings;
    return Array.isArray(warnings) ? warnings.map(text => notice(escape(String(text)), false, "warning")).join("") : "";
  }
  function checkpointStatus(job) {
    if (job.local_walkthrough) return notice("Workflow demo: no live Hugging Face access check is performed.", false, "warning");
    const status = job.hf_check_status || (TASKS.every(task => job.hf_access?.[task]?.accessible) ? "passed" : "pending");
    if (status === "passed") return notice("Automatic HF access check passed for all 10 current task URLs. Model files are readable using the organizer's shared HF account. Pinned revisions and checked file counts are listed above; access is checked again for the final deadline freeze.", true);
    if (status === "failed") return notice(`Automatic HF access check failed.<br>${escape(job.hf_check_error || "Checkpoint access was not confirmed.")}<br>Code preparation runs independently. Use Issue / Send email, then retry after access or the checkpoint URLs have been corrected.`, false, "error") + `<div class="reviewer-retry">${button("retry-code", "Retry after participant follow-up", "refresh-cw")}</div>`;
    return notice(job.coverage_status === "legacy_unverified" ? "Save the checkpoint URL for each of the 10 tasks above. The script then checks HF access automatically, even if code preparation failed." : status === "checking" ? "Automatic HF access check is running. Refresh to see the result; no personal HF token or manual access check is required." : "Automatic HF access check is queued for these saved URLs. The script checks repository access and the actual model files, independently of code preparation. Refresh to see the result.", false, "info");
  }
  function taskCommands(job) {
    return `<form class="reviewer-form" data-review-form="commands"><h4>Actual task evaluation commands <span class="reviewer-required">*</span></h4><div class="reviewer-command-fields">${TASKS.map((task) => `<label>${escape(label(task))}<textarea name="command_${task}" rows="2" maxlength="4000" ${resultFor(job, task) ? "readonly" : ""} required>${escape(job.task_commands?.[task] || "")}</textarea></label>`).join("")}</div><button class="button button-secondary">${icon("save")}Save commands</button></form>`;
  }
  function newEmail(job, template = "stage") {
    const blank = template === "blank";
    const issue = ISSUE_TEMPLATES[state.stage].find((item) => item[0] === template)?.[2] || STAGES[state.stage].issue;
    return { stage: state.stage, template, message_id: "msg_" + crypto.randomUUID().replace(/-/g, ""),
      subject: blank ? "" : "RoboSynChallenge evaluation update: " + job.evaluation_id,
      body: blank ? "" : `Dear ${job.team_name},\n\n${issue}\n\nEvaluation ID: ${job.evaluation_id}\nTask / issue details:\n${state.stage <= 1 ? [job.preparation_error, job.hf_check_error].filter(Boolean).join("\n") : ""}\n\n${state.stage === 2 ? "No participant action is required unless separately requested." : "Use the response link to confirm or submit your correction requested in the latest issue email. Corrections must include an immutable GitHub commit URL and checkpoint URLs for all 10 tasks."}\n\nRoboSynChallenge organizers` };
  }
  function composer(job) {
    if (!state.emailDraft) return "";
    const email = state.emailDraft;
    return `<section class="reviewer-composer" data-mail-composer><div class="reviewer-composer-head"><h3>Participant email</h3><button class="reviewer-icon" data-review-action="close-email" title="Close email draft" aria-label="Close email draft">${icon("x")}</button></div><form class="reviewer-form" data-review-form="email"><div class="reviewer-verify-grid"><label>Recipient<input value="${escape(job.email)}" readonly></label><label>Template<select data-email-template><option value="stage" ${email.template === "stage" ? "selected" : ""}>General stage issue</option>${ISSUE_TEMPLATES[email.stage].map(([key, title]) => `<option value="${key}" ${email.template === key ? "selected" : ""}>${title}</option>`).join("")}<option value="blank" ${email.template === "blank" ? "selected" : ""}>Blank email</option></select></label></div><label>Subject<input name="subject" value="${escape(email.subject)}" maxlength="200" required></label><label>Message<textarea name="body" rows="9" required>${escape(email.body)}</textarea></label><div class="reviewer-mail-actions"><button class="button button-primary">${icon("send")}${LOCAL ? "Record demo email" : "Send email"}</button><span>${LOCAL ? "Demo only; no email is sent." : "Recipient is fixed to the registered participant."}</span></div></form></section>`;
  }
  function participantResponse(job) {
    if (!job.correction) return "";
    return `<div class="reviewer-participant-response">Participant response: <strong>${escape(job.correction.status)}</strong> · Correction round: ${escape(job.correction.round || 0)}${job.correction.notes ? `<p>${escape(job.correction.notes)}</p>` : ""}</div>`;
  }
  function commandBlock(command) {
    return `<div class="reviewer-command"><code data-copy-command>${escape(command)}</code><button type="button" class="reviewer-icon" data-review-action="copy" title="Copy command" aria-label="Copy command">${icon("copy")}</button></div>`;
  }
  function overviewPage() {
    const back = `<button type="button" class="button button-secondary" data-review-action="workspace">${icon("arrow-left")}Evaluation requests</button>`;
    if (state.view === "downloads") {
      const assigned = state.jobs.filter(job => !job.local_walkthrough && job.reviewer_email === state.credentials.email);
      const ready = assigned.filter(job => job.bundle_commit && ["provisional", "final"].includes(job.version_status)).length;
      const setup = `git clone --single-branch --branch heldout/preliminary-2026 https://github.com/ZhaoRunyi/RoboSynChallenge_eval.git "/path/to/RoboSynChallenge_eval_tools"\npython -m pip install huggingface_hub`;
      const run = `python "/path/to/RoboSynChallenge_eval_tools/tools/download_assigned_checkpoints.py" --api-url '${API}' --email '${state.credentials.email.replace(/'/g, "")}' --output /path/to/checkpoints`;
      const status = `python "/path/to/RoboSynChallenge_eval_tools/tools/download_assigned_checkpoints.py" --output /path/to/checkpoints --status`;
      return `<section class="reviewer-overview">${back}<h2>Download assigned checkpoints</h2><p class="reviewer-description">${assigned.length} assigned requests · ${ready} requests ready for download</p>${!assigned.length ? notice("No evaluation requests are assigned to this account.") : ""}<h3>1. Prepare the private download tools</h3>${commandBlock(setup)}<p>Replace <code>/path/to</code> with your chosen parent directory. Run this setup once. If the tools directory already exists, use <code>git -C "/path/to/RoboSynChallenge_eval_tools" pull --ff-only</code> instead.</p><h3>2. Download to your checkpoint directory</h3>${commandBlock(run)}<p>Replace <code>/path/to/checkpoints</code> with your destination. Enter your evaluation token when prompted. Your own HF token is not needed. Repeat the same command after interruption; completed files and partial downloads are retained. Identical repositories and frozen revisions share one copy; each task uses a symbolic link to its checkpoint.</p><h3>3. Check progress</h3>${commandBlock(status)}<pre class="reviewer-directory">checkpoints/\n  download-progress.json\n  models/OWNER/MODEL/FROZEN_REVISION/\n  evaluations/EVAL_ID/EVALUATION_COMMIT/\n    checkpoint-index.json\n    code/\n    tasks/TASK/\n      checkpoint -> shared model directory\n      checkpoint.json</pre></section>`;
    }
    const sent = state.mailStatus.filter(message => message.status === "sent");
    const uncertain = state.mailStatus.filter(message => message.status !== "sent");
    return `<section class="reviewer-overview">${back}<h2>Email status</h2><p class="reviewer-description">${sent.length} sent · ${uncertain.length} awaiting delivery verification</p>${uncertain.length ? notice("Some email deliveries need organizer verification. Do not resend before checking Gmail.", false, "warning") : ""}${state.error ? notice(escape(state.error), false, "error") : ""}<div class="reviewer-mail-table"><table><thead><tr><th>Team / Evaluation</th><th>Recipient</th><th>Email / Stage</th><th>Sent at (UTC)</th><th>Status</th><th>Gmail</th></tr></thead><tbody>${state.mailStatus.map(message => `<tr><td><strong>${escape(message.team_name)}</strong><br><button type="button" class="reviewer-inline-link" data-review-mail-job="${escape(message.evaluation_id)}" ${state.jobs.some(job => job.evaluation_id === message.evaluation_id) ? "" : "disabled"}>${escape(message.evaluation_id)}</button></td><td>${escape(message.recipient)}</td><td>${escape(message.subject)}<br><small>${escape(STAGES[message.stage]?.title || "")}</small></td><td>${escape(message.sent_at || "Not confirmed")}</td><td>${message.status !== "sent" ? "WARNING: " : ""}${escape(label(message.status))}</td><td><a class="reviewer-icon" href="${escape(safeHref(message.gmail_url))}" target="_blank" rel="noreferrer" title="Open in organizer Gmail" aria-label="Open email in organizer Gmail">${icon("external-link")}</a></td></tr>`).join("") || '<tr><td colspan="6">No evaluation emails have been recorded.</td></tr>'}</tbody></table></div></section>`;
  }
  function jobDetail(job) {
    if (!job) return `<div class="reviewer-empty">No requests are currently assigned to you.</div>`;
    const workflow = flow(job);
return `<article class="reviewer-detail"><header class="reviewer-detail-head"><div><span class="reviewer-id" data-evaluation-id>${escape(job.evaluation_id)}</span><h2>${escape(job.local_walkthrough ? "Workflow demo" : job.team_name)}</h2><p>${escape(job.local_walkthrough ? "Five-stage walkthrough" : job.artifact_name)} · ${escape(job.email)}</p>${participantResponse(job)}</div><span class="reviewer-state ${doneCount(job) === 5 ? "completed" : ""}">${doneCount(job) === 5 ? "Completed" : doneCount(job) + " / 5 stages complete"}</span></header><nav class="reviewer-stage-nav" aria-label="Evaluation stages">${STAGES.map((stage, index) => `<button type="button" data-review-stage="${index}" aria-current="${state.stage === index ? "step" : "false"}" class="${state.stage === index ? "active" : ""} ${workflow.stages[index].done ? "done" : ""}" ${canEdit(job) && index > firstOpen(job) ? "disabled" : ""}><span class="reviewer-step-number">${workflow.stages[index].done ? icon("check") : index + 1}</span><span>${stage.title}</span></button>`).join("")}</nav><div class="reviewer-stage-body"><div class="reviewer-stage-title"><h3>${STAGES[state.stage].title}</h3><span>Step ${state.stage + 1} of 5</span></div><p class="reviewer-description">${STAGES[state.stage].description}</p>${state.error ? `<p class="reviewer-error" role="alert">${escape(state.error)}</p>` : ""}${state.toast ? `<p class="reviewer-toast" role="status">${escape(state.toast)}</p>` : ""}${!canEdit(job) ? notice("Read-only overview · Assigned reviewer: " + escape(job.reviewer_email || "Unassigned")) : ""}<fieldset class="reviewer-readonly" ${canEdit(job) ? "" : "disabled"}>${stageContent(job)}${checks(job)}${composer(job)}</fieldset>${job.messages?.length ? `<div class="reviewer-mail-log"><h4>Email history</h4>${job.messages.map((message) => `<p>${escape(STAGES[message.stage]?.title)} · ${escape(label(message.status))} · ${escape(message.sent_at || "")}<br>${escape(message.subject)}</p>`).join("")}</div>` : ""}</div><footer class="reviewer-footer">${button("previous", "Previous stage", "arrow-left", state.stage === 0 ? "disabled" : "")}${button("email", "Issue / Send email", "mail", canEdit(job) ? "" : "disabled")}<button type="button" class="button button-primary" data-review-action="next" ${!canEdit(job) || state.busy || (!workflow.stages[state.stage].done && nextBlocker(job)) ? "disabled" : ""} title="${escape(workflow.stages[state.stage].done ? "Stage already completed" : nextBlocker(job))}">${state.stage === 4 ? "Complete review" : "Complete / Next stage"}${icon(state.stage === 4 ? "check" : "arrow-right")}</button></footer></article>`;
  }
  function paint() {
    const content = root()?.querySelector("[data-reviewer-content]");
    if (!content) return;
    const queueScroll = content.querySelector(".reviewer-queue")?.scrollTop || 0;
    const previousBody = content.querySelector(".reviewer-stage-body");
    const bodyScroll = previousBody?.scrollTop || 0;
    const paneKey = state.selected + ":" + state.stage;
    const samePane = previousBody?.dataset.paneKey === paneKey;
    if (!state.credentials) content.innerHTML = `${heading(false)}<div class="reviewer-login-layout"><form data-review-form="login" class="reviewer-form reviewer-login"><h2>Reviewer sign in</h2><p>Preliminary simulation evaluation</p>${state.error ? `<p class="reviewer-error" role="alert">${escape(state.error)}</p>` : ""}<label>Email<input type="email" name="email" autocomplete="username" value="${LOCAL ? "1070055979@qq.com" : ""}" required></label><label>Evaluation token<input type="password" name="token" autocomplete="current-password" placeholder="Your assigned evaluation token" required></label><button class="button button-primary" ${state.busy ? "disabled" : ""}>${icon("log-in")}Sign in</button></form></div><div class="reviewer-login-meta"><a href="../#/leaderboard">Public leaderboard</a></div>`;
    else {
      const realJobs = state.jobs.filter((job) => !job.local_walkthrough);
      const complete = realJobs.filter((job) => doneCount(job) === 5).length;
      const units = realJobs.reduce((sum, job) => sum + doneCount(job), 0);
      content.innerHTML = `${heading(true)}<div class="reviewer-progress"><strong>${["admin", "observer"].includes(state.role) ? "Global evaluation progress" : "My evaluation progress"}</strong><progress max="${Math.max(1, realJobs.length * 5)}" value="${units}" aria-label="Overall evaluation progress"></progress><span>${complete} / ${realJobs.length} requests completed · ${units} / ${realJobs.length * 5} stages</span></div><nav class="reviewer-overview-tools" aria-label="Evaluation overview">${button("downloads", "Download checkpoints", "download")}${button("email-status", "Email status", "mail")}</nav>${state.view !== "workspace" ? overviewPage() : `<div class="reviewer-layout"><aside class="reviewer-sidebar"><div class="reviewer-sidebar-head"><h2>${["admin", "observer"].includes(state.role) ? "All requests" : "Assigned requests"}</h2><span>${realJobs.length}${LOCAL ? " + demo" : ""}</span></div><input class="reviewer-search" type="search" placeholder="Search team or request" aria-label="Search requests" value="${escape(state.search)}"><div class="reviewer-queue">${queueHtml()}</div></aside>${jobDetail(selected())}</div>`}`;
      if (LOCAL && selected()?.local_walkthrough && state.view === "workspace") {
        const message = document.createElement("div");
        message.className = "reviewer-notice";
        message.classList.add("warning");
        message.textContent = "WARNING: Workflow demo only. All fields are optional; no emails, uploads, branches or backend changes are made.";
        content.querySelector(".reviewer-stage-body").prepend(message);
      }
    }
    markRequiredFields(content);
    const queue = content.querySelector(".reviewer-queue");
    if (queue) queue.scrollTop = queueScroll;
    const body = content.querySelector(".reviewer-stage-body");
    if (body) { body.dataset.paneKey = paneKey; if (samePane) body.scrollTop = bodyScroll; }
    content.querySelectorAll(".reviewer-error").forEach(error => { error.prepend("ERROR: "); });
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
    return state.jobs.filter((job) => (job.team_name + " " + job.artifact_name + " " + job.evaluation_id).toLowerCase().includes(state.search.toLowerCase())).map((job) => `<button type="button" class="reviewer-job ${job.evaluation_id === state.selected ? "selected" : ""}" data-review-job="${escape(job.evaluation_id)}"><strong>${escape(job.local_walkthrough ? "Workflow demo" : job.team_name)}</strong><span>${escape(job.local_walkthrough ? "Five-stage walkthrough" : job.artifact_name)}</span><small><span>${doneCount(job) === 5 ? "Completed" : STAGES[firstOpen(job)].title}</span><span>${doneCount(job)} / 5</span></small><progress value="${doneCount(job)}" max="5" aria-label="Request progress"></progress></button>`).join("") || `<p class="reviewer-empty">No assigned requests match.</p>`;
  }
  async function refresh() {
    const credentials = state.credentials;
    const previous = new Map(state.jobs.map(job => [job.evaluation_id, job]));
    const includeMail = state.view === "email-status";
    const response = await request("reviewer_queue", { include_mail_status: includeMail });
    if (state.credentials !== credentials) return;
    state.role = response.reviewer?.role || "";
    state.jobs = response.jobs || [];
    for (const job of state.jobs) {
      const old = previous.get(job.evaluation_id);
      if (old && (old.preparation_attempt !== job.preparation_attempt || old.bundle_commit !== job.bundle_commit || old.hf_check_context !== job.hf_check_context ||
          old.workflow?.stages.some((stage, index) => stage.done && !job.workflow?.stages[index]?.done))) {
        for (let index = 0; index < STAGES.length; index += 1) state.drafts.delete(job.evaluation_id + ":" + index);
        if (state.selected === job.evaluation_id) { state.stage = firstOpen(job); state.emailDraft = null; }
      }
    }
    if (includeMail) state.mailStatus = response.messages || [];
    if (!selected()) { state.selected = state.jobs[0]?.evaluation_id || ""; state.stage = selected() ? firstOpen(selected()) : 0; }
  }
  async function perform(action) {
    if (state.busy) return;
    state.busy = true;
    root()?.querySelectorAll("button:not([data-review-job])").forEach((element) => { element.disabled = true; });
    try { state.error = ""; await saveChain; await action(); await refresh(); }
    catch (error) { if (!sessionStorage.getItem(STORAGE)) state.credentials = null; state.error = error.message || String(error); }
    finally {
      if (state.pendingSelection && state.jobs.some(job => job.evaluation_id === state.pendingSelection)) {
        state.selected = state.pendingSelection;
        state.stage = firstOpen(selected());
        state.emailDraft = null; state.toast = "";
      }
      state.pendingSelection = "";
      state.busy = false; paint();
    }
  }
  function saveStage() {
    const job = selected();
    if (!canEdit(job) || flow(job).stages[state.stage].done || state.stage > firstOpen(job)) return Promise.resolve();
    const stage = state.stage, credentials = state.credentials;
    const values = { ...draft(job) };
    const checks = Object.fromEntries(Object.keys(STAGES[stage].checks).map(key => [key, values[key] === true]));
    const key = job.evaluation_id + ":" + stage;
    const signature = JSON.stringify([checks, values.machine_id || ""]);
    const persisted = JSON.stringify([Object.fromEntries(Object.keys(STAGES[stage].checks).map(key => [key, flow(job).stages[stage].checks[key] === true])), flow(job).machine_id || ""]);
    const pending = pendingSaves.get(key);
    if (signature === (pending?.signature || persisted)) return pending?.promise || Promise.resolve();
    // Save captured checks in order while local navigation stays responsive.
    const promise = saveChain.then(async () => {
      if (state.credentials !== credentials) return;
      await request("reviewer_save_checks", { evaluation_id: job.evaluation_id, stage, checks, machine_id: values.machine_id || "" });
      flow(job).stages[stage].checks = checks;
      flow(job).machine_id = values.machine_id || "";
    });
    saveChain = promise.catch(() => {});
    const entry = { signature, promise };
    pendingSaves.set(key, entry);
    const clear = () => { if (pendingSaves.get(key) === entry) pendingSaves.delete(key); };
    promise.then(clear, clear);
    return promise;
  }
  function browse(change) {
    const credentials = state.credentials;
    const save = saveStage();
    change(); paint();
    save.catch(error => { if (state.credentials === credentials) { state.error = error.message || String(error); paint(); } });
  }
  async function loadMailStatus() {
    const credentials = state.credentials;
    try {
      const response = await request("reviewer_mail_status");
      if (state.credentials === credentials) { state.mailStatus = response.messages || []; if (state.view === "email-status") paint(); }
    } catch (error) {
      if (state.credentials === credentials) { state.error = error.message || String(error); paint(); }
    }
  }
  function openEmail() {
    state.emailDraft ||= newEmail(selected());
    paint();
    root().querySelector("[data-mail-composer]")?.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  function mount() {
    const element = root();
    element.addEventListener("click", (event) => {
      const mailJob = event.target.closest("[data-review-mail-job]");
      if (mailJob && !mailJob.disabled) {
        state.selected = mailJob.dataset.reviewMailJob;
        state.stage = firstOpen(selected()); state.view = "workspace"; history.replaceState(null, "", location.pathname + location.search); paint(); return;
      }
      const jobButton = event.target.closest("[data-review-job]");
      if (jobButton) {
        if (state.busy) { state.pendingSelection = jobButton.dataset.reviewJob; return; }
        browse(() => { state.selected = jobButton.dataset.reviewJob; state.stage = firstOpen(selected()); state.emailDraft = null; state.toast = ""; });
        return;
      }
      const stageButton = event.target.closest("[data-review-stage]");
      if (stageButton && !stageButton.disabled && !state.busy) { browse(() => { state.stage = Number(stageButton.dataset.reviewStage); state.emailDraft = null; state.toast = ""; }); return; }
      const action = event.target.closest("[data-review-action]")?.dataset.reviewAction;
      if (!action || state.busy) return;
      if (!["logout", "refresh", "copy", "previous", "close-email", "downloads", "email-status", "workspace"].includes(action) && !canEdit(selected())) return;
      if (["downloads", "email-status", "workspace"].includes(action)) {
        browse(() => { state.view = action; history.replaceState(null, "", location.pathname + location.search + (action === "workspace" ? "" : "#" + action)); });
        if (action === "email-status") loadMailStatus();
        return;
      }
      if (action === "logout") { sessionStorage.removeItem(STORAGE); state.credentials = null; state.jobs = []; state.mailStatus = []; state.selected = ""; state.emailDraft = null; state.drafts.clear(); state.error = ""; paint(); }
      if (action === "refresh") perform(async () => { await saveStage(); if (LOCAL) state.preview = null; });
      if (action === "copy") {
        const text = event.target.closest(".reviewer-command")?.querySelector("code")?.textContent || "";
        navigator.clipboard.writeText(text).then(() => { state.toast = "Command copied."; paint(); }).catch(() => { state.error = "Clipboard access unavailable. Select and copy the command."; paint(); });
      }
      if (action === "previous" && state.stage > 0) browse(() => { state.stage -= 1; state.emailDraft = null; state.toast = ""; });
      if (action === "email") openEmail();
      if (action === "retry-code") perform(async () => { await request("reviewer_retry_preparation", { evaluation_id: selected().evaluation_id }); state.toast = "Preparation retry queued. Refresh after the organizer's script runs."; });
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
      if (event.target.name === "revoke" && event.target.closest("[data-review-form=admission]")) {
        const date = event.target.form.elements.expires_at;
        date.required = !event.target.checked;
        date.disabled = event.target.checked;
        date.setAttribute("aria-required", String(date.required));
        date.closest("label").hidden = event.target.checked;
      }
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
      if (type !== "login" && !canEdit(selected())) return;
      if (type === "version-exception") perform(async () => {
        await request("reviewer_approve_version_exception", { evaluation_id: selected().evaluation_id,
          reason: String(data.get("reason") || ""), argument_reviewed: data.has("argument_reviewed") });
        state.toast = "Argument approval recorded. Rebuild queued.";
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
        await request("reviewer_submission_window", { participant_email: job.email,
          expires_at: revoke ? "" : date.toISOString(), reason: String(data.get("reason") || "").trim(), revoke });
        state.toast = LOCAL ? "Demo only: no submission exception changed." : revoke ? "Submission exception revoked." : "Submission exception saved for this participant's current access token.";
      });
      if (type === "commands") perform(async () => {
        const commands = Object.fromEntries(TASKS.map((task) => [task, String(data.get("command_" + task) || "").trim()]));
        if (Object.values(commands).some((value) => !value)) throw new Error("The actual command is required for every task.");
        for (const task of TASKS) if (!resultFor(job, task)) await request("reviewer_save_command", { evaluation_id: job.evaluation_id, task, command: commands[task] });
        state.toast = "Actual evaluation commands saved.";
      });
      if (type === "verify") perform(() => request("reviewer_verify_coverage", { evaluation_id: job.evaluation_id, coverage_confirmed: data.has("coverage_confirmed"), task_checkpoint_links: Object.fromEntries(TASKS.map((task) => [task, window.normalizeHfLocation(data.get(task))])) }));
      if (type === "accept") perform(() => request("reviewer_check_result", { evaluation_id: job.evaluation_id, task: state.task, decision: "checked", note: "", checks: { video: data.has("video"), trajectory: data.has("trajectory"), checksum: data.has("checksum") } }));
      if (type === "email") perform(async () => {
        const email = state.emailDraft;
        await request("reviewer_send_issue", { evaluation_id: job.evaluation_id, message_id: email.message_id, stage: email.stage, subject: String(data.get("subject") || "").trim(), body: String(data.get("body") || "").trim() });
        state.emailDraft = null; state.toast = LOCAL ? "Demo email recorded. No email was sent." : "Email sent and recorded.";
      });
    });
    paint();
    if (state.credentials) perform(async () => {});
    if (!LOCAL) window.setInterval(async () => {
      if (!state.credentials || state.busy || document.hidden || state.emailDraft || pendingSaves.size ||
          root()?.contains(document.activeElement) && document.activeElement.matches("input,textarea,select")) return;
      const waiting = state.jobs.some(job => ["pending", "checking"].includes(job.hf_check_status) ||
        ["pending", "code_ready"].includes(job.preparation_status) || job.correction?.status === "awaiting");
      if (!waiting) return;
      state.busy = true;
      try { await refresh(); paint(); } catch { /* Manual refresh exposes persistent network failures. */ }
      finally { state.busy = false; }
    }, 45000);
  }
  window.RSCReviewer = { render, mount };
})();
