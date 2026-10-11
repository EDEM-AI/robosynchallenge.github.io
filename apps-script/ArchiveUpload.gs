/** One organizer OneDrive authorization; task-scoped upload capabilities only. */

function reviewUploadContext_(payload) {
  if (!payload.upload_token) return reviewOwnedRun_(payload);
  const job = reviewJob_(payload.evaluation_id);
  const run = reviewRun_(job.evaluation.evaluation_id);
  const access = reviewRows_("ReviewUploadAccess").find((row) => row.evaluation_id === job.evaluation.evaluation_id);
  if (!run || !access || isTruthy_(access.revoked) || !Number.isFinite(new Date(access.expires_at).getTime()) || new Date(access.expires_at).getTime() <= Date.now() ||
      reviewerHash_(String(payload.upload_token)) !== String(access.token_hash)) throw new Error("Invalid or expired task upload capability.");
  return { job, run, viewer: { email: normalizeEmail_(run.reviewer_email), role: "upload" } };
}

function archiveRecordHash_(record) {
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
    return value;
  }
  return reviewerHash_(JSON.stringify(canonical(record)));
}

function reviewIssueUploadAccess_(payload) {
  return withReviewLock_(() => {
    const { viewer, run } = reviewOwnedRun_(payload, true);
    if (viewer.role !== "admin" || run.bundle_commit) throw new Error("Only the organizer preparer can issue a new bundle upload capability.");
    const token = "upl_" + Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
    const row = reviewRows_("ReviewUploadAccess").find((item) => item.evaluation_id === run.evaluation_id);
    reviewWrite_("ReviewUploadAccess", row?._rowNumber, { evaluation_id: run.evaluation_id, token_hash: reviewerHash_(token),
      expires_at: new Date(Date.now() + 60 * 86400000).toISOString(), revoked: "", created_at: now_() });
    return { ok: true, upload_token: token, evaluation_id: run.evaluation_id };
  });
}

function archiveConfigure_(payload) {
  const viewer = reviewerIdentity_(payload);
  if (viewer.role !== "admin") throw new Error("Organizer access required.");
  const settings = payload.storage || {};
  const required = ["client_id", "tenant_id", "refresh_token", "drive_id", "root_item_id"];
  const values = {};
  required.forEach((key) => {
    const value = String(settings[key] || "").trim();
    if (!value || value.length > 8000) throw new Error("Incomplete OneDrive authorization settings.");
    values["ARCHIVE_MS_" + key.toUpperCase()] = value;
  });
  if (!/^[a-f0-9-]{36}$/i.test(settings.client_id) || (!/^[a-f0-9-]{36}$/i.test(settings.tenant_id) && settings.tenant_id !== "common")) throw new Error("Invalid Microsoft application or authority.");
  const secret = String(settings.client_secret || "");
  if (secret.length > 8000) throw new Error("Invalid application credential.");
  values.ARCHIVE_MS_CLIENT_SECRET = secret;
  PropertiesService.getScriptProperties().setProperties(values, false);
  CacheService.getScriptCache().remove("archive-ms-access");
  return { ok: true, configured: true };
}

