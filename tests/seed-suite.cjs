const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Commitments are public backend configuration; actual frozen seeds remain private.
const expectedHashes = {
  click_bell: "57e2401bcc4df0e52f1999a7cd7dae53ee2af444938cebf357cd35ec2eb398aa",
  drawer_open_place: "98a2d2d0fb0e12a9aa55bb5798cdf644273b444b73acd6edbf09746f8b9eaeab",
  handle_basket: "7cab681cfc8ce8e4a8ffe172fd3c8a545a02a465bcfaf05046ae38035cfdf826",
  item_assembly: "ac4b8997e234a0d77d16ab38322d63aee7f67dd34f7c7bea4323da13bae1756a",
  items_handover: "9bdb5f01adc504cd448d2bb5ad6377382f774cd97eb716e913c8a794b5339938",
  manipulate_pipette: "0ceabd91a0041f61bac6b0bab1f517f193abdc55454bb5c4b5d89e45c02761b3",
  mixer_operating: "979ac42144b1085d27aa76b108ce78135d13bd79340e79396fc2f8d4a26bb239",
  sample_loading: "580863598cf42c75e2c82a1de6476fee6e36efd43a636bc5cd54dfb144b54d01",
  table_rearrangement: "45cfe6272b7b3c9772ec3869d078cf691f645ef732a2449cc309155f0499e5f1",
  water_pouring: "5ce89bedf9d08f0746caf0ef1ae1cfed1404acf2e2c71b70265dd2a2f5fdb6f9",
};
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const context = vm.createContext({ Utilities: {
  DigestAlgorithm: { SHA_256: "sha256" },
  computeDigest: (algorithm, value) => [...crypto.createHash(algorithm).update(value).digest()],
} });
for (const name of ["Code.gs", "Reviewer.gs"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../apps-script", name), "utf8"), context, { filename: name });
}
assert.deepEqual(JSON.parse(vm.runInContext("JSON.stringify(REVIEW_SEED_HASHES)", context)), expectedHashes);
const horizons = JSON.parse(vm.runInContext("JSON.stringify(REVIEW_TASK_STEPS)", context));
assert.deepEqual(Object.keys(expectedHashes).sort(), Object.keys(horizons).sort());
const privateMode = Boolean(process.env.RSC_SEED_PACKET);
assert.equal(privateMode, Boolean(process.env.RSC_PREVIOUS_SEED_PACKET), "Provide both private packets or neither");
const loadPacket = filename => JSON.parse(fs.readFileSync(filename, "utf8")).tasks;
const current = privateMode ? loadPacket(process.env.RSC_SEED_PACKET) : {};
const previous = privateMode ? loadPacket(process.env.RSC_PREVIOUS_SEED_PACKET) : {};
if (!privateMode) {
  for (const [index, task] of Object.keys(horizons).entries()) {
    current[task] = Array.from({ length: 100 }, (_, episode) => 10000 * index + episode);
    previous[task] = current[task].map(seed => seed + 1000);
  }
  // Synthetic fixtures test validator mechanics without publishing real seed packets.
  context.fixtureHashes = Object.fromEntries(Object.entries(current).map(([task, seeds]) => [task, sha(JSON.stringify(seeds))]));
  vm.runInContext("Object.assign(REVIEW_SEED_HASHES, fixtureHashes)", context);
}
const run = { evaluation_id: "eval_SEED_FIXTURE", submission_id: "sub_SEED_FIXTURE",
  bundle_commit: "a".repeat(40), policy_dirs_json: '["policy/fixture"]' };
function record(task, seeds, claimedHash) {
  return { schema: 1, evaluation_id: run.evaluation_id, submission_id: run.submission_id,
    bundle_commit: run.bundle_commit, task, policy_dir: "policy/fixture",
    eval_command: "bash policy/fixture/eval.sh " + task, seed_list_sha256: claimedHash,
    episodes: seeds.map((seed, index) => ({ index, seed, success: false, action_steps: horizons[task], inference_ms: 1 })),
    artifacts: { url: "https://evidence.example/fixture.zip", sha256: "b".repeat(64) } };
}
for (const task of Object.keys(horizons)) {
  const seeds = current[task], old = previous[task];
  assert.equal(seeds.length, 100); assert.equal(new Set(seeds).size, 100); assert.equal(old.length, 100);
  const currentHash = sha(JSON.stringify(seeds)), oldHash = sha(JSON.stringify(old));
  if (privateMode) assert.equal(currentHash, expectedHashes[task]);
  assert.notEqual(currentHash, oldHash);
  const valid = record(task, seeds, currentHash);
  assert.equal(context.reviewValidatedResult_({ result: valid }, run), valid);
  valid.episodes.reverse();
  assert.equal(context.reviewValidatedResult_({ result: JSON.stringify(valid) }, run).seed_list_sha256, currentHash);
  for (const [actual, claimed] of [[old, oldHash], [old, currentHash], [seeds, oldHash]]) {
    assert.throws(() => context.reviewValidatedResult_({ result: record(task, actual, claimed) }, run),
      /Result seeds do not match the frozen task seed list\./);
  }
}
console.log("Seed suite: backend commitments match PR #10; 20 acceptances and 30 rejections passed (" +
  (privateMode ? "private packets" : "synthetic fixtures") + ").");
