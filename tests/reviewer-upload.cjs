const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

async function test(corrupt = false, rejected = false, phase = "upload", offset = 0) {
  const bytes = Buffer.alloc(10 * 320 * 1024 + 19, 42);
  const file = new Blob([bytes]);
  const sha = crypto.createHash("sha256").update(bytes).digest("hex");
  const actions = [], ranges = [];
  const context = vm.createContext({ window: {}, Uint8Array, Blob, hashwasm: {
    async createSHA256() { let hash; return { init() { hash = crypto.createHash("sha256"); }, update(value) { hash.update(value); }, digest() { return hash.digest("hex"); } }; },
  }, async fetch(url, options) {
    if (options) {
      assert.equal(options.method, "PUT");
      assert.deepEqual(Object.keys(options.headers), ["Content-Range"], "Never forward reviewer/Microsoft credentials");
      ranges.push(options.headers["Content-Range"]);
      const end = Number(options.headers["Content-Range"].match(/-(\d+)\//)[1]) + 1;
      return new Response(JSON.stringify(end < file.size ? {nextExpectedRanges:[end + "-"]} : {id:"zip",size:file.size}), {status:end < file.size ? 202 : 201});
    }
    return new Response(corrupt ? bytes.subarray(1) : bytes);
  } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../static/js/reviewer-onedrive.js"), "utf8"), context);
  const record = { evaluation_id:"eval_TEST",task:"click_bell",artifacts:{sha256:sha,url:""} };
  async function request(action, fields) {
    actions.push(action);
    assert.equal(fields.evaluation_id, record.evaluation_id);
    if (rejected) throw new Error("Accepted results are locked");
    if (action === "reviewer_start_evidence_upload") return {phase,next_offset:offset,upload_id:"arc_test",upload_url:"https://upload.example/session",result:{...record,artifacts:{...record.artifacts,url:"https://tenant.sharepoint.com/latest/evidence.zip"}}};
    if (action === "reviewer_verify_evidence_upload") return {download_url:"https://download.example/zip"};
    assert.equal(action, "reviewer_finish_evidence_upload");
    assert.equal(fields.verified_sha256, sha);
    return {result:{...record,artifacts:{...record.artifacts,url:"https://tenant.sharepoint.com/latest/evidence.zip"}}};
  }
  const run = () => context.window.RSCOneDrive.upload({file,record,request});
  if (corrupt) {
    await assert.rejects(run, /SHA256 不一致/);
    assert(!actions.includes("reviewer_finish_evidence_upload"));
  } else if (rejected) {
    await assert.rejects(run, /locked/);
    assert.equal(ranges.length, 0);
  } else {
    assert((await run()).artifacts.url.startsWith("https://tenant.sharepoint.com/"));
    assert.equal(ranges.length, phase === "upload" ? offset ? 1 : 2 : 0);
    if (phase === "upload") assert.equal(ranges[0], `bytes ${offset}-${Math.min(file.size,offset+10*320*1024)-1}/${file.size}`);
    if (phase === "register") assert.deepEqual(actions, ["reviewer_start_evidence_upload"]);
  }
}
(async () => { await test(); await test(true); await test(false, true); await test(false, false, "upload", 10*320*1024); await test(false, false, "verify"); await test(false, false, "register"); console.log("Browser upload: bounded chunks, resumable offsets, completed-ZIP recovery, no forwarded credentials, remote SHA256 and locked-task gates passed."); })().catch(error => {console.error(error); process.exitCode=1;});
