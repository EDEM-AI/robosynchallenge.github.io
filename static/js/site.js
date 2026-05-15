const navToggle = document.querySelector("[data-nav-toggle]");
const navMenu = document.querySelector("[data-nav-menu]");

if (navToggle && navMenu) {
  navToggle.addEventListener("click", () => {
    navMenu.classList.toggle("is-open");
  });
}

const evalForm = document.querySelector("[data-eval-form]");

if (evalForm) {
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

  if (otherToggle) otherToggle.addEventListener("change", syncOtherSource);
  if (outputChunk) outputChunk.addEventListener("input", syncChunkHint);
  if (executionChunk) executionChunk.addEventListener("input", syncChunkHint);
}

const viewer = document.querySelector("[data-result-viewer]");

if (viewer) {
  const episodes = JSON.parse(viewer.dataset.episodes || "[]");
  const episodeSlider = viewer.querySelector("[data-episode-slider]");
  const timeSlider = viewer.querySelector("[data-time-slider]");
  const video = viewer.querySelector("[data-result-video]");
  const emptyState = viewer.querySelector("[data-video-empty]");
  const title = viewer.querySelector("[data-episode-title]");
  const timeReadout = viewer.querySelector("[data-time-readout]");
  const currentTask = document.querySelector("[data-current-task]");
  const episodeNotes = document.querySelector("[data-episode-notes]");

  const formatSeconds = (seconds) => `${Number(seconds || 0).toFixed(1)}s`;

  const syncTimeFromVideo = () => {
    if (!video || !timeSlider || !timeReadout) return;
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

  if (episodeSlider) {
    episodeSlider.addEventListener("input", () => {
      loadEpisode(Number(episodeSlider.value) - 1);
    });
  }

  if (timeSlider) {
    timeSlider.addEventListener("input", () => {
      if (!video.src) return;
      video.currentTime = Number(timeSlider.value || 0);
      timeReadout.textContent = formatSeconds(timeSlider.value || 0);
    });
  }

  if (video) {
    video.addEventListener("timeupdate", syncTimeFromVideo);
    video.addEventListener("loadedmetadata", () => {
      if (timeSlider) timeSlider.max = String(video.duration || 0);
    });
  }

  loadEpisode(0);
}