function archiveToken_() {
  const cached = CacheService.getScriptCache().get("archive-ms-access");
  if (cached) return cached;
  const client = config_("ARCHIVE_MS_CLIENT_ID", ""), tenant = config_("ARCHIVE_MS_TENANT_ID", ""), refresh = config_("ARCHIVE_MS_REFRESH_TOKEN", "");
  if (!client || !tenant || !refresh) throw new Error("Organizer OneDrive authorization has not been configured.");
  const response = UrlFetchApp.fetch("https://login.microsoftonline.com/" + encodeURIComponent(tenant) + "/oauth2/v2.0/token", {
    method: "post", payload: { client_id: client, ...(config_("ARCHIVE_MS_CLIENT_SECRET", "") ? { client_secret: config_("ARCHIVE_MS_CLIENT_SECRET", "") } : {}), grant_type: "refresh_token", refresh_token: refresh,
      scope: "https://graph.microsoft.com/Files.ReadWrite offline_access" }, muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) throw new Error("Organizer OneDrive authorization needs renewal or tenant approval.");
  const result = JSON.parse(response.getContentText());
  if (!result.access_token) throw new Error("Microsoft did not return a valid access token.");
  if (result.refresh_token) PropertiesService.getScriptProperties().setProperty("ARCHIVE_MS_REFRESH_TOKEN", result.refresh_token);
  CacheService.getScriptCache().put("archive-ms-access", result.access_token, Math.max(60, Math.min(3500, Number(result.expires_in || 3600) - 120)));
  return result.access_token;
}

function archiveGraph_(path, method, body, raw) {
  const options = { method: method || "get", headers: { Authorization: "Bearer " + archiveToken_() }, muteHttpExceptions: true };
  if (body != null) { options.contentType = "application/json"; options.payload = raw ? body : JSON.stringify(body); }
  const response = UrlFetchApp.fetch("https://graph.microsoft.com/v1.0" + path, options);
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) throw new Error("OneDrive operation failed (HTTP " + status + "). Check organizer folder permissions.");
  return status === 204 ? null : JSON.parse(response.getContentText());
}

function archiveStatus_(payload) {
  if (reviewerIdentity_(payload).role !== "admin") throw new Error("Organizer access required.");
  return archiveReadStatus_();
}

function archiveUploadHealth_(payload) {
  reviewUploadContext_(payload);
  return archiveReadStatus_();
}

function archiveReadStatus_() {
  const drive = config_("ARCHIVE_MS_DRIVE_ID", ""), root = config_("ARCHIVE_MS_ROOT_ITEM_ID", "");
  if (!drive || !root) throw new Error("Organizer archive folder is not configured.");
  const base = "/drives/" + encodeURIComponent(drive);
  const folder = archiveGraph_(base + "/items/" + encodeURIComponent(root) + "?$select=name,folder");
  if (!folder.folder) throw new Error("Configured archive target is not a folder.");
  const info = archiveGraph_(base + "?$select=quota");
  const quota = info.quota || {};
  return { ok: true, accessible: true, folder_name: folder.name, quota: {
    total: quota.total ?? null, remaining: quota.remaining ?? null,
    used: quota.used ?? null, deleted: quota.deleted ?? null, state: quota.state || "unknown",
  }, checked_at: now_() };
}

function archiveFolder_(drive, parent, name) {
  const base = "/drives/" + encodeURIComponent(drive) + "/items/" + encodeURIComponent(parent);
  // Listing only the dedicated parent avoids treating arbitrary provider failures as missing folders.
  let path = base + "/children?$select=id,name,folder&$top=200";
  for (let page = 0; page < 50; page += 1) {
    const listing = archiveGraph_(path);
    const found = listing.value.find((item) => item.name === name);
    if (found) { if (!found.folder) throw new Error("Expected archive folder is a file."); return found.id; }
    if (!listing["@odata.nextLink"]) break;
    const next = String(listing["@odata.nextLink"]);
    if (!next.startsWith("https://graph.microsoft.com/v1.0/")) throw new Error("Invalid Microsoft pagination URL.");
    path = next.slice("https://graph.microsoft.com/v1.0".length);
    if (page === 49) throw new Error("Archive folder listing exceeds the safety limit.");
  }
  return archiveGraph_(base + "/children", "post", { name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }).id;
}

function archiveTarget_(run, task) {
  const drive = config_("ARCHIVE_MS_DRIVE_ID", ""), root = config_("ARCHIVE_MS_ROOT_ITEM_ID", "");
  if (!drive || !root) throw new Error("Organizer archive folder is not configured.");
  let folder = archiveFolder_(drive, root, run.evaluation_id);
  folder = archiveFolder_(drive, folder, task);
  folder = archiveFolder_(drive, folder, "latest");
  return "/drives/" + encodeURIComponent(drive) + "/items/" + encodeURIComponent(folder);
}

