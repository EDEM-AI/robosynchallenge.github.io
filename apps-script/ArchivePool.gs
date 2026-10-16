/** Server-side archive locations; signed download URLs never contain reviewer credentials. */
function archivePoolProfile_(slot) {
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(String(slot || ""))) throw new Error("Invalid archive pool slot.");
  const profile = parseJson_(config_("ARCHIVE_POOL_" + slot, ""), null);
  if (!profile) throw new Error("Archive pool account is not configured.");
  return profile;
}

function archivePoolToken_(slot) {
  const key = "archive-pool-access:" + slot;
  const cached = CacheService.getScriptCache().get(key);
  if (cached) return cached;
  const profile = archivePoolProfile_(slot);
  const response = UrlFetchApp.fetch("https://login.microsoftonline.com/" + encodeURIComponent(profile.tenant_id) + "/oauth2/v2.0/token", {
    method:"post", payload:{client_id:profile.client_id, client_secret:profile.client_secret || "",
      grant_type:"refresh_token", refresh_token:profile.refresh_token,
      scope:"https://graph.microsoft.com/Files.ReadWrite offline_access"}, muteHttpExceptions:true});
  const result = parseJson_(response.getContentText(), {});
  if (response.getResponseCode() !== 200 || !result.access_token) throw new Error("Archive pool account authorization needs renewal.");
  if (result.refresh_token) PropertiesService.getScriptProperties().setProperty("ARCHIVE_POOL_" + slot,
    JSON.stringify({...profile, refresh_token:result.refresh_token}));
  CacheService.getScriptCache().put(key, result.access_token, Math.max(60, Math.min(3500, Number(result.expires_in || 3600) - 120)));
  return result.access_token;
}

function archivePoolGraph_(slot, path, method, body, headers) {
  const options = {method:method || "get", muteHttpExceptions:true,
    headers:{Authorization:"Bearer " + (slot === "ingress" ? archiveToken_() : archivePoolToken_(slot)), ...headers}};
  if (body != null) { options.contentType = "application/json"; options.payload = JSON.stringify(body); }
  const response = UrlFetchApp.fetch("https://graph.microsoft.com/v1.0" + path, options);
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) { const error = new Error("Archive pool Graph operation failed (HTTP " + status + ")."); error.httpStatus = status; throw error; }
  return status === 204 ? null : JSON.parse(response.getContentText());
}

function archivePoolCurrent_(evaluation, task, results, uploads) {
  if (!Object.prototype.hasOwnProperty.call(REVIEW_TASK_STEPS, task)) throw new Error("Unknown task.");
  const rows = (results || reviewRows_("ReviewTaskResults")).filter(row => row.evaluation_id === evaluation && row.task === task && ["submitted", "checked"].includes(row.status));
  if (rows.length !== 1) throw new Error("No single registered result for this task.");
  const record = parseJson_(rows[0].result_json, {}), sha = record.artifacts?.sha256;
  const matches = (uploads || reviewRows_("ReviewArchiveUploads")).filter(row => row.evaluation_id === evaluation && row.task === task && row.status === "completed" && row.expected_sha256 === sha);
  if (!/^[a-f0-9]{64}$/.test(String(sha || "")) || matches.length !== 1 ||
      matches[0].record_hash !== archiveRecordHash_(record)) throw new Error("Evidence upload is not completely registered.");
  return {record, upload:matches[0]};
}

function archivePoolLocation_(evaluation, task, current, locations) {
  return (locations || reviewRows_("ReviewArchiveLocations")).filter(row => row.evaluation_id === evaluation && row.task === task &&
    row.sha256 === current.record.artifacts.sha256 && row.upload_id === current.upload.upload_id &&
    row.record_hash === current.upload.record_hash && ["ready", "source_removed"].includes(row.status)).pop();
}

