/** External, non-agent restart watchdog for the exact central CCI.
 * Credentials are private Script Properties, never returned or written to logs.
 * No model CCI or EIP is managed here; the central worker owns those leases.
 */
function fcControllerCloud_(config,method,suffix) {
  const date=Utilities.formatDate(new Date(),"GMT","EEE, dd MMM yyyy HH:mm:ss 'GMT'");
  const signature=Utilities.base64Encode(Utilities.computeHmacSha256Signature("x-date: "+date,config.access_key_secret));
  const response=UrlFetchApp.fetch(config.api_url+suffix,{method,headers:{"X-Date":date,
    Authorization:'hmac accesskey="'+config.access_key_id+'", algorithm="hmac-sha256", headers="x-date", signature="'+signature+'"'},
    contentType:"application/json",...(method==="post"?{payload:"{}"}:{}),muteHttpExceptions:true,followRedirects:false});
  const code=response.getResponseCode();
  if(code!==200)throw new Error("SCO HTTP "+code);
  return JSON.parse(response.getContentText());
}

function fsControllerWatchAdmin_(action,b) {
  const properties=PropertiesService.getScriptProperties();
  if(action==="team_controller_watch_status")return {watch:fcGet_("controller-watch:status",null)};
  fcCheck_(action==="team_controller_watch_configure","Unknown controller watch operation.");
  if(b.enabled===false){properties.deleteProperty("FINALS_CONTROLLER_WATCH");return {enabled:false};}
  const config={api_url:b.api_url,uid:b.uid,account:b.account,access_key_id:b.access_key_id,access_key_secret:b.access_key_secret};
  fcCheck_(/^https:\/\/cci\.cn-sh-01\.sensecore\.cn\/compute\/cci\/data\/v2\/subscriptions\/[a-f0-9-]+\/resourceGroups\/default\/zones\/cn-sh-01z\/workspaces\/p7-scientific-embodied-multi-agent\/apps\/challenge-cpu$/.test(config.api_url),"Only the central challenge-cpu CCI is allowed.");
  fcCheck_(/^[a-f0-9]{32}$/.test(config.uid) && typeof config.account==="string" && config.access_key_id && config.access_key_secret,"Explicit current credentials and identity required.");
  const app=fcControllerCloud_(config,"get","");
  fcCheck_(app.uid===config.uid && app.ownership.user_name===config.account && app.name==="challenge-cpu","Controller identity mismatch.");
  properties.setProperty("FINALS_CONTROLLER_WATCH",JSON.stringify(config));
  if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==="finalsControllerWatchTick"))ScriptApp.newTrigger("finalsControllerWatchTick").timeBased().everyMinutes(1).create();
  fcPut_("controller-watch:status",{enabled:true,checked_at:now_(),cloud_state:app.state,uid:app.uid,external:true});
  return {enabled:true,cloud_state:app.state,identity_verified:true};
}

// Only local claims/state writes hold the control-plane lock. Cloud requests can
// take minutes and must not block a station finishing or discarding an episode.
function fcControllerWatchLocked_(work) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return null;
  try {
    fcCache_ = null;
    return work(PropertiesService.getScriptProperties());
  } finally {
    lock.releaseLock();
  }
}

function fcControllerWatchCurrent_(properties, run) {
  const raw = properties.getProperty("FINALS_CONTROLLER_WATCH_RUN");
  return properties.getProperty("FINALS_CONTROLLER_WATCH") === run.raw &&
    raw && JSON.parse(raw).id === run.id;
}

function finalsControllerWatchTick() {
  const run = fcControllerWatchLocked_(properties => {
    const raw = properties.getProperty("FINALS_CONTROLLER_WATCH");
    if (!raw) return null;
    const active = JSON.parse(properties.getProperty("FINALS_CONTROLLER_WATCH_RUN") || "null");
    if (active && active.expires_at > Date.now()) return null;
    const claim = {id:Utilities.getUuid(), expires_at:Date.now() + 10 * 60 * 1000};
    // Longer than the trigger execution limit; a dead run recovers by expiry.
    properties.setProperty("FINALS_CONTROLLER_WATCH_RUN", JSON.stringify(claim));
    return {...claim, raw, previous:fcGet_("controller-watch:status", {})};
  });
  if (!run) return;
  const config = JSON.parse(run.raw);
  const result = {enabled:true, checked_at:now_(), external:true, uid:config.uid,
    last_start_at:run.previous.last_start_at || null};
  try {
    const app = fcControllerCloud_(config, "get", "");
    fcCheck_(app.uid === config.uid && app.name === "challenge-cpu" &&
      app.ownership.user_name === config.account, "Controller identity mismatch.");
    result.cloud_state = app.state;
    if (app.state === "SUSPENDED") {
      const start = fcControllerWatchLocked_(properties => {
        if (!fcControllerWatchCurrent_(properties, run)) return false;
        const previous = fcGet_("controller-watch:status", {});
        result.last_start_at = previous.last_start_at || null;
        if (previous.last_start_at && Date.now() - Date.parse(previous.last_start_at) <= 180000) return false;
        // Commit intent before sending. Lost responses cannot cause duplicate starts.
        result.last_start_at = now_();
        fcPut_("controller-watch:status", result);
        return true;
      });
      if (start) {
        fcControllerCloud_(config, "post", ":start");
        result.action = "start_requested";
      }
    }
  } catch (error) {
    result.error_type = /^SCO HTTP \d+$/.test(String(error.message || ""))
      ? error.message : "controller_identity_or_network_error";
  } finally {
    fcControllerWatchLocked_(properties => {
      // Configuration changes or a newer run must never be overwritten.
      if (fcControllerWatchCurrent_(properties, run)) {
        fcPut_("controller-watch:status", result);
      }
      const active = JSON.parse(properties.getProperty("FINALS_CONTROLLER_WATCH_RUN") || "null");
      if (active && active.id === run.id) properties.deleteProperty("FINALS_CONTROLLER_WATCH_RUN");
    });
  }
}