function archiveValidate_(payload) {
  const { run } = reviewUploadContext_(payload);
  if (reviewWorkflow_(run.evaluation_id).stages.slice(0, 3).some((stage) => !stage.done)) throw new Error("Complete the first three stages before uploading evidence.");
  const record = reviewValidatedResult_({ result: { ...payload.result,
    artifacts: { ...payload.result?.artifacts, url: payload.result?.artifacts?.url || "https://example.invalid/pending-upload" } } }, run);
  return { run, record };
}

function archiveSessionKey_(id) { return "ARCHIVE_SESSION_" + id; }

function archiveSessionUrl_(id) {
  return PropertiesService.getScriptProperties().getProperty(archiveSessionKey_(id)) ||
    CacheService.getScriptCache().get("archive-session:" + id);
}

function archiveResume_(upload, url) {
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const code = response.getResponseCode();
  if ([404, 410].includes(code)) return null;
  if (code !== 200) throw new Error("Cannot confirm Microsoft upload offset (HTTP " + code + "). Retry without rerunning evaluation.");
  const status = JSON.parse(response.getContentText());
  const offset = Number(String(status.nextExpectedRanges?.[0] || "").split("-")[0]);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= Number(upload.size) || !Number.isFinite(Date.parse(status.expirationDateTime))) throw new Error("Invalid Microsoft resume status.");
  reviewWrite_("ReviewArchiveUploads", upload._rowNumber, { evaluation_id: upload.evaluation_id,
    expires_at: status.expirationDateTime, updated_at: now_() });
  return { ok: true, phase: "upload", upload_id: upload.upload_id, upload_url: url, next_offset: offset };
}

function archiveStart_(payload) {
  return withReviewLock_(() => {
    const { run, record } = archiveValidate_(payload);
    const size = Number(payload.size);
    if (!Number.isSafeInteger(size) || size < 1 || size > 250 * 1024 ** 3) throw new Error("Invalid evidence ZIP size.");
    const rows = reviewRows_("ReviewArchiveUploads");
    const previous = rows.find((row) => row.evaluation_id === run.evaluation_id && row.task === record.task);
    if (previous && ["uploading", "verified", "completed"].includes(previous.status)) {
      if (String(previous.expected_sha256) !== record.artifacts.sha256 || Number(previous.size) !== size) throw new Error("Another upload is active for this task. Finish it or wait for its session to expire.");
      if (["verified", "completed"].includes(previous.status)) {
        const ready = archiveGraph_(archiveTarget_(run, record.task) + ":/result.json");
        const content = archiveGraph_("/drives/" + encodeURIComponent(config_("ARCHIVE_MS_DRIVE_ID", "")) + "/items/" + encodeURIComponent(ready.id) + "/content");
        const expected = { ...record, artifacts: { ...record.artifacts, url: content.artifacts?.url } };
        if (archiveRecordHash_(content) !== previous.record_hash || archiveRecordHash_(expected) !== previous.record_hash) throw new Error("Recovery manifest differs from verified evidence.");
        return { ok: true, phase: "register", upload_id: previous.upload_id, result: content };
      }
      const url = archiveSessionUrl_(previous.upload_id);
      if (!url && Date.parse(previous.expires_at) > Date.now()) throw new Error("Upload session URL is unavailable. Wait until the recorded session expiry before restarting; do not create competing overwrite sessions.");
      if (url && !isTruthy_(payload.restart)) {
        const resumed = archiveResume_(previous, url);
        if (resumed) return resumed;
        const base = archiveTarget_(run, record.task);
        // A lost final PUT reply may leave a complete ZIP even though the session is gone.
        try {
          const item = archiveGraph_(base + ":/evidence.zip");
          if (Number(item.size) === size) return { ok: true, phase: "verify", upload_id: previous.upload_id };
        } catch (error) {
          if (!String(error.message).includes("HTTP 404")) throw error;
        }
      }
      if (url && isTruthy_(payload.restart)) {
        const response = UrlFetchApp.fetch(url, { method: "delete", muteHttpExceptions: true });
        if (![200, 204, 404, 410].includes(response.getResponseCode())) throw new Error("Could not cancel the old upload session.");
      }
      PropertiesService.getScriptProperties().deleteProperty(archiveSessionKey_(previous.upload_id));
    }
    if (reviewTaskRows_(run.evaluation_id).some(row => row.task === record.task && row.status === "checked")) throw new Error("Accepted results are locked.");
    const quota = archiveGraph_("/drives/" + encodeURIComponent(config_("ARCHIVE_MS_DRIVE_ID", "")) + "?$select=quota").quota;
    if (Number.isFinite(quota?.remaining) && size > quota.remaining) throw new Error("OneDrive storage is insufficient for this ZIP. Local evidence must be retained; contact the organizer before retrying upload.");
    const base = archiveTarget_(run, record.task);
    const session = archiveGraph_(base + ":/evidence.zip:/createUploadSession", "post", { item: { name: "evidence.zip", "@microsoft.graph.conflictBehavior": "replace" } });
    if (!String(session.uploadUrl).startsWith("https://")) throw new Error("Invalid Microsoft upload session.");
    if (!Number.isFinite(new Date(session.expirationDateTime).getTime()) || new Date(session.expirationDateTime).getTime() <= Date.now()) throw new Error("Invalid Microsoft session expiry.");
    const id = "arc_" + Utilities.getUuid().replace(/-/g, "");
    reviewWrite_("ReviewArchiveUploads", previous?._rowNumber, { evaluation_id: run.evaluation_id, task: record.task,
      upload_id: id, expected_sha256: record.artifacts.sha256, size, status: "uploading", expires_at: session.expirationDateTime, updated_at: now_(), record_hash: "" });
    CacheService.getScriptCache().put("archive-session:" + id, session.uploadUrl, 21600);
    PropertiesService.getScriptProperties().setProperty(archiveSessionKey_(id), session.uploadUrl);
    return { ok: true, phase: "upload", upload_id: id, upload_url: session.uploadUrl, next_offset: 0 };
  });
}

