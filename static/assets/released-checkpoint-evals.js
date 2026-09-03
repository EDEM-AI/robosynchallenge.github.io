(() => {
  "use strict";

  const POLICY_ORDER = ["SmolVLA", "ACT", "DP"];

  const release = Object.freeze({
    published_at: "2026-09-03",
    environment: "simulation",
    setting: "random",
    metric: "success_rate",
    episodes_per_checkpoint: 100,
    protocol_revision: "c97d440e339cd270b096e27e281daa29f8712b36",
    source_url: "https://github.com/EDEM-AI/RoboSynChallenge/tree/main/evaluation_results",
    data_url: "https://github.com/EDEM-AI/RoboSynChallenge/blob/main/evaluation_results/released_checkpoint_results.json",
    results: [
      {
        task_id: "table_rearrangement",
        task_name: "Table rearrangement",
        max_action_steps: 361,
        protocol_path: "configs/table_rearrangement/random/gym_config.json",
        policies: {
          SmolVLA: { success_count: 82, success_rate: 82.0, action_steps: 196.98, inference_time_ms: 287.013, repo_id: "RoboSynChallenge/SmolVLA_sim_table_rearrangement", revision: "913b29a7136876108a330aead1855309f985cbd8", model_name: "official SmolVLA_sim_table_rearrangement" },
          ACT: { success_count: 63, success_rate: 63.0, action_steps: 218.37, inference_time_ms: 57.6, repo_id: "RoboSynChallenge/ACT_sim_table_rearrangement", revision: "3a46b36fade1772176b791dd87349f479d0a98c8" },
          DP: { success_count: 14, success_rate: 14.0, action_steps: 330.38, inference_time_ms: 173.73, variant_label: "10-step", comparison: { "5-step": { success_count: 18, success_rate: 18.0, action_steps: 315.53, inference_time_ms: 128.07 } }, repo_id: "RoboSynChallenge/DP_sim_table_rearrangement", revision: "99c73475a13ec2583b5105dc3773f88bbdeba9f5" },
        },
      },
      {
        task_id: "click_bell",
        task_name: "Click bell",
        max_action_steps: 361,
        protocol_path: "configs/click_bell/random/gym_config.json",
        policies: {
          SmolVLA: { success_count: 35, success_rate: 35.0, action_steps: 269.15, inference_time_ms: 273.2, repo_id: "RoboSynChallenge/SmolVLA_sim_click_bell", revision: "27965b7e2432f5a3084f2c60a04bff7c5a47b853", model_name: "official SmolVLA_sim_click_bell" },
          ACT: { success_count: 37, success_rate: 37.0, action_steps: 259.43, inference_time_ms: 66.9, repo_id: "RoboSynChallenge/ACT_sim_click_bell", revision: "677e65fbb15974024ff840893496197ef7db26d4" },
          DP: { success_count: 51, success_rate: 51.0, action_steps: 202.68, inference_time_ms: 141.68, variant_label: "10-step", comparison: { "5-step": { success_count: 24, success_rate: 24.0, action_steps: 286.34, inference_time_ms: 88.85 } }, repo_id: "RoboSynChallenge/DP_sim_click_bell", revision: "fb8c9551e0fade7c4888a926ab577b85f0684da1" },
        },
      },
      {
        task_id: "water_pouring",
        task_name: "Water pouring",
        max_action_steps: 500,
        protocol_path: "configs/water_pouring/random/gym_config.json",
        policies: {
          SmolVLA: { success_count: 65, success_rate: 65.0, action_steps: 303.75, inference_time_ms: 271.1, repo_id: "RoboSynChallenge/SmolVLA_sim_water_pouring", revision: "2bf5d9c2d8d0b5820ba5c9fe6284c5ff8647561f", model_name: "official SmolVLA_sim_water_pouring" },
          ACT: { success_count: 72, success_rate: 72.0, action_steps: 276.00, inference_time_ms: 65.9, repo_id: "RoboSynChallenge/ACT_sim_water_pouring", revision: "0bf0fcfc931a69c52871385f28068fcf873cf07a" },
          DP: { success_count: 36, success_rate: 36.0, action_steps: 385.54, inference_time_ms: 160.38, variant_label: "10-step", comparison: { "5-step": { success_count: 40, success_rate: 40.0, action_steps: 373.82, inference_time_ms: 119.12 } }, repo_id: "RoboSynChallenge/DP_sim_water_pouring", revision: "b67e1ce7444dfa2940970088ebbe04a8b01013cc" },
        },
      },
      {
        task_id: "handle_basket",
        task_name: "Handle basket",
        max_action_steps: 500,
        protocol_path: "configs/handle_basket/random/gym_config.json",
        policies: {
          SmolVLA: { success_count: 40, success_rate: 40.0, action_steps: 434.50, inference_time_ms: 270.674, repo_id: "RoboSynChallenge/SmolVLA_sim_handle_basket", revision: "0de9a93f124bd4ebe2fbd0d572ce3133806b82a9", model_name: "official SmolVLA_sim_handle_basket" },
          ACT: { success_count: 37, success_rate: 37.0, action_steps: 448.71, inference_time_ms: 72.871, repo_id: "RoboSynChallenge/ACT_sim_handle_basket", revision: "6d5c70c4bb367e23b43e95cb155f7ad53f30cc79" },
          DP: { success_count: 11, success_rate: 11.0, action_steps: 483.88, inference_time_ms: 143.165, repo_id: "RoboSynChallenge/DP_sim_handle_basket", revision: "07f77f6ba48722677ad85efe8cb18c56ca002da7" },
        },
      },
      {
        task_id: "items_handover",
        task_name: "Items handover",
        max_action_steps: 350,
        protocol_path: "configs/items_handover/random/gym_config.json",
        policies: {
          SmolVLA: { success_count: 30, success_rate: 30.0, action_steps: 342.50, inference_time_ms: 263.571, repo_id: "RoboSynChallenge/SmolVLA_sim_items_handover", revision: "fabe9462853965228e90e34bd517aa4e43bad323", model_name: "official SmolVLA_sim_items_handover" },
          ACT: { success_count: 11, success_rate: 11.0, action_steps: 345.74, inference_time_ms: 73.577, repo_id: "RoboSynChallenge/ACT_sim_items_handover", revision: "86f6ca7f5decd17a92c3218f295de53497383d14" },
          DP: { success_count: 0, success_rate: 0.0, action_steps: 348.76, inference_time_ms: 144.945, repo_id: "RoboSynChallenge/DP_sim_items_handover", revision: "8fcaba9ae2530ec919ae51c9a559b43cf39b36a9" },
        },
      },
      {
        task_id: "drawer_open_place",
        task_name: "Drawer open and place",
        max_action_steps: 900,
        protocol_path: "configs/drawer_open_place/random/gym_config.json",
        policies: {
          SmolVLA: { success_count: 62, success_rate: 62.0, action_steps: 583.00, inference_time_ms: 254.478, repo_id: "RoboSynChallenge/SmolVLA_sim_drawer_open_place", revision: "c0088d84a568f93fb4401aabafcc41cf643efcdd", model_name: "official SmolVLA_sim_drawer_open_place" },
          ACT: { success_count: 29, success_rate: 29.0, action_steps: 741.70, inference_time_ms: 173.7, repo_id: "RoboSynChallenge/ACT_sim_drawer_open_place", revision: "592e30434aad83cf7bd8f1ee105d7c401488743d" },
          DP: { success_count: 0, success_rate: 0.0, action_steps: 900.00, inference_time_ms: 99.20, variant_label: "10-step", comparison: { "5-step": { success_count: 0, success_rate: 0.0, action_steps: 900.00, inference_time_ms: 62.06 } }, repo_id: "RoboSynChallenge/DP_sim_drawer_open_place", revision: "c5600daa96623adb4f8cd0c156b70836c30b1288" },
        },
      },
      {
        task_id: "mixer_operating",
        task_name: "Mixer operating",
        max_action_steps: 500,
        protocol_path: "configs/mixer_operating/random/gym_config.json",
        policies: {
          SmolVLA: { success_count: 58, success_rate: 58.0, action_steps: 362.50, inference_time_ms: 264.997, repo_id: "RoboSynChallenge/SmolVLA_sim_mixer_operating", revision: "42311ef3e795079caefee7a28f05c967caa870ac", model_name: "official SmolVLA_sim_mixer_operating" },
          ACT: { success_count: 77, success_rate: 77.0, action_steps: 310.49, inference_time_ms: 74.6, repo_id: "RoboSynChallenge/ACT_sim_mixer_operating", revision: "0f12c53a2a6e093ae5e1e28f20480296b45fdf2b" },
          DP: { success_count: 66, success_rate: 66.0, action_steps: 340.93, inference_time_ms: 88.63, variant_label: "10-step", comparison: { "5-step": { success_count: 78, success_rate: 78.0, action_steps: 313.84, inference_time_ms: 60.86 } }, repo_id: "RoboSynChallenge/DP_sim_mixer_operating", revision: "c05afece66ead46b47f6532c86d95cb3dd0f628e" },
        },
      },
      {
        task_id: "item_assembly",
        task_name: "Item assembly",
        max_action_steps: 361,
        protocol_path: "configs/item_assembly/random/gym_config.json",
        policies: {
          SmolVLA: { success_count: 24, success_rate: 24.0, action_steps: 337.16, inference_time_ms: 271.9, repo_id: "RoboSynChallenge/SmolVLA_sim_item_assembly", revision: "db32020164ed2c7264804a5eb036a38a07d879ca", model_name: "official SmolVLA_sim_item_assembly" },
          ACT: { success_count: 64, success_rate: 64.0, action_steps: 298.21, inference_time_ms: 76.987, repo_id: "RoboSynChallenge/ACT_sim_item_assembly", revision: "58955958519157176712a1eff319018d78177ddb" },
          DP: { success_count: 57, success_rate: 57.0, action_steps: 303.53, inference_time_ms: 141.390, repo_id: "RoboSynChallenge/DP_sim_item_assembly", revision: "dcdb3ee8ec57108e04982b3c9b78394be1a5c8d8" },
        },
      },
      {
        task_id: "manipulate_pipette",
        task_name: "Manipulate pipette",
        max_action_steps: 1000,
        protocol_path: "configs/manipulate_pipette/random/gym_config.json",
        policies: {
          SmolVLA: { success_count: 36, success_rate: 36.0, action_steps: 728.50, inference_time_ms: 258.076, repo_id: "RoboSynChallenge/SmolVLA_sim_manipulate_pipette", revision: "dd0e80bc7d5fa5081e1fa07f1b7115bad6dbffa0", model_name: "official SmolVLA_sim_manipulate_pipette" },
          ACT: { success_count: 61, success_rate: 61.0, action_steps: 536.91, inference_time_ms: 38.962, repo_id: "RoboSynChallenge/ACT_sim_manipulate_pipette", revision: "ca013b2e202d594bf347530c61c3ba28c06d1bc2" },
          DP: { success_count: 49, success_rate: 49.0, action_steps: 628.24, inference_time_ms: 135.691, repo_id: "RoboSynChallenge/DP_sim_manipulate_pipette", revision: "0476572763551b514f11339eab16e9ad4e2b75d4" },
        },
      },
      {
        task_id: "sample_loading",
        task_name: "Sample loading",
        max_action_steps: 500,
        protocol_path: "configs/sample_loading/random/gym_config.json",
        policies: {
          SmolVLA: { success_count: 6, success_rate: 6.0, action_steps: 491.40, inference_time_ms: 264.2, repo_id: "RoboSynChallenge/SmolVLA_sim_sample_loading", revision: "2a4f41ab3be8e5f544c890d6054bc8de3be5c53b", model_name: "official SmolVLA_sim_sample_loading" },
          ACT: { success_count: 2, success_rate: 2.0, action_steps: 498.65, inference_time_ms: 45.920, repo_id: "RoboSynChallenge/ACT_sim_sample_loading", revision: "917bf2796f18abd0a16f723573382161f1a5c5c8" },
          DP: { success_count: 0, success_rate: 0.0, action_steps: 500.00, inference_time_ms: 144.198, repo_id: "RoboSynChallenge/DP_sim_sample_loading", revision: "9bfc527f94c2bdc3e87a1d3796f0a46be8d32a65" },
        },
      },
    ],
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

  function formatMilliseconds(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "Not available";
    return Number.isInteger(number) ? String(number) : number.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  }

  function checkpointRevisionUrl(policy) {
    if (!policy.repo_id) return "";
    if (!policy.revision) return `https://huggingface.co/${policy.repo_id}`;
    return `https://huggingface.co/${policy.repo_id}/tree/${policy.revision}`;
  }

  function policyDisplayName(policyName, policy, taskId = "average") {
    if (policy?.model_name) return policy.model_name;
    if (policy?.repo_id) return policy.repo_id.replace(/^RoboSynChallenge\//, "official ");
    return `official ${policyName}_sim_${taskId}`;
  }

  function average(numbers) {
    const finite = numbers.map(Number).filter(Number.isFinite);
    if (!finite.length) return null;
    return finite.reduce((total, value) => total + value, 0) / finite.length;
  }

  function releasedPolicyNames() {
    const names = new Set();
    release.results.forEach((result) => {
      Object.keys(result.policies).forEach((policyName) => names.add(policyName));
    });
    return [
      ...POLICY_ORDER.filter((policyName) => names.has(policyName)),
      ...Array.from(names).filter((policyName) => !POLICY_ORDER.includes(policyName)).sort(),
    ];
  }

  function releasedPolicyResults(policyName) {
    return release.results
      .map((result) => ({ result, policy: result.policies[policyName] }))
      .filter((entry) => entry.policy);
  }

  function policySuccessText(policy, episodes) {
    const variantPrefix = policy.variant_label ? `${policy.variant_label}, ` : "";
    return `${variantPrefix}${policy.success_count} / ${episodes} successful episodes`;
  }

  function policyComparisonText(policy, maxActionSteps) {
    const fiveStep = policy.comparison?.["5-step"];
    if (!fiveStep) return "";
    return `5-step: ${formatPercent(fiveStep.success_rate)}, ${fiveStep.action_steps.toFixed(1)} / ${maxActionSteps} steps, ${formatMilliseconds(fiveStep.inference_time_ms)} ms inference`;
  }

  function releasedPolicyTaskScore(result, policyName) {
    const policy = result.policies[policyName];
    return {
      task_id: result.task_id,
      success_rate: policy.success_rate,
      action_steps: policy.action_steps,
      max_action_steps: result.max_action_steps,
      real_time: policy.inference_time_ms / 1000,
    };
  }

  function releasedPolicyAggregate(policyName) {
    const entries = releasedPolicyResults(policyName);
    const taskScores = entries.map(({ result }) => releasedPolicyTaskScore(result, policyName));
    return {
      taskScores,
      taskCount: taskScores.length,
      success_count: entries.reduce((total, { policy }) => total + Number(policy.success_count || 0), 0),
      episode_count: entries.length * release.episodes_per_checkpoint,
      macro_success_rate: average(taskScores.map((score) => score.success_rate)),
      action_steps: average(taskScores.map((score) => score.action_steps)),
      real_time: average(taskScores.map((score) => score.real_time)),
    };
  }

  function releasedPolicyAggregateRow(policyName) {
    const aggregate = releasedPolicyAggregate(policyName);
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
      data_regime: `${aggregate.taskCount}-task macro average / ${release.setting}`,
      success_rate: aggregate.macro_success_rate,
      action_steps: aggregate.action_steps,
      real_time: aggregate.real_time,
      rank_badge: `${aggregate.success_count} / ${aggregate.episode_count} successful episodes`,
      evaluation_id: "",
      result_url: release.data_url,
      protocol_url: release.source_url,
      task_scores: aggregate.taskScores,
      notes: `${modelName} evaluated across the released ${release.setting} task set.`,
    };
  }

  window.ROBO_SYN_RELEASED_CHECKPOINT_EVALS = release;
  window.ROBO_SYN_GET_RELEASED_CHECKPOINT_AVERAGE_ROWS = function getReleasedCheckpointAverageRows() {
    return releasedPolicyNames().map(releasedPolicyAggregateRow);
  };

  window.ROBO_SYN_GET_RELEASED_CHECKPOINT_LEADERBOARD_ROWS = function getReleasedCheckpointLeaderboardRows() {
    return release.results.flatMap((result) => Object.entries(result.policies).map(([policyName, policy]) => {
      const modelName = policyDisplayName(policyName, policy, result.task_id);
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
        max_action_steps: result.max_action_steps,
        real_time: policy.inference_time_ms / 1000,
        inference_time_ms: policy.inference_time_ms,
        rank_badge: policySuccessText(policy, release.episodes_per_checkpoint),
        evaluation_id: "",
        result_url: checkpointRevisionUrl(policy),
        protocol_url: protocolUrl,
        notes: `${modelName} evaluated on ${result.task_name} with ${release.setting}.`,
      };
    }));
  };

  window.ROBO_SYN_RENDER_RELEASED_CHECKPOINT_RESULTS = function renderReleasedCheckpointResults() {
    const policies = releasedPolicyNames();
    const episodes = release.episodes_per_checkpoint;

    return `
      <article class="card checkpoint-results-card">
        <div class="section-heading left">
          <span class="eyebrow">Released checkpoints</span>
          <h2>Released checkpoint evaluations.</h2>
        </div>
        <p class="field-note">
          Each task uses the <code>random</code> configuration for ${episodes} episodes.
          Every score links to the exact evaluated Hugging Face checkpoint revision when available; task names link to
          the pinned evaluation configuration.
        </p>
        <div class="table-shell">
          <table class="leaderboard-table">
            <thead><tr><th>Task</th>${policies.map((policyName) => `<th>${escapeHtml(policyName)}</th>`).join("")}</tr></thead>
            <tbody>
              ${release.results.map((result) => {
                const protocolUrl = `https://github.com/EDEM-AI/RoboSynChallenge/blob/${release.protocol_revision}/${result.protocol_path}`;
                return `
                  <tr>
                    <th scope="row"><a href="${escapeHtml(protocolUrl)}" target="_blank" rel="noreferrer">${escapeHtml(result.task_name)}</a></th>
                    ${policies.map((policyName) => {
                      const policy = result.policies[policyName];
                      if (!policy) return "<td>Not available</td>";
                      const scoreUrl = checkpointRevisionUrl(policy);
                      const scoreHtml = scoreUrl
                        ? `<a href="${escapeHtml(scoreUrl)}" target="_blank" rel="noreferrer"><strong>${escapeHtml(formatPercent(policy.success_rate))}</strong></a>`
                        : `<strong>${escapeHtml(formatPercent(policy.success_rate))}</strong>`;
                      return `
                        <td><div class="table-primary">
                          ${scoreHtml}
                          <span>${escapeHtml(policySuccessText(policy, episodes))}</span>
                          <span>${escapeHtml(policy.action_steps.toFixed(1))} / ${escapeHtml(result.max_action_steps)} steps, ${escapeHtml(formatMilliseconds(policy.inference_time_ms))} ms inference</span>
                          ${policyComparisonText(policy, result.max_action_steps) ? `<span>${escapeHtml(policyComparisonText(policy, result.max_action_steps))}</span>` : ""}
                        </div></td>
                      `;
                    }).join("")}
                  </tr>
                `;
              }).join("")}
              <tr>
                <th scope="row">Macro average</th>
                ${policies.map((policyName) => {
                  const aggregate = releasedPolicyAggregate(policyName);
                  return `
                    <td><div class="table-primary">
                      <strong>${escapeHtml(formatPercent(aggregate.macro_success_rate))}</strong>
                      <span>${escapeHtml(aggregate.success_count)} / ${escapeHtml(aggregate.episode_count)} successful episodes</span>
                      <span>${escapeHtml(aggregate.taskCount)} tasks</span>
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
