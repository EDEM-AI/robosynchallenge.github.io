(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const key = "rsc-finals-session-v1";
  let session = null, status = null, pending = null;
  function message(text) { $("notice").textContent = text; }
  async function api(action, payload = {}) {
    const url = window.ROBO_SYN_CONFIG?.API_BASE_URL;
    if (!url) throw new Error("The finals backend is not configured.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, session_id: session?.session_id, ...payload }), signal: controller.signal });
      const data = await response.json();
      if (!response.ok || data.ok === false) throw new Error(data.error || "Request failed.");
      return data;
    } finally { clearTimeout(timer); }
  }
  function field(parent, text, name, value = "", required = true, multi = false) {
    const label = document.createElement("label"); label.className = "field";
    const caption = document.createElement("span"); caption.textContent = text; label.append(caption);
    const input = document.createElement(multi ? "textarea" : "input");
    input.name = name; input.value = value; input.required = required;
    if (multi) input.rows = 3;
    label.append(input); parent.append(label); return input;
  }
  function checkpoint(value = {}) {
    const row = document.createElement("div"); row.className = "finals-checkpoint";
    const heading = document.createElement("div"); heading.className = "finals-checkpoint-heading";
    const title = document.createElement("strong"); title.textContent = "Checkpoint source"; heading.append(title);
    const grid = document.createElement("div"); grid.className = "form-grid";
    field(grid, "Checkpoint ID", "id", value.id || "").placeholder = "e.g. act_weights";
    field(grid, "HF repository", "repo", value.repo || "").placeholder = "account/repository";
    const branch = field(grid, "HF branch (optional)", "ref", value.ref || "", false);
    branch.placeholder = "main"; branch.maxLength = 200; branch.spellcheck = false;
    field(grid, "Checkpoint path (optional)", "path", value.path || "", false).placeholder = "Subdirectory, or blank for repository root";
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "button button-secondary finals-remove";
    remove.title = "Remove checkpoint source"; remove.setAttribute("aria-label", remove.title);
    const icon = document.createElement("i"); icon.dataset.lucide = "trash-2"; remove.append(icon);
    remove.onclick = () => { row.remove(); saveDraft(); }; heading.append(remove); row.append(heading, grid);
    $("checkpoints").append(row);
    window.lucide?.createIcons();
  }
  const get = (node, name) => node.querySelector(`[name="${name}"]`).value.trim();
  function contents() {
    const form = $("submission");
    const submission = Object.fromEntries(["method_name", "repository", "code_ref", "compute_notes", "description", "dependency_notes", "data_sources"].map(n => [n, get(form, n)]));
    submission.checkpoints = [...$("checkpoints").children].map(row => Object.fromEntries(["id", "repo", "ref", "path"].map(n => [n, get(row,n)])));
    submission.tasks = [...$("tasks").children].map(row => ({ task: row.dataset.task, policy_path: get(row,"policy_path"),
      checkpoint_ids: get(row,"checkpoint_ids").split(/[\s,]+/).filter(Boolean),
      no_weights_reason: get(row,"no_weights_reason"), run_notes: get(row,"run_notes") }));
    return submission;
  }
  function renderForm() {
    $("tasks").replaceChildren(); $("checkpoints").replaceChildren();
    for (const task of status.tasks) {
      const row = document.createElement("details"); row.className = "finals-task"; row.dataset.task = task;
      const summary = document.createElement("summary");
      const title = document.createElement("span"); title.textContent = task.split("_").map(word => word[0].toUpperCase() + word.slice(1)).join(" ");
      const completion = document.createElement("span"); completion.className = "finals-task-status";
      const chevron = document.createElement("i"); chevron.dataset.lucide = "chevron-down"; chevron.setAttribute("aria-hidden", "true");
      summary.append(title, completion, chevron);
      const grid = document.createElement("div"); grid.className = "form-grid";
      const policy = field(grid, "Policy directory", "policy_path", "policy/");
      policy.placeholder = "policy/act"; policy.pattern = "policy/[A-Za-z0-9_]+";
      field(grid, "Checkpoint IDs", "checkpoint_ids", "", false).placeholder = "e.g. act_weights, shared_encoder";
      const command = field(grid, "Task run command and configuration overrides", "run_notes", "", true, true);
      command.placeholder = "Exact command and parameters for this task"; command.parentElement.classList.add("field-span-2");
      const reason = field(grid, "Reason if no checkpoint is used (otherwise leave blank)", "no_weights_reason", "", false);
      reason.parentElement.classList.add("field-span-2"); row.append(summary, grid);
      $("tasks").append(row);
    }
    const draft = sessionStorage.getItem("rsc-finals-draft:" + session.email);
    if (draft) {
      try {
        const data = JSON.parse(draft); const s = data.submission;
        for (const name of ["method_name", "repository", "code_ref", "compute_notes", "description", "dependency_notes", "data_sources"]) $("submission").elements[name].value = s[name] || "";
        (s.checkpoints || []).forEach(checkpoint);
        for (const row of $("tasks").children) {
          const t = (s.tasks || []).find(x => x.task === row.dataset.task); if (!t) continue;
          for (const name of ["policy_path", "no_weights_reason", "run_notes"]) row.querySelector(`[name="${name}"]`).value = t[name] || "";
          row.querySelector('[name="checkpoint_ids"]').value = (t.checkpoint_ids || []).join(", ");
        }
        pending = data.pending || null;
        if (s.commit || (s.checkpoints || []).some(item => item.revision)) pending = null;
      } catch { message("Saved draft could not be restored."); }
    } else checkpoint();
    updateTaskStatus();
    window.lucide?.createIcons();
  }
  async function refresh() {
    status = await api("finals_status");
    // Keep the workshop upload identity in sync when entering from finals.
    sessionStorage.setItem("robosynchallenge-session-v1", JSON.stringify({version:1,
      session:{session_id:session.session_id}, user:{email:session.email, team_name:status.team_name || "", role:"participant"}}));
    $("login-section").hidden = true; $("account").hidden = false;
    $("finalist-content").hidden = !status.eligible;
    $("identity").textContent = status.team_name || session.email;
    $("test-badge").hidden = !status.is_test;
    $("not-finalist").hidden = status.eligible; $("history").hidden = !status.eligible;
    $("submission").hidden = !status.intake_open;
    $("requests").replaceChildren();
    $("empty-history").hidden = Boolean(status.requests?.length);
    for (const req of status.requests || []) {
      const li = document.createElement("li"); li.textContent = `${req.request_id} · revision ${req.revision} · ${req.status} · ${req.created_at}`; $("requests").append(li);
    }
    if (/^https:\/\//.test(status.paper_url || "")) $("report-paper").href = status.paper_url;
    window.lucide?.createIcons();
    if (status.intake_open) { renderForm(); message(""); }
    else message(status.eligible ? "Finals submissions are not open at this time." : "");
  }
  $("add-checkpoint").onclick = () => { checkpoint(); saveDraft(); };
  $("logout").onclick = () => { sessionStorage.removeItem(key); sessionStorage.removeItem("robosynchallenge-session-v1"); location.reload(); };
  $("login").onsubmit = async e => {
    e.preventDefault(); const button = e.target.querySelector("button"); button.disabled = true;
    try {
      const email = get(e.target,"email"); const data = await api("login", { email, token: get(e.target,"token") });
      session = { email, session_id: data.session_id }; sessionStorage.setItem(key, JSON.stringify(session));
      e.target.elements.token.value = ""; await refresh();
    } catch (error) { message(error.message); } finally { button.disabled = false; }
  };
  function updateTaskStatus() {
    const sources = new Set([...$("checkpoints").children].map(row => get(row, "id")).filter(Boolean));
    let count = 0;
    for (const row of $("tasks").children) {
      const ids = get(row, "checkpoint_ids").split(/[\s,]+/).filter(Boolean);
      const complete = /^policy\/[A-Za-z0-9_]+$/.test(get(row, "policy_path")) && Boolean(get(row, "run_notes")) &&
        (ids.length ? ids.every(id => sources.has(id)) && new Set(ids).size === ids.length : Boolean(get(row, "no_weights_reason")));
      row.dataset.complete = String(complete);
      row.querySelector(".finals-task-status").textContent = complete ? "Configured" : "Required";
      if (complete) count++;
    }
    $("task-count").textContent = `${count} / ${status.tasks.length}`;
  }
  function saveDraft() {
    if (session && !$("submission").hidden) {
      updateTaskStatus();
      sessionStorage.setItem("rsc-finals-draft:" + session.email, JSON.stringify({submission:contents(), pending}));
    }
  }
  $("submission").addEventListener("input", saveDraft);
  // Native validation must expose fields inside collapsed task sections.
  $("submission").addEventListener("invalid", e => {
    for (let parent = e.target.parentElement; parent && parent !== $("submission"); parent = parent.parentElement) {
      if (parent.tagName === "DETAILS") parent.open = true;
    }
  }, true);
  $("submission").onsubmit = async e => {
    e.preventDefault(); const submission = contents(); const content = JSON.stringify(submission);
    if (!pending || pending.content !== content) pending = { content, key: crypto.randomUUID() };
    saveDraft(); $("submit-button").disabled = true;
    try {
      const result = await api("finals_submit", { submission, submission_key: pending.key });
      pending = null; saveDraft(); await refresh(); message(`Received ${result.request.request_id}, revision ${result.request.revision}.`);
    } catch (error) { message(error.name === "AbortError" ? "Outcome unknown. Your retry key is retained; retry the unchanged submission safely." : error.message); }
    finally { $("submit-button").disabled = false; }
  };
  try { session = JSON.parse(sessionStorage.getItem(key) || "null"); } catch { sessionStorage.removeItem(key); }
  if (session?.session_id) refresh().catch(error => message(error.message));
  window.lucide?.createIcons();
})();
