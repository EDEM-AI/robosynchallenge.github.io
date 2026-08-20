(() => {
  "use strict";

  const release = Object.freeze({
    published_at: "2026-08-17",
    environment: "simulation",
    setting: "random",
    metric: "success_rate",
    episodes_per_checkpoint: 100,
    protocol_revision: "bd6bf77a63300f4b9a9d32337b519194dc7311a4",
    source_url: "https://github.com/EDEM-AI/RoboSynChallenge/tree/main/evaluation_results",
    data_url: "https://github.com/EDEM-AI/RoboSynChallenge/blob/main/evaluation_results/released_checkpoint_results.json",
    results: [
      {
        task_id: "click_bell",
        task_name: "Click bell",
        protocol_path: "configs/click_bell/random/gym_config.json",
        policies: {
          ACT: { success_count: 37, success_rate: 37.0, action_steps: 662.00, inference_time_ms: 155, repo_id: "RoboSynChallenge/ACT_sim_click_bell", revision: "677e65fbb15974024ff840893496197ef7db26d4" },
          DP: { success_count: 44, success_rate: 44.0, action_steps: 584.64, inference_time_ms: 8620, repo_id: "RoboSynChallenge/DP_sim_click_bell", revision: "fb8c9551e0fade7c4888a926ab577b85f0684da1" },
        },
      },
      {
        task_id: "drawer_open_place",
        task_name: "Drawer open and place",
        protocol_path: "configs/drawer_open_place/random/gym_config.json",
        policies: {
          ACT: { success_count: 29, success_rate: 29.0, action_steps: 812.70, inference_time_ms: 190, repo_id: "RoboSynChallenge/ACT_sim_drawer_open_place", revision: "592e30434aad83cf7bd8f1ee105d7c401488743d" },
          DP: { success_count: 0, success_rate: 0.0, action_steps: 1000.00, inference_time_ms: 14648, repo_id: "RoboSynChallenge/DP_sim_drawer_open_place", revision: "c5600daa96623adb4f8cd0c156b70836c30b1288" },
        },
      },
      {
        task_id: "mixer_operating",
        task_name: "Mixer operating",
        protocol_path: "configs/mixer_operating/random/gym_config.json",
        policies: {
          ACT: { success_count: 77, success_rate: 77.0, action_steps: 425.49, inference_time_ms: 101, repo_id: "RoboSynChallenge/ACT_sim_mixer_operating", revision: "0f12c53a2a6e093ae5e1e28f20480296b45fdf2b" },
          DP: { success_count: 69, success_rate: 69.0, action_steps: 490.24, inference_time_ms: 7260, repo_id: "RoboSynChallenge/DP_sim_mixer_operating", revision: "c05afece66ead46b47f6532c86d95cb3dd0f628e" },
        },
      },
      {
        task_id: "table_rearrangement",
        task_name: "Table rearrangement",
        protocol_path: "configs/table_rearrangement/random/gym_config.json",
        policies: {
          ACT: { success_count: 63, success_rate: 63.0, action_steps: 454.80, inference_time_ms: 109, repo_id: "RoboSynChallenge/ACT_sim_table_rearrangement", revision: "3a46b36fade1772176b791dd87349f479d0a98c8" },
          DP: { success_count: 16, success_rate: 16.0, action_steps: 855.60, inference_time_ms: 12570, repo_id: "RoboSynChallenge/DP_sim_table_rearrangement", revision: "99c73475a13ec2583b5105dc3773f88bbdeba9f5" },
        },
      },
      {
        task_id: "water_pouring",
        task_name: "Water pouring",
        protocol_path: "configs/water_pouring/random/gym_config.json",
        policies: {
          ACT: { success_count: 72, success_rate: 72.0, action_steps: 416.00, inference_time_ms: 98, repo_id: "RoboSynChallenge/ACT_sim_water_pouring", revision: "0bf0fcfc931a69c52871385f28068fcf873cf07a" },
          DP: { success_count: 33, success_rate: 33.0, action_steps: 731.76, inference_time_ms: 10725, repo_id: "RoboSynChallenge/DP_sim_water_pouring", revision: "b67e1ce7444dfa2940970088ebbe04a8b01013cc" },
        },
      },
    ],
    aggregate: {
      ACT: { success_count: 278, episode_count: 500, macro_success_rate: 55.6 },
      DP: { success_count: 162, episode_count: 500, macro_success_rate: 32.4 },
    },
  });

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatPercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "Not available";
    return `${number.toFixed(1).replace(/\.0$/, "")}%`;
  }

  function checkpointRevisionUrl(policy) {
    return `https://huggingface.co/${policy.repo_id}/tree/${policy.revision}`;
  }

  function average(numbers) {
    const finite = numbers.map(Number).filter(Number.isFinite);
    if (!finite.length) return null;
    return finite.reduce((total, value) => total + value, 0) / finite.length;
  }

  function releasedPolicyTaskScore(result, policyName) {
    const policy = result.policies[policyName];
    return {
      task_id: result.task_id,
      success_rate: policy.success_rate,
      action_steps: policy.action_steps,
      real_time: policy.inference_time_ms / 1000,
    };
  }

  function releasedPolicyAggregateRow(policyName) {
    const aggregate = release.aggregate[policyName];
    const taskScores = release.results.map((result) => releasedPolicyTaskScore(result, policyName));
    const modelName = `official ${policyName}_sim_average`;
    return {
      kind: "released_checkpoint_average",
      id: `${policyName.toLowerCase()}-sim-average`,
      model_name: modelName,
      username_display: "RoboSynChallenge",
      affiliation: "RoboSynChallenge",
      task_id: "",
      task_name: "Average",
      stage_label: `Simulation ${release.setting}`,
      evaluation_stage: "preliminary_simulation",
      data_regime: `Five-task macro average / ${release.setting}`,
      success_rate: aggregate.macro_success_rate,
      action_steps: average(taskScores.map((score) => score.action_steps)),
      real_time: average(taskScores.map((score) => score.real_time)),
      rank_badge: `${aggregate.success_count} / ${aggregate.episode_count} successful episodes`,
      evaluation_id: "",
      result_url: release.data_url,
      protocol_url: release.source_url,
      task_scores: taskScores,
      notes: `${modelName} evaluated across the released ${release.setting} task set.`,
    };
  }

  window.ROBO_SYN_RELEASED_CHECKPOINT_EVALS = release;
  window.ROBO_SYN_GET_RELEASED_CHECKPOINT_AVERAGE_ROWS = function getReleasedCheckpointAverageRows() {
    return ["ACT", "DP"].map(releasedPolicyAggregateRow);
  };

  window.ROBO_SYN_GET_RELEASED_CHECKPOINT_LEADERBOARD_ROWS = function getReleasedCheckpointLeaderboardRows() {
    return release.results.flatMap((result) => Object.entries(result.policies).map(([policyName, policy]) => {
      const modelName = policy.repo_id.replace(/^RoboSynChallenge\//, "official ");
      const protocolUrl = `https://github.com/EDEM-AI/RoboSynChallenge/blob/${release.protocol_revision}/${result.protocol_path}`;
      return {
        kind: "released_checkpoint",
        id: `${policyName.toLowerCase()}-${result.task_id}`,
        model_name: modelName,
        username_display: "RoboSynChallenge",
        affiliation: "RoboSynChallenge",
        task_id: result.task_id,
        task_name: result.task_name,
        stage_label: `Simulation ${release.setting}`,
        evaluation_stage: "preliminary_simulation",
        data_regime: `${result.task_name} / ${release.setting}`,
        success_rate: policy.success_rate,
        action_steps: policy.action_steps,
        real_time: policy.inference_time_ms / 1000,
        inference_time_ms: policy.inference_time_ms,
        rank_badge: `${policy.success_count} / ${release.episodes_per_checkpoint} successful episodes`,
        evaluation_id: "",
        result_url: checkpointRevisionUrl(policy),
        protocol_url: protocolUrl,
        notes: `${modelName} evaluated on ${result.task_name} with ${release.setting}.`,
      };
    }));
  };
  window.ROBO_SYN_RENDER_RELEASED_CHECKPOINT_RESULTS = function renderReleasedCheckpointResults() {
    const policies = ["ACT", "DP"];
    const episodes = release.episodes_per_checkpoint;

    return `
      <article class="card checkpoint-results-card">
        <div class="section-heading left">
          <span class="eyebrow">Released checkpoints</span>
          <h2>Released checkpoint evaluations.</h2>
        </div>
        <p class="field-note">
          Each task uses the <code>random</code> configuration for ${episodes} episodes.
          Every score links to the exact evaluated Hugging Face checkpoint revision; task names link to
          the pinned evaluation configuration.
        </p>
        <div class="table-shell">
          <table class="leaderboard-table">
            <thead><tr><th>Task</th><th>ACT</th><th>DP</th></tr></thead>
            <tbody>
              ${release.results.map((result) => {
                const protocolUrl = `https://github.com/EDEM-AI/RoboSynChallenge/blob/${release.protocol_revision}/${result.protocol_path}`;
                return `
                  <tr>
                    <th scope="row"><a href="${escapeHtml(protocolUrl)}" target="_blank" rel="noreferrer">${escapeHtml(result.task_name)}</a></th>
                    ${policies.map((policyName) => {
                      const policy = result.policies[policyName];
                      return `
                        <td><div class="table-primary">
                          <a href="${escapeHtml(checkpointRevisionUrl(policy))}" target="_blank" rel="noreferrer"><strong>${escapeHtml(formatPercent(policy.success_rate))}</strong></a>
                          <span>${escapeHtml(policy.success_count)} / ${episodes} successful episodes</span>
                          <span>${escapeHtml(policy.action_steps.toFixed(1))} steps, ${escapeHtml(policy.inference_time_ms)} ms inference</span>
                        </div></td>
                      `;
                    }).join("")}
                  </tr>
                `;
              }).join("")}
              <tr>
                <th scope="row">Five-task macro average</th>
                ${policies.map((policyName) => {
                  const aggregate = release.aggregate[policyName];
                  return `
                    <td><div class="table-primary">
                      <strong>${escapeHtml(formatPercent(aggregate.macro_success_rate))}</strong>
                      <span>${escapeHtml(aggregate.success_count)} / ${escapeHtml(aggregate.episode_count)} successful episodes</span>
                    </div></td>
                  `;
                }).join("")}
              </tr>
            </tbody>
          </table>
        </div>
        <div class="cta-row">
          <a href="${escapeHtml(release.source_url)}" target="_blank" rel="noreferrer" class="button button-secondary">Evaluation release ↗</a>
          <a href="https://huggingface.co/RoboSynChallenge/models" target="_blank" rel="noreferrer" class="button button-ghost">Released checkpoints ↗</a>
        </div>
      </article>
    `;
  };
})();
