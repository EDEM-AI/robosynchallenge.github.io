/** Workshop PDFs: authenticated intake, private Drive storage and durable mail receipts. */
const PAPER_MAX_BYTES = 10 * 1024 * 1024;
const PAPER_HEADERS = ["paper_id", "email", "team_name", "team_id", "stage", "is_test", "sha256", "bytes",
  "filename", "created_at", "drive_file_id", "status", "mail_status", "mail_id", "mail_attempts", "mail_error"];

function paperRows_() {
  SHEETS.PaperSubmissions = PAPER_HEADERS;
  return rows_("PaperSubmissions");
}

function paperIdentity_(payload) {
  const identity = finalsIdentity_(payload);
  const user = findRow_("Users", "email", identity.email);
  return { email:identity.email, team_name:String(identity.team?.team_name || user.team_name || identity.email),
    team_id:identity.team?.team_id || "team_" + reviewerHash_(identity.email).slice(0,16),
    stage:identity.team ? "finals" : "preliminary", is_test:Boolean(identity.team?.is_test) };
}

function paperPublic_(row) {
  return { paper_id:row.paper_id, stage:row.stage, filename:row.filename, created_at:row.created_at,
    sha256:row.sha256, bytes:Number(row.bytes), status:row.status, mail_status:row.mail_status };
}

function paperOpen_(identity) {
  const deadline = Date.parse(config_("PAPER_DEADLINE_AT", "2026-11-16T12:00:00Z"));
  return config_("PAPER_INTAKE_ENABLED", "false") === "true" && Number.isFinite(deadline) && Date.now() < deadline &&
    Boolean(config_(identity.is_test ? "PAPER_TEST_DRIVE_ROOT_ID" : "PAPER_DRIVE_ROOT_ID", ""));
}

function paperBytes_(payload) {
  const data = payload.pdf_base64;
  if (typeof data !== "string" || data.length > Math.ceil(PAPER_MAX_BYTES / 3) * 4 ||
      data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error("Upload a PDF no larger than 10 MiB.");
  const bytes = Utilities.base64Decode(data);
  const head = Utilities.newBlob(bytes.slice(0,8)).getDataAsString();
  const tail = Utilities.newBlob(bytes.slice(-1024)).getDataAsString();
  if (!bytes.length || bytes.length > PAPER_MAX_BYTES || !/^%PDF-\d\.\d/.test(head) || !/%%EOF\s*$/.test(tail)) {
    throw new Error("The file is not a complete PDF.");
  }
  return bytes;
}

function paperDigest_(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
    .map(byte => (byte & 255).toString(16).padStart(2,"0")).join("");
}

function paperPrivateFolder_(folder) {
  if (folder.getSharingAccess() !== DriveApp.Access.PRIVATE) throw new Error("Paper storage must not be publicly shared.");
  return folder;
}

function paperFolder_(parent, name) {
  const folders = parent.getFoldersByName(name);
  const folder = folders.hasNext() ? folders.next() : parent.createFolder(name);
  if (folders.hasNext()) throw new Error("Duplicate paper storage folders; contact organizers.");
  return paperPrivateFolder_(folder);
}

function paperStore_(row, bytes) {
  const testing = row.is_test === true || row.is_test === "true";
  const rootId = config_(testing ? "PAPER_TEST_DRIVE_ROOT_ID" : "PAPER_DRIVE_ROOT_ID", "");
  if (!rootId || (testing && rootId === config_("PAPER_DRIVE_ROOT_ID", ""))) throw new Error("Separate private paper storage is required.");
  const root = paperPrivateFolder_(DriveApp.getFolderById(rootId));
  const folder = paperFolder_(paperFolder_(root, row.stage), row.team_id);
  const files = folder.getFilesByName(row.filename);
  // A deterministic name recovers a completed Drive write after a lost sheet/API response.
  const file = files.hasNext() ? files.next() : folder.createFile(Utilities.newBlob(bytes, "application/pdf", row.filename));
  if (files.hasNext() || file.getSize() !== bytes.length || file.getSharingAccess() !== DriveApp.Access.PRIVATE) {
    throw new Error("Stored PDF needs organizer verification.");
  }
  return file.getId();
}

function paperMail_(row, bytes) {
  if (row.is_test === true || row.is_test === "true") return {mail_status:"test_suppressed", mail_error:""};
  const boundary = "rsc_paper_" + row.paper_id;
  const encode = value => Utilities.base64Encode(String(value), Utilities.Charset.UTF_8);
  const wrap = value => value.match(/.{1,76}/g).join("\r\n");
  const body = ["A technical report has been received.", "", "Team: " + row.team_name,
    "Registered email: " + row.email, "Stage: " + row.stage, "Receipt: " + row.paper_id,
    "Received: " + row.created_at, "SHA-256: " + row.sha256,
    "Drive: https://drive.google.com/file/d/" + row.drive_file_id + "/view"].join("\n");
  const mime = ["To: robosynchallenge@gmail.com", "Reply-To: " + requiredEmail_(row.email),
    "Message-ID: <" + row.paper_id + "@robosyn-bench.net>",
    "Subject: =?UTF-8?B?" + encode("[RoboSynChallenge] " + row.stage + " technical report: " + row.team_name) + "?=",
    "MIME-Version: 1.0", 'Content-Type: multipart/mixed; boundary="' + boundary + '"', "",
    "--" + boundary, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap(encode(body)),
    "--" + boundary, 'Content-Type: application/pdf; name="' + row.filename + '"',
    'Content-Disposition: attachment; filename="' + row.filename + '"', "Content-Transfer-Encoding: base64", "",
    wrap(Utilities.base64Encode(bytes)), "--" + boundary + "--", ""].join("\r\n");
  const response = UrlFetchApp.fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method:"post", contentType:"application/json", muteHttpExceptions:true,
    headers:{Authorization:"Bearer " + ScriptApp.getOAuthToken()},
    payload:JSON.stringify({raw:Utilities.base64EncodeWebSafe(mime, Utilities.Charset.UTF_8)}) });
  const code = response.getResponseCode();
  if (code >= 400 && code < 500) return {mail_status:"pending", mail_error:"Gmail rejected delivery: HTTP " + code};
  if (code < 200 || code >= 300) throw new Error("Mail delivery not confirmed: HTTP " + code);
  const id = JSON.parse(response.getContentText()).id;
  if (!/^[a-f0-9]{16,32}$/.test(id || "")) throw new Error("Mail receipt is missing.");
  return {mail_status:"sent", mail_id:id, mail_error:""};
}

