(() => {
  "use strict";
  const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  function render() {
    return `<div class="paper-page">
      <header class="shell paper-heading">
        <span class="eyebrow">Technical reports &middot; RoboSynChallenge workshop</span>
        <h1>Submit your paper.</h1>
        <p class="lead">Share your team's work from the preliminary round or real-robot finals.</p>
        <p class="helper-note">Submission deadline: <strong>November 15, 2026, 23:59 AoE</strong> (UTC&minus;12)</p>
      </header>
      <section class="section shell paper-content">
        <div class="card paper-form">
          <div class="section-heading left"><span class="eyebrow">Technical report</span><h2>Prepare your paper.</h2></div>
          <p>Use the RoboSynChallenge 2026 LaTeX template. The main content is limited to 6 pages, including figures and tables; references are excluded.</p>
          <div class="cta-row">
            <a class="button button-secondary" href="material/RoboSynChallenge-2026-submission-template.zip" download>${icon("download")} Download template</a>
            <a class="paper-reference" href="https://arxiv.org/abs/2608.12416" target="_blank" rel="noopener noreferrer">RoboSynChallenge paper ${icon("external-link")}</a>
          </div>
          <div class="paper-upload">
            <form id="paper-login" class="panel-stack compact">
              <h3>Sign in to submit</h3>
              <div class="form-grid">
                <label class="field"><span>Registered email</span><input name="email" type="email" autocomplete="username" placeholder="user@example.org" required></label>
                <label class="field"><span>Access token</span><input name="token" type="password" autocomplete="current-password" placeholder="Access token issued by the organizers" required></label>
              </div>
              <div class="section-actions"><button class="button button-primary" type="submit">Sign in</button></div>
            </form>
            <div id="paper-account" hidden>
              <p class="paper-identity"><strong id="paper-team"></strong><span id="paper-stage"></span></p>
              <p class="helper-note">PDF &middot; up to 10 MiB</p>
              <input id="paper-file" type="file" accept="application/pdf,.pdf" hidden>
              <button id="paper-submit" class="button button-primary" type="button" disabled>${icon("file-up")} Submit a paper</button>
            </div>
            <p id="paper-status" class="form-status" role="status" aria-live="polite"></p>
            <p id="paper-preview-note" class="helper-note" hidden>Local preview: files stay on this machine. No Google Drive upload or email is sent.</p>
          </div>
        </div>
        <section id="paper-history" class="paper-history" hidden><h2>Your submitted reports</h2><ul id="paper-receipts"></ul></section>
        <div class="cta-row paper-back"><a class="button button-secondary" href="#/workshop">${icon("arrow-left")} Back to workshop</a></div>
      </section>
    </div>`;
  }

  async function init(root, initialSession, onSession) {
    const page = root.querySelector(".paper-page");
    const $ = id => page.querySelector("#" + id);
    let session = initialSession?.session_id ? initialSession : null, status = null;
    if (!session) {
      try { session = JSON.parse(sessionStorage.getItem("rsc-finals-session-v1") || "null"); } catch { /* Sign in below. */ }
    }
    const show = text => { $("paper-status").textContent = text; };
    async function api(action, payload = {}) {
      const url = window.ROBO_SYN_CONFIG?.API_BASE_URL;
      if (!url) throw new Error("Paper submission backend is not configured.");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 120000);
      try {
        const response = await fetch(url, {method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"},
          body:JSON.stringify({action, session_id:session?.session_id, ...payload}), signal:controller.signal});
        const result = await response.json();
        if (!response.ok || result.ok === false) throw new Error(result.error || "Request failed.");
        return result;
      } finally { clearTimeout(timer); }
    }
    function receipts(requests) {
      $("paper-receipts").replaceChildren();
      $("paper-history").hidden = !requests.length;
      for (const row of [...requests].reverse()) {
        const li = document.createElement("li"), name = document.createElement("strong"), meta = document.createElement("span");
        name.textContent = row.filename;
        const stored = row.status === "stored" ? "Received" : "Upload incomplete; select the same PDF to retry";
        meta.textContent = `${stored} · ${row.stage === "finals" ? "Finals" : "Preliminary"} · ${new Date(row.created_at).toLocaleString()}`;
        li.append(name, meta); $("paper-receipts").append(li);
      }
    }
    async function refresh() {
      status = await api("paper_status");
      if (!page.isConnected) return;
      $("paper-login").hidden = true; $("paper-account").hidden = false;
      $("paper-team").textContent = status.team_name;
      $("paper-stage").textContent = status.stage === "finals" ? "Finals" : "Preliminary";
      $("paper-submit").disabled = !status.intake_open;
      $("paper-preview-note").hidden = !status.preview;
      receipts(status.requests || []);
      onSession({session_id:session.session_id}, {email:status.email, team_name:status.team_name});
      sessionStorage.removeItem("rsc-finals-session-v1");
      show(status.intake_open ? "" : "Paper submissions are not open at this time.");
    }
    $("paper-login").onsubmit = async event => {
      event.preventDefault();
      const form = event.target, button = form.querySelector("button"); button.disabled = true;
      try {
        const data = await api("login", {email:form.elements.email.value.trim(), token:form.elements.token.value});
        form.elements.token.value = "";
        session = {session_id:data.session_id || data.session?.session_id};
        if (!session.session_id) throw new Error("Sign-in response is missing a session.");
        await refresh();
      } catch (error) { show(error.message); } finally { button.disabled = false; }
    };
    $("paper-submit").onclick = () => $("paper-file").click();
    $("paper-file").onchange = async event => {
      const file = event.target.files[0];
      if (!file) return;
      const button = $("paper-submit"); button.disabled = true; button.setAttribute("aria-busy", "true");
      try {
        if (!/\.pdf$/i.test(file.name) || !file.size || file.size > status.max_bytes) throw new Error("Select a PDF no larger than 10 MiB.");
        show("Uploading " + file.name + "...");
        const bytes = await file.arrayBuffer();
        const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(b => b.toString(16).padStart(2,"0")).join("");
        const encoded = await new Promise((resolve,reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(",")[1]);
          reader.onerror = () => reject(new Error("The selected file could not be read."));
          reader.readAsDataURL(new Blob([bytes]));
        });
        const result = await api("paper_submit", {pdf_base64:encoded, sha256:hash});
        if (result.request?.status !== "stored") throw new Error("The upload was not confirmed. Select the same PDF to retry.");
        const row = result.request;
        receipts([...(status.requests || []).filter(r => r.paper_id !== row.paper_id), row]);
        status.requests = [...(status.requests || []).filter(r => r.paper_id !== row.paper_id), row];
        show(`${result.already_recorded ? "Already received" : "Received"}: ${row.filename}.${result.preview ? " Saved locally for preview only." : row.mail_status === "sent" ? " The organizers have been notified." : " Organizer notification is pending; no need to upload again."}`);
      } catch (error) {
        show(error.name === "AbortError" || error instanceof TypeError ? "Upload confirmation was interrupted. Select the same PDF to retry safely." : error.message);
      } finally {
        event.target.value = ""; button.disabled = !status?.intake_open; button.removeAttribute("aria-busy");
      }
    };
    window.lucide?.createIcons();
    if (session?.session_id) {
      try { await refresh(); } catch (error) { show(error.message); }
    }
  }
  window.ROBO_SYN_PAPERS = {render, init};
})();