function archivePoolDestination_(location, current) {
  const profile = archivePoolProfile_(location.slot), base = "/drives/" + encodeURIComponent(profile.drive_id) + "/items/";
  const folder = archivePoolGraph_(location.slot, base + encodeURIComponent(profile.root_item_id) + ":/" +
    [location.evaluation_id, location.task, location.sha256].map(encodeURIComponent).join("/") + "?$select=id");
  const zip = archivePoolGraph_(location.slot, base + encodeURIComponent(location.zip_item_id));
  const manifest = archivePoolGraph_(location.slot, base + encodeURIComponent(location.json_item_id));
  if (!zip.file || !manifest.file || Number(zip.size) !== Number(current.upload.size) ||
      zip.eTag !== location.zip_etag || manifest.eTag !== location.json_etag ||
      zip.parentReference?.id !== folder.id || manifest.parentReference?.id !== folder.id) throw new Error("Relocated evidence identity changed.");
  const content = archivePoolGraph_(location.slot, base + encodeURIComponent(manifest.id) + "/content");
  if (archiveRecordHash_(content) !== current.upload.record_hash) throw new Error("Relocated manifest differs from the registered result.");
  return zip;
}

function archivePoolQueue_() {
  const snapshot = reviewReadTables_(spreadsheet_(), ["ReviewTaskResults", "ReviewArchiveUploads", "ReviewArchiveLocations"]).rows;
  const items = [];
  snapshot.ReviewArchiveUploads.filter(row => row.status === "completed").forEach(upload => {
    try {
      const current = archivePoolCurrent_(upload.evaluation_id, upload.task, snapshot.ReviewTaskResults, snapshot.ReviewArchiveUploads);
      const location = archivePoolLocation_(upload.evaluation_id, upload.task, current, snapshot.ReviewArchiveLocations);
      items.push({evaluation_id:upload.evaluation_id, task:upload.task, upload_id:upload.upload_id,
        sha256:upload.expected_sha256, size:Number(upload.size), record_hash:upload.record_hash,
        record:current.record, location:location || null});
    } catch (error) { /* Incomplete or superseded uploads are not migration candidates. */ }
  });
  return {ok:true, items};
}

function archivePoolConfigure_(payload) {
  return withReviewLock_(() => {
    const slot = String(payload.slot || ""), storage = payload.storage || {};
    if (!/^[a-z][a-z0-9-]{1,40}$/.test(slot) || slot === "ingress") throw new Error("Invalid destination slot.");
    for (const key of ["client_id", "tenant_id", "refresh_token", "drive_id", "root_item_id"]) {
      if (!String(storage[key] || "") || String(storage[key]).length > 8000) throw new Error("Incomplete destination authorization.");
    }
    if (!/^[a-f0-9-]{36}$/i.test(storage.client_id) || storage.tenant_id !== "common" && !/^[a-f0-9-]{36}$/i.test(storage.tenant_id)) throw new Error("Invalid Microsoft client or authority.");
    if (storage.drive_id === config_("ARCHIVE_MS_DRIVE_ID", "")) throw new Error("Destination must differ from ingress.");
    const slots = parseJson_(config_("ARCHIVE_POOL_SLOTS", "[]"), []);
    if (slots.some(value => value !== slot && archivePoolProfile_(value).drive_id === storage.drive_id)) throw new Error("This OneDrive is already in the pool.");
    const existing = slots.includes(slot) ? archivePoolProfile_(slot) : null;
    if (existing && (existing.drive_id !== storage.drive_id || existing.root_item_id !== storage.root_item_id)) throw new Error("Do not replace a pool slot used by existing links.");
    const profile = Object.fromEntries(["client_id", "client_secret", "tenant_id", "refresh_token", "drive_id", "root_item_id"].map(key => [key, storage[key] || ""]));
    if (JSON.stringify(profile).length > 8500) throw new Error("Destination authorization is too large.");
    PropertiesService.getScriptProperties().setProperty("ARCHIVE_POOL_" + slot, JSON.stringify(profile));
    CacheService.getScriptCache().remove("archive-pool-access:" + slot);
    try {
      const folder = archivePoolGraph_(slot, "/drives/" + encodeURIComponent(profile.drive_id) + "/items/" + encodeURIComponent(profile.root_item_id));
      if (!folder.folder) throw new Error("Destination root is not a folder.");
    } catch (error) {
      if (existing) PropertiesService.getScriptProperties().setProperty("ARCHIVE_POOL_" + slot, JSON.stringify(existing));
      else PropertiesService.getScriptProperties().deleteProperty("ARCHIVE_POOL_" + slot);
      CacheService.getScriptCache().remove("archive-pool-access:" + slot);
      throw error;
    }
    if (!slots.includes(slot)) slots.push(slot);
    PropertiesService.getScriptProperties().setProperty("ARCHIVE_POOL_SLOTS", JSON.stringify(slots));
    return {ok:true, slot, configured:true};
  });
}