function paperNotify_(row, bytes) {
  if (["sent", "test_suppressed"].includes(row.mail_status) || Number(row.mail_attempts) >= 5) return row;
  if (["sending", "delivery_unknown"].includes(row.mail_status)) return row;
  const values = {mail_status:"sending", mail_attempts:Number(row.mail_attempts || 0) + 1};
  updateRow_("PaperSubmissions", row._rowNumber, values);
  Object.assign(row, values);
  try {
    Object.assign(values, paperMail_(row, bytes || DriveApp.getFileById(row.drive_file_id).getBlob().getBytes()));
  } catch (error) {
    Object.assign(values, {mail_status:"delivery_unknown", mail_error:"Delivery could not be confirmed; inspect Sent before retrying."});
  }
  updateRow_("PaperSubmissions", row._rowNumber, values);
  return Object.assign(row, values);
}

/** Optional time trigger: retries confirmed rejections, never an uncertain send. */
function retryPaperNotifications() {
  return withReviewLock_(() => paperRows_().filter(row => row.status === "stored" && row.mail_status === "pending" &&
    Number(row.mail_attempts || 0) < 5).slice(0,5).forEach(row => paperNotify_(row)));
}

function handlePaperAction_(action, payload) {
  if (action.startsWith("paper_admin_")) return paperAdmin_(action, payload);
  const identity = paperIdentity_(payload);
  if (action === "paper_status") return { ok:true, ...identity, intake_open:paperOpen_(identity), max_bytes:PAPER_MAX_BYTES,
    requests:paperRows_().filter(row => row.email === identity.email).map(paperPublic_) };
  if (action !== "paper_submit") throw new Error("Unknown paper action.");
  checkRateLimit_("paper_submit", identity.email, 12, 3600000);
  const bytes = paperBytes_(payload);
  const sha256 = paperDigest_(bytes);
  if (sha256 !== payload.sha256) throw new Error("PDF checksum mismatch; select the file again.");
  const paperId = "paper_" + reviewerHash_(identity.email + ":" + identity.stage + ":" + sha256).slice(0,32);
  return withReviewLock_(() => {
    let row = paperRows_().find(item => item.paper_id === paperId);
    if (row?.status === "stored") return {ok:true, already_recorded:true, request:paperPublic_(row)};
    if (!paperOpen_(identity)) throw new Error("Paper submissions are not open at this time.");
    if (!row) {
      const slug = identity.team_name.normalize("NFKD").replace(/[^A-Za-z0-9_-]+/g,"_").replace(/^_+|_+$/g,"").slice(0,60) || identity.team_id;
      appendRow_("PaperSubmissions", {...identity, paper_id:paperId, sha256, bytes:bytes.length,
        filename:identity.stage + "_" + slug + "_" + paperId + ".pdf", created_at:now_(), status:"storing", mail_status:"pending", mail_attempts:0});
      row = paperRows_().find(item => item.paper_id === paperId);
    }
    const values = {drive_file_id:paperStore_(row, bytes), status:"stored"};
    updateRow_("PaperSubmissions", row._rowNumber, values);
    Object.assign(row, values);
    paperNotify_(row, bytes);
    return {ok:true, already_recorded:false, request:paperPublic_(row)};
  });
}

