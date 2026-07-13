(() => {
  "use strict";

  const STORAGE_KEY = "robosynchallenge-pages-state-v3";
  const DATASET_URL = "https://huggingface.co/RoboSynChallenge/datasets";
  const DATASET_LABEL = "Released data on Hugging Face";
  const SIMULATION_REPO_URL = "https://github.com/EDEM-AI/RoboSynChallenge/tree/main";
  const TUTORIAL_URL = "https://edem-ai.github.io/RoboSynChallenge/html/getting_started/overview.html";
  const POLICY_TUTORIAL_URL = "https://edem-ai.github.io/RoboSynChallenge/html/tutorials/policy/your_own_policy.html";
  const DATA_COLLECTION_TUTORIAL_URL = "https://edem-ai.github.io/RoboSynChallenge/html/tutorials/collect_data.html";
  const REPORT_URL = "material/RoboSynChallenge-report.pdf";
  const DEFAULT_VIDEO_URL = "static/assets/demo-eval.mp4";

  const EVALUATION_STAGE_LABELS = {
    preliminary_simulation: "Preliminary simulation",
    final_real_robot: "Final real robot",
  };

  const EVALUATION_VIDEO_ASSETS = [
    { file: "click_bell.mp4", label: "Click bell" },
    { file: "drawer_open_place.mp4", label: "Drawer open place" },
    { file: "handle_basket.mp4", label: "Handle basket" },
    { file: "item_assembly.mp4", label: "Item assembly" },
    { file: "items_handover.mp4", label: "Items handover" },
    { file: "manipulate_pipette.mp4", label: "Manipulate pipette" },
    { file: "mixer_operating.mp4", label: "Mixer operating" },
    { file: "sample_loading.mp4", label: "Sample loading" },
    { file: "table_rearrangement.mp4", label: "Table rearrangement" },
    { file: "water_pouring.mp4", label: "Water pouring" },
  ];

  const RANKING_LABELS = {
    ranked: "Ranked",
    test: "Test run",
  };

  const STATUS_LABELS = {
    submitted: "Submitted",
    scheduled: "Scheduled",
    queued: "Queued",
    evaluating: "Evaluating",
    completed: "Completed",
    published: "Published",
  };

  const HOME_STATS = [
    { value: "10", label: "official manipulation tasks" },
    { value: "2", label: "competition stages" },
    { value: "0", label: "robots needed for preliminaries" },
    { value: "1", label: "standardized final platform" },
  ];

  const BENCHMARK_SUMMARY = [
    { label: "pi0 (sim)", model_name: "pi0", track: "sim-only", evaluation_stage: "preliminary_simulation", data_regime: "Sim only", success_rate: 22.0, action_steps: 898.12, real_time: 90.56 },
    { label: "pi0 (real)", model_name: "pi0", track: "real-only", evaluation_stage: "final_real_robot", data_regime: "Real only", success_rate: 22.5, action_steps: 881.15, real_time: 90.2 },
    { label: "pi0.5 (sim)", model_name: "pi0.5", track: "sim-only", evaluation_stage: "preliminary_simulation", data_regime: "Sim only", success_rate: 38.5, action_steps: 797.55, real_time: 80.55 },
    { label: "pi0.5 (real)", model_name: "pi0.5", track: "real-only", evaluation_stage: "final_real_robot", data_regime: "Real only", success_rate: 33.0, action_steps: 821.65, real_time: 82.35 },
    { label: "Motus (sim)", model_name: "Motus", track: "sim-only", evaluation_stage: "preliminary_simulation", data_regime: "Sim only", success_rate: 31.5, action_steps: 778.8, real_time: 133.76 },
    { label: "Motus (real)", model_name: "Motus", track: "real-only", evaluation_stage: "final_real_robot", data_regime: "Real only", success_rate: 27.5, action_steps: 721.35, real_time: 129.43 },
  ];

  const BENCHMARK_TABLES_RAW = [
    {
      title: "Click Bell to Table Rearrangement",
      tasks: ["Click Bell", "Items Hand-Over and Place", "Dual-Arm Water Pouring", "Table Rearrangement"],
      rows: [
        { model: "pi0 (sim)", values: [["8/20", 625.30, 63.78], ["5/20", 834.75, 83.60], ["6/20", 898.60, 89.95], ["7/20", 788.20, 79.07]] },
        { model: "pi0 (real)", values: [["5/20", 860.45, 86.05], ["5/20", 844.00, 86.10], ["4/20", 917.70, 92.69], ["8/20", 742.70, 74.27]] },
        { model: "pi0.5 (sim)", values: [["10/20", 647.55, 65.53], ["7/20", 791.25, 80.00], ["7/20", 877.45, 87.90], ["12/20", 612.90, 61.31]] },
        { model: "pi0.5 (real)", values: [["6/20", 791.20, 80.70], ["5/20", 832.90, 84.12], ["6/20", 872.15, 87.22], ["12/20", 628.80, 63.51]] },
        { model: "Motus (sim)", values: [["13/20", 463.30, 79.09], ["10/20", 584.70, 97.52], ["8/20", 667.30, 111.00], ["4/20", 864.25, 143.75]] },
        { model: "Motus (real)", values: [["14/20", 420.50, 70.11], ["12/20", 492.30, 83.65], ["6/20", 744.95, 125.97], ["3/20", 900.05, 153.78]] },
      ],
    },
    {
      title: "Basket Pick-and-Place to Item Assembly",
      tasks: ["Basket Pick-and-Place", "Drawer Open and Place", "Mixer Operating", "Item Assembly"],
      rows: [
        { model: "pi0 (sim)", values: [["5/20", 835.40, 83.56], ["6/20", 821.40, 82.23], ["3/20", 897.05, 90.09], ["0/20", 1000.00, 102.07]] },
        { model: "pi0 (real)", values: [["6/20", 796.70, 80.47], ["8/20", 757.70, 77.29], ["1/20", 967.55, 98.69], ["0/20", 1000.00, 99.86]] },
        { model: "pi0.5 (sim)", values: [["10/20", 663.25, 66.42], ["11/20", 664.40, 67.08], ["4/20", 864.50, 87.11], ["0/20", 1000.00, 104.29]] },
        { model: "pi0.5 (real)", values: [["9/20", 697.90, 71.88], ["12/20", 645.70, 65.22], ["3/20", 901.75, 90.18], ["0/20", 1000.00, 101.02]] },
        { model: "Motus (sim)", values: [["10/20", 827.95, 132.29], ["10/20", 593.15, 102.70], ["2/20", 936.25, 154.80], ["0/20", 1000.00, 166.22]] },
        { model: "Motus (real)", values: [["9/20", 608.55, 101.27], ["11/20", 546.60, 93.96], ["0/20", 1000.00, 166.41], ["0/20", 1000.00, 167.37]] },
      ],
    },
    {
      title: "Manipulate Pipette, Sample Loading, and Task Average",
      tasks: ["Manipulate Pipette", "Sample Loading", "Task Average"],
      rows: [
        { model: "pi0 (sim)", values: [["2/20", 960.65, 96.29], ["2/20", 946.85, 94.73], ["22.00%", 898.12, 90.56]] },
        { model: "pi0 (real)", values: [["0/20", 1000.00, 108.46], ["3/20", 920.35, 92.04], ["22.50%", 881.15, 90.20]] },
        { model: "pi0.5 (sim)", values: [["2/20", 953.15, 95.82], ["4/20", 900.05, 89.97], ["38.50%", 797.55, 80.55]] },
        { model: "pi0.5 (real)", values: [["4/20", 898.75, 91.67], ["3/20", 914.95, 93.32], ["33.00%", 821.65, 82.35]] },
        { model: "Motus (sim)", values: [["4/20", 905.35, 149.33], ["2/20", 945.70, 157.82], ["31.50%", 778.80, 133.76]] },
        { model: "Motus (real)", values: [["0/20", 1000.00, 164.84], ["0/20", 1000.00, 166.85], ["27.50%", 721.35, 129.43]] },
      ],
    },
  ];

  const TASK_TIERS = [
    {
      name: "Entry-level",
      tone: "mint",
      summary: "Short-horizon routines with clear affordances and low contact complexity.",
      tasks: ["Table rearrangement", "Click-bell", "Water pouring", "Handle basket"],
      image: "static/assets/task-vis-1.png",
    },
    {
      name: "Mid-level",
      tone: "powder",
      summary: "Sequential interactions that require moderate coordination and spatial reasoning.",
      tasks: ["Items hand-over", "Drawer open-and-place", "Mixer operating"],
      image: "static/assets/task-vis-2.png",
    },
    {
      name: "High-level",
      tone: "sand",
      summary: "Fine-grained multi-stage operations requiring precise end-effector control and adaptation.",
      tasks: ["Item assembly", "Manipulate pipette", "Sample loading"],
      image: "static/assets/task-vis-2.png",
    },
  ];

  const REAL_COLLECTION_CONDITIONS = [
    {
      background: "White",
      lighting: "Fixed lighting",
      additionals: "None",
      description: "Standard neutral setup for canonical demonstrations.",
    },
    {
      background: "White",
      lighting: "Enhanced lighting",
      additionals: "None",
      description: "Higher illumination to stress lighting invariance.",
    },
    {
      background: "White",
      lighting: "Fixed lighting",
      additionals: "2-3 distractors",
      description: "Extra objects added to test robustness to clutter.",
    },
    {
      background: "Blue",
      lighting: "Fixed lighting",
      additionals: "None",
      description: "Alternative background color for visual contrast shifts.",
    },
    {
      background: "Yellow",
      lighting: "Fixed lighting",
      additionals: "None",
      description: "Textured background to probe appearance generalization.",
    },
  ];

  const SIM_RANDOMIZATION = [
    {
      title: "Lighting and scene appearance",
      items: [
        "Light intensity, position, and color",
        "Background plate color variation",
        "Table color and texture probability",
      ],
    },
    {
      title: "Object geometry and pose",
      items: [
        "Initial object position offsets",
        "Initial object rotation range",
        "Object size scaling and surface material colors",
      ],
    },
    {
      title: "Camera calibration and viewpoint",
      items: [
        "Camera intrinsics on fx and fy",
        "Camera position XYZ offsets",
        "Camera roll, pitch, and yaw perturbations",
      ],
    },
    {
      title: "Robot initialization",
      items: [
        "Joint configuration randomization",
        "End-effector position variation",
        "Diverse feasible starting states for recovery behavior",
      ],
    },
    {
      title: "Workspace and distractors",
      items: [
        "Table height variation up to plus or minus 4 cm",
        "Distractor objects such as bowls, cups, and toys",
        "Mixed task-irrelevant items for scene complexity",
      ],
    },
  ];

  const EVALUATION_VARIATIONS = [
    "Three table textures: wood, blue fabric, yellow grid",
    "Three light positions with varying illumination colors",
    "Seen and unseen object instances within the same category",
    "Distractor objects at 2, 4, and 8 item difficulty levels",
    "Unseen positions on a predefined 3 x 3 grid",
  ];

  const BASELINE_SEEDS = BENCHMARK_SUMMARY.map((item) => ({
    model_name: item.model_name,
    username_display: "Official Baseline",
    affiliation: "RoboSynChallenge",
    track: item.track,
    data_regime: item.data_regime,
    success_rate: item.success_rate,
    action_steps: item.action_steps,
    real_time: item.real_time,
    notes: `${item.label} from the official 10-task benchmark snapshot.`,
  }));

  const BASELINE_RESULT_SEEDS = Array.isArray(window.ROBO_SYN_BASELINE_RESULTS)
    ? window.ROBO_SYN_BASELINE_RESULTS
    : [];
  const BASELINE_RESULT_BY_ID = new Map(BASELINE_RESULT_SEEDS.map((result) => [result.id, result]));
  const BASELINE_RESULT_BY_BASELINE_ID = new Map(
    BASELINE_RESULT_SEEDS.map((result) => [result.baseline_id, result])
  );
  const BASELINE_RESULT_BY_MODEL_TRACK = new Map(
    BASELINE_RESULT_SEEDS.map((result) => [`${result.model_name}|${result.track}`, result])
  );

  const BASELINE_EPISODES = [
    { title: "Episode 01", task_name: "Click-bell", notes: "Entry-level closed-loop evaluation" },
    { title: "Episode 02", task_name: "Drawer open-and-place", notes: "Mid-level coordination evaluation" },
    { title: "Episode 03", task_name: "Sample loading", notes: "High-level fine manipulation evaluation" },
  ];

  const appEl = document.getElementById("app");
  const flashZone = document.getElementById("flash-zone");
  const navEl = document.getElementById("site-nav");
  const headerActionsEl = document.getElementById("header-actions");
  const navToggle = document.querySelector("[data-nav-toggle]");
  const navMenu = document.querySelector("[data-nav-menu]");

  let state = loadState();
  let flashes = [];
  let viewerCleanup = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function uid(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
  }

  function routeHref(route) {
    return `#/${String(route || "home").replace(/^\/+/, "")}`;
  }

  function currentRoute() {
    const cleaned = window.location.hash.replace(/^#\/?/, "").replace(/^\/+/, "");
    return cleaned || "home";
  }

  function navigate(route) {
    window.location.hash = routeHref(route);
  }

  function pushFlash(category, message) {
    flashes.push({ category, message });
    renderFlashes(false);
  }

  function renderFlashes(consume = true) {
    if (!flashZone) return;
    flashZone.innerHTML = flashes
      .map((item) => `<div class="flash flash-${escapeHtml(item.category)}">${escapeHtml(item.message)}</div>`)
      .join("");
    if (consume) flashes = [];
  }

  function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return escapeHtml(value);
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function formatDateInput(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function formatSeconds(value) {
    const seconds = Number(value || 0);
    return `${seconds.toFixed(1)}s`;
  }

  function formatPercent(value) {
    return `${Number(value || 0).toFixed(1)}%`;
  }

  function formatSteps(value) {
    return `${Math.round(Number(value || 0))}`;
  }

  function srValue(value) {
    const text = String(value || "");
    if (text.endsWith("%")) return Number(text.slice(0, -1));
    if (text.includes("/")) return Number(text.split("/", 1)[0]);
    return Number(text || 0);
  }

  function prepareBenchmarkTables(rawTables) {
    return rawTables.map((block) => {
      const taskBests = block.tasks.map((_, taskIndex) => {
        const srValues = block.rows.map((row) => srValue(row.values[taskIndex][0]));
        const stepValues = block.rows.map((row) => Number(row.values[taskIndex][1]));
        const timeValues = block.rows.map((row) => Number(row.values[taskIndex][2]));
        return {
          sr: Math.max(...srValues),
          steps: Math.min(...stepValues),
          time: Math.min(...timeValues),
        };
      });

      return {
        title: block.title,
        tasks: [...block.tasks],
        rows: block.rows.map((row) => ({
          model: row.model,
          metrics: row.values.map(([sr, steps, time], taskIndex) => ({
            sr,
            steps: Number(steps),
            time: Number(time),
            best_sr: srValue(sr) === taskBests[taskIndex].sr,
            best_steps: Number(steps) === taskBests[taskIndex].steps,
            best_time: Number(time) === taskBests[taskIndex].time,
          })),
        })),
      };
    });
  }

  const BENCHMARK_TABLES = prepareBenchmarkTables(BENCHMARK_TABLES_RAW);

  function humanStatus(value) {
    return STATUS_LABELS[value] || value || "Unknown";
  }


  function structuredEpisodeDetails(episode) {
    const notes = String(episode?.notes || "");
    const match = notes.match(/^Task:\s*(.*?)\.\s*Setup:\s*(.*?)\.\s*Outcome:\s*(.*?)\.?$/i);
    const structured = Boolean(match);
    const outcome =
      episode?.outcome ||
      (episode?.success === true ? "Success" : episode?.success === false ? "Fail" : (match ? match[3] : "Not specified"));
    return {
      task: episode?.task_name || (match ? match[1] : "Not specified"),
      setup: episode?.setup || (match ? match[2] : "Not specified"),
      outcome,
      notes: structured ? "" : notes,
    };
  }

  function stageFromTrack(value) {
    const text = String(value || "").toLowerCase();
    if (text.includes("real")) return "final_real_robot";
    if (text.includes("sim")) return "preliminary_simulation";
    return "";
  }

  function stageLabel(value) {
    return EVALUATION_STAGE_LABELS[value] || value || "Pending assignment";
  }

  function isHttpUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }

  function isHuggingFaceUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.hostname === "huggingface.co";
    } catch {
      return false;
    }
  }

  function externalLink(value, fallback = "Not provided") {
    if (!value) return escapeHtml(fallback);
    const safeValue = escapeHtml(value);
    return `<a href="${safeValue}" target="_blank" rel="noreferrer">${safeValue}</a>`;
  }

  function renderEvaluationVideoWall() {
    const rows = [
      EVALUATION_VIDEO_ASSETS.slice(0, 4),
      EVALUATION_VIDEO_ASSETS.slice(4, 7),
      EVALUATION_VIDEO_ASSETS.slice(7),
    ];
    return `
      <div class="evaluation-video-wall" aria-label="Simulation evaluation task videos">
        ${rows.map((row) => `
          <div class="evaluation-video-row evaluation-video-row-${row.length}">
            ${row.map((video) => `
              <video muted loop autoplay playsinline preload="metadata" aria-label="${escapeHtml(video.label)}">
                <source src="static/assets/evaluation-videos/${escapeHtml(video.file)}" type="video/mp4">
              </video>
            `).join("")}
          </div>
        `).join("")}
      </div>
    `;
  }

  function rankingLabel(isRanked) {
    return isRanked ? RANKING_LABELS.ranked : RANKING_LABELS.test;
  }

  function isAdmin(user) {
    return Boolean(user && user.role === "admin");
  }

  function currentUser() {
    return state.users.find((user) => user.id === state.session.userId) || null;
  }

  function getUserById(userId) {
    return state.users.find((user) => user.id === userId) || null;
  }

  function getSubmissionById(submissionId) {
    return state.submissions.find((submission) => submission.id === submissionId) || null;
  }

  function getEvaluationById(evaluationId) {
    return (
      state.evaluations.find((evaluation) => evaluation.id === evaluationId) ||
      BASELINE_RESULT_BY_ID.get(evaluationId) ||
      null
    );
  }

  function loadState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return freshState();
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 3) return freshState();
      return parsed;
    } catch {
      return freshState();
    }
  }

  function saveState() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function freshState() {
    const createdAt = nowIso();
    const adminUser = {
      id: "user-admin",
      username: "robosyn-admin",
      email: "admin@robosynchallenge.local",
      affiliation: "RoboSynChallenge",
      bio: "Organizer administrator account.",
      role: "admin",
      token: "RSC-ADMIN-2026",
      createdAt,
      access_token_hint: "RSC-ADM****",
    };

    const seededUser = {
      id: "user-seeded",
      username: "team-alpha",
      email: "team-alpha@robosynchallenge.local",
      affiliation: "EDEM AI Lab",
      bio: "",
      role: "participant",
      token: "RSC-TEAM-ALPHA",
      createdAt,
      access_token_hint: "RSC-TEA****",
    };

    return {
      version: 3,
      session: { userId: null },
      latestToken: {
        action: "issued",
        username: seededUser.username,
        email: seededUser.email,
        token: seededUser.token,
      },
      accessRequests: [],
      users: [adminUser, seededUser],
      submissions: [],
      evaluations: [],
      baselines: BASELINE_SEEDS.map((baseline, index) => ({
        id: `baseline-${index + 1}`,
        ...baseline,
      })),
    };
  }

  function loginUser(userId) {
    state.session.userId = userId;
    saveState();
    render();
  }

  function logoutUser() {
    state.session.userId = null;
    saveState();
    pushFlash("success", "Signed out.");
    navigate("home");
  }

  function userSubmissions(userId) {
    return state.submissions
      .filter((submission) => submission.owner_id === userId)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }

  function getLeaderboardRows() {
    const rows = [];

    state.baselines.forEach((baseline) => {
      const baselineResult =
        BASELINE_RESULT_BY_BASELINE_ID.get(baseline.id) ||
        BASELINE_RESULT_BY_MODEL_TRACK.get(`${baseline.model_name}|${baseline.track}`);
      const stageValue = baseline.evaluation_stage || stageFromTrack(baseline.track);
      rows.push({
        kind: "baseline",
        id: baseline.id,
        model_name: baseline.model_name,
        username_display: baseline.username_display,
        affiliation: baseline.affiliation,
        stage_label: stageLabel(stageValue),
        data_regime: baseline.data_regime,
        success_rate: baseline.success_rate,
        action_steps: baseline.action_steps,
        real_time: baseline.real_time,
        rank_badge: "Official baseline",
        evaluation_id: baselineResult ? baselineResult.id : "",
        notes: baseline.notes,
      });
    });

    state.evaluations
      .filter((evaluation) => evaluation.published)
      .forEach((evaluation) => {
        const submission = getSubmissionById(evaluation.submission_id);
        if (!submission || !submission.is_ranked) return;
        const user = getUserById(submission.owner_id);
        const stageValue = evaluation.evaluation_stage || submission.evaluation_stage;
        rows.push({
          kind: "submission",
          id: submission.id,
          model_name: submission.display_name,
          username_display: user ? user.username : "Participant",
          affiliation: user ? user.affiliation : "",
          stage_label: stageLabel(stageValue),
          data_regime: submission.data_source_text,
          success_rate: evaluation.success_rate,
          action_steps: evaluation.action_steps,
          real_time: evaluation.real_time,
          rank_badge: "Participant ranked",
          evaluation_id: evaluation.id,
          notes: evaluation.leaderboard_notes || evaluation.notes || submission.short_description,
        });
      });

    rows.sort((left, right) => {
      const successDiff = Number(right.success_rate || 0) - Number(left.success_rate || 0);
      if (successDiff !== 0) return successDiff;
      const actionDiff = Number(left.action_steps || 0) - Number(right.action_steps || 0);
      if (actionDiff !== 0) return actionDiff;
      const timeDiff = Number(left.real_time || 0) - Number(right.real_time || 0);
      if (timeDiff !== 0) return timeDiff;
      return left.model_name.localeCompare(right.model_name);
    });

    return rows;
  }

  function renderHeader() {
    const route = currentRoute();
    const user = currentUser();

    const links = [
      ["home", "Home"],
      ["data", "Data"],
      ["evaluation", "Evaluation"],
      ["leaderboard", "Leaderboard"],
    ];

    if (user) {
      links.push(["dashboard", "My Submissions"]);
      if (isAdmin(user)) links.push(["admin", "Admin"]);
    }

    navEl.innerHTML = links
      .map(([path, label]) => {
        const active = route === path || route.startsWith(`${path}/`);
        return `<a href="${routeHref(path)}" class="${active ? "active" : ""}">${escapeHtml(label)}</a>`;
      })
      .join("");

    if (user) {
      headerActionsEl.innerHTML = `
        <div class="user-badge">
          <span>${escapeHtml(user.username)}</span>
          <small>${escapeHtml(user.role)}</small>
        </div>
        <button type="button" class="button button-secondary" data-action="logout">Sign out</button>
      `;
    } else {
      headerActionsEl.innerHTML = `
        <a href="${routeHref("login")}" class="button button-secondary">Sign in</a>
        <a href="${routeHref("register")}" class="button button-primary">Request access</a>
      `;
    }
  }

  function renderSection(html, title) {
    if (viewerCleanup) {
      viewerCleanup();
      viewerCleanup = null;
    }

    if (title) document.title = `${title} | RoboSynChallenge`;
    appEl.innerHTML = `<div class="page-shell">${html}</div>`;
    renderHeader();
    renderFlashes(true);
    initEvalHelpers();
    initResultViewer();
  }

  function renderAuthGate(title, lead, primary, secondary) {
    return `
      <section class="section section-alt">
        <div class="shell auth-grid">
          <article class="auth-card">
            <span class="tag">Sign in required</span>
            <h2>${escapeHtml(title)}</h2>
            <p>${escapeHtml(lead)}</p>
            <div class="cta-row">
              <a href="${routeHref(primary.route)}" class="button button-primary">${escapeHtml(primary.label)}</a>
              <a href="${routeHref(secondary.route)}" class="button button-secondary">${escapeHtml(secondary.label)}</a>
            </div>
          </article>
          <article class="card">
            <span class="tag">Account access</span>
            <div class="task-list">
              <span>After signing in you can submit evaluation artifacts and track requests.</span>
              <span>Public leaderboard entries and published result viewers remain visible without sign-in.</span>
            </div>
          </article>
        </div>
      </section>
    `;
  }

  function renderHome() {
    return `
      <section class="hero home-hero">
        <div class="shell home-hero-grid">
          <div class="hero-copy">
            <h1>RoboSynChallenge:</h1>
            <h2>Mastering Real-World Dexterity via Generalizing Synthesized Manipulation Skills.</h2>
            <p class="lead">
              General-purpose robot manipulation needs policies that can learn from broad experience and
              remain reliable in unfamiliar real-world scenes. Yet real robot data is scarce, costly, and
              hardware-specific, while simulation scales but often breaks across the Sim2Real gap.
              RoboSynChallenge turns this bottleneck into a benchmark: teams train with scalable synthetic
              data plus limited real demonstrations, qualify in simulation, and prove generalization on a
              standardized real-robot platform.
            </p>
            <div class="hero-thesis" aria-label="Challenge motivation">
              <span><strong>Scarce real data</strong> limits scalable robot learning</span>
              <span><strong>Synthetic trials</strong> expand training diversity</span>
              <span><strong>Real-robot evaluation</strong> measures true transfer</span>
            </div>
            <div class="cta-row">
              <a href="${routeHref("register")}" class="button button-primary">Register your team</a>
              <a href="${SIMULATION_REPO_URL}" target="_blank" rel="noreferrer" class="button button-secondary">GitHub codebase ↗</a>
              <a href="${TUTORIAL_URL}" target="_blank" rel="noreferrer" class="button button-ghost">Read tutorial ↗</a>
              <a href="${REPORT_URL}" target="_blank" rel="noreferrer" class="button button-ghost">Read report ↗</a>
            </div>
            <p class="hero-note">Registration opens July 13 · Updates close November 15 · Final evaluation starts November 15</p>
          </div>
          <figure class="home-hero-figure">
            <img src="static/assets/robosynchallenge-pipeline.png" alt="RoboSynChallenge pipeline from synthetic data generation to real-world evaluation">
            <figcaption>
              <strong>The RoboSynChallenge pipeline</strong>
              <span>Filter manipulation trials, synthesize diverse training data, co-train with synthetic and real demonstrations, then deploy and evaluate policies on the standardized dual-arm platform.</span>
            </figcaption>
          </figure>
        </div>
      </section>

      <section class="stat-ribbon">
        <div class="shell stat-grid">
          ${HOME_STATS.map((stat) => `
            <article class="stat-card">
              <strong>${escapeHtml(stat.value)}</strong>
              <span>${escapeHtml(stat.label)}</span>
            </article>
          `).join("")}
        </div>
      </section>

      <section class="section shell home-section">
        <div class="section-heading compact-heading">
          <span class="eyebrow">How it works</span>
          <h2>One competition, two stages.</h2>
          <p>Every team follows the same route from scalable simulation testing to a controlled physical final.</p>
        </div>
        <div class="stage-grid">
          <article class="stage-card">
            <span class="stage-number">01</span>
            <div>
              <span class="tag">Preliminary evaluation</span>
              <h3>Train, then qualify in simulation</h3>
              <p>Train from July 13 to October 11. Simulation evaluation runs October 11–18, with finalists announced on October 18.</p>
            </div>
          </article>
          <div class="stage-arrow" aria-hidden="true">→</div>
          <article class="stage-card stage-card-final">
            <span class="stage-number">02</span>
            <div>
              <span class="tag">Final evaluation</span>
              <h3>Update, then prove it on robots</h3>
              <p>Finalists update models until November 15. Final evaluation then starts on the unified dual-arm robot platform.</p>
            </div>
          </article>
        </div>
      </section>

      <section class="section section-alt home-section" id="timeline">
        <div class="shell">
          <div class="section-heading compact-heading">
            <span class="eyebrow">Competition timeline</span>
            <h2>Key dates for 2026.</h2>
          </div>
          <ol class="competition-timeline">
            <li><time>July 13</time><div><h3>Registration</h3><p>Teams receive the codebase, tutorial, released data, and baselines.</p></div></li>
            <li><time>July 13 – October 11</time><div><h3>Training period</h3><p>Train and improve models with official synthetic and limited real data.</p></div></li>
            <li><time>October 11 – 18</time><div><h3>Preliminary evaluation & finalists</h3><p>Models are evaluated in simulation; finalists are announced on October 18.</p></div></li>
            <li><time>October 18 – November 15</time><div><h3>Model update period</h3><p>Finalists continue updating models before the final submission deadline.</p></div></li>
            <li><time>Starts November 15</time><div><h3>Final evaluation</h3><p>Final submissions are evaluated on the unified real dual-arm robot platform.</p></div></li>
            <li><time>Early December</time><div><h3>Awards and showcase</h3><p>Winning teams are invited to present and receive awards at NeurIPS 2026.</p></div></li>
          </ol>
        </div>
      </section>

      <section class="section shell home-section">
        <div class="section-heading compact-heading">
          <span class="eyebrow">Official benchmark</span>
          <h2>Ten tasks, one test of robust manipulation.</h2>
        </div>
        <div class="compact-task-grid">
          ${TASK_TIERS.map((tier) => `
            <article class="compact-task-group tone-${escapeHtml(tier.tone)}">
              <span class="tag">${escapeHtml(tier.name)}</span>
              <div class="compact-task-list">${tier.tasks.map((task) => `<span>${escapeHtml(task)}</span>`).join("")}</div>
            </article>
          `).join("")}
        </div>
        <div class="metric-strip">
          <span><strong>Success rate</strong> task completion</span>
          <span><strong>Action steps</strong> execution efficiency</span>
          <span><strong>Inference time</strong> policy runtime</span>
        </div>
      </section>
    `;
  }

  function renderBenchmarkPage() {
    return `
      <section class="page-hero shell">
        <span class="eyebrow">Benchmark snapshot</span>
        <h1>Official baseline results across the 10 held-out RoboSynChallenge tasks.</h1>
        <p class="lead narrow">
          The tables below reproduce the released baseline benchmark sheet for pi0, pi0.5, and Motus
          under sim-only and real-only training regimes. SR is reported as successes out of 20 episodes,
          and Task Average is the macro-average summary over the full task set.
        </p>
      </section>

      <section class="section shell">
        <div class="panel-stack">
          ${BENCHMARK_TABLES.map((block, blockIndex) => `
            <article class="card">
              <div class="section-heading left">
                <span class="eyebrow">Benchmark block ${blockIndex + 1}</span>
                <h2>${escapeHtml(block.title)}</h2>
              </div>
              <p class="field-note">Bold values mark the best SR, lowest action steps, and lowest inference time within each task column.</p>
              <div class="table-shell">
                <table class="leaderboard-table">
                  <thead>
                    <tr>
                      <th rowspan="2">Model</th>
                      ${block.tasks.map((task) => `<th colspan="3">${escapeHtml(task)}</th>`).join("")}
                    </tr>
                    <tr>
                      ${block.tasks.map(() => "<th>SR</th><th>Steps</th><th>Inference</th>").join("")}
                    </tr>
                  </thead>
                  <tbody>
                    ${block.rows.map((row) => `
                      <tr>
                        <th scope="row">${escapeHtml(row.model)}</th>
                        ${row.metrics.map((metric) => `
                          <td>${metric.best_sr ? `<strong>${escapeHtml(metric.sr)}</strong>` : escapeHtml(metric.sr)}</td>
                          <td>${metric.best_steps ? `<strong>${metric.steps.toFixed(2)}</strong>` : metric.steps.toFixed(2)}</td>
                          <td>${metric.best_time ? `<strong>${metric.time.toFixed(2)}</strong>` : metric.time.toFixed(2)}</td>
                        `).join("")}
                      </tr>
                    `).join("")}
                  </tbody>
                </table>
              </div>
            </article>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderDataPage() {
    return `
      <section class="page-hero shell data-hero">
        <span class="eyebrow">Competition data</span>
        <h1>Train with scale. Ground in reality.</h1>
        <p class="lead data-lead">
          RoboSynChallenge pairs procedurally generated manipulation trials with a small, structured
          real-world dataset to support data-efficient Sim2Real learning.
        </p>
        <div class="cta-row">
          <a href="${DATA_COLLECTION_TUTORIAL_URL}" target="_blank" rel="noreferrer" class="button button-primary">Open generation toolkit ↗</a>
          <a href="${DATASET_URL}" target="_blank" rel="noreferrer" class="button button-secondary">${DATASET_LABEL} ↗</a>
          <a href="${TUTORIAL_URL}" target="_blank" rel="noreferrer" class="button button-ghost">Read tutorial ↗</a>
        </div>
      </section>

      <section class="section shell data-section">
        <div class="data-columns">
          <article class="data-panel data-panel-real">
            <header class="data-panel-header">
              <div><span class="tag">Real-world data</span><h2>Carefully collected demonstrations</h2></div>
              <strong class="data-count">60<small>trials / task</small></strong>
            </header>
            <p>Teleoperated dual-arm trajectories provide physical grounding across controlled changes in appearance, lighting, clutter, position, and orientation.</p>
            <img src="static/assets/realworld-env.png" alt="RoboSynChallenge real-world dual-arm collection platform">
            <div class="data-facts">
              <span><strong>5</strong> collection conditions</span>
              <span><strong>4</strong> position variations</span>
              <span><strong>3</strong> orientation settings</span>
            </div>
            <div class="condition-list">
              ${REAL_COLLECTION_CONDITIONS.map((condition) => `
                <div><strong>${escapeHtml(condition.background)} background</strong><span>${escapeHtml(condition.lighting)} · ${escapeHtml(condition.additionals)}</span></div>
              `).join("")}
            </div>
          </article>

          <article class="data-panel data-panel-sim">
            <header class="data-panel-header">
              <div><span class="tag">Simulated data</span><h2>Scale through procedural generation</h2></div>
              <strong class="data-count">1,000<small>trials / task</small></strong>
            </header>
            <p>Multimodal trajectories combine RGB-D observations, robot state, actions, contact events, task annotations, and outcomes under broad domain randomization.</p>
            <img src="static/assets/robosynchallenge-pipeline.png" alt="RoboSynChallenge synthetic data generation pipeline">
            <div class="randomization-list">
              ${SIM_RANDOMIZATION.map((block) => `
                <div><strong>${escapeHtml(block.title)}</strong><span>${block.items.map(escapeHtml).join(" · ")}</span></div>
              `).join("")}
            </div>
          </article>
        </div>
      </section>
    `;
  }

  function renderLoginPage() {
    return `
      <section class="section shell auth-grid single">
        <article class="auth-card">
          <span class="eyebrow">Token access</span>
          <h1>Sign in</h1>
          <p class="construction-note">Under construction</p>
          <form class="panel-stack compact" data-form="login">
            <label class="field">
              <span>Email</span>
              <input type="email" name="email" placeholder="user@example.org" required>
            </label>
            <label class="field">
              <span>Access token</span>
              <input type="text" name="token" placeholder="Paste the token issued by the administrator" required>
            </label>
            <button type="submit" class="button button-primary">Sign in</button>
          </form>
          <p class="auth-footnote">
            Need an account token?
            <a href="${routeHref("register")}">Request access here</a>
          </p>
        </article>
      </section>
    `;
  }

  function renderRegisterPage() {
    return `
      <section class="section shell auth-grid single">
        <article class="auth-card wide">
          <span class="eyebrow">Participant access</span>
          <h1>Request an account token</h1>
          <p class="lead">
            RoboSynChallenge uses a token-based access model. Participants receive an email-and-token pair
            from the organizers, then use that token to sign in and manage policy evaluation
            submissions.
          </p>
          <div class="task-list">
            <span><strong>Recommended email subject:</strong> RoboSynChallenge participant access request</span>
            <span><strong>Suggested details:</strong> full name, affiliation, email, team name, and intended use</span>
            <span><strong>Organizer action:</strong> an admin creates the account and issues an access token</span>
          </div>
          <p class="registration-email">
            <strong>Registration email</strong>
            <a href="mailto:robosynchallenge@gmail.com">robosynchallenge@gmail.com</a>
          </p>
          <div class="cta-row">
            <a href="mailto:robosynchallenge@gmail.com?subject=RoboSynChallenge%20participant%20access%20request" class="button button-primary">Open email draft</a>
            <a href="${routeHref("login")}" class="button button-secondary">I already have a token</a>
          </div>
        </article>
      </section>
    `;
  }

  function renderEvaluationPage() {
    const user = currentUser();
    const submitAction = user
      ? `<button type="button" class="button button-primary" data-action="focus-policy-submit">Submit Policy</button>`
      : `<a href="${routeHref("login")}" class="button button-primary">Submit Policy</a>`;
    const submissionForm = user ? `
      <section class="section shell" data-policy-submit>
        <form class="panel-stack" data-form="evaluation">
          <article class="card">
            <div class="section-heading left">
              <span class="eyebrow">Policy submission</span>
              <h2>Required fields</h2>
            </div>
            <div class="form-grid">
              <label class="field">
                <span>Artifact name</span>
                <input type="text" name="artifact_name" placeholder="Policy artifact name" required>
              </label>
              <label class="field">
                <span>Experiment name</span>
                <input type="text" name="title" placeholder="Experiment name" required>
              </label>
              <label class="field field-span-2">
                <span>Short description</span>
                <textarea name="short_description" rows="4" placeholder="Short description" required></textarea>
              </label>
              <label class="field field-span-2">
                <span>Code URL</span>
                <input type="url" name="code_link" placeholder="https://github.com/your-org/your-policy" required>
              </label>
              <label class="field field-span-2">
                <span>Hugging Face checkpoint URL</span>
                <input type="url" name="checkpoint_link" placeholder="https://huggingface.co/your-org/your-policy-ckpt" required>
              </label>
              <label class="field field-span-2">
                <span>Data source</span>
                <textarea name="data_source_text" rows="4" placeholder="Data source" required></textarea>
              </label>
              <label class="field field-span-2">
                <span>Run and dependency notes</span>
                <textarea name="technical_notes" rows="5" placeholder="Run notes" required></textarea>
              </label>
              <label class="choice-inline">
                <input type="checkbox" name="is_ranked" checked>
                <span>Count this run on the public leaderboard once published</span>
              </label>
            </div>
          </article>

          <div class="section-actions">
            <button type="submit" class="button button-primary">Submit Policy</button>
          </div>
        </form>
      </section>
    ` : "";

    return `
      <section class="page-hero shell data-hero">
        <span class="eyebrow">Evaluation</span>
        <h1>Sim first. Robot final.</h1>
        <p class="lead data-lead">
          RoboSynChallenge evaluation includes one simulation-only preliminary round and one real-robot
          final round. Published results report success rate, action steps, and inference time.
        </p>
        <div class="cta-row">
          ${submitAction}
          <a href="${POLICY_TUTORIAL_URL}" target="_blank" rel="noreferrer" class="button button-secondary">Policy tutorial ↗</a>
          <a href="${routeHref("leaderboard")}" class="button button-ghost">View leaderboard</a>
        </div>
      </section>

      <section class="section shell data-section">
        <div class="data-columns">
          <article class="data-panel data-panel-sim evaluation-panel evaluation-panel-sim">
            <header class="data-panel-header">
              <div><span class="tag">Preliminary round</span><h2>Simulation-only evaluation</h2></div>
              <strong class="data-count">01<small>stage</small></strong>
            </header>
            <p>Policies are evaluated in RoboSynChallenge simulation before finalists are selected.</p>
            ${renderEvaluationVideoWall()}
            <div class="randomization-list">
              <div><strong>Simulation only.</strong><span>No physical robot is used in the preliminary round.</span></div>
              <div><strong>Same metrics.</strong><span>Success rate, action steps, and inference time are reported.</span></div>
              <div><strong>Finalists advance.</strong><span>Top teams move to the real-robot final round.</span></div>
            </div>
          </article>

          <article class="data-panel data-panel-real evaluation-panel evaluation-panel-real">
            <header class="data-panel-header">
              <div><span class="tag">Final round</span><h2>Real-robot evaluation</h2></div>
              <strong class="data-count">02<small>stage</small></strong>
            </header>
            <p>Finalist policies are run by organizers on the standardized RoboSynChallenge real-robot setup.</p>
            <img src="static/assets/realworld-env.png" alt="RoboSynChallenge real-robot evaluation platform">
            <div class="randomization-list">
              <div><strong>Robot only.</strong><span>The final round runs on the real RoboSynChallenge platform.</span></div>
              <div><strong>Same metrics.</strong><span>Success rate, action steps, and inference time are reported.</span></div>
              <div><strong>Final ranking.</strong><span>Published results determine the final leaderboard.</span></div>
            </div>
          </article>
        </div>
      </section>

      ${submissionForm}
    `;
  }

  function renderDashboardPage() {
    const user = currentUser();
    if (!user) {
      return renderAuthGate(
        "Sign in to view your submissions",
        "Submission history is tied to your participant account.",
        { route: "login", label: "Sign in" },
        { route: "register", label: "Request access" }
      );
    }

    const submissions = userSubmissions(user.id);
    return `
      <section class="page-hero shell">
        <span class="eyebrow">My submissions</span>
        <h1>Monitor your artifact submissions, schedules, and published results.</h1>
        <p class="lead narrow">
          Each record stores the submitted code URL, Hugging Face checkpoint, data source, organizer
          schedule, evaluation stage, and any published metrics.
        </p>
      </section>

      <section class="section shell">
        <div class="split-grid">
          <article class="card card-soft">
            <span class="tag">Profile</span>
            <h2>${escapeHtml(user.username)}</h2>
            <p>${escapeHtml(user.affiliation || "Affiliation not provided.")}</p>
            <p>${escapeHtml(user.bio || "No biography added yet.")}</p>
          </article>
          <article class="card card-soft">
            <span class="tag">Quick actions</span>
            <div class="cta-row">
              <a href="${routeHref("evaluation")}" class="button button-primary">New submission</a>
              <a href="${routeHref("leaderboard")}" class="button button-secondary">Public leaderboard</a>
            </div>
          </article>
        </div>
      </section>

      <section class="section shell">
        <div class="section-heading">
          <span class="eyebrow">Submissions</span>
          <h2>${submissions.length} record${submissions.length === 1 ? "" : "s"}</h2>
        </div>
        <div class="table-shell">
          <table class="leaderboard-table">
            <thead>
              <tr>
                <th>Artifact</th>
                <th>Experiment</th>
                <th>Evaluation stage</th>
                <th>Run type</th>
                <th>Status</th>
                <th>Schedule</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              ${submissions.length
                ? submissions.map((submission) => `
                  <tr>
                    <td>
                      <div class="table-primary">
                        <a href="${routeHref(`submission/${submission.id}`)}">${escapeHtml(submission.display_name)}</a>
                        <span>${submission.code_link && submission.checkpoint_link ? "Code and checkpoint attached" : "Artifact links incomplete"}</span>
                      </div>
                    </td>
                    <td>
                      <div class="table-primary">
                        <a href="${routeHref(`submission/${submission.id}`)}">${escapeHtml(submission.title)}</a>
                        <span>${escapeHtml(submission.short_description.length > 88 ? `${submission.short_description.slice(0, 88)}...` : submission.short_description)}</span>
                      </div>
                    </td>
                    <td>${escapeHtml(stageLabel(submission.evaluation_stage))}</td>
                    <td>${escapeHtml(submission.ranking_label)}</td>
                    <td><span class="status-pill status-${escapeHtml(submission.status)}">${escapeHtml(humanStatus(submission.status))}</span></td>
                    <td>${escapeHtml(formatDateTime(submission.evaluation_schedule_at))}</td>
                    <td>${escapeHtml(formatDateTime(submission.created_at))}</td>
                  </tr>
                `).join("")
                : `<tr><td colspan="7">No submissions yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderSubmissionDetailPage(submissionId) {
    const user = currentUser();
    const submission = getSubmissionById(submissionId);
    if (!submission) {
      return renderNotFoundPage("Submission not found", "The requested submission does not exist.");
    }
    if (!user) {
      return renderAuthGate(
        "Sign in to inspect submission details",
        "Submission detail pages require a participant session.",
        { route: "login", label: "Sign in" },
        { route: "register", label: "Request access" }
      );
    }
    if (!isAdmin(user) && submission.owner_id !== user.id) {
      return renderNotFoundPage("Access restricted", "This submission belongs to another participant.");
    }

    const evaluation = getEvaluationById(submission.evaluation_id);
    const episodes = evaluation ? evaluation.episodes || [] : [];
    const stageValue = evaluation?.evaluation_stage || submission.evaluation_stage;

    return `
      <section class="page-hero shell">
        <span class="eyebrow">Submission detail</span>
        <h1>${escapeHtml(submission.display_name)}</h1>
        <p class="lead narrow">${escapeHtml(submission.short_description)}</p>
        <div class="cta-row">
          ${submission.evaluation_published ? `<a href="${routeHref(`results/${submission.evaluation_id}`)}" class="button button-primary">View published result</a>` : ""}
          ${isAdmin(user) ? `<a href="${routeHref(`admin/submission/${submission.id}`)}" class="button button-secondary">Open admin view</a>` : ""}
        </div>
      </section>

      <section class="section shell">
        <div class="split-grid">
          <article class="card">
            <span class="tag">Status</span>
            <h2>${escapeHtml(humanStatus(submission.status))}</h2>
            <div class="detail-list">
              <span><strong>Owner:</strong> ${escapeHtml(getUserById(submission.owner_id)?.username || "Unknown")}</span>
              <span><strong>Experiment:</strong> ${escapeHtml(submission.title)}</span>
              <span><strong>Evaluation stage:</strong> ${escapeHtml(stageLabel(stageValue))}</span>
              <span><strong>Run type:</strong> ${escapeHtml(submission.ranking_label)}</span>
              <span><strong>Schedule:</strong> ${escapeHtml(formatDateTime(submission.evaluation_schedule_at))}</span>
              <span><strong>Published:</strong> ${submission.evaluation_published ? "Yes" : "No"}</span>
            </div>
          </article>
          <article class="card">
            <span class="tag">Artifact links</span>
            <div class="detail-list">
              <span><strong>Code:</strong> ${externalLink(submission.code_link)}</span>
              <span><strong>Hugging Face checkpoint:</strong> ${externalLink(submission.checkpoint_link)}</span>
            </div>
          </article>
        </div>
      </section>

      <section class="section shell">
        <div class="split-grid">
          <article class="card">
            <h3>Data source</h3>
            <p>${escapeHtml(submission.data_source_text || "Not provided")}</p>
          </article>
          <article class="card">
            <h3>Run and dependency notes</h3>
            <p>${escapeHtml(submission.technical_notes || "Not provided")}</p>
          </article>
        </div>
      </section>

      <section class="section shell">
        <article class="card card-soft">
          <span class="tag">Policy integration contract</span>
          <div class="task-list">
            <span>Code should expose the RoboSynChallenge policy adapter entrypoints.</span>
            <span>Expected runnable files include <code>eval.sh</code>, <code>deploy_policy.yml</code>, and <code>deploy_policy.py</code>.</span>
            <span>Organizer evaluation uses the submitted artifact and Hugging Face checkpoint link.</span>
          </div>
        </article>
      </section>

      ${episodes.length ? `
        <section class="section shell">
          <div class="section-heading">
            <span class="eyebrow">Episodes</span>
            <h2>Uploaded evaluation footage</h2>
          </div>
          <div class="table-shell">
            <table class="leaderboard-table">
              <thead>
                <tr>
                  <th>Episode</th>
                  <th>Task</th>
                  <th>Duration</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                ${episodes.map((episode) => `
                  <tr>
                    <td>${episode.episode_index}</td>
                    <td>${escapeHtml(episode.task_name)}</td>
                    <td>${escapeHtml(formatSeconds(episode.duration_seconds))}</td>
                    <td>${escapeHtml(episode.notes || "-")}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </section>
      ` : ""}
    `;
  }

  function renderLeaderboardPage() {
    const rows = getLeaderboardRows();
    return `
      <section class="page-hero shell leaderboard-hero">
        <span class="eyebrow">Leaderboard</span>
        <h1>Official results.</h1>
        <p class="lead narrow">Ranked by success rate, with fewer action steps and lower inference time used as tie-breakers.</p>
      </section>

      <section class="section shell leaderboard-section">
        <div class="leaderboard-summary">
          <span><strong>1</strong> Success rate</span>
          <span><strong>2</strong> Action steps</span>
          <span><strong>3</strong> Inference time</span>
          <small>${rows.length} published results</small>
        </div>
        <div class="table-shell leaderboard-shell">
          <table class="leaderboard-table leaderboard-table-compact">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Model</th>
                <th>Team</th>
                <th>Stage</th>
                <th>Success</th>
                <th>Steps</th>
                <th>Inference</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length
                ? rows.map((row, index) => `
                  <tr class="${index < 3 ? "is-podium" : ""}">
                    <td><strong class="rank-number">${index + 1}</strong></td>
                    <td>
                      <div class="leaderboard-model">
                        <strong>${escapeHtml(row.model_name)}</strong>
                        <div><span>${escapeHtml(row.rank_badge)}</span>${row.evaluation_id ? `<a href="${routeHref(`results/${row.evaluation_id}`)}">View result →</a>` : ""}</div>
                      </div>
                    </td>
                    <td>${escapeHtml(row.username_display)}</td>
                    <td>${escapeHtml(row.stage_label)}</td>
                    <td><strong class="score-primary">${formatPercent(row.success_rate)}</strong></td>
                    <td>${formatSteps(row.action_steps)}</td>
                    <td>${formatSeconds(row.real_time)}</td>
                  </tr>
                `).join("")
                : `<tr><td colspan="7" class="empty-table">No published results yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderResultsPage(evaluationId) {
    const evaluation = getEvaluationById(evaluationId);
    if (!evaluation || !evaluation.published) {
      return renderNotFoundPage("Published result not found", "This evaluation either does not exist or has not been published.");
    }

    const episodes = evaluation.episodes || [];
    const firstEpisode = episodes[0];
    return `
      <section class="page-hero shell">
        <span class="eyebrow">Result viewer</span>
        <h1>${escapeHtml(evaluation.display_name)}</h1>
        <p class="lead narrow">
          ${escapeHtml(evaluation.short_description || evaluation.notes || evaluation.leaderboard_notes || "Published evaluation result.")}
        </p>
      </section>

      <section class="section shell">
        <div class="three-up">
          <article class="card metric-card">
            <span>Success rate</span>
            <strong>${formatPercent(evaluation.success_rate)}</strong>
          </article>
          <article class="card metric-card">
            <span>Action steps</span>
            <strong>${formatSteps(evaluation.action_steps)}</strong>
          </article>
          <article class="card metric-card">
            <span>Inference time</span>
            <strong>${formatSeconds(evaluation.real_time)}</strong>
          </article>
        </div>
      </section>

      <section class="section shell">
        <div class="result-layout">
          <article class="card viewer-card" data-result-viewer data-evaluation-id="${escapeHtml(evaluation.id)}">
            <div class="slider-shell">
              <div class="slider-header">
                <span>Eval episode</span>
                <strong data-episode-title>${escapeHtml(firstEpisode ? `${firstEpisode.title || `Episode ${firstEpisode.episode_index}`}` : "Episode 1")}</strong>
              </div>
              <input type="range" min="1" max="${Math.max(episodes.length, 1)}" value="1" step="1" data-episode-slider>
            </div>
            <div class="video-shell">
              <video controls playsinline preload="metadata" data-result-video></video>
              <div class="video-empty" data-video-empty>Episode video pending upload.</div>
            </div>
            <div class="slider-shell">
              <div class="slider-header">
                <span>Episode time</span>
                <strong data-time-readout>0.0s</strong>
              </div>
              <input type="range" min="0" max="0" value="0" step="0.1" data-time-slider>
            </div>
          </article>

          <article class="card sidecard">
            <span class="tag">${escapeHtml(stageLabel(evaluation.evaluation_stage || stageFromTrack(evaluation.track)))}</span>
            <h2 data-current-task>${escapeHtml(firstEpisode ? firstEpisode.task_name : "Episode pending")}</h2>
            <div class="detail-list episode-detail-list">
              <span><strong>Setup:</strong> <span data-current-setup>${escapeHtml(firstEpisode ? structuredEpisodeDetails(firstEpisode).setup : "Not specified")}</span></span>
              <span><strong>Outcome:</strong> <span data-current-outcome>${escapeHtml(firstEpisode ? structuredEpisodeDetails(firstEpisode).outcome : "Not specified")}</span></span>
            </div>
            <p data-episode-notes>${escapeHtml(firstEpisode ? structuredEpisodeDetails(firstEpisode).notes : "")}</p>
          </article>
        </div>
      </section>
    `;
  }

  function renderAdminPage() {
    const user = currentUser();
    if (!isAdmin(user)) {
      return renderNotFoundPage("Administrator access required", "This area is available only to administrator accounts.");
    }

    const participants = state.users.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const submissions = state.submissions.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const publishedResults = state.evaluations.filter((evaluation) => evaluation.published).length;
    const leaderboardEntries = getLeaderboardRows().length;

    return `
      <section class="page-hero shell">
        <span class="eyebrow">Administrator console</span>
        <h1>Issue access tokens, schedule runs, publish results, and seed baselines.</h1>
        <p class="lead narrow">
          This console is the operational layer of the competition site. It stores artifact links,
          assigns evaluation stages, and publishes public leaderboard metrics.
        </p>
      </section>

      <section class="section shell">
        <div class="four-up">
          <article class="card metric-card"><span>Users</span><strong>${participants.length}</strong></article>
          <article class="card metric-card"><span>Submissions</span><strong>${submissions.length}</strong></article>
          <article class="card metric-card"><span>Published results</span><strong>${publishedResults}</strong></article>
          <article class="card metric-card"><span>Leaderboard rows</span><strong>${leaderboardEntries}</strong></article>
        </div>
      </section>

      ${state.latestToken ? `
        <section class="section shell">
          <article class="card">
            <div class="section-heading left">
              <span class="eyebrow">Copy now</span>
              <h2>Latest participant token</h2>
            </div>
            <div class="detail-list">
              <span><strong>Action:</strong> ${escapeHtml(state.latestToken.action)}</span>
              <span><strong>User:</strong> ${escapeHtml(state.latestToken.username)} | ${escapeHtml(state.latestToken.email)}</span>
              <span><strong>Token:</strong> <code>${escapeHtml(state.latestToken.token)}</code></span>
            </div>
          </article>
        </section>
      ` : ""}

      <section class="section shell">
        <div class="split-grid">
          <article class="card">
            <div class="section-heading left">
              <span class="eyebrow">Participant access</span>
              <h2>Create a token-based account</h2>
            </div>
            <form class="panel-stack compact" data-form="admin-create-participant">
              <div class="form-grid">
                <label class="field">
                  <span>Username</span>
                  <input type="text" name="username" placeholder="team_name" required>
                </label>
                <label class="field">
                  <span>Email</span>
                  <input type="email" name="email" placeholder="user@example.org" required>
                </label>
                <label class="field">
                  <span>Affiliation</span>
                  <input type="text" name="affiliation" placeholder="Lab or company">
                </label>
                <label class="field field-span-2">
                  <span>Short bio</span>
                  <textarea name="bio" rows="3" placeholder="Optional context for the participant account."></textarea>
                </label>
              </div>
              <button type="submit" class="button button-primary">Create participant</button>
            </form>
          </article>

          <article class="card">
            <div class="section-heading left">
              <span class="eyebrow">Seed a baseline</span>
              <h2>Create a public leaderboard entry</h2>
            </div>
            <form class="panel-stack compact" data-form="admin-create-baseline">
              <div class="form-grid">
                <label class="field">
                  <span>Model name</span>
                  <input type="text" name="model_name" placeholder="pi0.5" required>
                </label>
                <label class="field">
                  <span>Display user</span>
                  <input type="text" name="username_display" placeholder="Official Baseline" required>
                </label>
                <label class="field">
                  <span>Affiliation</span>
                  <input type="text" name="affiliation" placeholder="RoboSynChallenge">
                </label>
                <label class="field">
                  <span>Evaluation stage</span>
                  <select name="evaluation_stage" required>
                    ${Object.entries(EVALUATION_STAGE_LABELS).map(([key, label]) => `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`).join("")}
                  </select>
                </label>
                <label class="field">
                  <span>Data source label</span>
                  <input type="text" name="data_regime" placeholder="Official simulation" required>
                </label>
                <label class="field">
                  <span>Success rate</span>
                  <input type="number" step="0.1" name="success_rate" placeholder="64.2" required>
                </label>
                <label class="field">
                  <span>Action steps</span>
                  <input type="number" step="0.1" name="action_steps" placeholder="402" required>
                </label>
                <label class="field">
                  <span>Inference time</span>
                  <input type="number" step="0.1" name="real_time" placeholder="72.5" required>
                </label>
                <label class="field field-span-2">
                  <span>Notes</span>
                  <textarea name="notes" rows="3" placeholder="What this baseline represents."></textarea>
                </label>
              </div>
              <button type="submit" class="button button-primary">Add baseline</button>
            </form>
          </article>
        </div>
      </section>

      <section class="section shell">
        <div class="table-shell">
          <table class="leaderboard-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Affiliation</th>
                <th>Role</th>
                <th>Token hint</th>
                <th>Issued</th>
                <th>Token</th>
              </tr>
            </thead>
            <tbody>
              ${participants.map((participant) => `
                <tr>
                  <td>${escapeHtml(participant.username)}</td>
                  <td>${escapeHtml(participant.email)}</td>
                  <td>${escapeHtml(participant.affiliation || "-")}</td>
                  <td>${escapeHtml(participant.role)}</td>
                  <td>${escapeHtml(participant.access_token_hint || "Not issued")}</td>
                  <td>${escapeHtml(formatDateTime(participant.createdAt))}</td>
                  <td>
                    ${participant.role === "admin"
                      ? `<span class="footer-muted">Pinned admin token</span>`
                      : `<button type="button" class="button button-secondary" data-action="regenerate-token" data-user-id="${escapeHtml(participant.id)}">Regenerate</button>`}
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>

      <section class="section shell">
        <div class="table-shell">
          <table class="leaderboard-table">
            <thead>
              <tr>
                <th>Artifact</th>
                <th>Experiment</th>
                <th>User</th>
                <th>Stage</th>
                <th>Status</th>
                <th>Schedule</th>
                <th>Published</th>
                <th>Manage</th>
              </tr>
            </thead>
            <tbody>
              ${submissions.length
                ? submissions.map((submission) => `
                  <tr>
                    <td>${escapeHtml(submission.display_name || submission.title)}</td>
                    <td>${escapeHtml(submission.title)}</td>
                    <td>${escapeHtml(getUserById(submission.owner_id)?.username || "Unknown")}</td>
                    <td>${escapeHtml(stageLabel(submission.evaluation_stage))}</td>
                    <td>${escapeHtml(humanStatus(submission.status))}</td>
                    <td>${escapeHtml(formatDateTime(submission.evaluation_schedule_at))}</td>
                    <td>${submission.evaluation_published ? "Yes" : "No"}</td>
                    <td><a href="${routeHref(`admin/submission/${submission.id}`)}">Open</a></td>
                  </tr>
                `).join("")
                : `<tr><td colspan="8">No submissions yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderAdminSubmissionPage(submissionId) {
    const user = currentUser();
    if (!isAdmin(user)) {
      return renderNotFoundPage("Administrator access required", "This area is available only to administrator accounts.");
    }

    const submission = getSubmissionById(submissionId);
    if (!submission) {
      return renderNotFoundPage("Submission not found", "The requested submission does not exist.");
    }
    const evaluation = getEvaluationById(submission.evaluation_id);
    const owner = getUserById(submission.owner_id);
    const episodes = evaluation ? evaluation.episodes || [] : [];
    const stageValue = evaluation?.evaluation_stage || submission.evaluation_stage;

    return `
      <section class="page-hero shell">
        <span class="eyebrow">Submission management</span>
        <h1>${escapeHtml(submission.display_name)}</h1>
        <p class="lead narrow">${escapeHtml(submission.short_description)}</p>
      </section>

      <section class="section shell">
        <div class="split-grid">
          <article class="card">
            <div class="section-heading left">
              <span class="eyebrow">Participant</span>
              <h2>${escapeHtml(owner?.username || "Unknown")}</h2>
            </div>
            <div class="detail-list">
              <span><strong>Email:</strong> ${escapeHtml(owner?.email || "Unknown")}</span>
              <span><strong>Affiliation:</strong> ${escapeHtml(owner?.affiliation || "Not provided")}</span>
              <span><strong>Artifact:</strong> ${escapeHtml(submission.display_name)}</span>
              <span><strong>Checkpoint:</strong> ${externalLink(submission.checkpoint_link)}</span>
              <span><strong>Code:</strong> ${externalLink(submission.code_link)}</span>
            </div>
          </article>

          <article class="card">
            <div class="section-heading left">
              <span class="eyebrow">Submitted artifact</span>
              <h2>${escapeHtml(stageLabel(stageValue))}</h2>
            </div>
            <div class="detail-list">
              <span><strong>Experiment:</strong> ${escapeHtml(submission.title)}</span>
              <span><strong>Run type:</strong> ${escapeHtml(submission.ranking_label)}</span>
              <span><strong>Data source:</strong> ${escapeHtml(submission.data_source_text || "Not provided")}</span>
              <span><strong>Run notes:</strong> ${escapeHtml(submission.technical_notes || "Not provided")}</span>
            </div>
          </article>
        </div>
      </section>

      <section class="section shell">
        <div class="split-grid">
          <article class="card">
            <div class="section-heading left">
              <span class="eyebrow">Evaluation metadata</span>
              <h2>Schedule and publish</h2>
            </div>
            <form class="panel-stack compact" data-form="admin-update-evaluation">
              <input type="hidden" name="submission_id" value="${escapeHtml(submission.id)}">
              <div class="form-grid">
                <label class="field">
                  <span>Evaluation stage</span>
                  <select name="evaluation_stage" required>
                    <option value="">Select stage</option>
                    ${Object.entries(EVALUATION_STAGE_LABELS).map(([key, label]) => `<option value="${escapeHtml(key)}" ${stageValue === key ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}
                  </select>
                </label>
                <label class="field">
                  <span>Status</span>
                  <select name="status">
                    ${Object.keys(STATUS_LABELS).map((value) => `<option value="${escapeHtml(value)}" ${evaluation?.status === value ? "selected" : ""}>${escapeHtml(humanStatus(value))}</option>`).join("")}
                  </select>
                </label>
                <label class="field">
                  <span>Schedule</span>
                  <input type="datetime-local" name="schedule_at" value="${escapeHtml(formatDateInput(evaluation?.schedule_at))}">
                </label>
                <label class="field">
                  <span>Success rate</span>
                  <input type="number" step="0.1" name="success_rate" value="${escapeHtml(evaluation?.success_rate ?? "")}">
                </label>
                <label class="field">
                  <span>Action steps</span>
                  <input type="number" step="0.1" name="action_steps" value="${escapeHtml(evaluation?.action_steps ?? "")}">
                </label>
                <label class="field">
                  <span>Inference time</span>
                  <input type="number" step="0.1" name="real_time" value="${escapeHtml(evaluation?.real_time ?? "")}">
                </label>
                <label class="field field-span-2">
                  <span>Schedule note</span>
                  <textarea name="admin_schedule_note" rows="3">${escapeHtml(submission.admin_schedule_note || "")}</textarea>
                </label>
                <label class="field field-span-2">
                  <span>Evaluation notes</span>
                  <textarea name="notes" rows="4">${escapeHtml(evaluation?.notes || "")}</textarea>
                </label>
              </div>
              <label class="choice-inline">
                <input type="checkbox" name="published" ${evaluation?.published ? "checked" : ""}>
                <span>Publish to leaderboard and result viewer</span>
              </label>
              <button type="submit" class="button button-primary">Save evaluation</button>
            </form>
          </article>

          <article class="card">
            <div class="section-heading left">
              <span class="eyebrow">Episode uploader</span>
              <h2>Add result footage</h2>
            </div>
            <form class="panel-stack compact" data-form="admin-add-episode">
              <input type="hidden" name="submission_id" value="${escapeHtml(submission.id)}">
              <div class="form-grid">
                <label class="field">
                  <span>Episode index</span>
                  <input type="number" min="1" step="1" name="episode_index" value="${episodes.length + 1}">
                </label>
                <label class="field">
                  <span>Task name</span>
                  <input type="text" name="task_name" placeholder="Drawer open-and-place" required>
                </label>
                <label class="field">
                  <span>Duration seconds</span>
                  <input type="number" step="0.1" name="duration_seconds" placeholder="12.5">
                </label>
                <label class="field">
                  <span>Episode video</span>
                  <input type="file" name="episode_video" accept=".mp4,.webm,.mov,.m4v">
                </label>
                <label class="field">
                  <span>External video URL</span>
                  <input type="url" name="video_url" placeholder="https://...">
                </label>
                <label class="field field-span-2">
                  <span>Episode notes</span>
                  <textarea name="episode_notes" rows="3" placeholder="What to notice in this rollout."></textarea>
                </label>
              </div>
              <button type="submit" class="button button-secondary">Add episode</button>
            </form>

            ${evaluation?.published ? `
              <div class="section-actions">
                <a href="${routeHref(`results/${evaluation.id}`)}" class="button button-ghost">Open public viewer</a>
              </div>
            ` : ""}
          </article>
        </div>
      </section>

      <section class="section shell">
        <div class="table-shell">
          <table class="leaderboard-table">
            <thead>
              <tr>
                <th>Episode</th>
                <th>Task</th>
                <th>Duration</th>
                <th>Video</th>
                <th>Notes</th>
                <th>Delete</th>
              </tr>
            </thead>
            <tbody>
              ${episodes.length
                ? episodes.map((episode) => `
                  <tr>
                    <td>${episode.episode_index}</td>
                    <td>${escapeHtml(episode.task_name)}</td>
                    <td>${escapeHtml(formatSeconds(episode.duration_seconds))}</td>
                    <td>${escapeHtml(episode.video_url || "Not uploaded")}</td>
                    <td>${escapeHtml(episode.notes || "-")}</td>
                    <td>
                      <button type="button" class="button button-danger" data-action="delete-episode" data-submission-id="${escapeHtml(submission.id)}" data-episode-id="${escapeHtml(episode.id)}">Delete</button>
                    </td>
                  </tr>
                `).join("")
                : `<tr><td colspan="6">No episodes uploaded yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderNotFoundPage(title, description) {
    return `
      <section class="section shell auth-grid single">
        <article class="auth-card wide">
          <span class="eyebrow">Navigation</span>
          <h1>${escapeHtml(title)}</h1>
          <p class="lead">${escapeHtml(description)}</p>
          <div class="cta-row">
            <a href="${routeHref("home")}" class="button button-primary">Go home</a>
            <a href="${routeHref("leaderboard")}" class="button button-secondary">Open leaderboard</a>
          </div>
        </article>
      </section>
    `;
  }

  function parseRoute(route) {
    if (route === "home") return { name: "home" };
    if (route === "data") return { name: "data" };
    if (route === "benchmark") return { name: "leaderboard" };
    if (route === "login") return { name: "login" };
    if (route === "register") return { name: "register" };
    if (route === "evaluation") return { name: "evaluation" };
    if (route === "dashboard") return { name: "dashboard" };
    if (route === "leaderboard") return { name: "leaderboard" };
    if (route === "admin") return { name: "admin" };
    if (route.startsWith("submission/")) return { name: "submission", id: route.slice("submission/".length) };
    if (route.startsWith("results/")) return { name: "results", id: route.slice("results/".length) };
    if (route.startsWith("admin/submission/")) return { name: "admin-submission", id: route.slice("admin/submission/".length) };
    return { name: "not-found" };
  }

  function render() {
    const route = parseRoute(currentRoute());
    switch (route.name) {
      case "home":
        renderSection(renderHome(), "Home");
        break;
      case "data":
        renderSection(renderDataPage(), "Data");
        break;
      case "login":
        renderSection(renderLoginPage(), "Sign In");
        break;
      case "register":
        renderSection(renderRegisterPage(), "Request Access");
        break;
      case "evaluation":
        renderSection(renderEvaluationPage(), "Evaluation");
        break;
      case "dashboard":
        renderSection(renderDashboardPage(), "Dashboard");
        break;
      case "submission":
        renderSection(renderSubmissionDetailPage(route.id), "Submission");
        break;
      case "leaderboard":
        renderSection(renderLeaderboardPage(), "Leaderboard");
        break;
      case "results":
        renderSection(renderResultsPage(route.id), "Result Viewer");
        break;
      case "admin":
        renderSection(renderAdminPage(), "Admin");
        break;
      case "admin-submission":
        renderSection(renderAdminSubmissionPage(route.id), "Manage Submission");
        break;
      default:
        renderSection(renderNotFoundPage("Page not found", "The requested route does not exist."), "Not Found");
        break;
    }
  }

  function initEvalHelpers() {}

  function initResultViewer() {
    const viewer = appEl.querySelector("[data-result-viewer]");
    if (!viewer) return;

    const evaluationId = viewer.getAttribute("data-evaluation-id");
    const evaluation = evaluationId ? getEvaluationById(evaluationId) : null;
    const episodes = evaluation ? evaluation.episodes || [] : [];
    const episodeSlider = viewer.querySelector("[data-episode-slider]");
    const timeSlider = viewer.querySelector("[data-time-slider]");
    const video = viewer.querySelector("[data-result-video]");
    const emptyState = viewer.querySelector("[data-video-empty]");
    const title = viewer.querySelector("[data-episode-title]");
    const timeReadout = viewer.querySelector("[data-time-readout]");
    const currentTask = appEl.querySelector("[data-current-task]");
    const currentSetup = appEl.querySelector("[data-current-setup]");
    const currentOutcome = appEl.querySelector("[data-current-outcome]");
    const episodeNotes = appEl.querySelector("[data-episode-notes]");

    if (!episodes.length || !video || !episodeSlider || !timeSlider || !emptyState) return;

    const syncTimeFromVideo = () => {
      timeSlider.value = String(video.currentTime || 0);
      timeReadout.textContent = formatSeconds(video.currentTime || 0);
    };

    const loadEpisode = (index) => {
      const episode = episodes[index] || episodes[0];
      if (!episode) return;
      const details = structuredEpisodeDetails(episode);
      if (title) title.textContent = `Episode ${episode.episode_index}: ${details.task}`;
      if (currentTask) currentTask.textContent = details.task;
      if (currentSetup) currentSetup.textContent = details.setup;
      if (currentOutcome) currentOutcome.textContent = details.outcome;
      if (episodeNotes) {
        episodeNotes.textContent = details.notes;
        episodeNotes.style.display = details.notes ? "" : "none";
      }
      if (timeSlider) {
        timeSlider.max = String(episode.duration_seconds || 0);
        timeSlider.value = "0";
      }
      if (timeReadout) timeReadout.textContent = "0.0s";

      if (episode.video_url) {
        video.src = episode.video_url;
        video.load();
        emptyState.style.display = "none";
        video.style.display = "block";
      } else {
        video.removeAttribute("src");
        video.load();
        video.style.display = "none";
        emptyState.style.display = "grid";
      }
    };

    const onEpisodeInput = () => loadEpisode(Number(episodeSlider.value) - 1);
    const onTimeInput = () => {
      if (!video.src) return;
      video.currentTime = Number(timeSlider.value || 0);
      if (timeReadout) timeReadout.textContent = formatSeconds(timeSlider.value || 0);
    };
    const onLoadedMetadata = () => {
      if (timeSlider) timeSlider.max = String(video.duration || 0);
      if (video.videoWidth && video.videoHeight) {
        const shell = video.closest(".video-shell");
        if (shell) shell.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
      }
    };

    episodeSlider.addEventListener("input", onEpisodeInput);
    timeSlider.addEventListener("input", onTimeInput);
    video.addEventListener("timeupdate", syncTimeFromVideo);
    video.addEventListener("loadedmetadata", onLoadedMetadata);

    viewerCleanup = () => {
      episodeSlider.removeEventListener("input", onEpisodeInput);
      timeSlider.removeEventListener("input", onTimeInput);
      video.removeEventListener("timeupdate", syncTimeFromVideo);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
    };

    loadEpisode(0);
  }


  function handleLogin(form) {
    const formData = new FormData(form);
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const token = String(formData.get("token") || "").trim();
    if (!email || !token) {
      pushFlash("error", "Email and token are required.");
      return;
    }

    let user = state.users.find((item) => item.email.toLowerCase() === email);
    if (!user) {
      user = {
        id: uid("user"),
        username: email.split("@")[0],
        email,
        affiliation: "",
        bio: "",
        role: "participant",
        token,
        createdAt: nowIso(),
        access_token_hint: `${token.slice(0, 6)}****`,
      };
      state.users.push(user);
      state.latestToken = { action: "created", username: user.username, email: user.email, token };
    } else if (user.role !== "admin" && user.token !== token) {
      user.token = token;
      user.access_token_hint = `${token.slice(0, 6)}****`;
    }

    state.session.userId = user.id;
    saveState();
    pushFlash("success", `Signed in as ${user.username}.`);
    navigate(user.role === "admin" ? "admin" : "dashboard");
  }

  function handleRegister(form) {
    const formData = new FormData(form);
    const username = String(formData.get("username") || "").trim();
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const affiliation = String(formData.get("affiliation") || "").trim();
    const bio = String(formData.get("bio") || "").trim();

    if (!username || !email) {
      pushFlash("error", "Username and email are required.");
      return;
    }

    let user = state.users.find((item) => item.email.toLowerCase() === email);
    const token = `RSC-${Math.random().toString(36).slice(2, 8).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    if (user) {
      user.username = username;
      user.affiliation = affiliation;
      user.bio = bio;
      user.token = token;
      user.access_token_hint = `${token.slice(0, 6)}****`;
    } else {
      user = {
        id: uid("user"),
        username,
        email,
        affiliation,
        bio,
        role: "participant",
        token,
        createdAt: nowIso(),
        access_token_hint: `${token.slice(0, 6)}****`,
      };
      state.users.push(user);
    }

    state.accessRequests.unshift({
      id: uid("request"),
      username,
      email,
      affiliation,
      bio,
      createdAt: nowIso(),
    });
    state.latestToken = { action: "register-auto-issue", username, email, token };
    state.session.userId = user.id;
    saveState();
    pushFlash("success", `Account token issued for ${username}.`);
    navigate("evaluation");
  }

  function handleEvaluationSubmit(form) {
    const user = currentUser();
    if (!user) {
      pushFlash("error", "Sign in before submitting.");
      return;
    }

    const formData = new FormData(form);
    const artifactName = String(formData.get("artifact_name") || "").trim();
    const title = String(formData.get("title") || "").trim();
    const shortDescription = String(formData.get("short_description") || "").trim();
    const codeLink = String(formData.get("code_link") || "").trim();
    const checkpointLink = String(formData.get("checkpoint_link") || "").trim();
    const dataSourceText = String(formData.get("data_source_text") || "").trim();
    const technicalNotes = String(formData.get("technical_notes") || "").trim();
    const isRanked = formData.has("is_ranked");

    if (!artifactName || !title || !shortDescription) {
      pushFlash("error", "Artifact name, experiment name, and short description are required.");
      return;
    }
    if (!isHttpUrl(codeLink)) {
      pushFlash("error", "Provide a valid code URL.");
      return;
    }
    if (!isHuggingFaceUrl(checkpointLink)) {
      pushFlash("error", "Checkpoint link must be a https://huggingface.co/... URL.");
      return;
    }
    if (!dataSourceText) {
      pushFlash("error", "Describe the data source used by this artifact.");
      return;
    }
    if (!technicalNotes) {
      pushFlash("error", "Run and dependency notes are required.");
      return;
    }

    const submissionId = uid("submission");
    const evaluationId = uid("evaluation");
    const submission = {
      id: submissionId,
      owner_id: user.id,
      display_name: artifactName,
      artifact_name: artifactName,
      checkpoint_link: checkpointLink,
      code_link: codeLink,
      title,
      short_description: shortDescription,
      technical_notes: technicalNotes,
      data_source_text: dataSourceText,
      is_ranked: isRanked,
      ranking_label: rankingLabel(isRanked),
      evaluation_stage: "",
      stage_label: stageLabel(""),
      status: "submitted",
      admin_schedule_note: "",
      evaluation_id: evaluationId,
      evaluation_schedule_at: "",
      evaluation_published: false,
      evaluation_notes: "",
      created_at: nowIso(),
    };

    const evaluation = {
      id: evaluationId,
      submission_id: submissionId,
      display_name: `${artifactName} | ${title}`,
      short_description: shortDescription,
      status: "submitted",
      source_kind: "submission",
      evaluation_stage: "",
      stage_label: stageLabel(""),
      schedule_at: "",
      published: false,
      published_at: "",
      success_rate: null,
      action_steps: null,
      real_time: null,
      notes: "",
      leaderboard_notes: "",
      episodes: [],
    };

    state.submissions.unshift(submission);
    state.evaluations.unshift(evaluation);
    saveState();
    pushFlash("success", "Artifact submission recorded. An administrator can now schedule and publish it.");
    navigate(`submission/${submissionId}`);
  }

  function handleAdminCreateParticipant(form) {
    const user = currentUser();
    if (!isAdmin(user)) return;
    const formData = new FormData(form);
    const username = String(formData.get("username") || "").trim();
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const affiliation = String(formData.get("affiliation") || "").trim();
    const bio = String(formData.get("bio") || "").trim();
    if (!username || !email) {
      pushFlash("error", "Username and email are required.");
      return;
    }
    const existing = state.users.find((item) => item.email.toLowerCase() === email);
    const token = `RSC-${Math.random().toString(36).slice(2, 8).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    if (existing) {
      existing.username = username;
      existing.affiliation = affiliation;
      existing.bio = bio;
      existing.role = existing.role === "admin" ? "admin" : "participant";
      existing.token = token;
      existing.access_token_hint = `${token.slice(0, 6)}****`;
    } else {
      state.users.push({
        id: uid("user"),
        username,
        email,
        affiliation,
        bio,
        role: "participant",
        token,
        createdAt: nowIso(),
        access_token_hint: `${token.slice(0, 6)}****`,
      });
    }
    state.latestToken = { action: "create-participant", username, email, token };
    saveState();
    pushFlash("success", "Participant account created. Copy the token now.");
    render();
  }

  function handleRegenerateToken(userId) {
    const user = currentUser();
    if (!isAdmin(user)) return;
    const participant = getUserById(userId);
    if (!participant || participant.role === "admin") return;
    const token = `RSC-${Math.random().toString(36).slice(2, 8).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    participant.token = token;
    participant.access_token_hint = `${token.slice(0, 6)}****`;
    state.latestToken = { action: "regenerate-token", username: participant.username, email: participant.email, token };
    saveState();
    pushFlash("success", `Regenerated token for ${participant.username}.`);
    render();
  }

  function handleAdminCreateBaseline(form) {
    const user = currentUser();
    if (!isAdmin(user)) return;
    const formData = new FormData(form);
    const modelName = String(formData.get("model_name") || "").trim();
    const usernameDisplay = String(formData.get("username_display") || "").trim();
    const affiliation = String(formData.get("affiliation") || "").trim();
    const evaluationStage = String(formData.get("evaluation_stage") || "").trim();
    const dataRegime = String(formData.get("data_regime") || "").trim();
    const successRate = Number(formData.get("success_rate") || 0);
    const actionSteps = Number(formData.get("action_steps") || 0);
    const realTime = Number(formData.get("real_time") || 0);
    const notes = String(formData.get("notes") || "").trim();
    if (!modelName || !usernameDisplay || !evaluationStage || !dataRegime) {
      pushFlash("error", "Model name, display user, evaluation stage, and data source label are required.");
      return;
    }
    state.baselines.unshift({
      id: uid("baseline"),
      model_name: modelName,
      username_display: usernameDisplay,
      affiliation,
      evaluation_stage: evaluationStage,
      data_regime: dataRegime,
      success_rate: successRate,
      action_steps: actionSteps,
      real_time: realTime,
      notes,
    });
    saveState();
    pushFlash("success", "Baseline entry added to the leaderboard.");
    render();
  }

  function handleAdminUpdateEvaluation(form) {
    const admin = currentUser();
    if (!isAdmin(admin)) return;
    const formData = new FormData(form);
    const submissionId = String(formData.get("submission_id") || "");
    const submission = getSubmissionById(submissionId);
    if (!submission) {
      pushFlash("error", "Submission not found.");
      return;
    }
    const evaluation = getEvaluationById(submission.evaluation_id);
    if (!evaluation) {
      pushFlash("error", "Evaluation not found.");
      return;
    }

    const evaluationStage = String(formData.get("evaluation_stage") || "").trim();
    const status = String(formData.get("status") || "submitted");
    const scheduleAt = String(formData.get("schedule_at") || "").trim();
    const successRateRaw = String(formData.get("success_rate") || "").trim();
    const actionStepsRaw = String(formData.get("action_steps") || "").trim();
    const realTimeRaw = String(formData.get("real_time") || "").trim();
    const published = formData.has("published");
    const notes = String(formData.get("notes") || "").trim();
    const adminScheduleNote = String(formData.get("admin_schedule_note") || "").trim();

    evaluation.evaluation_stage = evaluationStage;
    evaluation.stage_label = stageLabel(evaluationStage);
    evaluation.status = status;
    evaluation.schedule_at = scheduleAt ? new Date(scheduleAt).toISOString() : "";
    evaluation.success_rate = successRateRaw ? Number(successRateRaw) : null;
    evaluation.action_steps = actionStepsRaw ? Number(actionStepsRaw) : null;
    evaluation.real_time = realTimeRaw ? Number(realTimeRaw) : null;
    evaluation.notes = notes;
    evaluation.published = published;
    if (published && !evaluation.published_at) evaluation.published_at = nowIso();
    if (!published) evaluation.published_at = "";

    submission.evaluation_stage = evaluationStage;
    submission.stage_label = stageLabel(evaluationStage);
    submission.status = status;
    submission.admin_schedule_note = adminScheduleNote;
    submission.evaluation_schedule_at = evaluation.schedule_at;
    submission.evaluation_published = published;
    submission.evaluation_notes = notes;

    saveState();
    pushFlash("success", `Evaluation state saved for ${submission.display_name}.`);
    render();
  }

  function handleAdminAddEpisode(form) {
    const admin = currentUser();
    if (!isAdmin(admin)) return;
    const formData = new FormData(form);
    const submissionId = String(formData.get("submission_id") || "");
    const submission = getSubmissionById(submissionId);
    if (!submission) {
      pushFlash("error", "Submission not found.");
      return;
    }
    const evaluation = getEvaluationById(submission.evaluation_id);
    if (!evaluation) {
      pushFlash("error", "Evaluation not found.");
      return;
    }
    const episodeIndex = Number(formData.get("episode_index") || evaluation.episodes.length + 1);
    const taskName = String(formData.get("task_name") || "").trim();
    const durationSeconds = Number(formData.get("duration_seconds") || 0) || 18;
    const videoUrl = String(formData.get("video_url") || "").trim();
    const notes = String(formData.get("episode_notes") || "").trim();
    const file = formData.get("episode_video");
    if (!taskName) {
      pushFlash("error", "Task name is required.");
      return;
    }

    const finalVideoUrl = videoUrl || DEFAULT_VIDEO_URL;
    evaluation.episodes.push({
      id: uid("episode"),
      episode_index: episodeIndex,
      task_name: taskName,
      duration_seconds: durationSeconds,
      video_url: finalVideoUrl,
      notes: notes || "No notes uploaded.",
    });
    evaluation.episodes.sort((left, right) => left.episode_index - right.episode_index);
    if (file && typeof file === "object" && file.size) {
      pushFlash("warning", "Uploaded files are not persisted in this deployment, so the default preview video was kept unless an external URL was supplied.");
    } else {
      pushFlash("success", `Episode ${episodeIndex} added.`);
    }
    saveState();
    render();
  }

  function handleDeleteEpisode(submissionId, episodeId) {
    const admin = currentUser();
    if (!isAdmin(admin)) return;
    const submission = getSubmissionById(submissionId);
    const evaluation = submission ? getEvaluationById(submission.evaluation_id) : null;
    if (!evaluation) {
      pushFlash("error", "Evaluation not found.");
      return;
    }
    evaluation.episodes = evaluation.episodes.filter((episode) => episode.id !== episodeId);
    saveState();
    pushFlash("success", "Episode deleted.");
    render();
  }

  function attachGlobalEvents() {
    if (navToggle && navMenu) {
      navToggle.addEventListener("click", () => {
        navMenu.classList.toggle("is-open");
      });
    }

    document.addEventListener("click", (event) => {
      const target = event.target.closest("[data-action]");
      if (!target) return;
      const action = target.getAttribute("data-action");
      if (!action) return;

      if (action === "focus-policy-submit") {
        event.preventDefault();
        const submitSection = appEl.querySelector("[data-policy-submit]");
        if (!submitSection) {
          navigate("login");
          return;
        }
        submitSection.scrollIntoView({ behavior: "smooth", block: "start" });
        submitSection.querySelector("input, textarea, select, button")?.focus({ preventScroll: true });
      } else if (action === "logout") {
        event.preventDefault();
        logoutUser();
      } else if (action === "regenerate-token") {
        event.preventDefault();
        handleRegenerateToken(target.getAttribute("data-user-id") || "");
      } else if (action === "delete-episode") {
        event.preventDefault();
        handleDeleteEpisode(target.getAttribute("data-submission-id") || "", target.getAttribute("data-episode-id") || "");
      }
    });

    document.addEventListener("submit", (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      const kind = form.getAttribute("data-form");
      if (!kind) return;
      event.preventDefault();

      if (kind === "login") handleLogin(form);
      else if (kind === "register") handleRegister(form);
      else if (kind === "evaluation") handleEvaluationSubmit(form);
      else if (kind === "admin-create-participant") handleAdminCreateParticipant(form);
      else if (kind === "admin-create-baseline") handleAdminCreateBaseline(form);
      else if (kind === "admin-update-evaluation") handleAdminUpdateEvaluation(form);
      else if (kind === "admin-add-episode") handleAdminAddEpisode(form);
    });

    window.addEventListener("hashchange", render);
  }

  if (!window.location.hash) {
    navigate("home");
  }

  attachGlobalEvents();
  render();
})();