function archivePoolPublish_(payload) {
  return withReviewLock_(() => {
    const current = archivePoolCurrent_(payload.evaluation_id, payload.task);
    if (payload.upload_id !== current.upload.upload_id || payload.record_hash !== current.upload.record_hash ||
        payload.verified_sha256 !== current.record.artifacts.sha256) throw new Error("Registration changed during migration.");
    const existing = archivePoolLocation_(payload.evaluation_id, payload.task, current);
    if (existing) return {ok:true, duplicate:true, location:existing};
    const row = {evaluation_id:payload.evaluation_id, task:payload.task, sha256:payload.verified_sha256,
      upload_id:payload.upload_id, record_hash:payload.record_hash, slot:payload.slot,
      zip_item_id:payload.zip_item_id, zip_etag:payload.zip_etag, json_item_id:payload.json_item_id,
      json_etag:payload.json_etag, size:current.upload.size, source_zip_id:payload.source_zip_id,
      source_etag:payload.source_etag, status:"ready", updated_at:now_()};
    if (![row.source_zip_id, row.source_etag, row.zip_item_id, row.zip_etag, row.json_item_id, row.json_etag].every(value => typeof value === "string" && value && value.length < 1000)) throw new Error("Missing migration file identities.");
    archivePoolDestination_(row, current);
    reviewWrite_("ReviewArchiveLocations", null, row);
    return {ok:true, location:row};
  });
}

