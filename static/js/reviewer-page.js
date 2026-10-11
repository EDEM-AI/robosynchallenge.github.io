(() => {
  "use strict";
  const STORAGE = "rsc-reviewer-credentials-v1";
  const PREVIEW_STORAGE = "rsc-reviewer-preview-workflow-v4";
  const API = String(window.ROBO_SYN_CONFIG?.API_BASE_URL || "").trim();
  const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname) && new URLSearchParams(location.search).has("review_preview");
  const TASKS = ["click_bell", "drawer_open_place", "mixer_operating", "table_rearrangement", "water_pouring", "handle_basket", "items_handover", "item_assembly", "manipulate_pipette", "sample_loading"];
  const STEPS = { click_bell: 361, drawer_open_place: 900, mixer_operating: 500, table_rearrangement: 361, water_pouring: 500, handle_basket: 500, items_handover: 350, item_assembly: 500, manipulate_pipette: 1000, sample_loading: 500 };
  const STAGES = [
    { title: "资料核验", description: "先核对选手资料和十任务映射。旧请求请在本环节填写并确认各任务 checkpoint，再等待自动脚本检查访问权限并合成代码；后续环节检查运行兼容性。",
      checks: { repository_access: "自动合成记录已生成，且与当前请求一致。", checkpoint_access: "已核对十个任务与 checkpoint 的对应关系。", ten_tasks: "十个任务均有明确的运行入口与 checkpoint。" },
      issue: "我们未能完成提交资料的访问核验。请确认仓库权限，并提供全部十个任务的 checkpoint 与运行入口对应关系。" },
    { title: "测评代码", description: "将合成后的私密分支克隆到本请求专属目录，按仓库 README 和各任务入口说明准备代码与依赖。",
      checks: { commit_verified: "本地代码与自动固定的测评 commit 一致。", policy_entrypoints: "已确认各任务应使用的 policy 目录和运行入口。", dependencies: "已在隔离环境中安装选手 policy 所需依赖。" },
      issue: "我们未能合成或启动您的 policy。请检查完整 policy/ 目录、运行入口和依赖说明。请通过回复表单确认资料或提交唯一一次修复，并填写固定 GitHub commit 与十个任务的 checkpoint。" },
    { title: "环境检查", description: "运行仓库内置环境检查脚本。仅当输出 ENVIRONMENT CHECK PASSED 且退出码为 0 时，才可继续。",
      checks: { machine_checked: "内置环境检查输出 ENVIRONMENT CHECK PASSED，退出码为 0。", reference_checked: "官方专家轨迹规划、渲染比对及动作／状态检查均通过。" },
      issue: "测评暂时暂停，我们正在排查环境或运行问题。除非下方明确指出选手 policy 的问题，否则无需修改提交。" },
    { title: "运行与上传", description: "使用固定 seeds 测评十个任务，记录实际运行命令。每个任务生成 JSON 与 ZIP，保存视频、状态及动作轨迹，并上传至私密存储。",
      checks: { all_runs: "十个任务均使用固定代码和 seeds 完成测评。", archives_uploaded: "全部产物已上传，且主办方可以访问。" },
      issue: "当前 policy 未能完成测评。请检查下方任务及报错，通过回复表单确认当前代码，或提交唯一一次修复及全部十任务 checkpoint。" },
    { title: "结果复核", description: "逐任务检查视频、轨迹与校验和后确认结果。此操作仅记录复核结论，不会自动发布至公开排行榜。",
      checks: { videos_checked: "已检查十个任务的视频及成功／失败判定。", trajectories_checked: "已检查状态／动作轨迹和 episode 完整性。", hashes_checked: "下载产物的 SHA256 与记录一致。" },
      issue: "我们在复核测评产物时发现问题。请核对下方任务与说明，并回复澄清或按规定提交固定版本的修复资料。" },
  ];
  const ISSUE_TEMPLATES = [
    [
      ["repository_access", "私密仓库无法访问", "主办方合成账号无法读取您提交的 GitHub 仓库。请授予指定账号 robosynchallenge 只读权限，并确认仓库及 commit 链接；邀请被接受后才能继续合成。"],
      ["missing_code", "代码文件不完整", "仓库缺少必要的 policy 文件或任务入口。请提供完整 policy/ 目录，包含相应适配器的 eval.sh、deploy_policy.yml 和 deploy_policy.py，并说明十个任务的入口。"],
      ["missing_checkpoints", "Checkpoint 缺失或无法访问", "我们无法访问全部十任务 checkpoint。请检查 Hugging Face 链接、私密／受限访问权限、模型文件及任务对应关系；如多个任务共用 checkpoint，请明确说明。"]
    ],
    [
      ["composition_failed", "代码合成失败", "您的 policy/ 目录自动合成失败。请检查下方错误，确认所需文件与目录完整。"],
      ["dependencies", "依赖安装失败", "按仓库说明无法安装或导入 policy。请核对 Python／CUDA 版本、依赖版本、安装命令及所需资源。"],
      ["cannot_start", "Policy 无法启动", "文档中的 policy 入口无法在官方环境中启动。请检查运行命令、适配入口、配置及 checkpoint 加载方式。"]
    ],
    [
      ["environment_pause", "主办方环境检查暂停", "测评暂停，主办方正在排查官方环境检查问题。当前无需修改您的提交。"]
    ],
    [
      ["runtime_failure", "Policy 运行报错", "Policy 在测评中出现运行错误。请检查下方受影响的任务、命令与报错。"],
      ["invalid_actions", "动作输出不合法", "Policy 返回动作的维度、数值或单位不符合接口。请核对对应任务的官方动作接口，不要修改官方环境。"],
      ["checkpoint_loading", "Checkpoint 加载失败", "Policy 无法加载指定 checkpoint。请检查任务映射、模型配置、文件完整性及加载命令。"]
    ],
    [
      ["evidence_missing", "任务产物不完整", "任务产物缺失或不一致。请澄清下方任务设置及 policy 输出。由主办方归档／上传造成的问题由主办方处理，无需修改 policy。"],
      ["task_mapping", "任务与 checkpoint 不匹配", "资料中的任务入口／checkpoint 与实际测评 policy 不一致。请确认正确映射，并说明受影响的任务。"]
    ]
  ];
  const ERROR_MESSAGES = {"Reviewer backend is not configured.":"尚未配置测评后端。","Local preview data is missing.":"未找到流程演示数据。","Invalid reviewer credentials.":"测评邮箱或 token 不正确。","This request is not assigned to you.":"此请求未分配给您。","Confirm all ten task checkpoints first.":"请先确认全部十任务 checkpoint。","Prepared code metadata is invalid.":"代码合成记录不合法。","Review and record the participant argument first.":"请先审核并记录选手申诉。","Reassignment is only available before local work.":"开始本地工作后不可重新分配。","Prepared code already exists.":"已存在合成代码。","Complete the previous stages first.":"请先完成之前的环节。","Complete every checklist item.":"请完成所有检查项。","Verify all ten task checkpoints first.":"请先核验十任务 checkpoint。","Prepared code is missing.":"尚未生成合成代码。","Upload all ten results first.":"请先上传十个任务的结果。","Accept all ten task results first.":"请先复核并确认十个任务的结果。","Preflight must cover all ten tasks and three cameras.":"环境检查必须覆盖十任务及三个相机。","Complete the earlier stages; accepted task evidence is locked.":"请先完成前序环节；已确认的任务产物不可修改。","Complete the first three stages.":"请先完成前三个环节。","Save the actual task evaluation command first; it must match the result JSON.":"请先保存实际测评命令，且须与结果 JSON 一致。","Result identity, 100 episodes, or evidence is missing.":"结果标识、100 个 episode 或任务产物不完整。","Invalid episode values.":"Episode 数据不合法。","Episode seed hash mismatch.":"Episode seed 校验和不一致。","Accepted results are locked.":"已确认的结果不可修改。","Complete upload and evidence checks first.":"请先完成上传及产物检查。","No submitted result to check.":"尚无已提交的结果可供复核。","Provide the actual command before uploading the task result.":"上传结果前请填写实际运行命令。","Unknown local preview action.":"不支持此演示操作。","Generate the local acceptance files first.":"请先生成验收样例文件。","Select a future expiry timestamp.":"请选择未来的有效期。","The actual command is required for every task.":"每个任务必须填写实际运行命令。","Select the evidence ZIP and its matching JSON (under 45 KB).":"请选择产物 ZIP 及对应的 JSON（小于 45 KB）。","The evidence belongs to a different evaluation, commit or task.":"产物所属的测评编号、commit 或任务不匹配。","Selected ZIP SHA256 does not match the JSON.":"所选 ZIP 的 SHA256 与 JSON 不一致。","Select a JSON manifest smaller than 45 KB.":"请选择小于 45 KB 的结果 JSON。","Failed to fetch":"网络连接失败，请稍后重试。","NetworkError when attempting to fetch resource.":"网络连接失败，请稍后重试。"};
  const errorText = (value) => {
    const message = String(value || "操作失败。");
    if (ERROR_MESSAGES[message]) return ERROR_MESSAGES[message];
    if (/^[\x00-\x7F]+$/.test(message)) return "操作未完成，请检查资料或联系主办方。技术诊断原文：" + message;
    return message;
  };
  const state = { credentials: null, role: "", jobs: [], selected: "", stage: 0, task: TASKS[0], policyDir: "", busy: false, error: "", toast: "", preview: null, drafts: new Map(), emailDraft: null, search: "" };
  try { state.credentials = JSON.parse(sessionStorage.getItem(STORAGE) || "null"); } catch { /* Require sign-in. */ }
  const escape = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const LABELS = { click_bell: "按铃", drawer_open_place: "开抽屉并放置", mixer_operating: "操作搅拌机", table_rearrangement: "桌面整理", water_pouring: "倒水", handle_basket: "搬运篮子", items_handover: "物品交接", item_assembly: "物品装配", manipulate_pipette: "操作移液器", sample_loading: "样本装载", checked: "已复核", submitted: "已提交", needs_correction: "需修复", pending: "待处理", ready: "已就绪", failed: "失败", provisional: "截止前验证", final: "正式冻结", confirmed: "已确认", corrected: "已修复", expired: "已过期", sent: "已发送", sending: "发送中", queued: "待发送", preview_only: "演示记录" };
  const label = (value) => LABELS[value] || String(value || "");
  const safeHref = (value) => { try { const url = new URL(String(value)); return url.protocol === "https:" ? url.href : "#"; } catch { return "#"; } };
  function sourceLinks(value, title, symbol) {
    return String(value || "").split(/[;；\s]+/).map(safeHref).filter(url => url !== "#").map((url) => {
      const parsed = new URL(url);
      return `<a href="${escape(url)}" target="_blank" rel="noreferrer">${icon(symbol)}${escape(title)}：${escape(parsed.pathname.slice(1))}</a>`;
    }).join("");
  }
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
    if (Object.keys(STAGES[state.stage].checks).some((key) => checks[key] !== true)) return "请完成本环节检查项";
    if (state.stage === 0 && job.coverage_status === "legacy_unverified") return "请先核验十任务映射";
    if (job.version_status === "provisional") return "当前仅验证代码，截止后才能冻结正式版本";
    if (state.stage <= 1 && !job.bundle_commit) return "请等待代码合成成功";
    if (state.stage === 3 && TASKS.some((task) => !job.task_commands?.[task])) return "请记录十个任务的实际测评命令";
    if (state.stage === 3 && TASKS.some((task) => !["submitted", "checked"].includes(resultFor(job, task)?.status))) return "请上传十个任务的结果";
    if (state.stage === 4 && TASKS.some((task) => resultFor(job, task)?.status !== "checked")) return "请复核并确认十个任务的结果";
    return "";
  };

  async function request(action, fields = {}) {
    if (LOCAL) return previewAction(action, fields);
    if (!API) throw new Error("尚未配置测评后端。");
    const response = await fetch(API, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, reviewer_email: state.credentials.email, reviewer_token: state.credentials.token, ...fields }) });
    const data = await response.json();
    if (!response.ok || data.ok === false) throw new Error(data.error || "测评请求失败。");
    return data;
  }
  const hash = async (text) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  function persistPreview() {
    sessionStorage.setItem(PREVIEW_STORAGE, JSON.stringify({ captured_at: state.preview.captured_at, jobs: state.preview.jobs, machines: state.preview.machines }));
  }
  async function previewAction(action, fields) {
    if (!state.preview) {
      const response = await fetch("../static/reviewer-preview.json", { cache: "no-store" });
      if (!response.ok) throw new Error("未找到流程演示数据。");
      state.preview = await response.json();
      try {
        const saved = JSON.parse(sessionStorage.getItem(PREVIEW_STORAGE) || "null");
        if (saved?.captured_at === state.preview.captured_at) { state.preview.jobs = saved.jobs; state.preview.machines = saved.machines; }
      } catch { /* Start a new local preview. */ }
      state.preview.machines ||= [];
      state.preview.jobs.forEach((job) => { job.workflow ||= { stages: STAGES.map(() => ({ done: false, checks: {} })), machine_id: "" }; });
    }
    if (state.credentials.email !== state.preview.reviewer_email || await hash(state.credentials.token) !== state.preview.reviewer_token_sha256) throw new Error("测评邮箱或 token 不正确。");
    if (action === "reviewer_login") return { ok: true, reviewer: { email: state.credentials.email, role: "admin" } };
    if (action === "reviewer_queue") return { ok: true, reviewer: { email: state.credentials.email, role: "admin" },
      jobs: state.preview.jobs.filter((job) => job.reviewer_email === state.credentials.email).map((job) => ({ ...job, machines: state.preview.machines })) };
    if (action === "reviewer_submission_window") return { ok: true, status: fields.revoke ? "revoked" : "granted" };
    const job = state.preview.jobs.find((item) => item.evaluation_id === fields.evaluation_id && item.reviewer_email === state.credentials.email);
    if (!job) throw new Error("此请求未分配给您。");
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
          TASKS.some((task) => !/^https:\/\/huggingface\.co\/\S+$/i.test(String(fields.task_checkpoint_links?.[task] || "")))) throw new Error("请先确认全部十任务 checkpoint。");
      job.task_checkpoint_links = fields.task_checkpoint_links; job.coverage_status = "verified_all_10"; job.coverage_verified_by = state.credentials.email;
    } else if (action === "reviewer_prepare") {
      if (job.coverage_status === "legacy_unverified" || !/^[a-f0-9]{40}$/.test(fields.bundle_commit) ||
          fields.bundle_url !== "https://github.com/ZhaoRunyi/RoboSynChallenge_eval/tree/submissions/" + job.evaluation_id + versionSuffix(job) ||
          !fields.policy_dirs?.length || fields.policy_dirs.some((dir) => !/^policy(?:\/[A-Za-z0-9_.-]+)*$/.test(dir) || dir.split("/").some((part) => [".", ".."].includes(part)))) throw new Error("代码合成记录不合法。");
      job.bundle_url = fields.bundle_url; job.bundle_commit = fields.bundle_commit; job.policy_dirs = fields.policy_dirs; job.state = "ready";
      job.preparation_status = "ready"; job.preparation_error = "";
    } else if (action === "reviewer_approve_version_exception") {
      if (!fields.argument_reviewed || !String(fields.reason || "").trim() || !String(job.preparation_error).includes("NO_LEGAL_VERSION")) throw new Error("请先审核并记录选手申诉。");
      job.version_generation = (job.version_generation || 0) + 1;
      job.version_cutoff_at = new Date().toISOString(); job.preparation_status = "pending"; job.preparation_error = "";
    } else if (action === "reviewer_reassign") {
      if (job.workflow.stages[1].done || !fields.assign_to || !fields.reason) throw new Error("开始本地工作后不可重新分配。");
      job.reviewer_email = fields.assign_to;
    } else if (action === "reviewer_retry_preparation") {
      if (job.bundle_commit) throw new Error("已存在合成代码。");
      job.preparation_status = "pending"; job.preparation_error = "";
    } else if (["reviewer_complete_stage", "reviewer_save_checks"].includes(action)) {
      if (!Number.isInteger(fields.stage) || fields.stage < 0 || fields.stage > 4 || job.workflow.stages.slice(0, fields.stage).some((stage) => !stage.done)) throw new Error("请先完成之前的环节。");
      if (action === "reviewer_complete_stage") {
        if (Object.keys(STAGES[fields.stage].checks).some((key) => fields.checks?.[key] !== true)) throw new Error("请完成所有检查项。");
        if (fields.stage === 0 && job.coverage_status === "legacy_unverified") throw new Error("请先核验十任务 checkpoint。");
        if (fields.stage === 1 && !job.bundle_commit) throw new Error("尚未生成合成代码。");
        if (fields.stage === 3 && TASKS.some((task) => !["submitted", "checked"].includes(resultFor(job, task)?.status))) throw new Error("请先上传十个任务的结果。");
        if (fields.stage === 4 && TASKS.some((task) => resultFor(job, task)?.status !== "checked")) throw new Error("请先复核并确认十个任务的结果。");
      }
      const stage = job.workflow.stages[fields.stage];
      if (!stage.done) { stage.checks = fields.checks; stage.done = action === "reviewer_complete_stage"; if (stage.done) stage.completed_at = new Date().toISOString(); }
      if (fields.stage === 2) job.workflow.machine_id = fields.machine_id;
      if (fields.stage === 4 && stage.done) job.state = "checked";
    } else if (action === "reviewer_preflight") {
      const report = fields.report;
      if (!/^[A-Za-z0-9_.-]{1,80}$/.test(fields.machine_id || "") || report?.schema !== 1 || report.kind !== "render_first_frame_comparison" ||
          TASKS.some((task) => report.task_coverage?.[task] !== true || ["cam_high", "cam_left_wrist", "cam_right_wrist"].some((camera) => !report.results?.some((row) => row.task === task && row.camera === camera)))) throw new Error("环境检查必须覆盖十任务及三个相机。");
      // Preview-only thresholds do not configure or bypass the production backend.
      const passed = report.results.every((row) => Number.isFinite(row.ssim) && row.ssim >= 0.98 && (row.identical_pixels === true || Number.isFinite(row.psnr_db) && row.psnr_db >= 35));
      state.preview.machines = state.preview.machines.filter((machine) => machine.machine_id !== fields.machine_id);
      state.preview.machines.push({ machine_id: fields.machine_id, status: passed ? "passed" : "failed", report_sha256: await hash(JSON.stringify(report)) });
    } else if (action === "reviewer_validate_result") {
      if (job.workflow.stages.slice(0, 3).some((stage) => !stage.done) || resultFor(job, fields.result?.task)?.status === "checked") throw new Error("请先完成前序环节；已确认的任务产物不可修改。");
    } else if (action === "reviewer_submit_result") {
      if (job.workflow.stages.slice(0, 3).some((stage) => !stage.done)) throw new Error("请先完成前三个环节。");
      const record = fields.result;
      if (!record?.eval_command || job.task_commands?.[record.task] !== record.eval_command) throw new Error("请先保存实际测评命令，且须与结果 JSON 一致。");
      if (record?.schema !== 1 || !TASKS.includes(record.task) || record.evaluation_id !== job.evaluation_id || record.submission_id !== job.submission_id ||
          record.bundle_commit !== job.bundle_commit || !job.policy_dirs.includes(record.policy_dir) || record.episodes?.length !== 100 ||
          !/^https:\/\//.test(record.artifacts?.url || "") || !/^[a-f0-9]{64}$/.test(record.artifacts?.sha256 || "")) throw new Error("结果标识、100 个 episode 或任务产物不完整。");
      if (new Set(record.episodes.map((row) => row.index)).size !== 100 || record.episodes.some((row) => !Number.isInteger(row.index) || row.index < 0 || row.index > 99 ||
          !Number.isInteger(row.seed) || row.seed < 0 || row.seed > 2147483647 || typeof row.success !== "boolean" || !Number.isInteger(row.action_steps) ||
          row.action_steps < 0 || row.action_steps > STEPS[record.task] || !Number.isFinite(row.inference_ms) || row.inference_ms < 0)) throw new Error("Episode 数据不合法。");
      const ordered = [...record.episodes].sort((a, b) => a.index - b.index).map((row) => row.seed);
      if (await hash(JSON.stringify(ordered)) !== record.seed_list_sha256) throw new Error("Episode seed 校验和不一致。");
      if (resultFor(job, record.task)?.status === "checked") throw new Error("已确认的结果不可修改。");
      job.results = (job.results || []).filter((row) => row.task !== record.task);
      job.results.push({ task: record.task, status: "submitted", artifacts: record.artifacts, summary: { episodes: 100, success_rate: record.episodes.filter((row) => row.success).length, average_steps: record.episodes.reduce((sum, row) => sum + row.action_steps, 0) / 100 } });
      job.state = "reviewing";
    } else if (action === "reviewer_check_result") {
      if (!job.workflow.stages[3].done || ["video", "trajectory", "checksum"].some((key) => fields.checks?.[key] !== true)) throw new Error("请先完成上传及产物检查。");
      const row = resultFor(job, fields.task);
      if (!row || row.status !== "submitted") throw new Error("尚无已提交的结果可供复核。");
      row.status = fields.decision;
    } else if (action === "reviewer_save_command") {
      if (!TASKS.includes(fields.task) || !String(fields.command || "").trim() || resultFor(job, fields.task)) throw new Error("上传结果前请填写实际运行命令。");
      job.task_commands ||= {}; job.task_commands[fields.task] = String(fields.command).trim();
    } else if (action === "reviewer_send_issue") {
      job.messages ||= [];
      if (!job.messages.some((message) => message.message_id === fields.message_id)) job.messages.push({ message_id: fields.message_id, stage: fields.stage, subject: fields.subject, status: "preview_only", sent_at: new Date().toISOString() });
    } else throw new Error("不支持此演示操作。");
    persistPreview();
    return { ok: true };
  }

  function render() {
    return `<section class="reviewer-page"><div class="shell" data-reviewer-root><div data-reviewer-content></div></div></section>`;
  }
  function heading(signedIn) {
    return `<div class="reviewer-heading"><div><h1>Evaluation workspace</h1></div>${signedIn ? `<div class="reviewer-toolbar"><span>${escape(state.credentials.email)}</span><button class="reviewer-icon" data-review-action="refresh" title="刷新请求" aria-label="刷新请求">${icon("refresh-cw")}</button><button class="reviewer-icon" data-review-action="logout" title="退出登录" aria-label="退出登录">${icon("log-out")}</button></div>` : ""}</div>`;
  }
  function checks(job) {
    const values = draft(job);
    return `${state.stage === 4 ? scoreSummary(job) : ""}<div class="reviewer-checks"><h4>完成检查</h4>${Object.entries(STAGES[state.stage].checks).map(([key, text]) => `<label class="reviewer-check"><input type="checkbox" data-stage-check="${key}" ${values[key] ? "checked" : ""} ${flow(job).stages[state.stage].done ? "disabled" : ""}><span>${text}</span></label>`).join("")}</div>${admissionControls(job)}`;
  }
  const notice = (text, success = false) => `<div class="reviewer-notice ${success ? "success" : ""}">${text}</div>`;
  const metric = (value, unit = "", digits = 1) => Number.isFinite(value) ? Number(value).toFixed(digits) + unit : "待完成";
  const commandBox = (text, title) => `<div class="reviewer-command"><code data-copy-command>${escape(text)}</code><button class="reviewer-icon" data-review-action="copy" title="${escape(title)}" aria-label="${escape(title)}">${icon("copy")}</button></div>`;
  function scoreSummary(job) {
    const overall = job.overall_summary || {};
    const row = resultFor(job, state.task);
    return `<h4>十任务平均</h4><dl class="reviewer-meta"><div><dt>成功率</dt><dd>${metric(overall.success_rate, "%")}</dd></div><div><dt>动作步数</dt><dd>${metric(overall.average_steps)}</dd></div><div><dt>每 episode 推理耗时</dt><dd>${metric(overall.inference_per_episode_ms, " ms")}</dd></div><div><dt>加权得分</dt><dd>${metric(overall.weighted_score)}</dd></div></dl>${!["calibrated", "published_act_reference"].includes(overall.score_status) ? notice("最终加权得分需完整十任务产物及固定的 RTX 5090 ACT 参考值。未完成标定的得分不会发布。") : ""}${row && job.task_commands?.[state.task] ? commandBox(job.task_commands[state.task], "复制已记录的测评命令") : ""}${row ? commandBox(`printf '%s  %s\\n' '${row.artifacts?.sha256}' '${job.evaluation_id}-${state.task}-evidence.zip' | sha256sum --check`, "复制产物校验命令") : ""}`;
  }
  function runCommands(job) {
    const dirs = job.policy_dirs || [];
    const dir = dirs.includes(state.policyDir) ? state.policyDir : dirs.length === 1 ? dirs[0] : "";
    const target = `results/${state.task}`;
    const command = `cd ${cloneDirectory(job)}\npython tools/run_task_evaluation.py --task ${state.task} --submission-id ${job.submission_id} --policy-dir ${dir || "SELECT_POLICY_DIRECTORY"} --seeds "\${RSC_SEED_PACKET:?请设置主办方 seed 文件路径}" --checkpoints "\${RSC_CHECKPOINTS:?请设置已下载的 checkpoint 目录}" --policy-image "\${RSC_POLICY_IMAGE:?请设置核准的镜像及 sha256}" --output ${target}`;
    return `<div class="reviewer-task-picker"><label>任务<select data-task-picker>${TASKS.map(task => `<option value="${task}" ${task === state.task ? "selected" : ""}>${label(task)}</option>`).join("")}</select></label><label>识别到的 policy 入口<select data-policy-picker required><option value="">请选择运行入口</option>${dirs.map(value => `<option value="${escape(value)}" ${value === dir ? "selected" : ""}>${escape(value)}</option>`).join("")}</select></label></div>${!dir ? notice("请按选手文档选择此任务的运行入口，再复制命令。") : commandBox(command, "复制任务测评命令")}${notice("官方采集器运行固定的 100 个 episode，记录实际命令，生成任务 JSON 与 ZIP，并自动上传校验后的产物到 OneDrive。按适配器要求设置 --model-config 和 --checkpoint-relative；checkpoint、seeds 和核准的依赖镜像均放在选手代码之外。")}${commandBox(`cd ${cloneDirectory(job)}\npython tools/check_upload.py`, "复制存储检查命令")}${commandBox(`cd ${cloneDirectory(job)}\npython tools/upload_evidence.py --manifest ${target}/package/${job.evaluation_id}-${state.task}-result.json --archive ${target}/package/${job.evaluation_id}-${state.task}-evidence.zip`, "复制上传重试命令")}`;
  }
  function admissionControls(job) {
    if (state.role !== "admin" || !job || job.local_walkthrough) return "";
    return `<details class="reviewer-notes"><summary>主办方：单独开放提交</summary><form class="reviewer-form" data-review-form="admission"><label>参赛者注册邮箱<input name="participant_email" type="email" value="${escape(job.email)}" required></label><label>有效期至（浏览器本地时间）<input name="expires_at" type="datetime-local"></label><label>理由<input name="reason" maxlength="500" required></label><label class="reviewer-confirm"><input type="checkbox" name="revoke">撤销此参赛者的特殊提交权限</label><button class="button button-secondary">${icon("save")}保存提交权限</button></form></details>`;
  }
  function versionControls(job) {
    if (job.local_walkthrough) return "";
    const report = job.version_report?.code;
    const metadata = report ? notice(`版本状态：${escape(label(job.version_status))}<br>Commit：<code>${escape(report.revision)}</code><br>提交时间：${escape(report.committed_at)}<br>截止时间：${escape(report.cutoff_at)}`) : "";
    const appeal = String(job.preparation_error || "").includes("NO_LEGAL_VERSION") ? `<form class="reviewer-form" data-review-form="version-exception"><h4>审核参赛者申诉</h4><label>申诉邮件内容及批准理由<textarea name="reason" required maxlength="6000"></textarea></label><label class="reviewer-confirm"><input type="checkbox" name="argument_reviewed" required>已审核参赛者的邮件申诉，允许使用当前可用版本重新合成一次。</label><button class="button button-secondary">${icon("check")}批准并重新合成</button></form>` : "";
    const transfer = state.role === "admin" && !flow(job).stages[1].done ? `<details class="reviewer-notes"><summary>主办方：本地工作前重新分配</summary><form class="reviewer-form" data-review-form="reassign"><label>在岗测评者邮箱<input name="assign_to" type="email" required></label><label>理由<input name="reason" required maxlength="500"></label><button class="button button-secondary">${icon("arrow-right-left")}重新分配</button></form></details>` : "";
    return metadata + appeal + transfer;
  }
  function taskTable(job, checkpoints = false) {
    return `<table class="reviewer-task-table"><thead><tr><th>任务</th>${checkpoints ? "<th>Checkpoint</th><th>最大步数</th>" : "<th>Episodes</th><th>成功率</th><th>步数</th><th>每 episode 推理耗时</th><th>得分</th><th>状态</th>"}</tr></thead><tbody>${TASKS.map((task) => {
      const row = resultFor(job, task);
      const access = job.hf_access?.[task];
      return `<tr><td><strong>${escape(label(task))}</strong></td>${checkpoints ? `<td><a target="_blank" rel="noreferrer" href="${escape(safeHref(job.task_checkpoint_links?.[task]))}">Hugging Face ${icon("external-link")}</a><br><small>${access?.accessible ? `${Number(access.files_checked)} 个文件已核验 · <code>${escape(access.revision.slice(0, 12))}</code>` : "等待访问核验"}</small></td><td>${STEPS[task]}</td>` : `<td>${row?.summary?.episodes || "—"} / 100</td><td>${metric(row?.summary?.success_rate, "%")}</td><td>${metric(row?.summary?.average_steps)}</td><td>${metric(row?.summary?.inference_per_episode_ms, " ms")}</td><td>${metric(row?.summary?.weighted_score)}</td><td class="${row?.status === "checked" ? "checked" : ""}">${escape(label(row?.status || "尚未上传"))}</td>`}</tr>`;
    }).join("")}</tbody></table>`;
  }
  function stageContent(job) {
    return stageContentDetails(job) + (state.stage === 0 ? versionControls(job) : "");
  }
  function stageContentDetails(job) {
    if (state.stage === 0) return `${job.bundle_commit ? notice("自动合成成功，固定 commit：<code>" + escape(job.bundle_commit) + "</code>。保留完整选手 policy/，环境代码来自官方私密基线。", true) : codeStage(job)}<dl class="reviewer-meta"><div><dt>参赛者</dt><dd>${escape(job.email)}</dd></div><div><dt>提交编号</dt><dd>${escape(job.submission_id)}</dd></div><div><dt>提交时间</dt><dd>${escape(job.created_at)}</dd></div><div><dt>任务覆盖</dt><dd>${job.coverage_status === "legacy_unverified" ? "待填写十任务映射" : "十任务 checkpoint 映射已记录"}</dd></div></dl><div class="reviewer-links">${sourceLinks(job.code_link, "代码仓库", "github")}${sourceLinks(job.checkpoint_link, "Checkpoint", "external-link")}</div>${job.technical_notes ? `<details class="reviewer-notes"><summary>选手运行与依赖说明</summary><p>${escape(job.technical_notes)}</p></details>` : ""}${job.coverage_status !== "legacy_unverified" ? taskTable(job, true) : `${notice("此旧请求尚无已核验的十任务映射。请根据选手说明和仓库资料，在本环节逐任务填写。保存后自动脚本将检查 GitHub／Hugging Face 权限并合成代码；等待合成成功后再继续。")}${`<form class="reviewer-form" data-review-form="verify"><h3>补全旧请求的十任务映射</h3><div class="reviewer-verify-grid">${TASKS.map((task) => `<label><span>${label(task)} <small>${task}</small></span><input type="url" name="${task}" value="${escape(job.task_checkpoint_links?.[task] || "")}" required></label>`).join("")}</div><label class="reviewer-confirm"><input type="checkbox" name="coverage_confirmed" required>已阅读选手资料，确认十个任务的对应关系；共用 checkpoint 的任务也已明确核实。</label><button class="button button-secondary">${icon("check")}保存并提交核验</button></form>`}`}`;
    if (state.stage === 1) return `${codeStage(job)}${job.bundle_commit ? commandBox(`cd ${cloneDirectory(job)}\npython tools/download_checkpoints.py --output /path/to/checkpoints --token-file /path/to/private/hf.token`, "复制固定版本 checkpoint 下载示例") + notice("测评者自行下载并配置 checkpoint 路径。示例使用固定的 HF 版本，生成采集器所需的校验记录。Token 须保存在代码目录及选手容器之外。适配器配置和依赖由选手负责，请记录实际命令与配置。") : ""}`;
    if (state.stage === 2) return `<div class="reviewer-command"><code data-copy-command>cd ${escape(cloneDirectory(job))}
python tools/check_environment.py</code><button class="reviewer-icon" data-review-action="copy" title="复制环境检查命令" aria-label="复制环境检查命令">${icon("copy")}</button></div>${notice("预期输出：ENVIRONMENT CHECK PASSED（退出码 0）。主办方须先安装固定参考场景并配置核准阈值。缺少参考数据、未设阈值或检查失败时脚本会停止；无需填写机器 ID、指标或上传报告。")}`;
    if (state.stage === 3) return `${runCommands(job)}<details class="reviewer-notes"><summary>实际命令与手动上传</summary>${taskCommands(job)}<form class="reviewer-form" data-review-form="onedrive"><h4>上传 ZIP 至 OneDrive</h4><div class="reviewer-verify-grid"><label>任务产物 ZIP<input type="file" name="evidence_zip" accept=".zip,application/zip" required></label><label>对应任务 JSON<input type="file" name="evidence_manifest" accept=".json,application/json" required></label></div><label class="reviewer-confirm"><input type="checkbox" name="restart">取消未完成的上传，并重新上传同一 ZIP。</label><button class="button button-secondary">${icon("upload-cloud")}${LOCAL ? "检查演示 ZIP" : "上传 ZIP"}</button><div data-upload-status role="status"></div><progress data-upload-progress max="1" value="0" hidden></progress></form><hr><form class="reviewer-form" data-review-form="result"><label>任务结果 JSON<input type="file" name="result_file" accept=".json,application/json" required></label><button class="button button-secondary">${icon("upload")}校验并上传 JSON</button></form></details>${notice("无需另行登录 Microsoft。两种上传方式均写入 evaluation_id/task/latest。ZIP 直接上传 OneDrive，不经过 Google Sheets；已确认的结果不可修改。")}${taskTable(job)}`;
    const row = resultFor(job, state.task);
    return `<div class="reviewer-task-picker"><select data-task-picker aria-label="待复核任务">${TASKS.map((task) => `<option value="${task}" ${task === state.task ? "selected" : ""}>${label(task)} · ${label(resultFor(job, task)?.status || "尚未上传")}</option>`).join("")}</select><span>${(job.results || []).filter((result) => result.status === "checked").length} / 10 已确认</span></div>${row ? `<dl class="reviewer-meta"><div><dt>Episodes</dt><dd>${row.summary.episodes} / 100</dd></div><div><dt>成功率</dt><dd>${Number(row.summary.success_rate).toFixed(1)}%</dd></div><div><dt>平均动作步数</dt><dd>${Number(row.summary.average_steps).toFixed(1)} / ${STEPS[state.task]}</dd></div><div><dt>产物 SHA256</dt><dd>${escape(row.artifacts?.sha256 || "")}</dd></div></dl><div class="reviewer-links"><a href="${escape(safeHref(row.artifacts?.url))}" target="_blank" rel="noreferrer">${icon("folder-open")}打开任务产物</a></div>${row.status === "checked" ? notice("此任务结果已复核并确认。", true) : `<form data-review-form="accept" class="reviewer-form"><label class="reviewer-confirm"><input type="checkbox" name="video" required>已检查任务视频和成功／失败判定。</label><label class="reviewer-confirm"><input type="checkbox" name="trajectory" required>已检查 episode 状态／动作轨迹。</label><label class="reviewer-confirm"><input type="checkbox" name="checksum" required>下载产物与记录的 SHA256 一致。</label><button class="button button-secondary">${icon("check")}确认此任务结果</button></form>`}` : notice("此任务尚未上传结果 JSON。")}${taskTable(job)}`;
  }
  function codeStage(job) {
    const instructions = "";
    if (job.coverage_status === "legacy_unverified") return notice("第一步：核对选手资料，填写下方十任务映射并保存。自动合成将在映射确认后开始。");
    if (!job.bundle_commit) return `${notice(job.preparation_status === "failed"
      ? `自动代码合成失败。<br>${escape(job.preparation_error || "无法合成已提交的 policy。")}<br>请通过“有问题／发送邮件”联系选手。合成成功前不可进入下一环节。`
      : "等待自动合成脚本。脚本将完整选手 policy/ 目录复制到官方隐藏测评环境中，请勿克隆并使用选手修改过的环境代码进行测评。")}${instructions}${job.preparation_status === "failed" ? `<div class="reviewer-retry">${button("retry-code", "选手回复后重试合成", "refresh-cw")}</div>` : ""}`;
    return `<div class="reviewer-code"><div class="reviewer-links"><a target="_blank" rel="noreferrer" href="${escape(safeHref(job.bundle_url))}">${icon("git-branch")}已合成的私密分支</a></div><div class="reviewer-command"><code data-copy-command>${escape(cloneCommand(job))}</code><button class="reviewer-icon" data-review-action="copy" title="复制克隆及切换命令" aria-label="复制克隆及切换命令">${icon("copy")}</button></div><dl class="reviewer-meta"><div><dt>自动固定的 commit</dt><dd>${escape(job.bundle_commit)}</dd></div><div><dt>识别到的测评入口</dt><dd>${escape(job.policy_dirs.join(", "))}</dd></div></dl>${notice("保留完整 policy/ 目录，包含共享文件及所有子目录。脚本自动识别测评入口，无需手填目录名或 commit SHA。", true)}${instructions}${taskTable(job, true)}</div>`;
  }
  function taskCommands(job) {
    return `<form class="reviewer-form" data-review-form="commands"><h4>各任务实际测评命令 <span class="reviewer-required">*</span></h4><div class="reviewer-command-fields">${TASKS.map((task) => `<label>${escape(label(task))}<textarea name="command_${task}" rows="2" maxlength="4000" ${resultFor(job, task) ? "readonly" : ""} required>${escape(job.task_commands?.[task] || "")}</textarea></label>`).join("")}</div><button class="button button-secondary">${icon("save")}保存命令</button></form>`;
  }
  function previewSamples(job) {
    if (!LOCAL) return "";
    const base = "../static/reviewer-demo-files/";
    if (state.stage <= 1 && !job.bundle_commit) return notice("验收样例：仅模拟代码合成记录，不创建 GitHub 分支。") + button("demo-code", "载入合成记录样例", "file-json");
    if (state.stage === 1 && job.bundle_commit === "a".repeat(40)) return notice("此为模拟合成记录，不是真实 GitHub commit，仅用于流程验收。");
    if (state.stage === 3 && job.bundle_commit === "a".repeat(40)) return `<details class="reviewer-notes"><summary>结果 JSON 样例（不计入比赛）</summary><div class="reviewer-samples">${TASKS.map(task => `<a href="${base}${escape(job.evaluation_id)}/${task}-result.json" download>${label(task)} ${icon("download")}</a>`).join("")}</div></details>`;
    return "";
  }
  function newEmail(job, template = "stage") {
    const blank = template === "blank";
    const issue = ISSUE_TEMPLATES[state.stage].find((item) => item[0] === template)?.[2] || STAGES[state.stage].issue;
    return { stage: state.stage, template, message_id: "msg_" + crypto.randomUUID().replace(/-/g, ""),
      subject: blank ? "" : "RoboSynChallenge 测评通知：" + job.evaluation_id,
      body: blank ? "" : `${job.team_name} 团队您好：\n\n${issue}\n\n测评编号：${job.evaluation_id}\n任务／问题详情：\n${state.stage <= 1 ? job.preparation_error || "" : ""}\n\n${state.stage === 2 ? "除非另行通知，当前无需选手操作。" : "请通过回复链接确认资料，或在首次问题通知后的 24 小时内提交唯一一次代码修复。修复须包含固定 GitHub commit 链接及全部十任务 checkpoint。"}\n\nRoboSynChallenge 主办方` };
  }
  function composer(job) {
    if (!state.emailDraft) return "";
    const email = state.emailDraft;
    return `<section class="reviewer-composer" data-mail-composer><div class="reviewer-composer-head"><h3>发送选手邮件</h3><button class="reviewer-icon" data-review-action="close-email" title="关闭邮件草稿" aria-label="关闭邮件草稿">${icon("x")}</button></div><form class="reviewer-form" data-review-form="email"><div class="reviewer-verify-grid"><label>收件人<input value="${escape(job.email)}" readonly></label><label>模板<select data-email-template><option value="stage" ${email.template === "stage" ? "selected" : ""}>本环节通用问题</option>${ISSUE_TEMPLATES[email.stage].map(([key, title]) => `<option value="${key}" ${email.template === key ? "selected" : ""}>${title}</option>`).join("")}<option value="blank" ${email.template === "blank" ? "selected" : ""}>空白邮件</option></select></label></div><label>主题<input name="subject" value="${escape(email.subject)}" maxlength="200" required></label><label>正文<textarea name="body" rows="9" required>${escape(email.body)}</textarea></label><div class="reviewer-mail-actions"><button class="button button-primary">${icon("send")}${LOCAL ? "记录演示邮件" : "发送邮件"}</button><span>${LOCAL ? "演示仅记录，不发送邮件。" : "收件人固定为该队伍的注册邮箱。"}</span></div></form></section>`;
  }
  function jobDetail(job) {
    if (!job) return `<div class="reviewer-empty">当前没有分配给您的请求。</div>`;
    const workflow = flow(job);
return `<article class="reviewer-detail"><header class="reviewer-detail-head"><div><span class="reviewer-id" data-evaluation-id>${escape(job.evaluation_id)}</span><h2>${escape(job.local_walkthrough ? "演示请求" : job.team_name)}</h2><p>${escape(job.local_walkthrough ? "五环节流程演示" : job.artifact_name)} · ${escape(job.email)}</p></div><span class="reviewer-state ${doneCount(job) === 5 ? "completed" : ""}">${doneCount(job) === 5 ? "已完成" : doneCount(job) + " / 5 环节已完成"}</span></header><nav class="reviewer-stage-nav" aria-label="测评环节">${STAGES.map((stage, index) => `<button type="button" data-review-stage="${index}" aria-current="${state.stage === index ? "step" : "false"}" class="${state.stage === index ? "active" : ""} ${workflow.stages[index].done ? "done" : ""}" ${index > firstOpen(job) ? "disabled" : ""}><span class="reviewer-step-number">${workflow.stages[index].done ? icon("check") : index + 1}</span><span>${stage.title}</span></button>`).join("")}</nav><div class="reviewer-stage-body"><div class="reviewer-stage-title"><h3>${STAGES[state.stage].title}</h3><span>第 ${state.stage + 1} / 5 环节</span></div><p class="reviewer-description">${STAGES[state.stage].description}</p>${state.error ? `<p class="reviewer-error" role="alert">${escape(state.error)}</p>` : ""}${state.toast ? `<p class="reviewer-toast" role="status">${escape(state.toast)}</p>` : ""}${job.correction ? notice("选手回复：" + escape(label(job.correction.status)) + " · 截止时间（UTC）：" + escape(job.correction.deadline_at) + "<br>" + escape(job.correction.notes || "")) : ""}${stageContent(job)}${previewSamples(job)}${checks(job)}${composer(job)}${job.messages?.length ? `<div class="reviewer-mail-log"><h4>邮件记录</h4>${job.messages.map((message) => `<p>${escape(STAGES[message.stage]?.title)} · ${escape(label(message.status))} · ${escape(message.sent_at || "")}<br>${escape(message.subject)}</p>`).join("")}</div>` : ""}</div><footer class="reviewer-footer">${button("previous", "上一环节", "arrow-left", state.stage === 0 ? "disabled" : "")}${button("email", "有问题／发送邮件", "mail")}<button type="button" class="button button-primary" data-review-action="next" ${state.busy || (!workflow.stages[state.stage].done && nextBlocker(job)) ? "disabled" : ""} title="${escape(workflow.stages[state.stage].done ? "此环节已完成" : nextBlocker(job))}">${state.stage === 4 ? "完成复核" : "已完成／下一环节"}${icon(state.stage === 4 ? "check" : "arrow-right")}</button></footer></article>`;
  }
  function paint() {
    const content = root()?.querySelector("[data-reviewer-content]");
    if (!content) return;
    if (!state.credentials) content.innerHTML = `${heading(false)}<div class="reviewer-login-layout"><form data-review-form="login" class="reviewer-form reviewer-login"><h2>测评者登录</h2><p>仿真初赛测评</p>${state.error ? `<p class="reviewer-error" role="alert">${escape(state.error)}</p>` : ""}<label>邮箱<input type="email" name="email" autocomplete="username" value="${LOCAL ? "1070055979@qq.com" : ""}" required></label><label>测评 token<input type="password" name="token" autocomplete="current-password" placeholder="请输入分配给您的测评 token" required></label><button class="button button-primary" ${state.busy ? "disabled" : ""}>${icon("log-in")}登录</button></form></div><div class="reviewer-login-meta"><a href="../#/leaderboard">Public leaderboard</a></div>`;
    else {
      const realJobs = state.jobs.filter((job) => !job.local_walkthrough);
      const complete = realJobs.filter((job) => doneCount(job) === 5).length;
      const units = realJobs.reduce((sum, job) => sum + doneCount(job), 0);
      content.innerHTML = `${heading(true)}<div class="reviewer-progress"><strong>我的测评进度</strong><progress max="${Math.max(1, realJobs.length * 5)}" value="${units}" aria-label="总体测评进度"></progress><span>${complete} / ${realJobs.length} 请求已完成 · ${units} / ${realJobs.length * 5} 环节</span></div><div class="reviewer-layout"><aside class="reviewer-sidebar"><div class="reviewer-sidebar-head"><h2>我的测评请求</h2><span>${realJobs.length}${LOCAL ? " + 演示" : ""}</span></div><input class="reviewer-search" type="search" placeholder="搜索队伍或请求" aria-label="搜索我的测评请求" value="${escape(state.search)}"><div class="reviewer-queue">${queueHtml()}</div></aside>${jobDetail(selected())}</div>`;
      if (LOCAL && selected()?.local_walkthrough) {
        const message = document.createElement("div");
        message.className = "reviewer-notice";
        message.textContent = "流程演示请求：可直接进入下一环节，无需填写或上传。不发送邮件，不创建代码分支，也不写入后台表格。";
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
    return state.jobs.filter((job) => (job.team_name + " " + job.artifact_name + " " + job.evaluation_id).toLowerCase().includes(state.search.toLowerCase())).map((job) => `<button type="button" class="reviewer-job ${job.evaluation_id === state.selected ? "selected" : ""}" data-review-job="${escape(job.evaluation_id)}"><strong>${escape(job.local_walkthrough ? "演示请求" : job.team_name)}</strong><span>${escape(job.local_walkthrough ? "五环节流程演示" : job.artifact_name)}</span><small><span>${doneCount(job) === 5 ? "已完成" : STAGES[firstOpen(job)].title}</span><span>${doneCount(job)} / 5</span></small><progress value="${doneCount(job)}" max="5" aria-label="请求进度"></progress></button>`).join("") || `<p class="reviewer-empty">没有匹配的测评请求。</p>`;
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
    catch (error) { if (!sessionStorage.getItem(STORAGE)) state.credentials = null; state.error = errorText(error.message || String(error)); }
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
        navigator.clipboard.writeText(text).then(() => { state.toast = "命令已复制。"; paint(); }).catch(() => { state.error = "无法访问剪贴板，请选中命令后复制。"; paint(); });
      }
      if (action === "previous" && state.stage > 0) perform(async () => { await saveStage(); state.stage -= 1; state.emailDraft = null; state.toast = ""; });
      if (action === "email") openEmail();
      if (action === "retry-code") perform(async () => { await request("reviewer_retry_preparation", { evaluation_id: selected().evaluation_id }); state.toast = "已排队重新合成，脚本运行后请刷新。"; });
      if (action === "demo-code" && LOCAL) perform(async () => {
        const job = selected();
        const response = await fetch("../static/reviewer-demo-files/" + encodeURIComponent(job.evaluation_id) + "/code-receipt.json");
        if (!response.ok) throw new Error("请先生成验收样例文件。");
        await request("reviewer_prepare", { evaluation_id: job.evaluation_id, ...await response.json() });
      });
      if (action === "close-email") { state.emailDraft = null; paint(); }
      if (action === "next") perform(async () => {
        const job = selected();
        const values = draft(job);
        if (!flow(job).stages[state.stage].done) await request("reviewer_complete_stage", { evaluation_id: job.evaluation_id, stage: state.stage, checks: values, machine_id: values.machine_id || "" });
        if (state.stage < 4) { state.stage += 1; state.toast = ""; } else state.toast = "复核完成。主办方发布前，结果仍保持私密。";
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
        state.toast = "已记录申诉批准，重新合成已排队。";
      });
      if (type === "reassign") perform(async () => {
        await request("reviewer_reassign", { evaluation_id: selected().evaluation_id, assign_to: String(data.get("assign_to") || ""), reason: String(data.get("reason") || "") });
        state.selected = ""; state.toast = "请求已重新分配。";
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
        if (!revoke && (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now())) throw new Error("请选择未来的有效期。");
        await request("reviewer_submission_window", { participant_email: String(data.get("participant_email") || "").trim(),
          expires_at: revoke ? "" : date.toISOString(), reason: String(data.get("reason") || "").trim(), revoke });
        state.toast = LOCAL ? "演示操作：未修改实际提交权限。" : revoke ? "已撤销单独提交权限。" : "已为当前参赛 token 保存单独提交权限。";
      });
      if (type === "commands") perform(async () => {
        const commands = Object.fromEntries(TASKS.map((task) => [task, String(data.get("command_" + task) || "").trim()]));
        if (Object.values(commands).some((value) => !value)) throw new Error("每个任务必须填写实际运行命令。");
        for (const task of TASKS) if (!resultFor(job, task)) await request("reviewer_save_command", { evaluation_id: job.evaluation_id, task, command: commands[task] });
        state.toast = "实际测评命令已保存。";
      });
      if (type === "verify") perform(() => request("reviewer_verify_coverage", { evaluation_id: job.evaluation_id, coverage_confirmed: data.has("coverage_confirmed"), task_checkpoint_links: Object.fromEntries(TASKS.map((task) => [task, String(data.get(task) || "").trim()])) }));
      if (type === "onedrive") perform(async () => {
        const file = data.get("evidence_zip");
        const json = data.get("evidence_manifest");
        if (!file?.size || !json?.size || json.size > 45000) throw new Error("请选择产物 ZIP 及对应的 JSON（小于 45 KB）。");
        const record = JSON.parse(await json.text());
        if (record.evaluation_id !== job.evaluation_id || record.submission_id !== job.submission_id || record.bundle_commit !== job.bundle_commit || !TASKS.includes(record.task)) throw new Error("产物所属的测评编号、commit 或任务不匹配。");
        const progress = (title, fraction) => {
          const text = element.querySelector("[data-upload-status]");
          const meter = element.querySelector("[data-upload-progress]");
          if (text) text.textContent = title;
          if (meter) { meter.hidden = false; meter.value = fraction; }
        };
        if (LOCAL) {
          const checksum = await RSCOneDrive.hashBlob(file, value => progress("正在检查演示 ZIP", value));
          if (checksum !== record.artifacts?.sha256) throw new Error("所选 ZIP 的 SHA256 与 JSON 不一致。");
          state.toast = "演示 ZIP 校验完成。本次未连接 Microsoft，未上传 ZIP 或 JSON。";
          return;
        }
        const ready = await RSCOneDrive.upload({ file, record, request, progress, restart: form.querySelector('[name="restart"]')?.checked === true });
        await request("reviewer_submit_result", { evaluation_id: job.evaluation_id, result: ready });
        state.toast = label(ready.task) + "：ZIP 已上传，SHA256 已核验，JSON 已登记。";
      });
      if (type === "result") perform(async () => {
        const file = data.get("result_file");
        if (!file?.size || file.size > 45000) throw new Error("请选择小于 45 KB 的结果 JSON。");
        const record = JSON.parse(await file.text());
        { await request("reviewer_submit_result", { evaluation_id: job.evaluation_id, result: record }); state.toast = label(record.task) + "：结果 JSON 已上传并通过校验。"; }
      });
      if (type === "accept") perform(() => request("reviewer_check_result", { evaluation_id: job.evaluation_id, task: state.task, decision: "checked", note: "", checks: { video: data.has("video"), trajectory: data.has("trajectory"), checksum: data.has("checksum") } }));
      if (type === "email") perform(async () => {
        const email = state.emailDraft;
        await request("reviewer_send_issue", { evaluation_id: job.evaluation_id, message_id: email.message_id, stage: email.stage, subject: String(data.get("subject") || "").trim(), body: String(data.get("body") || "").trim() });
        state.emailDraft = null; state.toast = LOCAL ? "演示邮件已记录，未发送邮件。" : "邮件已发送并记录。";
      });
    });
    paint();
    if (state.credentials) perform(async () => {});
  }
  window.RSCReviewer = { render, mount };
})();
