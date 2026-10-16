(() => {
  "use strict";

  const program = [
    { start: "10:30", end: "10:40", minutes: 10, title: "Opening Remarks & Competition Introduction" },
    { start: "10:40", end: "11:10", minutes: 30, title: "Invited Talk 1: Stone Tao" },
    { start: "11:10", end: "11:40", minutes: 30, title: "Invited Talk 2" },
    { start: "11:40", end: "12:00", minutes: 20, title: "Competition Results & Key Insights" },
    { start: "12:00", end: "12:35", minutes: 35, title: "Finalist Presentations" },
    { start: "12:35", end: "12:45", minutes: 10, title: "Awards & Closing Remarks" },
  ];
  const tasks = [
    { id: "click_bell", label: "Click Bell", simStart: 0, realStart: 0 },
    { id: "drawer_open_place", label: "Drawer Open Place", simStart: 3, realStart: 10 },
    { id: "mixer_operating", label: "Mixer Operating", simStart: 2, realStart: 9 },
    { id: "table_rearrangement", label: "Table Rearrangement", simStart: 0, realStart: 8 },
    { id: "water_pouring", label: "Water Pouring", simStart: 0, realStart: 16 },
    { id: "handle_basket", label: "Handle Basket", simStart: 3, realStart: 12 },
    { id: "items_handover", label: "Items Handover", simStart: 2, realStart: 14 },
    { id: "item_assembly", label: "Item Assembly", simStart: 1, realStart: 12 },
    { id: "manipulate_pipette", label: "Manipulate Pipette", simStart: 2, realStart: 12 },
    { id: "sample_loading", label: "Sample Loading", simStart: 3, realStart: 24 },
  ];
  const playlist = tasks.flatMap(task => [
    { label: task.label, mode: "Sim", src: `static/assets/evaluation-videos/${task.id}.mp4`, start: task.simStart },
    { label: task.label, mode: "Real", src: `static/assets/real-evaluation-videos/cobotmagic_Real_${task.id}.mp4`, start: task.realStart },
  ]);
  const clipLength = 10000;
  let teardown = null;
  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
  const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;

  function render(contactEmail) {
    return `
      <div class="workshop-page">
        <section class="hero workshop-hero" aria-labelledby="workshop-title">
          <div class="workshop-media" aria-hidden="true">
            <img class="workshop-poster" src="static/assets/workshop/sim-poster.jpg" alt="" fetchpriority="high">
            <video muted loop playsinline preload="none" tabindex="-1"></video>
            <video muted loop playsinline preload="none" tabindex="-1"></video>
          </div>
          <div class="shell workshop-hero-content">
            <p class="eyebrow">NeurIPS 2026 Competition Workshop</p>
            <h1 id="workshop-title">RoboSynChallenge 2026</h1>
            <p class="workshop-subtitle"><span>Mastering Real-World Dexterity via</span> <span>Generalizing Synthesized Manipulation Skills</span></p>
            <div class="workshop-event-details">
              <span>${icon("calendar-days")} Friday, 11 December 2026</span>
              <span>${icon("clock")} 10:30 AM&ndash;12:45 PM AEDT</span>
              <span>${icon("map-pin")} MR C4.3, Sydney</span>
            </div>
            <div class="cta-row workshop-hero-actions">
              <a class="button button-primary" href="static/assets/workshop/robosynchallenge-2026.ics" download>${icon("calendar-plus")} Add to calendar</a>
              <a class="button button-secondary" href="mailto:${escapeHtml(contactEmail)}">${icon("mail")} Contact</a>
            </div>
          </div>
        </section>

        <nav class="workshop-section-nav" aria-label="Workshop sections">
          <div class="shell nav-pill-row workshop-nav-inner">
            ${[["about", "About"], ["competition", "Competition"], ["program", "Program"], ["speakers", "Speakers"], ["research", "Results & papers"], ["presentations", "Presentations"], ["awards", "Awards"]].map(([id, label]) => `<a class="nav-pill" href="#/workshop" data-workshop-section="${id}">${label}</a>`).join("")}
          </div>
        </nav>

        <section id="workshop-about" class="section workshop-section">
          <div class="shell">
            <div class="workshop-editorial-grid">
              <div class="section-heading left"><p class="eyebrow">From simulation to the real world</p><h2>About the workshop</h2></div>
              <div class="workshop-prose">
                <p class="lead">How can large-scale synthetic data enable generalizable robotic manipulation?</p>
                <p>The RoboSynChallenge Workshop brings together researchers and practitioners to explore how synthetic demonstrations, combined with limited real-world data, improve manipulation performance and generalization. Advances in simulation and robot learning make synthetic data increasingly accessible; transferring learned skills to physical robots remains a fundamental challenge.</p>
              </div>
            </div>
            <figure class="workshop-pipeline">
              <img src="static/assets/robosynchallenge-pipeline.png" alt="RoboSynChallenge pipeline: data filtering and synthesis, simulation validation, simulation and real-world co-training, and real-world deployment and evaluation" width="1801" height="785" loading="lazy">
            </figure>
          </div>
        </section>

        <section id="workshop-competition" class="section section-alt workshop-section">
          <div class="shell workshop-editorial-grid">
            <div class="section-heading left"><p class="eyebrow">Benchmark &amp; resources</p><h2>The competition</h2></div>
            <div class="workshop-prose">
              <p>RoboSynChallenge evaluates generalizable robot manipulation across 10 tasks. Teams qualify in simulation, then demonstrate transfer on a standardized real dual-arm robot platform, using synthetic demonstrations and limited real-world data.</p>
              <div class="workshop-resource-links">
                <a href="https://github.com/EDEM-AI/RoboSynChallenge/tree/main" target="_blank" rel="noreferrer">${icon("code-2")} Code ${icon("arrow-up-right")}</a>
                <a href="https://huggingface.co/RoboSynChallenge/datasets" target="_blank" rel="noreferrer">${icon("database")} Released data ${icon("arrow-up-right")}</a>
                <a href="https://edem-ai.github.io/RoboSynChallenge/html/getting_started/overview.html" target="_blank" rel="noreferrer">${icon("book-open")} Tutorial ${icon("arrow-up-right")}</a>
                <a href="#/evaluation">${icon("clipboard-check")} Evaluation rules ${icon("arrow-up-right")}</a>
                <a href="#/faq">${icon("circle-help")} Competition FAQ ${icon("arrow-up-right")}</a>
                <a href="material/RoboSynChallenge-report.pdf" target="_blank" rel="noreferrer">${icon("file-text")} Competition report ${icon("arrow-up-right")}</a>
              </div>
            </div>
          </div>
        </section>

        <section id="workshop-program" class="section workshop-section">
          <div class="shell">
            <div class="workshop-heading-row">
              <div class="section-heading left"><p class="eyebrow">135 minutes</p><h2>Workshop program</h2></div>
              <p class="workshop-timezone">All times AEDT / Sydney time</p>
            </div>
            <table class="workshop-program-table">
              <caption class="workshop-visually-hidden">Workshop schedule in Sydney time (AEDT)</caption>
              <thead><tr><th scope="col">Time (AEDT)</th><th scope="col">Session</th><th scope="col">Duration</th></tr></thead>
              <tbody>${program.map(slot => `
                <tr><th scope="row"><time>${slot.start}</time><span>&ndash; ${slot.end}</span></th>
                <td>${escapeHtml(slot.title)}</td><td>${slot.minutes} min</td></tr>
              `).join("")}</tbody>
            </table>
          </div>
        </section>

        <section id="workshop-speakers" class="section section-alt workshop-section">
          <div class="shell">
            <div class="section-heading left"><p class="eyebrow">Research perspectives</p><h2>Invited speakers</h2></div>
            <div class="workshop-speaker-grid">
              <article class="card workshop-speaker">
                <div class="workshop-speaker-heading">
                  <img class="workshop-speaker-photo" src="static/assets/workshop/stone-tao.jpeg" alt="Stone Tao" width="400" height="400" loading="lazy">
                  <div>
                    <p class="workshop-talk-label">Invited Talk 1</p>
                    <h3>Stone Tao</h3>
                    <p class="workshop-speaker-affiliation">Physical Intelligence</p>
                  </div>
                </div>
                <p class="workshop-speaker-talk">Talk info to be announced</p>
                <p class="workshop-speaker-bio">Stone is a member of technical staff at Physical Intelligence, driving research and engineering on simulation. He currently is completing his PhD at UC San Diego advised by Henrik Christensen and previously Hao Su. His research investigates the intersection of simulation and robot learning and how that can be leveraged for training, evaluation, and deployment of robotic systems. His work spans scalable simulation infrastructure, reinforcement learning, sim-to-real, and synthetic data generation for robotics.</p>
              </article>
              <article class="card workshop-speaker">
                <span class="workshop-speaker-icon">${icon("mic")}</span>
                <p class="workshop-talk-label">Invited Talk 2</p>
                <h3>Talk info to be announced</h3>
              </article>
            </div>
          </div>
        </section>

        <section id="workshop-research" class="section workshop-section">
          <div class="shell">
            <div class="workshop-heading-row">
              <div class="section-heading left"><p class="eyebrow">Competition Results &amp; Key Insights</p><h2>Results &amp; Research Highlights</h2></div>
              <p class="workshop-session-date">11 December 2026<br>11:40 AM&ndash;12:00 PM AEDT</p>
            </div>
            <div class="workshop-research-grid">
              <div class="workshop-leaderboards">
                <h3>Competition leaderboards</h3>
                ${[["Simulation leaderboard", "Preliminary simulation"], ["Real-robot leaderboard", "Final real-robot evaluation"]].map(([title, label]) => `
                  <article class="workshop-pending-item">
                    <p class="workshop-muted">${label}</p><h4>${title}</h4>
                    <p class="workshop-release-date">Workshop announcement: 11 December 2026</p>
                    <button class="button workshop-button-pending" type="button" disabled>${icon("clock-3")} Coming soon</button>
                  </article>
                `).join("")}
              </div>
              <div class="workshop-papers">
                <h3>Submitted papers</h3>
                <p class="workshop-prose">Finalist teams may submit papers to the RoboSynChallenge workshop. Submission details and the paper collection will be announced here.</p>
                <table class="workshop-paper-table"><caption class="workshop-visually-hidden">Finalist papers</caption><thead><tr><th scope="col">Paper</th><th scope="col">Team</th></tr></thead><tbody><tr><td colspan="2" class="workshop-table-empty">${icon("files")} Coming soon</td></tr></tbody></table>
                <button class="button workshop-button-pending" type="button" disabled>${icon("file-up")} Submit a paper &middot; Coming soon</button>
              </div>
            </div>
          </div>
        </section>

        <section id="workshop-presentations" class="section section-alt workshop-section">
          <div class="shell">
            <div class="workshop-heading-row">
              <div class="section-heading left"><p class="eyebrow">Finalist recordings</p><h2>Finalist Presentations</h2></div>
              <p class="workshop-session-date">11 December 2026<br>12:00&ndash;12:35 PM AEDT</p>
            </div>
            <div class="workshop-recording-stage" tabindex="0" aria-label="Finalist presentation recordings">
              ${[0, 1, 2].map(index => `
                <button type="button" class="workshop-recording-card" data-recording-index="${index}" data-position="${["center", "right", "left"][index]}" ${index === 0 ? 'disabled aria-label="Recording coming soon"' : `aria-label="${index === 1 ? "Next" : "Previous"} presentation"`}>
                  <span class="workshop-recording-screen"><span class="workshop-recording-play">${icon("circle-play")}</span><span>Coming soon</span></span>
                  <span class="workshop-recording-caption">Finalist presentation</span>
                </button>
              `).join("")}
            </div>
            <div class="workshop-recording-controls">
              <button class="workshop-icon-button" type="button" data-recording-step="-1" aria-label="Previous presentation" title="Previous presentation">${icon("arrow-left")}</button>
              <button class="button workshop-button-pending" type="button" disabled>${icon("video")} Watch recording &middot; Coming soon</button>
              <button class="workshop-icon-button" type="button" data-recording-step="1" aria-label="Next presentation" title="Next presentation">${icon("arrow-right")}</button>
            </div>
            <p class="workshop-visually-hidden" data-recording-status aria-live="polite">Recording coming soon</p>
          </div>
        </section>

        <section id="workshop-awards" class="section workshop-section">
          <div class="shell">
            <div class="workshop-heading-row">
              <div class="section-heading left"><p class="eyebrow">Recognition &amp; closing</p><h2>Awards &amp; Closing Remarks</h2></div>
              <p class="workshop-session-date">11 December 2026<br>12:35&ndash;12:45 PM AEDT</p>
            </div>
            <table class="workshop-awards-table"><caption class="workshop-visually-hidden">Award recipients</caption><thead><tr><th scope="col">Award</th><th scope="col">Team</th><th scope="col">Affiliation</th></tr></thead><tbody><tr><td colspan="3" class="workshop-table-empty">${icon("trophy")} Coming soon</td></tr></tbody></table>
          </div>
        </section>
      </div>
    `;
  }

  function cleanup() {
    teardown?.();
    teardown = null;
  }

  function init(root) {
    cleanup();
    document.querySelector("[data-nav-menu]")?.classList.remove("is-open");
    window.scrollTo({ top: 0, behavior: "instant" });
    window.lucide?.createIcons();
    root.querySelectorAll("[data-workshop-section]").forEach(link => link.addEventListener("click", event => {
      event.preventDefault();
      const target = root.querySelector(`#workshop-${link.dataset.workshopSection}`);
      root.querySelectorAll("[data-workshop-section]").forEach(item => {
        const active = item === link;
        item.classList.toggle("active", active);
        if (active) item.setAttribute("aria-current", "location");
        else item.removeAttribute("aria-current");
      });
      target.style.scrollMarginTop = `${Math.ceil(document.querySelector(".site-header").getBoundingClientRect().height) + 24}px`;
      target.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
      target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    }));
    const firstLink = root.querySelector("[data-workshop-section]");
    firstLink.classList.add("active");
    firstLink.setAttribute("aria-current", "location");

    const recordingCards = [...root.querySelectorAll("[data-recording-index]")];
    const recordingStage = root.querySelector(".workshop-recording-stage");
    let selectedRecording = 0;
    function selectRecording(step) {
      selectedRecording = (selectedRecording + step + recordingCards.length) % recordingCards.length;
      recordingCards.forEach((card, index) => {
        const offset = (index - selectedRecording + recordingCards.length) % recordingCards.length;
        const position = ["center", "right", "left"][offset];
        card.dataset.position = position;
        card.disabled = position === "center";
        card.setAttribute("aria-label", position === "center" ? "Recording coming soon" : `${position === "left" ? "Previous" : "Next"} presentation`);
      });
      root.querySelector("[data-recording-status]").textContent = `${step > 0 ? "Next" : "Previous"} presentation: recording coming soon`;
    }
    recordingCards.forEach(card => card.addEventListener("click", () => selectRecording(card.dataset.position === "left" ? -1 : 1)));
    root.querySelectorAll("[data-recording-step]").forEach(button => button.addEventListener("click", () => selectRecording(Number(button.dataset.recordingStep))));
    recordingStage.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      selectRecording(event.key === "ArrowLeft" ? -1 : 1);
    });

    const hero = root.querySelector(".workshop-hero");
    const videos = [...root.querySelectorAll(".workshop-media video")];
    let destroyed = false, activeLayer = 0, current = -1, sequence = 0, failures = 0, loading = false;
    let timer = null, deadline = 0, remaining = clipLength, visible = true;
    let fadeFrame = null;
    let userPaused = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const loaders = new Set();
    const canPlay = () => !destroyed && !userPaused && visible && !document.hidden;

    function updateFraming() {
      const ratio = hero.clientWidth / hero.clientHeight;
      for (const video of videos) {
        const source = video.videoWidth / video.videoHeight;
        const crop = Math.max(ratio / source, source / ratio);
        // Never discard more than a quarter of a task view just to fill the banner.
        video.style.objectFit = Number.isFinite(crop) && crop <= 4 / 3 ? "cover" : "contain";
      }
    }
    const framingObserver = new ResizeObserver(updateFraming);
    framingObserver.observe(hero);

    function syncPlayback() {
      hero.dataset.videoPaused = String(!canPlay());
    }

    function fade() {
      if (!canPlay() || current < 0) return;
      const left = Math.max(0, deadline - performance.now());
      const elapsed = clipLength - left;
      videos[activeLayer].style.opacity = String(Math.max(0, Math.min(1, elapsed / 750, left / 750)));
      fadeFrame = requestAnimationFrame(fade);
    }

    function prepare(video, index) {
      if (Number(video.dataset.clipIndex) === index && video.readyState >= 2 && !video.seeking) return Promise.resolve();
      video.cancelWorkshopLoad?.();
      return new Promise((resolve, reject) => {
        const clip = playlist[index];
        let timeout;
        const done = error => {
          clearTimeout(timeout);
          video.removeEventListener("loadedmetadata", seek);
          video.removeEventListener("loadeddata", ready);
          video.removeEventListener("seeked", ready);
          video.removeEventListener("error", failed);
          loaders.delete(cancel);
          if (video.cancelWorkshopLoad === cancel) video.cancelWorkshopLoad = null;
          error ? reject(error) : resolve();
        };
        const seek = () => {
          updateFraming();
          video.currentTime = Math.min(clip.start, Math.max(0, video.duration - 1));
        };
        const ready = () => {
          if (video.readyState >= 2 && !video.seeking) done();
        };
        const failed = () => done(new Error("Video unavailable"));
        const cancel = () => done(new Error("Video load cancelled"));
        loaders.add(cancel);
        video.cancelWorkshopLoad = cancel;
        video.pause();
        video.muted = true;
        video.dataset.clipIndex = String(index);
        video.addEventListener("loadedmetadata", seek, { once: true });
        video.addEventListener("loadeddata", ready, { once: true });
        video.addEventListener("seeked", ready, { once: true });
        video.addEventListener("error", failed, { once: true });
        timeout = setTimeout(failed, 15000);
        video.src = clip.src;
        video.load();
      });
    }

    function schedule() {
      clearTimeout(timer);
      if (!canPlay() || current < 0) return;
      deadline = performance.now() + remaining;
      timer = setTimeout(() => show((current + 1) % playlist.length), remaining);
      cancelAnimationFrame(fadeFrame);
      fadeFrame = requestAnimationFrame(fade);
    }

    async function show(index) {
      const request = ++sequence;
      loading = true;
      clearTimeout(timer);
      const nextLayer = current < 0 ? activeLayer : 1 - activeLayer;
      const video = videos[nextLayer];
      try {
        await prepare(video, index);
        if (destroyed || request !== sequence) return;
        if (canPlay()) await video.play();
        if (destroyed || request !== sequence) return;
        videos[activeLayer].classList.remove("active");
        videos[activeLayer].style.opacity = "0";
        if (nextLayer !== activeLayer) videos[activeLayer].pause();
        activeLayer = nextLayer;
        current = index;
        failures = 0;
        video.classList.add("active");
        video.style.opacity = canPlay() ? "0" : "1";
        root.querySelector(".workshop-media").classList.add("has-video");
        hero.dataset.clipIndex = String(index);
        remaining = clipLength;
        syncPlayback();
        schedule();
        // Load only the current clip and the next one, not all twenty videos.
        prepare(videos[1 - activeLayer], (index + 1) % playlist.length).catch(() => {});
      } catch (error) {
        if (destroyed || request !== sequence) return;
        if (error.name === "NotAllowedError") {
          userPaused = true;
          syncPlayback();
          show(index);
        } else if (++failures < playlist.length) {
          show((index + 1) % playlist.length);
        } else {
          userPaused = true;
          syncPlayback();
        }
      } finally {
        if (request === sequence) loading = false;
      }
    }

    function suspend() {
      if (timer) remaining = Math.max(0, deadline - performance.now());
      clearTimeout(timer);
      cancelAnimationFrame(fadeFrame);
      timer = null;
      videos.forEach(video => video.pause());
      syncPlayback();
    }

    function resume() {
      if (!canPlay()) return;
      if (current < 0) { if (!loading) show(0); return; }
      videos[activeLayer].play().then(schedule).catch(() => { userPaused = true; syncPlayback(); });
      syncPlayback();
    }

    const onVisibility = () => document.hidden ? suspend() : resume();
    document.addEventListener("visibilitychange", onVisibility);
    const observer = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      visible ? resume() : suspend();
    }, { threshold: 0.05 });
    observer.observe(hero);
    teardown = () => {
      destroyed = true;
      ++sequence;
      clearTimeout(timer);
      cancelAnimationFrame(fadeFrame);
      observer.disconnect();
      framingObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      [...loaders].forEach(cancel => cancel());
      videos.forEach(video => { video.pause(); video.removeAttribute("src"); video.load(); });
    };
    syncPlayback();
    show(0);
  }

  window.ROBO_SYN_WORKSHOP = { render, init, cleanup };
})();
