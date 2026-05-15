(() => {
  "use strict";

  const STORAGE_KEY = "robosynchallenge-pages-state-v1";
  const DATASET_URL = "";
  const DATASET_LABEL = "Hugging Face dataset";
  const SIMULATION_REPO_URL = "https://github.com/wuxinxin27/Embodied_Challenge";
  const PAPER_URL = "Benchmark___Competition_2026.pdf";
  const DEFAULT_VIDEO_URL = "static/assets/demo-eval.mp4";

  const STATE_LABELS = {
    joints: "Joints",
    gripper: "Gripper",
    eef_pose: "EEF pose (pos + rot)",
  };

  const IMAGE_LABELS = {
    cam_high: "Cam high",
    cam_left_wrist: "Cam left wrist",
    cam_right_wrist: "Cam right wrist",
  };

  const ROTATION_LABELS = {
    rot6d: "Rot6D",
    quat: "Quaternion",
    rpy: "RPY",
  };

  const DATA_SOURCE_LABELS = {
    official_real: "Official real data",
    official_simulated: "Official simulated data",
    other: "Other data sources",
  };

  const TRACK_LABELS = {
    hybrid: "Sim + Real",
    "real-only": "Real only",
    "sim-only": "Sim only",
    custom: "Custom",
  };

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
    { value: "10", label: "official tasks" },
    { value: "1000", label: "synthetic trials / task" },
    { value: "60", label: "real references / task" },
    { value: "1000", label: "action-step cap" },
  ];

  const BENCHMARK_SUMMARY = [
    { label: "pi0 (sim)", model_name: "pi0", track: "sim-only", data_regime: "Sim only", success_rate: 22.0, action_steps: 898.12, real_time: 90.56 },
    { label: "pi0 (real)", model_name: "pi0", track: "real-only", data_regime: "Real only", success_rate: 22.5, action_steps: 881.15, real_time: 90.2 },
    { label: "pi0.5 (sim)", model_name: "pi0.5", track: "sim-only", data_regime: "Sim only", success_rate: 38.5, action_steps: 797.55, real_time: 80.55 },
    { label: "pi0.5 (real)", model_name: "pi0.5", track: "real-only", data_regime: "Real only", success_rate: 33.0, action_steps: 821.65, real_time: 82.35 },
    { label: "Motus (sim)", model_name: "Motus", track: "sim-only", data_regime: "Sim only", success_rate: 31.5, action_steps: 778.8, real_time: 133.76 },
    { label: "Motus (real)", model_name: "Motus", track: "real-only", data_regime: "Real only", success_rate: 27.5, action_steps: 721.35, real_time: 129.43 },
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

  function trackLabel(value) {
    return TRACK_LABELS[value] || value || "Custom";
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

  function getModelById(modelId) {
    return state.models.find((model) => model.id === modelId) || null;
  }

  function getSubmissionById(submissionId) {
    return state.submissions.find((submission) => submission.id === submissionId) || null;
  }

  function getEvaluationById(evaluationId) {
    return state.evaluations.find((evaluation) => evaluation.id === evaluationId) || null;
  }

  function loadState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return freshState();
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 1) return freshState();
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
    const scheduledAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const publishedAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

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
      bio: "Reference participant account for the public workflow.",
      role: "participant",
      token: "RSC-TEAM-ALPHA",
      createdAt,
      access_token_hint: "RSC-TEA****",
    };

    const seededModel = {
      id: "model-seeded",
      ownerId: seededUser.id,
      display_name: "pi0.5 hybrid transfer",
      checkpoint_link: "https://huggingface.co/edem-ai/pi05-hybrid-transfer",
      code_link: "https://github.com/edem-ai/RoboSynChallenge",
      created_at: createdAt,
      updated_at: createdAt,
    };

    const seededSubmission = {
      id: "submission-seeded",
      owner_id: seededUser.id,
      model_id: seededModel.id,
      display_name: seededModel.display_name,
      checkpoint_link: seededModel.checkpoint_link,
      code_link: seededModel.code_link,
      title: "Official hybrid reference run",
      short_description: "Reference participant submission illustrating the public evaluation workflow.",
      technical_notes: "Reference entry for the published result viewer and leaderboard flow.",
      is_ranked: true,
      data_sources: [DATA_SOURCE_LABELS.official_real, DATA_SOURCE_LABELS.official_simulated],
      other_data_source_text: "",
      input_state: [STATE_LABELS.joints, STATE_LABELS.gripper, STATE_LABELS.eef_pose],
      input_images: [IMAGE_LABELS.cam_high, IMAGE_LABELS.cam_left_wrist, IMAGE_LABELS.cam_right_wrist],
      input_rotation_format: "rot6d",
      output_actions: ["Joints", "Gripper", "EEF pose delta"],
      output_rotation_format: "rot6d",
      output_chunk_size: 16,
      execution_chunk_size: 8,
      gripper_threshold: 0.05,
      track: "hybrid",
      track_label: TRACK_LABELS.hybrid,
      ranking_label: rankingLabel(true),
      status: "published",
      admin_schedule_note: "Reference published run used for the public result viewer.",
      evaluation_id: "evaluation-seeded",
      evaluation_schedule_at: scheduledAt,
      evaluation_published: true,
      evaluation_notes: "Published reference result for the workflow preview.",
      created_at: createdAt,
    };

    const seededEvaluation = {
      id: "evaluation-seeded",
      submission_id: seededSubmission.id,
      display_name: `${seededSubmission.display_name} | ${seededSubmission.title}`,
      short_description: seededSubmission.short_description,
      status: "published",
      source_kind: "submission",
      track_label: TRACK_LABELS.hybrid,
      schedule_at: scheduledAt,
      published: true,
      published_at: publishedAt,
      success_rate: 71.4,
      action_steps: 318,
      real_time: 54.8,
      notes: "Published reference result used to exercise the episode viewer.",
      leaderboard_notes: "Reference published evaluation.",
      episodes: BASELINE_EPISODES.map((episode, index) => ({
        id: uid("episode"),
        episode_index: index + 1,
        task_name: episode.task_name,
        duration_seconds: 22 + index * 4,
        video_url: DEFAULT_VIDEO_URL,
        notes: episode.notes,
      })),
    };

    return {
      version: 1,
      session: { userId: null },
      latestToken: {
        action: "issued",
        username: seededUser.username,
        email: seededUser.email,
        token: seededUser.token,
      },
      accessRequests: [],
      users: [adminUser, seededUser],
      models: [seededModel],
      submissions: [seededSubmission],
      evaluations: [seededEvaluation],
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

  function userModels(userId) {
    return state.models
      .filter((model) => model.ownerId === userId || model.owner_id === userId)
      .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  }

  function userSubmissions(userId) {
    return state.submissions
      .filter((submission) => submission.owner_id === userId)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }

  function computeSubmissionTrack(dataSources) {
    const hasReal = dataSources.includes(DATA_SOURCE_LABELS.official_real);
    const hasSim = dataSources.includes(DATA_SOURCE_LABELS.official_simulated);
    if (hasReal && hasSim) return "hybrid";
    if (hasReal) return "real-only";
    if (hasSim) return "sim-only";
    return "custom";
  }

  function getLeaderboardRows() {
    const rows = [];

    state.baselines.forEach((baseline) => {
      rows.push({
        kind: "baseline",
        id: baseline.id,
        model_name: baseline.model_name,
        username_display: baseline.username_display,
        affiliation: baseline.affiliation,
        track_label: trackLabel(baseline.track),
        data_regime: baseline.data_regime,
        success_rate: baseline.success_rate,
        action_steps: baseline.action_steps,
        real_time: baseline.real_time,
        rank_badge: "Official baseline",
        evaluation_id: "",
        notes: baseline.notes,
      });
    });

    state.evaluations
      .filter((evaluation) => evaluation.published)
      .forEach((evaluation) => {
        const submission = getSubmissionById(evaluation.submission_id);
        if (!submission || !submission.is_ranked) return;
        const user = getUserById(submission.owner_id);
        rows.push({
          kind: "submission",
          id: submission.id,
          model_name: submission.display_name,
          username_display: user ? user.username : "Participant",
          affiliation: user ? user.affiliation : "",
          track_label: submission.track_label || trackLabel(submission.track),
          data_regime: submission.data_sources.join(", "),
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
      ["benchmark", "Benchmark"],
      ["evaluation", "Evaluation"],
      ["leaderboard", "Leaderboard"],
    ];

    if (user) {
      links.push(["models", "My Models"]);
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
              <span>Participant access is issued with email and token.</span>
              <span>After signing in you can register models and submit evaluation requests.</span>
              <span>Public leaderboard entries and published result viewers remain visible without sign-in.</span>
            </div>
          </article>
        </div>
      </section>
    `;
  }

  function renderHome() {
    const topEntries = getLeaderboardRows().slice(0, 5);

    return `
      <section class="hero">
        <div class="shell hero-grid">
          <div class="hero-copy">
            <span class="eyebrow">NeurIPS 2026 Competition</span>
            <h1>Mastering real-world dexterity through synthesized manipulation skills.</h1>
            <p class="lead">
              RoboSynChallenge evaluates how well simulated and real-world co-training closes the
              Sim2Real gap for bimanual manipulation. Teams train however they want, but official ranking
              happens on held-out physical robot setups with standardized tasks and metrics.
            </p>
            <div class="cta-row">
              <a href="${routeHref("evaluation")}" class="button button-primary">Submit a policy</a>
              <a href="${routeHref("data")}" class="button button-secondary">Explore datasets</a>
              <a href="${routeHref("benchmark")}" class="button button-secondary">View benchmark</a>
              <a href="${PAPER_URL}" class="button button-ghost" target="_blank" rel="noreferrer">Read benchmark PDF</a>
            </div>
          </div>
          <div class="hero-visual">
            <div class="hero-panel hero-panel-tall">
              <div class="panel-label">Challenge pipeline</div>
              <img src="static/assets/robosynchallenge-pipeline.png" alt="RoboSynChallenge pipeline">
            </div>
            <div class="hero-panel hero-panel-short">
              <div class="panel-label">Real-world workstation</div>
              <img src="static/assets/realworld-env.png" alt="RoboSynChallenge real-world evaluation platform">
            </div>
          </div>
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

      <section class="section shell">
        <div class="section-heading">
          <span class="eyebrow">Overview</span>
          <h2>One benchmark, one interface, multiple routes to Sim2Real transfer.</h2>
        </div>
        <div class="split-grid">
          <article class="card card-soft">
            <h3>What the competition measures</h3>
            <p>
              Every official evaluation reports three outcomes: success rate, average action steps with a
              1000-step cap, and measured real time on the held-out robot platform. The goal is not only
              to finish tasks, but to do so efficiently and consistently under appearance, lighting, and
              clutter variation.
            </p>
          </article>
          <article class="card card-soft">
            <h3>What teams are allowed to use</h3>
            <p>
              Participants can train with the open Embodied_Challenge generation platform, the official
              simulated and real data releases, or additional private data if they disclose its source at
              submission time. The leaderboard keeps that provenance visible.
            </p>
          </article>
        </div>
      </section>

      <section class="section shell">
        <div class="section-heading">
          <span class="eyebrow">Platforms</span>
          <h2>Simulation scale on one side, standardized dual-arm validation on the other.</h2>
        </div>
        <div class="platform-grid">
          <article class="card platform-card">
            <div class="platform-meta">
              <span class="tag">Synthetic data generation</span>
              <h3>Embodied_Challenge simulation stack</h3>
              <p>
                Use the open-source simulation pipeline to synthesize large-scale state-action trials with
                domain randomization over lighting, objects, table properties, camera calibration, robot
                initialization, and distractors.
              </p>
              <a href="${SIMULATION_REPO_URL}" target="_blank" rel="noreferrer" class="button button-secondary">
                Open GitHub
              </a>
            </div>
            <img src="static/assets/robosynchallenge-pipeline.png" alt="Simulation pipeline figure">
          </article>
          <article class="card platform-card">
            <div class="platform-meta">
              <span class="tag">Physical benchmark</span>
              <h3>Dual AgileX PiPER-X evaluation platform</h3>
              <p>
                Final rankings come from standardized dual-arm workstations with multi-camera visual
                observations and proprioceptive feedback only. Entry, mid, and high-level tasks cover
                rigid objects, articulated objects, tools, and precision operations.
              </p>
              <a href="${PAPER_URL}" class="button button-secondary" target="_blank" rel="noreferrer">See platform details</a>
            </div>
            <img src="static/assets/realworld-env.png" alt="Real-world hardware platform">
          </article>
        </div>
      </section>

      <section class="section section-alt">
        <div class="shell">
          <div class="section-heading">
            <span class="eyebrow">Task spectrum</span>
            <h2>Ten official tasks, organized by contact complexity and planning depth.</h2>
          </div>
          <div class="task-grid">
            ${TASK_TIERS.map((tier) => `
              <article class="task-card tone-${escapeHtml(tier.tone)}">
                <div class="task-copy">
                  <span class="tag">${escapeHtml(tier.name)}</span>
                  <h3>${escapeHtml(tier.summary)}</h3>
                  <div class="task-list">
                    ${tier.tasks.map((task) => `<span>${escapeHtml(task)}</span>`).join("")}
                  </div>
                </div>
                <img src="${escapeHtml(tier.image)}" alt="${escapeHtml(tier.name)} tasks">
              </article>
            `).join("")}
          </div>
        </div>
      </section>

      <section class="section shell">
        <div class="section-heading">
          <span class="eyebrow">Evaluation protocol</span>
          <h2>Held-out robot testing emphasizes robustness, not leaderboard gaming.</h2>
        </div>
        <div class="three-up">
          <article class="card">
            <h3>Controlled real-world shifts</h3>
            <p>
              Official evaluations vary table textures, light positions, object identities, distractor
              density, and unseen object placements on a 3 × 3 grid.
            </p>
          </article>
          <article class="card">
            <h3>Unified submission schema</h3>
            <p>
              Teams declare input modalities, output action protocol, chunk sizes, gripper binarization
              threshold, and data provenance. Admins then schedule and publish results through the same site.
            </p>
          </article>
          <article class="card">
            <h3>Public result playback</h3>
            <p>
              Each published result can expose an episode-by-episode video viewer with an evaluation
              slider on top and an in-episode time slider below.
            </p>
          </article>
        </div>
      </section>

      <section class="section section-alt">
        <div class="shell">
          <div class="section-heading">
            <span class="eyebrow">Leaderboard preview</span>
            <h2>Baseline placeholders are already wired into the public ranking flow.</h2>
          </div>
          <div class="table-shell">
            <table class="leaderboard-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Model</th>
                  <th>User</th>
                  <th>Track</th>
                  <th>Success rate</th>
                  <th>Action steps</th>
                  <th>Real time</th>
                </tr>
              </thead>
              <tbody>
                ${topEntries.map((row, index) => `
                  <tr>
                    <td>#${index + 1}</td>
                    <td>
                      <div class="table-primary">
                        ${escapeHtml(row.model_name)}
                        ${row.evaluation_id ? `<a href="${routeHref(`results/${row.evaluation_id}`)}">View result</a>` : ""}
                      </div>
                    </td>
                    <td>${escapeHtml(row.username_display)}</td>
                    <td>${escapeHtml(row.track_label)}</td>
                    <td>${formatPercent(row.success_rate)}</td>
                    <td>${formatSteps(row.action_steps)}</td>
                    <td>${formatSeconds(row.real_time)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
          <div class="section-actions">
            <a href="${routeHref("benchmark")}" class="button button-secondary">Open benchmark tables</a>
            <a href="${routeHref("leaderboard")}" class="button button-primary">Open full leaderboard</a>
          </div>
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
              <p class="field-note">Bold values mark the best SR, lowest action steps, and lowest real time within each task column.</p>
              <div class="table-shell">
                <table class="leaderboard-table">
                  <thead>
                    <tr>
                      <th rowspan="2">Model</th>
                      ${block.tasks.map((task) => `<th colspan="3">${escapeHtml(task)}</th>`).join("")}
                    </tr>
                    <tr>
                      ${block.tasks.map(() => "<th>SR</th><th>Steps</th><th>Time</th>").join("")}
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
      <section class="page-hero shell">
        <span class="eyebrow">Data and generation</span>
        <h1>From teleoperated real trajectories to large-scale randomized simulation streams.</h1>
        <p class="lead narrow">
          RoboSynChallenge combines a smaller curated real set with a larger synthetic corpus generated
          using Embodied_Challenge. The site keeps both the data links and the collection protocol visible
          so participants can reason about what is official, what is additional, and what is still held out.
        </p>
        <div class="cta-row">
          <a href="${SIMULATION_REPO_URL}" target="_blank" rel="noreferrer" class="button button-primary">Simulation platform</a>
          ${DATASET_URL
            ? `<a href="${escapeHtml(DATASET_URL)}" target="_blank" rel="noreferrer" class="button button-secondary">${escapeHtml(DATASET_LABEL)}</a>`
            : `<span class="button button-disabled">Hugging Face release coming soon</span>`}
        </div>
      </section>

      <section class="section shell">
        <div class="split-grid">
          <article class="card">
            <span class="tag">Official real data</span>
            <h2>Teleoperation collection under five real-world conditions</h2>
            <p>
              Each task is recorded across five experimental conditions, then expanded with four position
              variations and three orientation settings for 60 samples per task. This gives physical
              correspondence for a limited but carefully structured slice of the challenge.
            </p>
            <div class="table-shell compact">
              <table class="leaderboard-table compact">
                <thead>
                  <tr>
                    <th>Background</th>
                    <th>Lighting</th>
                    <th>Additionals</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  ${REAL_COLLECTION_CONDITIONS.map((condition) => `
                    <tr>
                      <td>${escapeHtml(condition.background)}</td>
                      <td>${escapeHtml(condition.lighting)}</td>
                      <td>${escapeHtml(condition.additionals)}</td>
                      <td>${escapeHtml(condition.description)}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          </article>

          <article class="card">
            <span class="tag">Official simulated data</span>
            <h2>1000 randomized trials per task, generated procedurally</h2>
            <p>
              The synthetic corpus contains multi-modal interaction trajectories, RGB-D observations,
              proprioceptive signals, structured task annotations, contact events, and success outcomes.
              Its main job is to extend the diversity and scale that is too expensive to collect physically.
            </p>
            <img src="static/assets/robosynchallenge-pipeline.png" alt="Data generation pipeline">
          </article>
        </div>
      </section>

      <section class="section section-alt">
        <div class="shell">
          <div class="section-heading">
            <span class="eyebrow">Domain randomization</span>
            <h2>The simulation dataset intentionally perturbs appearance, geometry, sensing, and initial states.</h2>
          </div>
          <div class="three-up">
            ${SIM_RANDOMIZATION.map((block) => `
              <article class="card">
                <h3>${escapeHtml(block.title)}</h3>
                <div class="task-list">
                  ${block.items.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
                </div>
              </article>
            `).join("")}
          </div>
        </div>
      </section>

      <section class="section shell">
        <div class="section-heading">
          <span class="eyebrow">Release policy</span>
          <h2>Open training resources, confidential test settings, and a held-out real benchmark.</h2>
        </div>
        <div class="split-grid">
          <article class="card card-soft">
            <h3>What is released</h3>
            <p>
              We expose the simulation generator, baseline pipelines, preprocessing logic, sample
              trajectories, and the official dataset links. The public website is prepared to show both
              repository and Hugging Face entry points.
            </p>
          </article>
          <article class="card card-soft">
            <h3>What remains held out</h3>
            <p>
              Final evaluation stays confidential: teams do not see test labels or raw held-out episodes.
              Performance is measured directly on the standardized physical setup, reducing leakage risk and
              overfitting to a known validation split.
            </p>
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
            RoboSynChallenge now follows a token-based access model similar to RoboChallenge. Participants
            receive an email-and-token pair from the organizers, then use that token to sign in and manage
            model links and evaluation submissions.
          </p>
          <div class="task-list">
            <span><strong>Recommended email subject:</strong> RoboSynChallenge participant access request</span>
            <span><strong>Suggested details:</strong> full name, affiliation, email, team name, and intended use</span>
            <span><strong>Organizer action:</strong> an admin creates the account and issues an access token</span>
          </div>
          <div class="cta-row">
            <a href="mailto:neurips-robosyn@edem-ai.org?subject=RoboSynChallenge%20participant%20access%20request" class="button button-primary">Open email draft</a>
            <a href="${routeHref("login")}" class="button button-secondary">I already have a token</a>
          </div>
          <p class="auth-footnote">
            If you deploy this publicly, replace the email address above with your real organizer contact.
          </p>
        </article>
      </section>
    `;
  }

  function renderEvaluationPage() {
    const user = currentUser();
    if (!user) {
      return `
        <section class="page-hero shell">
          <span class="eyebrow">Submission portal</span>
          <h1>Declare your observation space, action protocol, and data provenance before robot testing.</h1>
          <p class="lead narrow">
            The evaluation interface is designed around your actual deployment contract: what observations
            your policy consumes, what actions it returns, how chunked execution works, and where the
            training data came from.
          </p>
        </section>
        <section class="section section-alt">
          <div class="shell auth-grid">
            <article class="auth-card">
              <span class="tag">Sign in required</span>
              <h2>Create an account to submit</h2>
              <p>
                Public users can browse pages and results, but evaluation scheduling is tied to issued
                participant accounts and access tokens.
              </p>
              <div class="cta-row">
                <a href="${routeHref("register")}" class="button button-primary">Request access</a>
                <a href="${routeHref("login")}" class="button button-secondary">Sign in</a>
              </div>
            </article>
            <article class="card">
              <span class="tag">Submission checklist</span>
              <div class="task-list">
                <span>Choose state and or image inputs</span>
                <span>Specify rotation format if using eef pose</span>
                <span>Provide full joints + gripper or full eef pose + gripper outputs</span>
                <span>Set output chunk size and execution chunk size</span>
                <span>Disclose whether you used official real and simulated data</span>
              </div>
            </article>
          </div>
        </section>
      `;
    }

    const availableModels = userModels(user.id);
    if (!availableModels.length) {
      return `
        <section class="page-hero shell">
          <span class="eyebrow">Submission portal</span>
          <h1>Declare your observation space, action protocol, and data provenance before robot testing.</h1>
          <p class="lead narrow">
            The evaluation interface is designed around your actual deployment contract: what observations
            your policy consumes, what actions it returns, how chunked execution works, and where the
            training data came from.
          </p>
        </section>
        <section class="section section-alt">
          <div class="shell auth-grid">
            <article class="auth-card">
              <span class="tag">Model registry required</span>
              <h2>Create a base model entry first</h2>
              <p>
                The evaluation workflow mirrors RoboChallenge-style model registration. Save a Hugging Face
                or GitHub-backed base model first, then return here to submit a run.
              </p>
              <div class="cta-row">
                <a href="${routeHref("models")}" class="button button-primary">Open My Models</a>
                <a href="${routeHref("leaderboard")}" class="button button-secondary">Browse leaderboard</a>
              </div>
            </article>
            <article class="card">
              <span class="tag">Submission checklist</span>
              <div class="task-list">
                <span>Register at least one base model link</span>
                <span>Choose state and or image inputs</span>
                <span>Provide full joints + gripper or full eef pose + gripper outputs</span>
                <span>Disclose whether you used official real and simulated data</span>
              </div>
            </article>
          </div>
        </section>
      `;
    }

    return `
      <section class="page-hero shell">
        <span class="eyebrow">Submission portal</span>
        <h1>Declare your observation space, action protocol, and data provenance before robot testing.</h1>
        <p class="lead narrow">
          The evaluation interface is designed around your actual deployment contract: what observations
          your policy consumes, what actions it returns, how chunked execution works, and where the
          training data came from.
        </p>
      </section>

      <section class="section shell">
        <div class="three-up">
          <article class="card">
            <h3>Metric bundle</h3>
            <p>Success rate, average action steps up to 1000, and measured real time.</p>
          </article>
          <article class="card">
            <h3>Submission artifact</h3>
            <p>Select a registered base model instead of uploading checkpoints directly to the website.</p>
          </article>
          <article class="card">
            <h3>Admin workflow</h3>
            <p>Admins schedule evaluations, upload result videos, and publish metrics to the public leaderboard.</p>
          </article>
        </div>
      </section>

      <section class="section shell">
        <form class="panel-stack" data-form="evaluation">
          <article class="card">
            <div class="section-heading left">
              <span class="eyebrow">Basic info</span>
              <h2>Policy identity</h2>
            </div>
            <div class="form-grid">
              <label class="field">
                <span>Base model</span>
                <select name="model_id" required>
                  <option value="">Select one of your registered base models</option>
                  ${availableModels.map((model) => `<option value="${escapeHtml(model.id)}">${escapeHtml(model.display_name)}</option>`).join("")}
                </select>
              </label>
              <label class="field field-span-2">
                <span>Experiment name</span>
                <input type="text" name="title" placeholder="Hybrid transfer ablation on official sim + real" required>
              </label>
              <label class="field field-span-2">
                <span>Short description</span>
                <textarea name="short_description" rows="4" placeholder="What the policy is, how it was trained, and why it should transfer well." required></textarea>
              </label>
              <label class="field field-span-2">
                <span>Technical notes</span>
                <textarea name="technical_notes" rows="4" placeholder="Runtime expectations, entrypoints, evaluation assumptions, or dependency constraints."></textarea>
              </label>
              <label class="choice-inline">
                <input type="checkbox" name="is_ranked" checked>
                <span>Count this run on the public leaderboard once published</span>
              </label>
            </div>
          </article>

          <article class="card">
            <div class="section-heading left">
              <span class="eyebrow">Data disclosure</span>
              <h2>Training data sources</h2>
            </div>
            <div class="checkbox-grid">
              ${Object.entries(DATA_SOURCE_LABELS).map(([key, label]) => `
                <label class="choice-card">
                  <input type="checkbox" name="data_source_${escapeHtml(key)}" id="data_source_${escapeHtml(key)}">
                  <span>${escapeHtml(label)}</span>
                </label>
              `).join("")}
            </div>
            <label class="field toggle-target is-hidden" data-toggle-target="data_source_other">
              <span>Describe additional data sources</span>
              <textarea name="other_data_source_text" rows="3" placeholder="Explain what additional real or simulated data you used."></textarea>
            </label>
          </article>

          <article class="card">
            <div class="section-heading left">
              <span class="eyebrow">Input schema</span>
              <h2>Observation modalities</h2>
            </div>
            <div class="form-columns">
              <div>
                <h3>State inputs</h3>
                <div class="checkbox-grid">
                  ${Object.entries(STATE_LABELS).map(([key, label]) => `
                    <label class="choice-card">
                      <input type="checkbox" name="input_state_${escapeHtml(key)}">
                      <span>${escapeHtml(label)}</span>
                    </label>
                  `).join("")}
                </div>
                <label class="field inline-field">
                  <span>EEF rotation representation</span>
                  <select name="input_rotation_format">
                    ${Object.entries(ROTATION_LABELS).map(([key, label]) => `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`).join("")}
                  </select>
                </label>
              </div>
              <div>
                <h3>Image inputs</h3>
                <div class="checkbox-grid">
                  ${Object.entries(IMAGE_LABELS).map(([key, label]) => `
                    <label class="choice-card">
                      <input type="checkbox" name="input_image_${escapeHtml(key)}">
                      <span>${escapeHtml(label)}</span>
                    </label>
                  `).join("")}
                </div>
              </div>
            </div>
          </article>

          <article class="card">
            <div class="section-heading left">
              <span class="eyebrow">Output schema</span>
              <h2>Action contract</h2>
            </div>
            <div class="output-matrix">
              <div class="output-header">Channel</div>
              <div class="output-header">Emit</div>
              <div class="output-header">Use delta</div>

              <div class="output-label">Joints</div>
              <label class="choice-inline"><input type="checkbox" name="output_joints"><span>enabled</span></label>
              <label class="choice-inline"><input type="checkbox" name="output_joints_delta"><span>delta</span></label>

              <div class="output-label">Gripper</div>
              <label class="choice-inline"><input type="checkbox" name="output_gripper"><span>enabled</span></label>
              <label class="choice-inline"><input type="checkbox" name="output_gripper_delta"><span>delta</span></label>

              <div class="output-label">EEF pose</div>
              <label class="choice-inline"><input type="checkbox" name="output_eef_pose"><span>enabled</span></label>
              <label class="choice-inline"><input type="checkbox" name="output_eef_pose_delta"><span>delta</span></label>
            </div>

            <div class="form-grid">
              <label class="field">
                <span>EEF action rotation representation</span>
                <select name="output_rotation_format">
                  ${Object.entries(ROTATION_LABELS).map(([key, label]) => `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`).join("")}
                </select>
              </label>
              <label class="field">
                <span>output_chunk_size</span>
                <input type="number" min="1" step="1" name="output_chunk_size" id="output_chunk_size" value="16">
              </label>
            </div>
            <p class="field-note">
              The action output must contain either a full joints + gripper bundle or a full eef pose +
              gripper bundle. Delta toggles are optional per enabled field.
            </p>
          </article>

          <article class="card">
            <div class="section-heading left">
              <span class="eyebrow">Execution protocol</span>
              <h2>Robot-side decoding</h2>
            </div>
            <div class="form-grid">
              <label class="field">
                <span>Gripper threshold</span>
                <input type="number" min="0" max="0.1" step="0.001" name="gripper_threshold" value="0.05">
              </label>
              <label class="field">
                <span>execution_chunk_size</span>
                <input type="number" min="1" step="1" name="execution_chunk_size" id="execution_chunk_size" value="8">
              </label>
            </div>
            <p class="field-note" data-execution-hint>
              execution_chunk_size must stay smaller than output_chunk_size.
            </p>
          </article>

          <div class="section-actions">
            <button type="submit" class="button button-primary">Submit for evaluation</button>
          </div>
        </form>
      </section>
    `;
  }

  function renderModelsPage() {
    const user = currentUser();
    if (!user) {
      return renderAuthGate(
        "Sign in to manage model links",
        "Model registration is tied to your participant identity.",
        { route: "login", label: "Sign in" },
        { route: "register", label: "Request access" }
      );
    }

    const models = userModels(user.id);
    return `
      <section class="page-hero shell">
        <span class="eyebrow">Model registry</span>
        <h1>Register the Hugging Face and GitHub links that identify your base models.</h1>
        <p class="lead narrow">
          Evaluation submissions now reference a saved base model instead of uploading checkpoints to the
          website. This keeps the platform light while preserving clear provenance for each run.
        </p>
      </section>

      <section class="section shell">
        <div class="split-grid">
          <article class="card">
            <div class="section-heading left">
              <span class="eyebrow">New model</span>
              <h2>Add a base model</h2>
            </div>
            <form class="panel-stack compact" data-form="create-model">
              <div class="form-grid">
                <label class="field">
                  <span>Base model name</span>
                  <input type="text" name="display_name" placeholder="pi0.5 hybrid transfer" required>
                </label>
                <label class="field">
                  <span>Checkpoint link</span>
                  <input type="url" name="checkpoint_link" placeholder="https://huggingface.co/your-org/model">
                </label>
                <label class="field field-span-2">
                  <span>Code link</span>
                  <input type="url" name="code_link" placeholder="https://github.com/your-org/your-repo">
                </label>
              </div>
              <button type="submit" class="button button-primary">Save model</button>
            </form>
          </article>

          <article class="card card-soft">
            <span class="tag">Expected usage</span>
            <div class="task-list">
              <span>Store weights on Hugging Face and source code on GitHub when possible.</span>
              <span>Each evaluation submission picks one registered base model.</span>
              <span>Admins can inspect these links without handling heavyweight uploads.</span>
            </div>
          </article>
        </div>
      </section>

      <section class="section shell">
        <div class="section-heading">
          <span class="eyebrow">Saved entries</span>
          <h2>${models.length} base model${models.length === 1 ? "" : "s"}</h2>
        </div>
        ${models.length
          ? `
            <div class="panel-stack">
              ${models.map((model) => `
                <article class="card">
                  <form class="panel-stack compact" data-form="edit-model">
                    <input type="hidden" name="model_id" value="${escapeHtml(model.id)}">
                    <div class="form-grid">
                      <label class="field">
                        <span>Base model name</span>
                        <input type="text" name="display_name" value="${escapeHtml(model.display_name)}" required>
                      </label>
                      <label class="field">
                        <span>Checkpoint link</span>
                        <input type="url" name="checkpoint_link" value="${escapeHtml(model.checkpoint_link || "")}">
                      </label>
                      <label class="field field-span-2">
                        <span>Code link</span>
                        <input type="url" name="code_link" value="${escapeHtml(model.code_link || "")}">
                      </label>
                    </div>
                    <div class="detail-list">
                      <span><strong>Updated:</strong> ${escapeHtml(formatDateTime(model.updated_at))}</span>
                      <span><strong>Checkpoint:</strong> ${escapeHtml(model.checkpoint_link || "Not provided")}</span>
                      <span><strong>Code:</strong> ${escapeHtml(model.code_link || "Not provided")}</span>
                    </div>
                    <div class="section-actions">
                      <button type="submit" class="button button-secondary">Save changes</button>
                      <button type="button" class="button button-danger" data-action="delete-model" data-model-id="${escapeHtml(model.id)}">Delete model</button>
                    </div>
                  </form>
                </article>
              `).join("")}
            </div>
          `
          : `
            <article class="card">
              <p>No base models saved yet. Add one above before creating an evaluation submission.</p>
            </article>
          `}
      </section>
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
        <h1>Track your evaluation requests, schedules, and published results.</h1>
        <p class="lead narrow">
          Each entry records the selected base model, declared modalities, data sources, admin schedule,
          and any published evaluation results.
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
              <a href="${routeHref("models")}" class="button button-secondary">Manage models</a>
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
                <th>Base model</th>
                <th>Experiment</th>
                <th>Track</th>
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
                        <span>${submission.code_link || submission.checkpoint_link ? "External links attached" : "No external link attached"}</span>
                      </div>
                    </td>
                    <td>
                      <div class="table-primary">
                        <a href="${routeHref(`submission/${submission.id}`)}">${escapeHtml(submission.title)}</a>
                        <span>${escapeHtml(submission.short_description.length > 88 ? `${submission.short_description.slice(0, 88)}...` : submission.short_description)}</span>
                      </div>
                    </td>
                    <td>${escapeHtml(submission.track_label)}</td>
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
              <span><strong>Track:</strong> ${escapeHtml(submission.track_label)}</span>
              <span><strong>Run type:</strong> ${escapeHtml(submission.ranking_label)}</span>
              <span><strong>Schedule:</strong> ${escapeHtml(formatDateTime(submission.evaluation_schedule_at))}</span>
              <span><strong>Published:</strong> ${submission.evaluation_published ? "Yes" : "No"}</span>
            </div>
          </article>
          <article class="card">
            <span class="tag">Protocol</span>
            <div class="detail-list">
              <span><strong>output_chunk_size:</strong> ${escapeHtml(submission.output_chunk_size)}</span>
              <span><strong>execution_chunk_size:</strong> ${escapeHtml(submission.execution_chunk_size)}</span>
              <span><strong>gripper_threshold:</strong> ${escapeHtml(submission.gripper_threshold)}</span>
              <span><strong>Input rot:</strong> ${escapeHtml(ROTATION_LABELS[submission.input_rotation_format] || "N/A")}</span>
              <span><strong>Output rot:</strong> ${escapeHtml(ROTATION_LABELS[submission.output_rotation_format] || "N/A")}</span>
            </div>
          </article>
        </div>
      </section>

      <section class="section shell">
        <div class="three-up">
          <article class="card">
            <h3>Data sources</h3>
            <div class="task-list">
              ${submission.data_sources.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
              ${submission.other_data_source_text ? `<span>${escapeHtml(submission.other_data_source_text)}</span>` : ""}
            </div>
          </article>
          <article class="card">
            <h3>Inputs</h3>
            <div class="task-list">
              ${submission.input_state.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
              ${submission.input_images.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
            </div>
          </article>
          <article class="card">
            <h3>Outputs</h3>
            <div class="task-list">
              ${submission.output_actions.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
            </div>
          </article>
        </div>
      </section>

      <section class="section shell">
        <div class="split-grid">
          <article class="card">
            <span class="tag">Model registry</span>
            <div class="detail-list">
              <span><strong>Base model:</strong> ${escapeHtml(submission.display_name)}</span>
              <span><strong>Checkpoint:</strong> ${escapeHtml(submission.checkpoint_link || "Not provided")}</span>
              <span><strong>Code:</strong> ${escapeHtml(submission.code_link || "Not provided")}</span>
            </div>
          </article>
          <article class="card">
            <span class="tag">Admin notes</span>
            <p>${escapeHtml(submission.admin_schedule_note || submission.evaluation_notes || "No admin notes yet.")}</p>
          </article>
        </div>
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
      <section class="page-hero shell">
        <span class="eyebrow">Public ranking</span>
        <h1>Success rate first, then action efficiency, then real-world time.</h1>
        <p class="lead narrow">
          The leaderboard is automatically refreshed from published evaluations. Baseline placeholders
          are seeded now so the interface is usable before the first public submissions arrive.
        </p>
      </section>

      <section class="section shell">
        <div class="top-grid">
          ${rows.slice(0, 3).map((row, index) => `
            <article class="card rank-card">
              <span class="tag">#${index + 1}</span>
              <h2>${escapeHtml(row.model_name)}</h2>
              <div class="detail-list">
                <span><strong>User:</strong> ${escapeHtml(row.username_display)}</span>
                <span><strong>Track:</strong> ${escapeHtml(row.track_label)}</span>
                <span><strong>Success rate:</strong> ${formatPercent(row.success_rate)}</span>
                <span><strong>Action steps:</strong> ${formatSteps(row.action_steps)}</span>
                <span><strong>Real time:</strong> ${formatSeconds(row.real_time)}</span>
              </div>
            </article>
          `).join("")}
        </div>
      </section>

      <section class="section shell">
        <div class="table-shell">
          <table class="leaderboard-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Model</th>
                <th>User</th>
                <th>Track</th>
                <th>Data regime</th>
                <th>Success rate</th>
                <th>Action steps</th>
                <th>Real time</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length
                ? rows.map((row, index) => `
                  <tr>
                    <td>#${index + 1}</td>
                    <td>
                      <div class="table-primary">
                        ${escapeHtml(row.model_name)}
                        ${row.evaluation_id ? `<a href="${routeHref(`results/${row.evaluation_id}`)}">View result</a>` : ""}
                      </div>
                    </td>
                    <td>${escapeHtml(row.username_display)}</td>
                    <td>${escapeHtml(row.track_label)}</td>
                    <td>${escapeHtml(row.data_regime)}</td>
                    <td>${formatPercent(row.success_rate)}</td>
                    <td>${formatSteps(row.action_steps)}</td>
                    <td>${formatSeconds(row.real_time)}</td>
                    <td>${escapeHtml(row.rank_badge)}</td>
                  </tr>
                `).join("")
                : `<tr><td colspan="9">No published results yet.</td></tr>`}
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
            <span>Real time</span>
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
            <span class="tag">${escapeHtml(evaluation.track_label || "Published result")}</span>
            <h2 data-current-task>${escapeHtml(firstEpisode ? firstEpisode.task_name : "Episode pending")}</h2>
            <div class="detail-list">
              <span><strong>Source:</strong> ${escapeHtml(evaluation.source_kind || "submission")}</span>
              <span><strong>Status:</strong> ${escapeHtml(humanStatus(evaluation.status))}</span>
              <span><strong>Scheduled:</strong> ${escapeHtml(formatDateTime(evaluation.schedule_at))}</span>
              <span><strong>Published:</strong> ${escapeHtml(formatDateTime(evaluation.published_at))}</span>
            </div>
            <p data-episode-notes>${escapeHtml(firstEpisode ? firstEpisode.notes || "No episode notes uploaded." : "No episodes uploaded yet.")}</p>
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
          This console is the operational layer of the competition site. It stays light by issuing account
          tokens, referencing external model links, and exposing public leaderboard data as JSON.
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
                  <span>Track</span>
                  <select name="track">
                    ${Object.entries(TRACK_LABELS).map(([key, label]) => `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`).join("")}
                  </select>
                </label>
                <label class="field">
                  <span>Data regime label</span>
                  <input type="text" name="data_regime" placeholder="Official sim + real" required>
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
                  <span>Real time</span>
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
                <th>Base model</th>
                <th>Experiment</th>
                <th>User</th>
                <th>Run type</th>
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
                    <td>${escapeHtml(submission.ranking_label)}</td>
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
              <span><strong>Base model:</strong> ${escapeHtml(submission.display_name)}</span>
              <span><strong>Checkpoint:</strong> ${escapeHtml(submission.checkpoint_link || "Not provided")}</span>
              <span><strong>Code:</strong> ${escapeHtml(submission.code_link || "Not provided")}</span>
            </div>
          </article>

          <article class="card">
            <div class="section-heading left">
              <span class="eyebrow">Declared protocol</span>
              <h2>${escapeHtml(submission.track_label)}</h2>
            </div>
            <div class="detail-list">
              <span><strong>Experiment:</strong> ${escapeHtml(submission.title)}</span>
              <span><strong>Run type:</strong> ${escapeHtml(submission.ranking_label)}</span>
              <span><strong>Inputs:</strong> ${escapeHtml([...submission.input_state, ...submission.input_images].join(", "))}</span>
              <span><strong>Outputs:</strong> ${escapeHtml(submission.output_actions.join(", "))}</span>
              <span><strong>Data sources:</strong> ${escapeHtml(submission.data_sources.join(", "))}</span>
              <span><strong>Chunking:</strong> ${escapeHtml(`${submission.execution_chunk_size} / ${submission.output_chunk_size}`)}</span>
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
                  <span>Real time</span>
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
    if (route === "benchmark") return { name: "benchmark" };
    if (route === "login") return { name: "login" };
    if (route === "register") return { name: "register" };
    if (route === "evaluation") return { name: "evaluation" };
    if (route === "models") return { name: "models" };
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
      case "benchmark":
        renderSection(renderBenchmarkPage(), "Benchmark");
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
      case "models":
        renderSection(renderModelsPage(), "My Models");
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

  function initEvalHelpers() {
    const evalForm = appEl.querySelector('[data-form="evaluation"]');
    if (!evalForm) return;

    const otherToggle = evalForm.querySelector("#data_source_other");
    const otherTarget = evalForm.querySelector('[data-toggle-target="data_source_other"]');
    const outputChunk = evalForm.querySelector("#output_chunk_size");
    const executionChunk = evalForm.querySelector("#execution_chunk_size");
    const executionHint = evalForm.querySelector("[data-execution-hint]");

    const syncOtherSource = () => {
      if (!otherToggle || !otherTarget) return;
      otherTarget.classList.toggle("is-hidden", !otherToggle.checked);
    };

    const syncChunkHint = () => {
      if (!outputChunk || !executionChunk || !executionHint) return;
      const outputValue = Number(outputChunk.value || 0);
      const executionValue = Number(executionChunk.value || 0);
      const valid = outputValue > 0 && executionValue > 0 && executionValue < outputValue;
      executionHint.classList.toggle("is-error", !valid);
      executionHint.textContent = valid
        ? `execution_chunk_size ${executionValue} is valid for output_chunk_size ${outputValue}.`
        : "execution_chunk_size must stay strictly smaller than output_chunk_size.";
      executionChunk.max = outputValue > 0 ? String(outputValue - 1) : "";
    };

    syncOtherSource();
    syncChunkHint();

    otherToggle?.addEventListener("change", syncOtherSource);
    outputChunk?.addEventListener("input", syncChunkHint);
    executionChunk?.addEventListener("input", syncChunkHint);
  }

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
    const episodeNotes = appEl.querySelector("[data-episode-notes]");

    if (!episodes.length || !video || !episodeSlider || !timeSlider || !emptyState) return;

    const syncTimeFromVideo = () => {
      timeSlider.value = String(video.currentTime || 0);
      timeReadout.textContent = formatSeconds(video.currentTime || 0);
    };

    const loadEpisode = (index) => {
      const episode = episodes[index] || episodes[0];
      if (!episode) return;
      if (title) title.textContent = `Episode ${episode.episode_index}: ${episode.task_name}`;
      if (currentTask) currentTask.textContent = episode.task_name;
      if (episodeNotes) episodeNotes.textContent = episode.notes || "No episode notes uploaded.";
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

  function readCheckedValues(formData, prefix, labelMap) {
    return Object.entries(labelMap)
      .filter(([key]) => formData.has(`${prefix}${key}`))
      .map(([, label]) => label);
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
    navigate("models");
  }

  function handleCreateModel(form) {
    const user = currentUser();
    if (!user) {
      pushFlash("error", "Sign in to save a model.");
      return;
    }
    const formData = new FormData(form);
    const displayName = String(formData.get("display_name") || "").trim();
    const checkpointLink = String(formData.get("checkpoint_link") || "").trim();
    const codeLink = String(formData.get("code_link") || "").trim();
    if (!displayName) {
      pushFlash("error", "Base model name is required.");
      return;
    }

    state.models.unshift({
      id: uid("model"),
      owner_id: user.id,
      display_name: displayName,
      checkpoint_link: checkpointLink,
      code_link: codeLink,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
    saveState();
    pushFlash("success", `Saved base model ${displayName}.`);
    render();
  }

  function handleEditModel(form) {
    const user = currentUser();
    if (!user) return;
    const formData = new FormData(form);
    const modelId = String(formData.get("model_id") || "");
    const model = getModelById(modelId);
    if (!model || (model.owner_id !== user.id && model.ownerId !== user.id)) {
      pushFlash("error", "Model not found.");
      return;
    }

    model.display_name = String(formData.get("display_name") || "").trim();
    model.checkpoint_link = String(formData.get("checkpoint_link") || "").trim();
    model.code_link = String(formData.get("code_link") || "").trim();
    model.updated_at = nowIso();
    saveState();
    pushFlash("success", `Updated base model ${model.display_name}.`);
    render();
  }

  function handleDeleteModel(modelId) {
    const user = currentUser();
    if (!user) return;
    const model = getModelById(modelId);
    if (!model || (model.owner_id !== user.id && model.ownerId !== user.id)) {
      pushFlash("error", "Model not found.");
      return;
    }
    const hasSubmissions = state.submissions.some((submission) => submission.model_id === modelId);
    if (hasSubmissions) {
      pushFlash("error", "This model is already referenced by a submission and cannot be deleted.");
      return;
    }
    state.models = state.models.filter((item) => item.id !== modelId);
    saveState();
    pushFlash("success", `Deleted base model ${model.display_name}.`);
    render();
  }

  function handleEvaluationSubmit(form) {
    const user = currentUser();
    if (!user) {
      pushFlash("error", "Sign in before submitting.");
      return;
    }

    const formData = new FormData(form);
    const modelId = String(formData.get("model_id") || "");
    const model = getModelById(modelId);
    if (!model) {
      pushFlash("error", "Select a registered base model.");
      return;
    }

    const title = String(formData.get("title") || "").trim();
    const shortDescription = String(formData.get("short_description") || "").trim();
    const technicalNotes = String(formData.get("technical_notes") || "").trim();
    const dataSources = readCheckedValues(formData, "data_source_", DATA_SOURCE_LABELS);
    const otherDataSourceText = String(formData.get("other_data_source_text") || "").trim();
    const inputState = readCheckedValues(formData, "input_state_", STATE_LABELS);
    const inputImages = readCheckedValues(formData, "input_image_", IMAGE_LABELS);
    const inputRotationFormat = String(formData.get("input_rotation_format") || "rot6d");
    const outputRotationFormat = String(formData.get("output_rotation_format") || "rot6d");
    const outputChunkSize = Number(formData.get("output_chunk_size") || 0);
    const executionChunkSize = Number(formData.get("execution_chunk_size") || 0);
    const gripperThreshold = Number(formData.get("gripper_threshold") || 0);
    const isRanked = formData.has("is_ranked");

    const outputJoints = formData.has("output_joints");
    const outputGripper = formData.has("output_gripper");
    const outputEefPose = formData.has("output_eef_pose");
    const outputActions = [];
    if (outputJoints) outputActions.push(formData.has("output_joints_delta") ? "Joints delta" : "Joints");
    if (outputGripper) outputActions.push(formData.has("output_gripper_delta") ? "Gripper delta" : "Gripper");
    if (outputEefPose) outputActions.push(formData.has("output_eef_pose_delta") ? "EEF pose delta" : "EEF pose");

    if (!title || !shortDescription) {
      pushFlash("error", "Experiment name and short description are required.");
      return;
    }
    if (!dataSources.length) {
      pushFlash("error", "Choose at least one training data source.");
      return;
    }
    if (dataSources.includes(DATA_SOURCE_LABELS.other) && !otherDataSourceText) {
      pushFlash("error", "Describe the additional data sources when selecting 'Other data sources'.");
      return;
    }
    if (!inputState.length && !inputImages.length) {
      pushFlash("error", "Choose at least one input modality.");
      return;
    }
    if (!(outputJoints && outputGripper) && !(outputEefPose && outputGripper)) {
      pushFlash("error", "Outputs must include full joints + gripper or full eef pose + gripper.");
      return;
    }
    if (!(outputChunkSize > 0 && executionChunkSize > 0 && executionChunkSize < outputChunkSize)) {
      pushFlash("error", "execution_chunk_size must stay strictly smaller than output_chunk_size.");
      return;
    }
    if (gripperThreshold < 0 || gripperThreshold > 0.1) {
      pushFlash("error", "Gripper threshold must stay between 0 and 0.1.");
      return;
    }

    const submissionId = uid("submission");
    const evaluationId = uid("evaluation");
    const track = computeSubmissionTrack(dataSources);
    const submission = {
      id: submissionId,
      owner_id: user.id,
      model_id: model.id,
      display_name: model.display_name,
      checkpoint_link: model.checkpoint_link,
      code_link: model.code_link,
      title,
      short_description: shortDescription,
      technical_notes: technicalNotes,
      is_ranked: isRanked,
      data_sources: dataSources,
      other_data_source_text: otherDataSourceText,
      input_state: inputState,
      input_images: inputImages,
      input_rotation_format: inputRotationFormat,
      output_actions: outputActions,
      output_rotation_format: outputRotationFormat,
      output_chunk_size: outputChunkSize,
      execution_chunk_size: executionChunkSize,
      gripper_threshold: gripperThreshold,
      track,
      track_label: trackLabel(track),
      ranking_label: rankingLabel(isRanked),
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
      display_name: `${model.display_name} | ${title}`,
      short_description: shortDescription,
      status: "submitted",
      source_kind: "submission",
      track_label: trackLabel(track),
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
    pushFlash("success", "Submission recorded. An administrator can now schedule and publish it.");
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
    const track = String(formData.get("track") || "custom");
    const dataRegime = String(formData.get("data_regime") || "").trim();
    const successRate = Number(formData.get("success_rate") || 0);
    const actionSteps = Number(formData.get("action_steps") || 0);
    const realTime = Number(formData.get("real_time") || 0);
    const notes = String(formData.get("notes") || "").trim();
    if (!modelName || !usernameDisplay || !dataRegime) {
      pushFlash("error", "Model name, display user, and data regime are required.");
      return;
    }
    state.baselines.unshift({
      id: uid("baseline"),
      model_name: modelName,
      username_display: usernameDisplay,
      affiliation,
      track,
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

    const status = String(formData.get("status") || "submitted");
    const scheduleAt = String(formData.get("schedule_at") || "").trim();
    const successRateRaw = String(formData.get("success_rate") || "").trim();
    const actionStepsRaw = String(formData.get("action_steps") || "").trim();
    const realTimeRaw = String(formData.get("real_time") || "").trim();
    const published = formData.has("published");
    const notes = String(formData.get("notes") || "").trim();
    const adminScheduleNote = String(formData.get("admin_schedule_note") || "").trim();

    evaluation.status = status;
    evaluation.schedule_at = scheduleAt ? new Date(scheduleAt).toISOString() : "";
    evaluation.success_rate = successRateRaw ? Number(successRateRaw) : null;
    evaluation.action_steps = actionStepsRaw ? Number(actionStepsRaw) : null;
    evaluation.real_time = realTimeRaw ? Number(realTimeRaw) : null;
    evaluation.notes = notes;
    evaluation.published = published;
    evaluation.track_label = submission.track_label;
    if (published && !evaluation.published_at) evaluation.published_at = nowIso();
    if (!published) evaluation.published_at = "";

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

      if (action === "logout") {
        event.preventDefault();
        logoutUser();
      } else if (action === "delete-model") {
        event.preventDefault();
        handleDeleteModel(target.getAttribute("data-model-id") || "");
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
      else if (kind === "create-model") handleCreateModel(form);
      else if (kind === "edit-model") handleEditModel(form);
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