function archiveCompletedItem_(payload) {
  const { run, record } = archiveValidate_(payload);
  const upload = reviewRows_("ReviewArchiveUploads").find((row) => row.evaluation_id === run.evaluation_id && row.task === record.task && row.upload_id === payload.upload_id);
  if (!upload || !["uploading", "verified", "completed"].includes(upload.status) || upload.expected_sha256 !== record.artifacts.sha256) throw new Error("Upload identity does not match this task.");
  const base = archiveTarget_(run, record.task);
  const item = archiveGraph_(base + ":/evidence.zip");
  if (Number(item.size) !== Number(upload.size)) throw new Error("ZIP upload is not complete.");
  return { run, record, upload, base, item };
}

function archiveDownload_(payload) {
  const { item } = archiveCompletedItem_(payload);
  const url = item["@microsoft.graph.downloadUrl"];
  if (!String(url).startsWith("https://")) throw new Error("No archive verification URL is available.");
  return { ok: true, download_url: url };
}

function archiveFinish_(payload) {
  return withReviewLock_(() => {
    const { record, upload, base, item } = archiveCompletedItem_(payload);
    if (payload.verified_sha256 !== upload.expected_sha256) throw new Error("Uploaded ZIP checksum was not verified.");
    const ready = { ...record, artifacts: { ...record.artifacts, url: item.webUrl } };
    if (!/^https:\/\//.test(String(item.webUrl || ""))) throw new Error("No valid archive link is available.");
    archiveGraph_(base + ":/result.json:/content", "put", JSON.stringify(ready), true);
    reviewWrite_("ReviewArchiveUploads", upload._rowNumber, { evaluation_id: record.evaluation_id, task: record.task, status: "verified", updated_at: now_(), record_hash: archiveRecordHash_(ready) });
    PropertiesService.getScriptProperties().deleteProperty(archiveSessionKey_(upload.upload_id));
    return { ok: true, result: ready };
  });
}
