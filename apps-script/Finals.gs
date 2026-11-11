/** Separate real-finals intake. No writes to preliminary submissions or results. */
const FINALS_TASKS = ["click_bell", "drawer_open_place", "handle_basket", "item_assembly",
  "items_handover", "manipulate_pipette", "mixer_operating", "sample_loading", "table_rearrangement", "water_pouring"];
const FINALS_REQUEST_HEADERS = ["request_id", "team_id", "email", "retry_key", "fingerprint",
  "revision", "status", "created_at", "submission_json", "is_test"];
const FINALS_VERSION_POLICY = "latest_before_deadline";

function finalsText_(value, label, max) {
  if (typeof value !== "string" || !value.trim() || value.length > (max || 4000)) throw new Error(label + " is required or too long.");
  return value.trim();
}

function finalsPath_(value, label) {
  const path = finalsText_(value, label, 500);
  if (/^[\\/]|[\\\x00-\x1f]/.test(path) || path.split("/").some(x => !x || x === "." || x === "..")) throw new Error(label + " must be a safe relative path.");
  return path;
}

function finalsSha_(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{40}$/i.test(value)) throw new Error(label + " requires a full 40-character commit SHA.");
  return value.toLowerCase();
}

function finalsBranch_(value, fallback) {
  const branch = typeof value === "string" ? value.trim() : "";
  if (!branch) return fallback;
  if (branch.length > 200 || !/^[A-Za-z0-9_][A-Za-z0-9_./-]*$/.test(branch) || branch.includes("..") ||
      branch.split("/").some(part => !part || part.startsWith(".") || part.endsWith(".") || part.endsWith(".lock")) ||
      /^[a-f0-9]{40}$/i.test(branch) || branch === "HEAD") throw new Error("Use a branch name, not a commit SHA.");
  return branch;
}

function finalsValidate_(input) {
  if (!input || typeof input !== "object") throw new Error("Submission required.");
  const repository = finalsText_(input.repository, "GitHub repository", 500).replace(/\/$/, "");
  if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error("Use a GitHub repository URL without credentials, branch or query parameters.");
  if (!Array.isArray(input.checkpoints) || input.checkpoints.length > 40) throw new Error("Provide at most 40 checkpoint sources.");
  const ids = new Set();
  const checkpoints = input.checkpoints.map(item => {
    const id = finalsText_(item.id, "Checkpoint ID", 64);
    if (!/^[A-Za-z0-9_-]+$/.test(id) || ids.has(id)) throw new Error("Checkpoint IDs must be unique identifiers.");
    ids.add(id);
    const repo = finalsText_(item.repo, "HF repository", 300);
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error("HF repository must be owner/repository.");
    return { id, repo, ref: finalsBranch_(item.ref, "main"),
      path: item.path === "" || item.path === "." ? "" : finalsPath_(item.path, "Checkpoint path") };
  });
  if (!Array.isArray(input.tasks) || input.tasks.length !== FINALS_TASKS.length) throw new Error("Provide all ten tasks.");
  const seen = new Set();
  const tasks = input.tasks.map(task => {
    if (!FINALS_TASKS.includes(task.task) || seen.has(task.task)) throw new Error("Each official task must appear exactly once.");
    seen.add(task.task);
    const entry = finalsPath_(task.policy_path, "Policy path");
    if (!/^policy\/[A-Za-z0-9_]+$/.test(entry)) throw new Error("Policy path must be policy/<module_name>.");
    if (!Array.isArray(task.checkpoint_ids) || new Set(task.checkpoint_ids).size !== task.checkpoint_ids.length || task.checkpoint_ids.some(id => !ids.has(id))) throw new Error("Unknown or repeated checkpoint ID.");
    const noWeights = task.checkpoint_ids.length ? "" : finalsText_(task.no_weights_reason, "Reason for no checkpoint", 1000);
    return { task: task.task, policy_path: entry, checkpoint_ids: task.checkpoint_ids.slice().sort(),
      no_weights_reason: noWeights, run_notes: finalsText_(task.run_notes, "Task parameters and run command", 2000) };
  }).sort((a, b) => a.task.localeCompare(b.task));
  const result = { method_name: finalsText_(input.method_name, "Method name", 200),
    description: finalsText_(input.description, "Detailed method description", 6000), repository,
    code_ref: finalsBranch_(input.code_ref, ""), version_policy: FINALS_VERSION_POLICY,
    dependency_notes: finalsText_(input.dependency_notes, "Dependency installation notes", 6000),
    data_sources: finalsText_(input.data_sources, "Training data sources", 4000),
    compute_notes: finalsText_(input.compute_notes, "Runtime and GPU requirements", 2000),
    checkpoints: checkpoints.sort((a, b) => a.id.localeCompare(b.id)), tasks };
  if (JSON.stringify(result).length > 42000) throw new Error("Submission is too large; shorten the notes.");
  return result;
}

