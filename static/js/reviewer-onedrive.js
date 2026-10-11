(() => {
  "use strict";
  const CHUNK = 10 * 320 * 1024;
  async function hashBlob(blob, progress = () => {}) {
    const hasher = await hashwasm.createSHA256();
    hasher.init();
    for (let offset = 0; offset < blob.size; offset += CHUNK) {
      hasher.update(new Uint8Array(await blob.slice(offset, offset + CHUNK).arrayBuffer()));
      progress(Math.min(blob.size, offset + CHUNK) / blob.size);
    }
    return hasher.digest("hex");
  }
  async function upload({ file, record, request, restart = false, progress = () => {} }) {
    if (!file?.size || !/^eval_[A-Za-z0-9]+$/.test(record.evaluation_id)) throw new Error("Select a task ZIP and matching JSON.");
    const expected = record.artifacts?.sha256;
    if (await hashBlob(file, value => progress("Checking local ZIP", value)) !== expected) throw new Error("Selected ZIP does not match the JSON SHA256.");
    const fields = { evaluation_id: record.evaluation_id, result: record };
    const session = await request("reviewer_start_evidence_upload", { ...fields, size: file.size, restart });
    if (session.phase === "register") return session.result;
    const resumeOffset = session.next_offset || 0;
    if (!Number.isSafeInteger(resumeOffset) || resumeOffset < 0 || resumeOffset >= file.size || resumeOffset % (320 * 1024)) throw new Error("Invalid upload resume offset.");
    if (session.phase !== "verify") {
    if (!session.upload_url?.startsWith("https://")) throw new Error("Invalid archive upload session.");
    let complete = false;
    for (let offset = resumeOffset; offset < file.size; offset += CHUNK) {
      const end = Math.min(file.size, offset + CHUNK);
      // The session URL is pre-authenticated; never attach reviewer or Graph credentials.
      const response = await fetch(session.upload_url, { method: "PUT",
        headers: { "Content-Range": `bytes ${offset}-${end - 1}/${file.size}` }, body: file.slice(offset, end) });
      if (![200, 201, 202].includes(response.status)) throw new Error("ZIP upload interrupted (HTTP " + response.status + ").");
      const item = await response.json();
      if (response.status === 202 && Number(item.nextExpectedRanges?.[0]?.split("-")[0]) !== end) throw new Error("Unexpected upload offset; do not register this result.");
      complete = [200, 201].includes(response.status) && item.size === file.size;
      progress("Uploading ZIP", end / file.size);
    }
    if (!complete) throw new Error("ZIP upload is incomplete.");
    }
    const identity = { ...fields, upload_id: session.upload_id };
    const verification = await request("reviewer_verify_evidence_upload", identity);
    if (!verification.download_url?.startsWith("https://")) throw new Error("No archive verification URL.");
    const response = await fetch(verification.download_url);
    if (!response.ok || !response.body) throw new Error("Unable to verify uploaded ZIP.");
    const hasher = await hashwasm.createSHA256();
    hasher.init();
    let received = 0;
    const reader = response.body.getReader();
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      hasher.update(part.value);
      received += part.value.length;
      progress("Verifying OneDrive ZIP", received / file.size);
    }
    if (received !== file.size || hasher.digest("hex") !== expected) throw new Error("Uploaded ZIP SHA256 mismatch. No result was registered.");
    const ready = await request("reviewer_finish_evidence_upload", { ...identity, verified_sha256: expected });
    return ready.result;
  }
  window.RSCOneDrive = { upload, hashBlob };
})();