function archivePoolResolve_(payload) {
  const viewer = reviewerIdentity_(payload), run = reviewRun_(payload.evaluation_id);
  if (!run || !["admin", "supervisor", "observer"].includes(viewer.role) && normalizeEmail_(run.reviewer_email) !== viewer.email) throw new Error("Evidence is not assigned to you.");
  const current = archivePoolCurrent_(payload.evaluation_id, payload.task);
  if (payload.sha256 !== current.record.artifacts.sha256) throw new Error("Result changed; refresh the task.");
  const location = archivePoolLocation_(payload.evaluation_id, payload.task, current);
  const item = location ? archivePoolDestination_(location, current) : archivePoolGraph_("ingress",
    "/drives/" + encodeURIComponent(config_("ARCHIVE_MS_DRIVE_ID", "")) + "/items/" + encodeURIComponent(config_("ARCHIVE_MS_ROOT_ITEM_ID", "")) + ":/" +
    [payload.evaluation_id, payload.task, "latest", "evidence.zip"].map(encodeURIComponent).join("/"));
  const url = item["@microsoft.graph.downloadUrl"];
  if (Number(item.size) !== Number(current.upload.size) || !/^https:\/\//.test(String(url || ""))) throw new Error("Verified evidence is not available.");
  return {ok:true, download_url:url, sha256:current.record.artifacts.sha256, storage:location ? location.slot : "ingress"};
}

function archivePoolCleanup_(payload) {
  return withReviewLock_(() => {
    if (!parseJson_(config_("ARCHIVE_POOL_CLEANUP_APPROVAL", "{}"), {}).enabled) throw new Error("Source cleanup awaits explicit organizer approval.");
    const current = archivePoolCurrent_(payload.evaluation_id, payload.task);
    const location = archivePoolLocation_(payload.evaluation_id, payload.task, current);
    if (!location || payload.upload_id !== current.upload.upload_id || payload.sha256 !== location.sha256) throw new Error("No current verified migration.");
    archivePoolDestination_(location, current);
    if (location.status === "source_removed") return {ok:true, source_removed:true, duplicate:true};
    const base = "/drives/" + encodeURIComponent(config_("ARCHIVE_MS_DRIVE_ID", "")) + "/items/";
    let item;
    try { item = archivePoolGraph_("ingress", base + encodeURIComponent(location.source_zip_id)); }
    catch (error) { if (error.httpStatus !== 404) throw error; }
    if (item) {
      const expected = archivePoolGraph_("ingress", base + encodeURIComponent(config_("ARCHIVE_MS_ROOT_ITEM_ID", "")) + ":/" +
        [payload.evaluation_id, payload.task, "latest", "evidence.zip"].map(encodeURIComponent).join("/"));
      if (item.id !== expected.id || item.eTag !== location.source_etag || Number(item.size) !== Number(current.upload.size)) throw new Error("Source evidence changed; it was not deleted.");
      archivePoolGraph_("ingress", base + encodeURIComponent(item.id) + "/permanentDelete", "post", null, {"If-Match":item.eTag});
    }
    reviewWrite_("ReviewArchiveLocations", location._rowNumber, {evaluation_id:payload.evaluation_id, status:"source_removed", updated_at:now_()});
    return {ok:true, source_removed:true};
  });
}

function handleArchivePool_(action, payload) {
  if (payload.upload_token) throw new Error("Clone capabilities cannot administer archive storage.");
  if (action === "reviewer_resolve_evidence") return archivePoolResolve_(payload);
  if (reviewerIdentity_(payload).role !== "admin") throw new Error("Organizer access required.");
  if (action === "reviewer_archive_pool_configure") return archivePoolConfigure_(payload);
  if (action === "reviewer_archive_pool_queue") return archivePoolQueue_();
  if (action === "reviewer_archive_pool_publish") return archivePoolPublish_(payload);
  if (action === "reviewer_archive_pool_cleanup") return archivePoolCleanup_(payload);
  if (action === "reviewer_archive_pool_enable_cleanup") {
    if (typeof payload.enabled !== "boolean") throw new Error("Use an explicit cleanup setting.");
    const reason = requiredString_(payload.reason, "Cleanup approval reason");
    const approval = {enabled:payload.enabled, reason, approved_by:reviewerIdentity_(payload).email, approved_at:now_()};
    PropertiesService.getScriptProperties().setProperty("ARCHIVE_POOL_CLEANUP_APPROVAL", JSON.stringify(approval));
    return {ok:true, approval};
  }
  if (action === "reviewer_archive_pool_heartbeat") {
    const status = payload.status;
    if (!status || JSON.stringify(status).length > 6000) throw new Error("Invalid pool service status.");
    PropertiesService.getScriptProperties().setProperty("ARCHIVE_POOL_HEARTBEAT", JSON.stringify({state:status.state,
      slot:status.slot || "", evaluation_id:status.evaluation_id || "", task:status.task || "",
      bytes:Number(status.bytes || 0), error_type:status.error_type || "", updated_at:now_()}));
    return {ok:true};
  }
  if (action === "reviewer_archive_pool_status") return {ok:true, slots:parseJson_(config_("ARCHIVE_POOL_SLOTS", "[]"), []),
    cleanup_approval:parseJson_(config_("ARCHIVE_POOL_CLEANUP_APPROVAL", "{}"), {}), service:parseJson_(config_("ARCHIVE_POOL_HEARTBEAT", "{}"), {}), locations:reviewRows_("ReviewArchiveLocations").map(row =>
      ({evaluation_id:row.evaluation_id, task:row.task, sha256:row.sha256, slot:row.slot, status:row.status, updated_at:row.updated_at}))};
  throw new Error("Unknown archive pool action.");
}