function finalsIdentity_(payload) {
  const session = requireSession_(payload.session_id);
  const user = findRow_("Users", "email", session.email);
  if (!user || user.token_status !== "active") throw new Error("User token is not active.");
  const official = JSON.parse(config_("FINALS_ROSTER_JSON", "[]"));
  const testing = JSON.parse(config_("FINALS_TEST_ROSTER_JSON", "[]"));
  if (!Array.isArray(official) || !Array.isArray(testing)) throw new Error("Finals roster configuration is invalid.");
  const roster = official.map(row => ({...row, is_test:false})).concat(testing.map(row => ({...row, is_test:true})));
  const matches = roster.filter(row => normalizeEmail_(row.email) === session.email && row.enabled === true);
  if (matches.length > 1) throw new Error("Duplicate roster identity; contact organizers.");
  const team = matches[0] || null;
  if (team && !/^[A-Za-z0-9_-]{1,100}$/.test(team.team_id)) throw new Error("Invalid roster team ID.");
  return { email: session.email, team };
}

function finalsRows_() {
  SHEETS.FinalsRequests = FINALS_REQUEST_HEADERS;
  return rows_("FinalsRequests");
}

function finalsPublic_(row) {
  return { request_id: row.request_id, revision: Number(row.revision), status: row.status,
    created_at: row.created_at, is_test: row.is_test === true || row.is_test === "true", submission: JSON.parse(row.submission_json) };
}

function finalsVersionRows_() {
  SHEETS.FinalsVersions = ["request_id", "fingerprint", "resolved_at", "version_json"];
  return rows_("FinalsVersions");
}