function paperAdmin_(action, payload) {
  const viewer = reviewerIdentity_(payload);
  if (viewer.role !== "admin") throw new Error("Organizer access required.");
  if (action === "paper_admin_status") return {ok:true,
    enabled:config_("PAPER_INTAKE_ENABLED", "false") === "true",
    root_id:config_("PAPER_DRIVE_ROOT_ID", ""), test_root_id:config_("PAPER_TEST_DRIVE_ROOT_ID", ""),
    deadline_at:config_("PAPER_DEADLINE_AT", ""), requests:paperRows_().map(paperPublic_)};
  if (action === "paper_admin_configure") return withReviewLock_(() => {
    const deadline = String(payload.deadline_at || "");
    if (typeof payload.enabled !== "boolean" || !/(Z|[+-]\d{2}:\d{2})$/.test(deadline) || !Number.isFinite(Date.parse(deadline))) {
      throw new Error("Explicit intake flag and timezone-qualified deadline required.");
    }
    let rootId = config_("PAPER_DRIVE_ROOT_ID", ""), testId = config_("PAPER_TEST_DRIVE_ROOT_ID", "");
    if (!rootId || !testId) {
      if (payload.initialize_private_storage !== true) throw new Error("Private paper folders are not configured.");
      // Keep reports outside the evidence tree, whose share links may be public.
      const parent = paperFolder_(DriveApp.getRootFolder(), "RoboSynChallenge2026_private");
      rootId = rootId || paperFolder_(parent, "technical_reports").getId();
      testId = testId || paperFolder_(parent, "technical_reports_test").getId();
    }
    if (rootId === testId) throw new Error("Test and formal storage must be separate.");
    paperPrivateFolder_(DriveApp.getFolderById(rootId));
    paperPrivateFolder_(DriveApp.getFolderById(testId));
    PropertiesService.getScriptProperties().setProperties({PAPER_DRIVE_ROOT_ID:rootId,
      PAPER_TEST_DRIVE_ROOT_ID:testId, PAPER_INTAKE_ENABLED:String(payload.enabled), PAPER_DEADLINE_AT:deadline}, false);
    if (!ScriptApp.getProjectTriggers().some(trigger => trigger.getHandlerFunction() === "retryPaperNotifications")) {
      ScriptApp.newTrigger("retryPaperNotifications").timeBased().everyMinutes(10).create();
    }
    return {ok:true,enabled:payload.enabled,root_id:rootId,test_root_id:testId,deadline_at:deadline};
  });
  if (action === "paper_admin_smoke") return withReviewLock_(() => {
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(payload.probe_id || "")) throw new Error("Stable probe ID required.");
    const bytes = paperBytes_(payload), sha256 = paperDigest_(bytes);
    const paperId = "paper_probe_" + reviewerHash_(payload.probe_id).slice(0,32);
    let row = paperRows_().find(item => item.paper_id === paperId);
    if (row && row.sha256 !== sha256) throw new Error("Probe ID already belongs to another PDF.");
    if (!row) {
      appendRow_("PaperSubmissions", {paper_id:paperId,email:viewer.email,team_name:"SYSTEM TEST - not a participant report",
        team_id:"system_test",stage:"finals",is_test:true,sha256,bytes:bytes.length,filename:paperId + ".pdf",
        created_at:now_(),status:"storing",mail_status:"pending",mail_attempts:0});
      row = paperRows_().find(item => item.paper_id === paperId);
    }
    if (row.status !== "stored") {
      const values = {drive_file_id:paperStore_(row, bytes),status:"stored"};
      updateRow_("PaperSubmissions",row._rowNumber,values);Object.assign(row,values);
    }
    if (payload.send_test_notification === true) paperNotify_(Object.assign(row,{is_test:false}),bytes);
    return {ok:true,request:paperPublic_(row)};
  });
  throw new Error("Unknown paper administration action.");
}
