(() => {
  "use strict";
  const config = window.ROBO_SYN_CONFIG || {};
  const views = [
    ["overall", "Average"], ["table_rearrangement", "Table rearrangement"], ["click_bell", "Click bell"],
    ["water_pouring", "Water pouring"], ["handle_basket", "Handle basket"], ["items_handover", "Items handover"],
    ["drawer_open_place", "Drawer open place"], ["mixer_operating", "Mixer operating"], ["item_assembly", "Item assembly"],
    ["manipulate_pipette", "Manipulate pipette"], ["sample_loading", "Sample loading"],
  ];
  const escape = value => String(value).replace(/[&<>"']/g, char => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"})[char]);
  let data = null, loading = false, error = "";
  const notify = () => window.dispatchEvent(new Event("rsc:preliminary-leaderboard"));

  async function load() {
    if (loading) return;
    loading = true;
    error = "";
    data = null;
    notify();
    try {
      const response = await fetch(config.PRELIMINARY_LEADERBOARD_URL || "static/preliminary-leaderboard.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Preliminary results are not available.");
      const value = await response.json();
      if (value.schema !== 1 || value.stage !== "preliminary_simulation" || value.review_status !== "reviewed" ||
          !Number.isInteger(value.team_count) || !Array.isArray(value.tables) || value.tables.length !== 11 ||
          views.some(([id]) => value.tables.filter(table => table.id === id && Array.isArray(table.rows) && table.rows.length === value.team_count).length !== 1)) {
        throw new Error("The preliminary results snapshot is incomplete.");
      }
      data = value;
    } catch (failure) {
      error = failure.message || "Could not load preliminary results.";
    } finally {
      loading = false;
      notify();
    }
  }

  function render(view = "overall", renderTable) {
    if (!views.some(([id]) => id === view)) view = "overall";
    if (!data && !loading && !error) void load();
    const heading = `<section class="page-hero shell leaderboard-hero"><span class="eyebrow">Preliminary simulation</span><h1>Preliminary leaderboard.</h1><p class="lead narrow">Ranked by the FAQ weighted score across success rate, action efficiency, and inference efficiency.</p></section>`;
    if (loading) return `${heading}<section class="section shell"><p role="status">Loading preliminary results...</p></section>`;
    if (error) return `${heading}<section class="section shell"><p role="alert">${escape(error)}</p><button type="button" class="button button-secondary" data-preliminary-refresh>Retry</button></section>`;
    return `${heading}<div class="leaderboard-stack preliminary-leaderboard">${views.map(([id, label]) => {
        const table = data.tables.find(item => item.id === id);
        const rows = table.rows.map(row => ({
          model_name: row.model_name, username_display: row.team_name, rank_badge: "",
          weighted_score: id === "overall" ? row.weighted_all : row.weighted_score,
          success_rate: row.success_rate, action_steps: row.average_steps,
          real_time: row.inference_ms / 1000,
          result_url: "", protocol_url: "", evaluation_id: "",
        }));
        return renderTable(rows, { id, label, teamFirst: true });
      }).join("")}</div>`;
  }

  function measureHeader() {
    const header = document.querySelector(".site-header")?.getBoundingClientRect().height || 0;
    document.documentElement.style.setProperty("--leaderboard-jump-offset", `${header + 16}px`);
  }

  function init(view = "overall") {
    if (!data || !document.querySelector(".preliminary-leaderboard")) return;
    measureHeader();
    if (view !== "overall") {
      document.getElementById("leaderboard-" + view)?.scrollIntoView({ block: "start", behavior: "instant" });
    }
  }

  document.addEventListener("click", event => {
    if (event.target.closest("[data-preliminary-refresh]")) void load();
  });
  window.addEventListener("resize", measureHeader);
  window.ROBO_SYN_PRELIMINARY = { render, init, refresh: load };
})();