function finalsVersionReport_(submission, report) {
  const cutoff = submission.version_cutoff_at;
  const limit = Date.parse(cutoff);
  if (!report || report.cutoff_at !== cutoff || !Number.isFinite(limit)) throw new Error("Version cutoff mismatch.");
  function timestamp(value) {
    const time = Date.parse(value);
    if (typeof value !== "string" || !/(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(time) || time >= limit) {
      throw new Error("Selected commit must be strictly before the cutoff.");
    }
    return new Date(time).toISOString();
  }
  const code = report.code || {};
  const branch = finalsBranch_(code.ref, "");
  if (code.repo !== submission.repository || !branch || (submission.code_ref && branch !== submission.code_ref)) throw new Error("Code source mismatch.");
  const selected = { repo:code.repo, ref:branch, revision:finalsSha_(code.revision, "Selected code SHA"),
    committed_at:timestamp(code.committed_at), authored_at:timestamp(code.authored_at) };
  if (!Array.isArray(report.checkpoints) || report.checkpoints.length !== submission.checkpoints.length) throw new Error("Every checkpoint must be resolved.");
  const seen = new Set();
  const checkpoints = report.checkpoints.map(item => {
    const source = submission.checkpoints.find(row => row.id === item.id);
    if (!source || seen.has(item.id) || item.repo !== source.repo || item.ref !== source.ref || item.path !== source.path) throw new Error("Checkpoint source mismatch.");
    seen.add(item.id);
    return { id:item.id, repo:item.repo, ref:item.ref, path:item.path, revision:finalsSha_(item.revision, "Selected HF SHA"), committed_at:timestamp(item.committed_at) };
  }).sort((a,b) => a.id.localeCompare(b.id));
  return {cutoff_at:cutoff, code:selected, checkpoints};
}

function handleFinalsAction_(action, payload) {
  if (action.startsWith("finals_admin_")) return finalsAdmin_(action, payload);
  const identity = finalsIdentity_(payload);
  const enabled = config_("FINALS_INTAKE_ENABLED", "false") === "true";
  const deadline = config_("FINALS_DEADLINE_AT", "");
  const deadlineMs = Date.parse(deadline);
  const open = enabled && Number.isFinite(deadlineMs) && Date.now() < deadlineMs;
  if (action === "finals_status") return {
    ok: true, eligible: Boolean(identity.team), intake_open: Boolean(identity.team) && open,
    team_name: identity.team ? String(identity.team.team_name || "") : "", deadline_at: deadline,
    is_test: Boolean(identity.team && identity.team.is_test),
    tasks: FINALS_TASKS, version_policy: FINALS_VERSION_POLICY,
    paper_url: config_("FINALS_PAPER_URL", "https://arxiv.org/abs/2608.12416"), report_url: config_("FINALS_REPORT_URL", ""),
    requests: identity.team ? finalsRows_().filter(r => r.team_id === identity.team.team_id).map(finalsPublic_) : [],
  };
  if (action !== "finals_submit") throw new Error("Unknown finals action.");
  if (!identity.team) throw new Error("This account is not on the confirmed finalist roster.");
  const submission = finalsValidate_(payload.submission);
  submission.version_cutoff_at = deadline;
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(String(payload.submission_key || ""))) throw new Error("A valid submission retry key is required.");
  return withReviewLock_(() => {
    const fingerprint = reviewerHash_(JSON.stringify(submission));
    const key = reviewerHash_(identity.team.team_id + ":" + payload.submission_key);
    const existing = finalsRows_();
    const receipt = existing.find(row => row.retry_key === key);
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) throw new Error("Retry key belongs to different content.");
      return { ok: true, already_recorded: true, request: finalsPublic_(receipt) };
    }
    if (!enabled || !Number.isFinite(deadlineMs) || Date.now() >= deadlineMs) throw new Error("Finals intake is not currently open.");
    checkRateLimit_("finals_submit", identity.email, 10, 3600000);
    const revision = Math.max(0, ...existing.filter(row => row.team_id === identity.team.team_id).map(row => Number(row.revision) || 0)) + 1;
    const row = { request_id: id_("real"), team_id: identity.team.team_id, email: identity.email,
      retry_key: key, fingerprint, revision, status: identity.team.is_test ? "test_submitted" : "submitted",
      created_at: now_(), submission_json: JSON.stringify(submission), is_test: Boolean(identity.team.is_test) };
    appendRow_("FinalsRequests", row);
    return { ok: true, already_recorded: false, request: finalsPublic_(row) };
  });
}

