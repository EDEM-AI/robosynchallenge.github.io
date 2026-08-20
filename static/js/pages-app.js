(() => {
  "use strict";

  const SESSION_STORAGE_KEY = "robosynchallenge-session-v1";
  const ACCESS_REQUEST_STORAGE_KEY = "robosynchallenge-access-request-id-v1";
  const CONFIG = window.ROBO_SYN_CONFIG || {};
  const API_BASE_URL = String(CONFIG.API_BASE_URL || "").trim().replace(/\/+$/, "");
  const CONTACT_EMAIL = String(CONFIG.CONTACT_EMAIL || "robosynchallenge@gmail.com").trim();
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
    { file: "table_rearrangement.mp4", label: "Table rearrangement" },
    { file: "click_bell.mp4", label: "Click bell" },
    { file: "water_pouring.mp4", label: "Water pouring" },
    { file: "handle_basket.mp4", label: "Handle basket" },
    { file: "items_handover.mp4", label: "Items handover" },
    { file: "drawer_open_place.mp4", label: "Drawer open place" },
    { file: "mixer_operating.mp4", label: "Mixer operating" },
    { file: "item_assembly.mp4", label: "Item assembly" },
    { file: "manipulate_pipette.mp4", label: "Manipulate pipette" },
    { file: "sample_loading.mp4", label: "Sample loading" },
  ];

  const LEADERBOARD_TASKS = [
    { id: "table_rearrangement", label: "Table rearrangement", aliases: ["table rearrangement"] },
    { id: "click_bell", label: "Click bell", aliases: ["click bell", "click-bell"] },
    { id: "water_pouring", label: "Water pouring", aliases: ["water pouring", "dual arm water pouring", "dual-arm water pouring"] },
    { id: "handle_basket", label: "Handle basket", aliases: ["handle basket", "basket pick and place", "basket pick-and-place"] },
    { id: "items_handover", label: "Items handover", aliases: ["items handover", "items hand-over", "items hand over and place", "items hand-over and place"] },
    { id: "drawer_open_place", label: "Drawer open place", aliases: ["drawer open place", "drawer open and place", "drawer open-and-place"] },
    { id: "mixer_operating", label: "Mixer operating", aliases: ["mixer operating"] },
    { id: "item_assembly", label: "Item assembly", aliases: ["item assembly"] },
    { id: "manipulate_pipette", label: "Manipulate pipette", aliases: ["manipulate pipette"] },
    { id: "sample_loading", label: "Sample loading", aliases: ["sample loading"] },
  ];

  const LEADERBOARD_VIEWS = [
    { id: "overall", label: "Average" },
    ...LEADERBOARD_TASKS,
  ];

  const REAL_EVALUATION_VIDEO_ASSETS = [
    { file: "cobotmagic_Real_table_rearrangement.mp4", label: "Table rearrangement" },
    { file: "cobotmagic_Real_click_bell.mp4", label: "Click bell" },
    { file: "cobotmagic_Real_water_pouring.mp4", label: "Water pouring" },
    { file: "cobotmagic_Real_handle_basket.mp4", label: "Handle basket" },
    { file: "cobotmagic_Real_items_handover.mp4", label: "Items handover" },
    { file: "cobotmagic_Real_drawer_open_place.mp4", label: "Drawer open place" },
    { file: "cobotmagic_Real_mixer_operating.mp4", label: "Mixer operating" },
    { file: "cobotmagic_Real_item_assembly.mp4", label: "Item assembly" },
    { file: "cobotmagic_Real_manipulate_pipette.mp4", label: "Manipulate pipette" },
    { file: "cobotmagic_Real_sample_loading.mp4", label: "Sample loading" },
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

  const FAQ_ITEMS = [
    {
      question: "How is the leaderboard ranked?",
      answer: `
        <p>The overall score is:</p>
        <div class="faq-formula" role="note">
          Overall Score = 75% Success Rate + 20% Action Efficiency + 5% Inference Efficiency
        </div>
        <p>Success Rate is the percentage of successful official episodes. Action Efficiency is calculated for every episode as:</p>
        <div class="faq-formula" role="note">Episode Action Efficiency = (1 − Used Action Steps / H) × 100</div>
        <p><em>H</em> is the maximum number of steps for that task. Inference Efficiency is measured on a single NVIDIA RTX 5090 and calculated as:</p>
        <div class="faq-formula" role="note">Episode Inference Efficiency = max(0, 1 − Measured Inference Time / T) × 100</div>
        <p><em>T</em> is the time required by the published ACT baseline to infer the corresponding number of action steps for that task, using the official standard code on the standardized NVIDIA RTX 5090 platform.</p>
      `,
    },
    {
      question: "Is ranking based mainly on Success Rate, and is the official evaluation identical to the public code?",
      answer: `
        <p>Success Rate has the largest weight at 75%. The official evaluation uses private hold-out test parameters that are not published. They differ from the public parameters but follow a similar in-distribution setting. Please do not overfit the public test parameters.</p>
      `,
    },
    {
      question: "Are action steps and inference time calculated only from successful episodes?",
      answer: `
        <p>No. Both are averaged over all episodes. A failed episode is assigned the maximum number of steps for that task. Its Action Efficiency is therefore zero. Inference time includes all policy calls in all episodes.</p>
      `,
    },
    {
      question: "Can participants use depth data, camera intrinsics, or point clouds as model inputs?",
      answer: `
        <p>No. Official evaluation provides RGB images only, without depth data, camera intrinsics, or point clouds. Participants may estimate depth or 3D information from a single RGB image using their own models.</p>
      `,
    },
    {
      question: "Do the organizers provide tools for generating depth data?",
      answer: `
        <p>Yes. We provide data-collection examples and scripts for generating simulated training data with depth information. This data may be used for training, but official evaluation remains RGB-only.</p>
      `,
    },
    {
      question: "Does the code repository need to be public for policy evaluation?",
      answer: `
        <p>No. The GitHub repository can remain private. Please invite our official GitHub account, <a href="https://github.com/EDEM-AI" target="_blank" rel="noreferrer">EDEM-AI</a>, as a collaborator and make sure the organizers have access to the repository for evaluation.</p>
      `,
    },
    {
      question: "How many times may a team submit, and what is the deadline?",
      answer: `
        <p>Teams may submit multiple times before <strong>October 11, 2026, Anywhere on Earth (AoE, UTC−12)</strong>. We will evaluate each team only once, using its latest valid submission received before the deadline.</p>
      `,
    },
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

  let state = loadSessionState();
  const remoteState = {
    submissionsLoaded: false,
    submissionsLoading: false,
    submissionsError: "",
    leaderboardLoaded: false,
    leaderboardLoading: false,
    leaderboardError: "",
  };
  let flashes = [];
  let flashTimer = null;
  let viewerCleanup = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function normalizeFullNameList(value) {
    const text = String(value || "").trim();
    if (!text) throw new Error("Full name is required.");
    if (/[，；;]/.test(text)) {
      throw new Error('Use English commas "," to separate team member names.');
    }
    const names = text.split(",").map((item) => item.trim().replace(/\s+/g, " "));
    if (names.some((name) => !name)) {
      throw new Error("Full name cannot contain empty comma-separated entries.");
    }
    if (names.length > 5) {
      throw new Error("Full name can list at most 5 team members.");
    }
    if (names.some((name) => name.length > 120)) {
      throw new Error("Each team member name must be 120 characters or fewer.");
    }
    return names.join(", ");
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

  function accessRequestId() {
    try {
      const existing = window.sessionStorage.getItem(ACCESS_REQUEST_STORAGE_KEY);
      if (existing) return existing;
      const generated = `RSC-REQ-2026-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      window.sessionStorage.setItem(ACCESS_REQUEST_STORAGE_KEY, generated);
      return generated;
    } catch {
      return `RSC-REQ-2026-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    }
  }

  function currentRoute() {
    const cleaned = window.location.hash.replace(/^#\/?/, "").replace(/^\/+/, "");
    return cleaned || "home";
  }

  function navigate(route) {
    window.location.hash = routeHref(route);
  }

  function pushFlash(category, message) {
    flashes = [{ category, message }];
    renderFlashes(false);
    if (flashTimer) window.clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => {
      flashes = [];
      renderFlashes(false);
      flashTimer = null;
    }, 6000);
  }

  function renderFlashes(consume = true) {
    if (!flashZone) return;
    flashZone.innerHTML = flashes
      .map((item) => `<div class="flash flash-${escapeHtml(item.category)}">${escapeHtml(item.message)}</div>`)
      .join("");
    if (consume) {
      flashes = [];
      if (flashTimer) window.clearTimeout(flashTimer);
      flashTimer = null;
    }
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
    if (value === "" || value == null || !Number.isFinite(Number(value))) return "--";
    const seconds = Number(value);
    return `${seconds.toFixed(1)}s`;
  }

  function formatInferenceMilliseconds(value) {
    if (value === "" || value == null || !Number.isFinite(Number(value))) return "--";
    const milliseconds = Number(value) * 1000;
    return `${milliseconds >= 100 ? Math.round(milliseconds) : milliseconds.toFixed(1)} ms`;
  }

  function formatPercent(value) {
    return `${Number(value || 0).toFixed(1)}%`;
  }

  function formatSteps(value) {
    if (value === "" || value == null || !Number.isFinite(Number(value))) return "--";
    return `${Math.round(Number(value))}`;
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

  function normalizeTaskKey(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) return "";
    const compact = raw
      .replace(/&/g, " and ")
      .replace(/[_-]+/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const underscored = compact.replace(/\s+/g, "_");
    const exact = LEADERBOARD_TASKS.find((task) => task.id === underscored);
    if (exact) return exact.id;
    const fuzzy = LEADERBOARD_TASKS.find((task) => {
      const labels = [task.label, ...(task.aliases || [])].map((label) => normalizeTaskKeyLoose(label));
      return labels.some((label) => compact === label || compact.includes(label));
    });
    return fuzzy ? fuzzy.id : "";
  }

  function normalizeTaskKeyLoose(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[_-]+/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function leaderboardViewById(viewId) {
    return LEADERBOARD_VIEWS.find((view) => view.id === viewId) || LEADERBOARD_VIEWS[0];
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

  function truthy(value) {
    return value === true || ["true", "1", "yes"].includes(String(value || "").toLowerCase());
  }

  function renderEvaluationVideoWall(videos = EVALUATION_VIDEO_ASSETS, basePath = "static/assets/evaluation-videos", ariaLabel = "Simulation evaluation task videos") {
    const rows = [
      videos.slice(0, 4),
      videos.slice(4, 7),
      videos.slice(7),
    ];
    return `
      <div class="evaluation-video-wall" aria-label="${escapeHtml(ariaLabel)}">
        ${rows.map((row) => `
          <div class="evaluation-video-row evaluation-video-row-${row.length}">
            ${row.map((video) => `
              <video muted loop autoplay playsinline preload="metadata" aria-label="${escapeHtml(video.label)}">
                <source src="${escapeHtml(basePath)}/${escapeHtml(video.file)}" type="video/mp4">
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
    return state.user || null;
  }

  function getUserById(userId) {
    const user = currentUser();
    if (user && (user.id === userId || user.email === userId)) return user;
    return null;
  }

  function getSubmissionById(submissionId) {
    return state.submissions.find((submission) => submission.id === submissionId) || null;
  }

  function getEvaluationById(evaluationId) {
    const direct = state.evaluations.find((evaluation) => evaluation.id === evaluationId);
    if (direct) return direct;
    const row = state.leaderboardRows.find((item) => item.evaluation_id === evaluationId || item.id === evaluationId);
    if (row) {
      return normalizeEvaluation({
        id: row.evaluation_id || row.id,
        display_name: row.model_name,
        short_description: row.notes,
        evaluation_stage: row.evaluation_stage,
        status: "published",
        published: true,
        success_rate: row.success_rate,
        action_steps: row.action_steps,
        real_time: row.real_time,
        notes: row.notes,
        episodes: row.episodes,
      });
    }
    return BASELINE_RESULT_BY_ID.get(evaluationId) || null;
  }

  function backendConfigured() {
    return Boolean(API_BASE_URL);
  }

  function normalizeUser(user) {
    if (!user) return null;
    const email = String(user.email || "").trim().toLowerCase();
    return {
      id: String(user.id || user.user_id || email || "participant"),
      username: String(user.username || user.team_name || email.split("@")[0] || "Participant"),
      email,
      team_name: String(user.team_name || user.username || ""),
      affiliation: String(user.affiliation || ""),
      bio: String(user.bio || user.intended_use || ""),
      role: String(user.role || "participant"),
      token_hint: String(user.token_hint || user.access_token_hint || ""),
    };
  }

  function normalizeSubmission(submission) {
    if (!submission) return null;
    const id = String(submission.id || submission.submission_id || "");
    const evaluationId = String(submission.evaluation_id || submission.evaluationId || "");
    const isRanked = truthy(submission.is_ranked) || truthy(submission.ranked);
    return {
      id,
      owner_id: String(submission.owner_id || submission.email || state.user?.id || ""),
      display_name: String(submission.display_name || submission.artifact_name || submission.title || "Policy artifact"),
      artifact_name: String(submission.artifact_name || submission.display_name || ""),
      checkpoint_link: String(submission.checkpoint_link || ""),
      code_link: String(submission.code_link || ""),
      title: String(submission.title || submission.experiment_name || submission.display_name || "Submitted policy"),
      short_description: String(submission.short_description || submission.description || ""),
      technical_notes: String(submission.technical_notes || ""),
      data_source_text: String(submission.data_source_text || submission.data_regime || ""),
      is_ranked: isRanked,
      ranking_label: submission.ranking_label || rankingLabel(isRanked),
      evaluation_stage: String(submission.evaluation_stage || ""),
      stage_label: stageLabel(submission.evaluation_stage || ""),
      status: String(submission.status || "submitted"),
      admin_schedule_note: String(submission.admin_schedule_note || ""),
      evaluation_id: evaluationId,
      evaluation_schedule_at: String(submission.evaluation_schedule_at || submission.schedule_at || ""),
      evaluation_published: truthy(submission.evaluation_published) || truthy(submission.published),
      evaluation_notes: String(submission.evaluation_notes || submission.notes || ""),
      created_at: String(submission.created_at || submission.createdAt || nowIso()),
    };
  }

  function normalizeEvaluation(evaluation) {
    if (!evaluation) return null;
    const evaluationStage = String(evaluation.evaluation_stage || "");
    return {
      id: String(evaluation.id || evaluation.evaluation_id || ""),
      submission_id: String(evaluation.submission_id || ""),
      display_name: String(evaluation.display_name || evaluation.model_name || "Published evaluation"),
      short_description: String(evaluation.short_description || evaluation.notes || ""),
      status: String(evaluation.status || "submitted"),
      source_kind: String(evaluation.source_kind || "submission"),
      evaluation_stage: evaluationStage,
      stage_label: stageLabel(evaluationStage),
      schedule_at: String(evaluation.schedule_at || ""),
      published: truthy(evaluation.published),
      published_at: String(evaluation.published_at || ""),
      success_rate: evaluation.success_rate === "" || evaluation.success_rate == null ? null : Number(evaluation.success_rate),
      action_steps: evaluation.action_steps === "" || evaluation.action_steps == null ? null : Number(evaluation.action_steps),
      real_time: evaluation.real_time === "" || evaluation.real_time == null ? null : Number(evaluation.real_time),
      notes: String(evaluation.notes || ""),
      leaderboard_notes: String(evaluation.leaderboard_notes || ""),
      episodes: Array.isArray(evaluation.episodes) ? evaluation.episodes : [],
    };
  }

  function normalizeLeaderboardRow(row) {
    if (!row) return null;
    const evaluationStage = String(row.evaluation_stage || "");
    const actionSteps = row.action_steps === "" || row.action_steps == null ? null : Number(row.action_steps);
    const realTime = row.real_time === "" || row.real_time == null ? null : Number(row.real_time);
    const hasEvaluationId = Object.prototype.hasOwnProperty.call(row, "evaluation_id");
    const taskId = normalizeTaskKey(row.task_id || row.task_key || row.task_name || row.data_regime || row.notes);
    return {
      kind: String(row.kind || "submission"),
      id: String(row.id || row.submission_id || row.evaluation_id || ""),
      model_name: String(row.model_name || row.display_name || row.artifact_name || "Policy artifact"),
      username_display: String(row.username_display || row.team_name || row.email || "Participant"),
      affiliation: String(row.affiliation || ""),
      task_id: taskId,
      task_name: String(row.task_name || (taskId ? leaderboardViewById(taskId).label : "")),
      stage_label: row.stage_label || stageLabel(evaluationStage),
      evaluation_stage: evaluationStage,
      data_regime: String(row.data_regime || row.data_source_text || ""),
      success_rate: Number(row.success_rate || 0),
      action_steps: Number.isFinite(actionSteps) ? actionSteps : null,
      real_time: Number.isFinite(realTime) ? realTime : null,
      rank_badge: String(row.rank_badge || "Participant ranked"),
      evaluation_id: hasEvaluationId ? String(row.evaluation_id || "") : String(row.id || ""),
      result_url: String(row.result_url || ""),
      protocol_url: String(row.protocol_url || ""),
      inference_time_ms: row.inference_time_ms === "" || row.inference_time_ms == null ? null : Number(row.inference_time_ms),
      notes: String(row.notes || row.leaderboard_notes || ""),
      episodes: Array.isArray(row.episodes) ? row.episodes : [],
    };
  }

  function loadSessionState() {
    try {
      const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return freshClientState();
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 1) return freshClientState();
      if (parsed.session?.expires_at && new Date(parsed.session.expires_at).getTime() <= Date.now()) {
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
        return freshClientState();
      }
      return {
        ...freshClientState(),
        session: parsed.session || { session_id: "", expires_at: "" },
        user: normalizeUser(parsed.user),
      };
    } catch {
      return freshClientState();
    }
  }

  function saveSessionState() {
    window.sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        session: state.session,
        user: state.user,
      })
    );
  }

  function clearSessionState() {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    state = freshClientState();
  }

  function freshClientState() {
    return {
      version: 1,
      session: { session_id: "", expires_at: "" },
      user: null,
      submissions: [],
      evaluations: [],
      leaderboardRows: [],
    };
  }

  function logoutUser() {
    clearSessionState();
    remoteState.submissionsLoaded = false;
    remoteState.submissionsError = "";
    remoteState.leaderboardLoaded = false;
    remoteState.leaderboardError = "";
    pushFlash("success", "Signed out.");
    navigate("home");
  }

  function userSubmissions() {
    return state.submissions
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }

  async function apiRequest(action, payload = {}) {
    if (!backendConfigured()) {
      throw new Error("The RoboSynChallenge backend API is not configured yet.");
    }
    const response = await fetch(API_BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, ...payload }),
    });
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error("The backend returned a non-JSON response.");
    }
    if (!response.ok || data.ok === false) {
      throw new Error(data.error || data.message || `Backend request failed: ${action}`);
    }
    return data;
  }

  async function loadMySubmissions(force = false) {
    const user = currentUser();
    if (!user || !state.session.session_id || !backendConfigured()) return;
    if (remoteState.submissionsLoading || (remoteState.submissionsLoaded && !force)) return;
    remoteState.submissionsLoading = true;
    remoteState.submissionsError = "";
    try {
      const data = await apiRequest("my_submissions", { session_id: state.session.session_id });
      state.submissions = (data.submissions || []).map(normalizeSubmission).filter(Boolean);
      state.evaluations = (data.evaluations || []).map(normalizeEvaluation).filter(Boolean);
      remoteState.submissionsLoaded = true;
    } catch (error) {
      const message = error.message || "Could not load submissions.";
      remoteState.submissionsError = message;
      remoteState.submissionsLoaded = true;
      if (/session|expired|unauthorized/i.test(String(message))) clearSessionState();
    } finally {
      remoteState.submissionsLoading = false;
      const route = parseRoute(currentRoute());
      if (route.name === "dashboard" || route.name === "submission") render();
    }
  }

  async function loadLeaderboard(force = false) {
    if (!backendConfigured()) return;
    if (remoteState.leaderboardLoading || (remoteState.leaderboardLoaded && !force)) return;
    remoteState.leaderboardLoading = true;
    remoteState.leaderboardError = "";
    try {
      const data = await apiRequest("leaderboard");
      state.leaderboardRows = (data.rows || data.leaderboard || []).map(normalizeLeaderboardRow).filter(Boolean);
      state.evaluations = [
        ...state.evaluations.filter((evaluation) => !evaluation.published),
        ...(data.evaluations || []).map(normalizeEvaluation).filter(Boolean),
      ];
      remoteState.leaderboardLoaded = true;
    } catch (error) {
      remoteState.leaderboardError = error.message || "Could not load leaderboard.";
      remoteState.leaderboardLoaded = true;
    } finally {
      remoteState.leaderboardLoading = false;
      const route = parseRoute(currentRoute());
      if (route.name === "leaderboard" || route.name === "results") render();
    }
  }

  function getLeaderboardRows(viewId = "overall") {
    const view = leaderboardViewById(viewId);
    const isTaskView = view.id !== "overall";
    const releasedRows = isTaskView ? (window.ROBO_SYN_GET_RELEASED_CHECKPOINT_LEADERBOARD_ROWS?.() || [])
      .map(normalizeLeaderboardRow)
      .filter((row) => row && row.task_id === view.id) : [];
    const backendRows = isTaskView
      ? state.leaderboardRows.map((row) => taskLeaderboardRow(row, view)).filter(Boolean)
      : state.leaderboardRows;
    const rows = [
      ...releasedRows,
      ...backendRows,
    ];

    rows.sort((left, right) => {
      const successDiff = Number(right.success_rate || 0) - Number(left.success_rate || 0);
      if (successDiff !== 0) return successDiff;
      const actionDiff = metricSortValue(left.action_steps) - metricSortValue(right.action_steps);
      if (actionDiff !== 0) return actionDiff;
      const timeDiff = metricSortValue(left.real_time) - metricSortValue(right.real_time);
      if (timeDiff !== 0) return timeDiff;
      return left.model_name.localeCompare(right.model_name);
    });

    return rows;
  }

  function taskLeaderboardRow(row, task) {
    if (!row || !task || row.kind === "released_checkpoint") return null;
    if (row.task_id === task.id) return row;
    const episodes = (row.episodes || []).filter((episode) => episodeMatchesTask(episode, task));
    if (!episodes.length) return null;
    const successEpisodes = episodes.filter((episode) => episode.success === true).length;
    const knownSuccessEpisodes = episodes.filter((episode) => typeof episode.success === "boolean").length;
    const actionSteps = averageFinite(episodes.map(episodeActionSteps));
    const realTime = averageFinite(episodes.map(episodeInferenceSeconds));
    return {
      ...row,
      id: `${row.id}-${task.id}`,
      task_id: task.id,
      task_name: task.label,
      data_regime: `${task.label}${row.data_regime ? ` / ${row.data_regime}` : ""}`,
      success_rate: knownSuccessEpisodes ? (successEpisodes / knownSuccessEpisodes) * 100 : row.success_rate,
      action_steps: actionSteps,
      real_time: realTime,
      rank_badge: knownSuccessEpisodes ? `${successEpisodes} / ${knownSuccessEpisodes} successful episodes` : row.rank_badge,
      episodes,
    };
  }

  function episodeMatchesTask(episode, task) {
    const values = [
      episode?.task_id,
      episode?.task_key,
      episode?.task_name,
      episode?.task,
      episode?.notes,
    ];
    return values.some((value) => normalizeTaskKey(value) === task.id);
  }

  function episodeActionSteps(episode) {
    return firstFinite([
      episode?.action_steps,
      episode?.action_step_count,
      episode?.steps,
      episode?.step_count,
    ]);
  }

  function episodeInferenceSeconds(episode) {
    const seconds = firstFinite([
      episode?.inference_time,
      episode?.inference_seconds,
      episode?.real_time,
    ]);
    if (Number.isFinite(seconds)) return seconds;
    const milliseconds = firstFinite([
      episode?.inference_time_ms,
      episode?.inference_ms,
    ]);
    return Number.isFinite(milliseconds) ? milliseconds / 1000 : null;
  }

  function firstFinite(values) {
    for (const value of values) {
      if (value === "" || value == null) continue;
      const number = Number(value);
      if (Number.isFinite(number)) return number;
    }
    return null;
  }

  function averageFinite(values) {
    const numbers = values.map(Number).filter(Number.isFinite);
    if (!numbers.length) return null;
    return numbers.reduce((total, value) => total + value, 0) / numbers.length;
  }

  function metricSortValue(value) {
    if (value === "" || value == null) return Number.POSITIVE_INFINITY;
    const number = Number(value);
    return Number.isFinite(number) ? number : Number.POSITIVE_INFINITY;
  }

  function renderHeader() {
    const route = currentRoute();
    const user = currentUser();

    const links = [
      ["home", "Home"],
      ["data", "Data"],
      ["faq", "FAQ"],
      ["evaluation", "Evaluation"],
      ["leaderboard", "Leaderboard"],
    ];

    if (user) {
      links.push(["dashboard", "My Submissions"]);
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

  function renderBackendUnavailableCard(title = "Backend service unavailable") {
    return `
      <article class="card card-soft">
        <span class="tag">Service status</span>
        <h2>${escapeHtml(title)}</h2>
        <p>
          The access-token backend is not configured for this deployment yet. Please contact
          ${escapeHtml(CONTACT_EMAIL)} for account or submission support.
        </p>
      </article>
    `;
  }

  function renderBackendErrorCard(title, message, retryAction) {
    return `
      <article class="card card-soft">
        <span class="tag">Backend error</span>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(message || "The backend request failed.")}</p>
        <div class="cta-row">
          <button type="button" class="button button-secondary" data-action="${escapeHtml(retryAction)}">Retry</button>
          <span class="button button-ghost" aria-label="Organizer contact email">${escapeHtml(CONTACT_EMAIL)}</span>
        </div>
      </article>
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
          The released ACT and Diffusion Policy checkpoints are evaluated over 100 random simulation
          episodes on five tasks. The following 10-task pi0, pi0.5, and Motus snapshot uses 20 episodes
          per task under sim-only and real-only training regimes, and is reported separately.
        </p>
      </section>

      <section class="section shell">
        <div class="panel-stack">
          ${window.ROBO_SYN_RENDER_RELEASED_CHECKPOINT_RESULTS?.() || ""}
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
              <span><strong>4</strong> object positions</span>
              <span><strong>3</strong> object orientation settings</span>
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
          <p class="lead">Use the email and access token issued by the RoboSynChallenge organizers.</p>
          ${backendConfigured() ? "" : `<p class="construction-note">Backend API is not configured yet.</p>`}
          <form class="panel-stack compact" data-form="login">
            <label class="field">
              <span>Email</span>
              <input type="email" name="email" placeholder="user@example.org" required>
            </label>
            <label class="field">
              <span>Access token</span>
              <input type="text" name="token" placeholder="Paste the token issued by the administrator" required>
            </label>
            <button type="submit" class="button button-primary" ${backendConfigured() ? "" : "disabled"}>Sign in</button>
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
    const requestId = accessRequestId();
    return `
      <section class="section shell auth-grid single">
        <article class="auth-card wide">
          <span class="eyebrow">Participant access</span>
          <h1>Request an account token</h1>
          <p class="lead">
            RoboSynChallenge access requests are reviewed by the organizers through Gmail. Submit the
            required fields here, then the approval workflow can issue an access token after review.
          </p>
          ${backendConfigured() ? "" : `<p class="construction-note">Backend API is not configured yet. Please contact the organizers.</p>`}
          <div class="task-list">
            <span><strong>Request id:</strong> <span data-register-request-id>${escapeHtml(requestId)}</span></span>
            <span><strong>Required fields:</strong> email, full name list, team name, affiliation, and intended use</span>
            <span><strong>Full name rule:</strong> use English commas to list every team member, max 5 names, final after registration</span>
            <span><strong>Organizer action:</strong> approved requests receive an access-token email after review</span>
          </div>
          <form class="panel-stack compact" data-form="register">
            <input type="hidden" name="request_id" value="${escapeHtml(requestId)}">
            <label class="field">
              <span>Email</span>
              <input type="email" name="email" placeholder="participant@example.org" required>
            </label>
            <label class="field">
              <span><strong>Full name</strong></span>
              <input type="text" name="full_name" placeholder="Name A, Name B" required>
              <p class="field-note"><strong>Use English commas to list every team member, max 5 names. This field is final after registration.</strong></p>
            </label>
            <label class="field">
              <span>Team name</span>
              <input type="text" name="team_name" placeholder="Team name" required>
            </label>
            <label class="field">
              <span>Affiliation</span>
              <input type="text" name="affiliation" placeholder="University, lab, or company" required>
            </label>
            <label class="field">
              <span>Intended use</span>
              <textarea name="intended_use" rows="4" placeholder="Brief intended use" required></textarea>
            </label>
            <label class="field">
              <span>Misc</span>
              <textarea name="misc" rows="4" placeholder="Optional extra information"></textarea>
            </label>
            <button type="submit" class="button button-primary" ${backendConfigured() ? "" : "disabled"}>Send request</button>
            <p class="form-status" data-register-status aria-live="polite"></p>
          </form>
          <div class="cta-row">
            <a href="${routeHref("login")}" class="button button-secondary">I already have a token</a>
          </div>
          <p class="registration-email">
            <strong>Registration email</strong>
            <span>${escapeHtml(CONTACT_EMAIL)}</span>
          </p>
        </article>
      </section>
    `;
  }

  function renderEvaluationPage() {
    const user = currentUser();
    const submitAction = user
      ? `<button type="button" class="button button-primary" data-action="focus-policy-submit" ${backendConfigured() ? "" : "disabled"}>Submit Policy</button>`
      : `<a href="${routeHref("login")}" class="button button-primary">Submit Policy</a>`;
    const submissionForm = user && backendConfigured() ? `
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
    ` : user ? `
      <section class="section shell" data-policy-submit>
        ${renderBackendUnavailableCard("Policy submission backend unavailable")}
      </section>
    ` : "";

    return `
      ${submissionForm}

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
            ${renderEvaluationVideoWall(REAL_EVALUATION_VIDEO_ASSETS, "static/assets/real-evaluation-videos", "Real-robot evaluation task videos")}
            <div class="randomization-list">
              <div><strong>Robot only.</strong><span>The final round runs on the real RoboSynChallenge platform.</span></div>
              <div><strong>Same metrics.</strong><span>Success rate, action steps, and inference time are reported.</span></div>
              <div><strong>Final ranking.</strong><span>Published results determine the final leaderboard.</span></div>
            </div>
          </article>
        </div>
      </section>
    `;
  }

  function renderFaqPage() {
    return `
      <section class="page-hero shell faq-hero">
        <span class="eyebrow">FAQ</span>
        <h1>Competition questions, answered.</h1>
        <p class="lead narrow">
          Official guidance on ranking, evaluation, observation inputs, and model submission.
        </p>
      </section>

      <section class="section shell faq-section" aria-label="Frequently asked questions">
        <div class="faq-list">
          ${FAQ_ITEMS.map((item, index) => `
            <article class="faq-item">
              <div class="faq-index" aria-hidden="true">${String(index + 1).padStart(2, "0")}</div>
              <div class="faq-content">
                <h2><span>Q:</span> ${escapeHtml(item.question)}</h2>
                <div class="faq-answer"><strong>A:</strong><div>${item.answer}</div></div>
              </div>
            </article>
          `).join("")}
        </div>
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
    if (!backendConfigured()) {
      return `
        <section class="page-hero shell">
          <span class="eyebrow">My submissions</span>
          <h1>Backend required.</h1>
          <p class="lead narrow">Submission history is stored in the RoboSynChallenge backend.</p>
        </section>
        <section class="section shell">${renderBackendUnavailableCard()}</section>
      `;
    }
    if (!remoteState.submissionsLoaded) {
      loadMySubmissions();
      return `
        <section class="page-hero shell">
          <span class="eyebrow">My submissions</span>
          <h1>Loading your submissions.</h1>
          <p class="lead narrow">Fetching records from the RoboSynChallenge backend.</p>
        </section>
      `;
    }
    if (remoteState.submissionsError) {
      return `
        <section class="page-hero shell">
          <span class="eyebrow">My submissions</span>
          <h1>Submission records are temporarily unavailable.</h1>
          <p class="lead narrow">The private backend stores your submitted artifacts and evaluation status.</p>
        </section>
        <section class="section shell">
          ${renderBackendErrorCard("Could not load submissions", remoteState.submissionsError, "retry-submissions")}
        </section>
      `;
    }

    const submissions = userSubmissions();
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
    if (!user) {
      return renderAuthGate(
        "Sign in to inspect submission details",
        "Submission detail pages require a participant session.",
        { route: "login", label: "Sign in" },
        { route: "register", label: "Request access" }
      );
    }
    if (!backendConfigured()) {
      return `
        <section class="section shell">${renderBackendUnavailableCard("Submission backend unavailable")}</section>
      `;
    }
    if (!remoteState.submissionsLoaded) {
      loadMySubmissions();
      return `
        <section class="page-hero shell">
          <span class="eyebrow">Submission detail</span>
          <h1>Loading submission.</h1>
          <p class="lead narrow">Fetching the record from the RoboSynChallenge backend.</p>
        </section>
      `;
    }
    if (remoteState.submissionsError) {
      return `
        <section class="page-hero shell">
          <span class="eyebrow">Submission detail</span>
          <h1>Submission record unavailable.</h1>
          <p class="lead narrow">This detail page is served from the private competition backend.</p>
        </section>
        <section class="section shell">
          ${renderBackendErrorCard("Could not load submission detail", remoteState.submissionsError, "retry-submissions")}
        </section>
      `;
    }
    const submission = getSubmissionById(submissionId);
    if (!submission) {
      return renderNotFoundPage("Submission not found", "The requested submission does not exist.");
    }
    if (!isAdmin(user) && submission.owner_id !== user.id && submission.owner_id !== user.email) {
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

  function renderLeaderboardPage(viewId = "overall") {
    const activeView = leaderboardViewById(viewId);
    if (!backendConfigured()) {
      const rows = getLeaderboardRows(activeView.id);
      return `
        <section class="page-hero shell leaderboard-hero">
          <span class="eyebrow">Leaderboard</span>
          <h1>Leaderboard.</h1>
          <p class="lead narrow">Published ranked evaluations are served by the RoboSynChallenge backend.</p>
        </section>
        ${renderLeaderboardTable(rows, activeView, "Leaderboard backend unavailable")}
      `;
    }
    if (!remoteState.leaderboardLoaded) {
      loadLeaderboard();
      return `
        <section class="page-hero shell leaderboard-hero">
          <span class="eyebrow">Leaderboard</span>
          <h1>Loading leaderboard.</h1>
          <p class="lead narrow">Fetching published ranked evaluations from the RoboSynChallenge backend.</p>
        </section>
        ${renderLeaderboardTable(getLeaderboardRows(activeView.id), activeView)}
      `;
    }
    if (remoteState.leaderboardError) {
      const rows = getLeaderboardRows(activeView.id);
      return `
        <section class="page-hero shell leaderboard-hero">
          <span class="eyebrow">Leaderboard</span>
          <h1>Leaderboard.</h1>
          <p class="lead narrow">Published ranked evaluations are served by the RoboSynChallenge backend.</p>
        </section>
        ${renderLeaderboardTable(rows, activeView)}
        <section class="section shell">
          ${renderBackendErrorCard("Could not load leaderboard", remoteState.leaderboardError, "retry-leaderboard")}
        </section>
      `;
    }
    const rows = getLeaderboardRows(activeView.id);
    return `
      <section class="page-hero shell leaderboard-hero">
        <span class="eyebrow">Leaderboard</span>
        <h1>Leaderboard.</h1>
        <p class="lead narrow">Ranked by success rate, with fewer action steps and lower inference time used as tie-breakers.</p>
      </section>
      ${renderLeaderboardTable(rows, activeView)}
    `;
  }

  function renderLeaderboardTable(rows, activeView, fallbackTitle = "") {
    const emptyMessage = activeView.id === "overall"
      ? "No published overall results yet."
      : `No published ${activeView.label} results yet.`;
    return `
      <section class="section shell leaderboard-section">
        <div class="leaderboard-summary">
          <span><strong>1</strong> Success rate</span>
          <span><strong>2</strong> Action steps</span>
          <span><strong>3</strong> Inference time</span>
          <small class="leaderboard-view-meta">
            <b>View</b>
            <strong>${escapeHtml(activeView.label)}</strong>
            <i>${rows.length} published results</i>
          </small>
        </div>
        <div class="table-shell leaderboard-shell">
          <table class="leaderboard-table leaderboard-table-compact">
            <thead>
              <tr>
                <th class="leaderboard-rank-header">${renderLeaderboardViewSelect(activeView.id)}</th>
                <th>Model</th>
                <th>Team</th>
                <th>Stage</th>
                <th>Success</th>
                <th>Steps</th>
                <th>Inference (ms)</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length
                ? rows.map((row, index) => `
                  <tr class="${index < 3 ? "is-podium" : ""}">
                    <td><strong class="rank-number">${index + 1}</strong></td>
                    <td>
                      <div class="leaderboard-model">
                        <strong>${row.result_url ? `<a href="${escapeHtml(row.result_url)}" target="_blank" rel="noreferrer">${escapeHtml(row.model_name)}</a>` : escapeHtml(row.model_name)}</strong>
                        <div>
                          <span>${escapeHtml(row.rank_badge)}</span>
                          ${row.evaluation_id ? `<a href="${routeHref(`results/${row.evaluation_id}`)}">View result -&gt;</a>` : ""}
                          ${row.protocol_url ? `<a href="${escapeHtml(row.protocol_url)}" target="_blank" rel="noreferrer">Protocol -&gt;</a>` : ""}
                        </div>
                      </div>
                    </td>
                    <td>${escapeHtml(row.username_display)}</td>
                    <td>${escapeHtml(row.stage_label)}</td>
                    <td><strong class="score-primary">${formatPercent(row.success_rate)}</strong></td>
                    <td>${formatSteps(row.action_steps)}</td>
                    <td>${formatInferenceMilliseconds(row.real_time)}</td>
                  </tr>
                `).join("")
                : `<tr><td colspan="7" class="empty-table">${escapeHtml(fallbackTitle || emptyMessage)}</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderLeaderboardViewSelect(activeViewId) {
    return `
      <label class="leaderboard-head-select">
        <span class="leaderboard-caret" aria-hidden="true"></span>
        <span class="leaderboard-head-select-label">Rank by</span>
        <select data-leaderboard-view-select aria-label="Select leaderboard task">
          ${LEADERBOARD_VIEWS.map((view) => `
            <option value="${escapeHtml(view.id)}" ${view.id === activeViewId ? "selected" : ""}>${escapeHtml(view.label)}</option>
          `).join("")}
        </select>
      </label>
    `;
  }

  function renderResultsPage(evaluationId) {
    if (backendConfigured() && !remoteState.leaderboardLoaded) {
      loadLeaderboard();
      return `
        <section class="page-hero shell">
          <span class="eyebrow">Result viewer</span>
          <h1>Loading published result.</h1>
          <p class="lead narrow">Fetching evaluation details from the RoboSynChallenge backend.</p>
        </section>
      `;
    }
    if (remoteState.leaderboardError) {
      return `
        <section class="page-hero shell">
          <span class="eyebrow">Result viewer</span>
          <h1>Published result unavailable.</h1>
          <p class="lead narrow">Result pages are served from the private competition backend.</p>
        </section>
        <section class="section shell">
          ${renderBackendErrorCard("Could not load published result", remoteState.leaderboardError, "retry-leaderboard")}
        </section>
      `;
    }
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
            <strong>${formatInferenceMilliseconds(evaluation.real_time)}</strong>
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
    return `
      <section class="page-hero shell">
        <span class="eyebrow">Administrator workflow</span>
        <h1>Use the internal Gmail and Google Sheet backend.</h1>
        <p class="lead narrow">
          Access tokens, policy submissions, evaluation rows, and leaderboard publishing are managed
          through the private Apps Script, Gmail labels, and Google Sheet. This public static site no
          longer stores or edits administrator state.
        </p>
      </section>

      <section class="section shell">
        <article class="card card-soft">
          <span class="tag">Internal operations</span>
          <div class="task-list">
            <span>Approve or reject access-request emails with the configured Gmail labels.</span>
            <span>Use the private Google Sheet to revoke/regenerate tokens and publish evaluation rows.</span>
            <span>Use the Apps Script menu to run processing and digest jobs when needed.</span>
          </div>
        </article>
      </section>
    `;
  }

  function renderAdminSubmissionPage() {
    return renderAdminPage();
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
    if (route === "faq") return { name: "faq" };
    if (route === "dashboard") return { name: "dashboard" };
    if (route === "leaderboard") return { name: "leaderboard", view: "overall" };
    if (route.startsWith("leaderboard/")) return { name: "leaderboard", view: route.slice("leaderboard/".length) || "overall" };
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
      case "faq":
        renderSection(renderFaqPage(), "FAQ");
        break;
      case "dashboard":
        renderSection(renderDashboardPage(), "Dashboard");
        break;
      case "submission":
        renderSection(renderSubmissionDetailPage(route.id), "Submission");
        break;
      case "leaderboard":
        renderSection(renderLeaderboardPage(route.view), "Leaderboard");
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


  async function handleLogin(form) {
    const formData = new FormData(form);
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const token = String(formData.get("token") || "").trim();
    if (!email || !token) {
      pushFlash("error", "Email and token are required.");
      return;
    }
    if (!backendConfigured()) {
      pushFlash("error", "The access-token backend is not configured yet.");
      return;
    }

    try {
      const data = await apiRequest("login", { email, token });
      state.session = {
        session_id: String(data.session_id || data.session?.session_id || ""),
        expires_at: String(data.expires_at || data.session?.expires_at || ""),
      };
      state.user = normalizeUser(data.user || { email });
      if (!state.session.session_id) throw new Error("Login response did not include a session_id.");
      saveSessionState();
      remoteState.submissionsLoaded = false;
      remoteState.submissionsError = "";
      pushFlash("success", `Signed in as ${state.user.username}.`);
      navigate("dashboard");
    } catch (error) {
      pushFlash("error", error.message || "Sign in failed.");
    }
  }

  async function handleRegister(form) {
    const setStatus = (category, message, busy = false) => {
      const button = form.querySelector('button[type="submit"]');
      const status = form.querySelector("[data-register-status]");
      if (button) {
        if (!button.dataset.defaultText) button.dataset.defaultText = button.textContent;
        button.disabled = busy || !backendConfigured();
        button.textContent = busy ? "Sending..." : button.dataset.defaultText;
        button.setAttribute("aria-busy", busy ? "true" : "false");
      }
      if (status) {
        status.textContent = message || "";
        status.className = `form-status${category ? ` form-status-${category}` : ""}`;
      }
    };

    if (!backendConfigured()) {
      pushFlash("error", "The access-request backend is not configured yet.");
      setStatus("error", "The access-request backend is not configured yet.");
      return;
    }

    const formData = new FormData(form);
    const requestId = String(formData.get("request_id") || accessRequestId()).trim();
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const fullNameInput = String(formData.get("full_name") || "").trim();
    const teamName = String(formData.get("team_name") || "").trim();
    const affiliation = String(formData.get("affiliation") || "").trim();
    const intendedUse = String(formData.get("intended_use") || "").trim();
    const misc = String(formData.get("misc") || "").trim();

    if (!email || !fullNameInput || !teamName || !affiliation || !intendedUse) {
      pushFlash("error", "Email, full name, team name, affiliation, and intended use are required.");
      setStatus("error", "Email, full name, team name, affiliation, and intended use are required.");
      return;
    }

    let fullName;
    try {
      fullName = normalizeFullNameList(fullNameInput);
    } catch (error) {
      const message = error.message || "Full name is invalid.";
      pushFlash("error", message);
      setStatus("error", message);
      return;
    }

    try {
      setStatus("pending", "Sending request to the RoboSynChallenge organizers...", true);
      const data = await apiRequest("request_access", {
        request_id: requestId,
        email,
        full_name: fullName,
        team_name: teamName,
        affiliation,
        intended_use: intendedUse,
        misc,
      });
      window.sessionStorage.removeItem(ACCESS_REQUEST_STORAGE_KEY);
      form.reset();
      const message = data.existing_token_sent
        ? "This email already has an active access token. A token reminder has been sent to that email."
        : data.already_submitted
          ? "This access request is already queued for review."
          : "Access request sent. The organizers will review it in Gmail.";
      pushFlash("success", message);
      setStatus("success", message);
      const nextRequestId = accessRequestId();
      const requestInput = form.querySelector('input[name="request_id"]');
      const requestLabel = document.querySelector("[data-register-request-id]");
      if (requestInput) requestInput.value = nextRequestId;
      if (requestLabel) requestLabel.textContent = nextRequestId;
    } catch (error) {
      const message = error.message || "Access request failed.";
      pushFlash("error", message);
      setStatus("error", message);
    }
  }

  async function handleEvaluationSubmit(form) {
    const user = currentUser();
    if (!user) {
      pushFlash("error", "Sign in before submitting.");
      return;
    }
    if (!backendConfigured() || !state.session.session_id) {
      pushFlash("error", "The submission backend is not available. Please sign in again or contact the organizers.");
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
    try {
      const data = await apiRequest("submit_policy", {
        session_id: state.session.session_id,
        submission: {
          artifact_name: artifactName,
          title,
          short_description: shortDescription,
          code_link: codeLink,
          checkpoint_link: checkpointLink,
          data_source_text: dataSourceText,
          technical_notes: technicalNotes,
          is_ranked: isRanked,
        },
      });
      const submission = normalizeSubmission(data.submission || data);
      const evaluation = normalizeEvaluation(data.evaluation);
      if (submission) state.submissions.unshift(submission);
      if (evaluation) state.evaluations.unshift(evaluation);
      remoteState.submissionsLoaded = true;
      remoteState.submissionsError = "";
      pushFlash("success", "Artifact submission recorded. The organizers can now schedule and publish it.");
      navigate(submission ? `submission/${submission.id}` : "dashboard");
    } catch (error) {
      pushFlash("error", error.message || "Policy submission failed.");
    }
  }

  function handleAdminCreateParticipant() {
    pushFlash("warning", "Participant access is managed in the private Google Sheet and Gmail workflow.");
  }

  function handleRegenerateToken() {
    pushFlash("warning", "Token regeneration is managed in the private Google Sheet.");
  }

  function handleAdminCreateBaseline() {
    pushFlash("warning", "Leaderboard rows are managed in the private Google Sheet backend.");
  }

  function handleAdminUpdateEvaluation() {
    pushFlash("warning", "Evaluation publishing is managed in the private Google Sheet backend.");
  }

  function handleAdminAddEpisode() {
    pushFlash("warning", "Evaluation episode metadata is managed in the private Google Sheet backend.");
  }

  function handleDeleteEpisode() {
    pushFlash("warning", "Evaluation episode metadata is managed in the private Google Sheet backend.");
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
      } else if (action === "retry-submissions") {
        event.preventDefault();
        remoteState.submissionsLoaded = false;
        loadMySubmissions(true);
        render();
      } else if (action === "retry-leaderboard") {
        event.preventDefault();
        remoteState.leaderboardLoaded = false;
        loadLeaderboard(true);
        render();
      } else if (action === "regenerate-token") {
        event.preventDefault();
        handleRegenerateToken(target.getAttribute("data-user-id") || "");
      } else if (action === "delete-episode") {
        event.preventDefault();
        handleDeleteEpisode(target.getAttribute("data-submission-id") || "", target.getAttribute("data-episode-id") || "");
      }
    });

    document.addEventListener("change", (event) => {
      const target = event.target.closest("[data-leaderboard-view-select]");
      if (!target) return;
      const viewId = target.value || "overall";
      navigate(viewId === "overall" ? "leaderboard" : `leaderboard/${viewId}`);
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
