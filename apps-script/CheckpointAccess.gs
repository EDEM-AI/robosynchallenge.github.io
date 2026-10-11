/** Organizer-owned HF credential, available only to authorized private evaluation clones. */
function reviewConfigureCheckpointAccess_(payload) {
  if (reviewerIdentity_(payload).role !== "admin") throw new Error("Organizer access required.");
  const token = String(payload.hf_token || "").trim();
  if (!/^hf_[A-Za-z0-9]+$/.test(token)) throw new Error("Invalid organizer HF credential.");
  const response = UrlFetchApp.fetch("https://huggingface.co/api/whoami-v2", {
    headers: { Authorization: "Bearer " + token }, muteHttpExceptions: true,
  });
  if (response.getResponseCode() !== 200) throw new Error("Organizer HF authorization could not be verified.");
  const identity = JSON.parse(response.getContentText());
  if (String(identity.name || "").toLowerCase() !== "robosynchallenge" || identity.type !== "user") {
    throw new Error("The organizer HF credential must belong to RoboSynChallenge.");
  }
  PropertiesService.getScriptProperties().setProperty("REVIEW_HF_DOWNLOAD_TOKEN", token);
  return { ok: true, configured: true, account: "RoboSynChallenge" };
}

function reviewCheckpointCredential_(payload) {
  if (!payload.upload_token) throw new Error("Private clone capability required.");
  const { run } = reviewUploadContext_(payload);
  if (!run.bundle_commit || payload.bundle_commit !== run.bundle_commit) throw new Error("Checkpoint access belongs to another prepared commit.");
  const token = config_("REVIEW_HF_DOWNLOAD_TOKEN", "");
  if (!token) throw new Error("Organizer HF download credential is not configured; contact the organizers.");
  checkRateLimit_("reviewer_hf_credential", run.evaluation_id, 30, 60 * 60 * 1000);
  return { ok: true, account: "RoboSynChallenge", hf_token: token };
}