function finalsAdmin_(action, payload) {
  const viewer = reviewerIdentity_(payload);
  if (viewer.role !== "admin") throw new Error("Organizer access required.");
  if (action === "finals_admin_configure") {
    const settings = payload.settings;
    if (!settings || !Array.isArray(settings.roster) || settings.roster.length !== 21) throw new Error("Use the confirmed 21-team roster.");
    const seen = new Set(), teams = new Set();
    function validateRoster(rows, testing) {
      return rows.map(row => {
        const email = requiredEmail_(row.email);
        const id = String(row.team_id || "");
        if (seen.has(email) || teams.has(id) || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new Error("Duplicate or invalid roster identity.");
        seen.add(email); teams.add(id);
        return { email, team_id:id, team_name:finalsText_(row.team_name || (testing ? "Test team" : id), "Team name", 200), enabled:true };
      });
    }
    const roster = validateRoster(settings.roster, false);
    const testing = validateRoster(settings.test_roster || [], true);
    if (testing.length > 5 || typeof settings.enabled !== "boolean") throw new Error("Invalid test roster or intake flag.");
    const deadline = String(settings.deadline_at || "");
    if (!/(Z|[+-]\d{2}:\d{2})$/.test(deadline) || !Number.isFinite(Date.parse(deadline))) throw new Error("Deadline must specify its timezone.");
    PropertiesService.getScriptProperties().setProperties({
      FINALS_ROSTER_JSON:JSON.stringify(roster), FINALS_TEST_ROSTER_JSON:JSON.stringify(testing),
      FINALS_DEADLINE_AT:deadline, FINALS_INTAKE_ENABLED:String(settings.enabled),
    }, false);
    return { ok:true, finalists:roster.length, test_accounts:testing.length, deadline_at:deadline, intake_open:settings.enabled && Date.now()<Date.parse(deadline) };
  }
  SHEETS.FinalsPreparations = ["preparation_id", "request_id", "status", "bundle_sha", "manifest_sha256", "note", "created_at"];
  if (action === "finals_admin_queue") {
    const latest = {};
    finalsRows_().filter(row => row.is_test !== true && row.is_test !== "true").forEach(row => {
      if (!latest[row.team_id] || Number(row.revision)>Number(latest[row.team_id].revision)) latest[row.team_id]=row;
    });
    const preparations = rows_("FinalsPreparations");
    const versions = finalsVersionRows_();
    return {ok:true, requests:Object.values(latest).map(row => ({...finalsPublic_(row),
      team_id:row.team_id, fingerprint:row.fingerprint,
      versions:versions.find(v=>v.request_id===row.request_id) || null,
      preparation:preparations.filter(p=>p.request_id===row.request_id).slice(-1)[0] || null}))};
  }
  if (action === "finals_admin_freeze_versions") return withReviewLock_(() => {
    const requests = finalsRows_();
    const row = requests.find(r=>r.request_id===payload.request_id);
    if (!row || row.is_test === true || row.is_test === "true") throw new Error("Formal request required.");
    if (row.fingerprint !== payload.fingerprint) throw new Error("Submission fingerprint mismatch.");
    if (requests.some(r=>r.team_id===row.team_id && Number(r.revision)>Number(row.revision))) throw new Error("Request was superseded.");
    const submission = JSON.parse(row.submission_json);
    if (submission.version_policy !== FINALS_VERSION_POLICY || Date.now() < Date.parse(submission.version_cutoff_at)) throw new Error("Wait until the version cutoff before freezing.");
    const report = finalsVersionReport_(submission, payload.versions);
    const versionJson = JSON.stringify(report);
    const fingerprint = reviewerHash_(versionJson);
    const existing = finalsVersionRows_().find(r=>r.request_id===row.request_id);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new Error("Versions are already frozen; they cannot drift with repository updates.");
      return {ok:true,already_recorded:true,versions:existing};
    }
    const receipt = {request_id:row.request_id,fingerprint,resolved_at:now_(),version_json:versionJson};
    appendRow_("FinalsVersions", receipt);
    return {ok:true,versions:receipt};
  });
  if (action === "finals_admin_prepare_result") return withReviewLock_(() => {
    const row = finalsRows_().find(r=>r.request_id===payload.request_id);
    if (!row || row.is_test === true || row.is_test === "true") throw new Error("Formal request required.");
    if (!["prepared", "blocked"].includes(payload.status)) throw new Error("Invalid preparation status.");
    if (payload.status === "prepared" && JSON.parse(row.submission_json).version_policy === FINALS_VERSION_POLICY) {
      const version = finalsVersionRows_().find(v=>v.request_id===row.request_id);
      if (!version || payload.version_fingerprint !== version.fingerprint) throw new Error("Freeze the deadline-selected versions before preparing code.");
    }
    const sha = payload.status === "prepared" ? finalsSha_(payload.bundle_sha, "Prepared bundle") : "";
    const manifest = payload.status === "prepared" ? String(payload.manifest_sha256 || "") : "";
    if (sha && !/^[a-f0-9]{64}$/.test(manifest)) throw new Error("Manifest SHA256 required.");
    const existing = rows_("FinalsPreparations").filter(p=>p.request_id===row.request_id);
    const pinned = existing.find(p=>p.status==="prepared");
    if (pinned) {
      if (pinned.bundle_sha!==sha || pinned.manifest_sha256!==manifest) throw new Error("Prepared revision is frozen. Submit a new request revision.");
      return {ok:true,already_recorded:true,preparation:pinned};
    }
    const result={preparation_id:id_("realprep"),request_id:row.request_id,status:payload.status,
      bundle_sha:sha,manifest_sha256:manifest,note:finalsText_(payload.note,"Preparation note",2000),created_at:now_()};
    appendRow_("FinalsPreparations",result);
    return {ok:true,preparation:result};
  });
  throw new Error("Unknown finals organizer action.");
}
