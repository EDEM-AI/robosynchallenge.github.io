/** Team-scoped model services and platform-first setting queues. */
function fsTeam_(request) {return fcRequest_(request).team_id;}
function fsActive_(team) {return fcList_("attempt:").find(a=>a.status==="running" && fsTeam_(a.request_id)===team);}
function fsJob_(request) {return fcGet_("teamruntime:"+fsTeam_(request),null);}
function fsLease_(team) {
  const lease=fcGet_("lease:"+team,null);
  return lease && (Date.parse(lease.expires_at)>Date.now() || fsActive_(team)) ? lease : null;
}
function fsDropLease_(request,attempt) {
  const key="lease:"+fsTeam_(request),lease=fcGet_(key,null);
  if(attempt && (!lease || lease.attempt_id!==attempt.id))return;
  fcPut_(key,{expires_at:new Date(0).toISOString()});
}

function fsAdmin_(who,action,b) {
  fcCheck_(who.role==="admin","Organizer access required.");
  if(action==="team_queue") {
    fcPut_("worker:runtime",{last_seen:now_(),status:"team_worker_online"});
    const requests=finalsRows_(),versions=finalsVersionRows_(),tasks=fcList_("runtime:"),latest={};
    fcRequestCache_=requests;
    requests.forEach(r=>{if(!latest[r.team_id] || Number(r.revision)>Number(latest[r.team_id].revision))latest[r.team_id]=r;});
    Object.values(latest).forEach(row=>{
      const approved=tasks.filter(j=>j.request_id===row.request_id && j.recipe.transport==="chunk-v2" && j.status!=="cancelled");
      if(!approved.length)return;
      const registry=approved.sort((a,b)=>a.task.localeCompare(b.task)).map(j=>({task:j.task,recipe:j.recipe,recipe_sha:j.recipe_sha}));
      const key="teamruntime:"+row.team_id,old=fcGet_(key,null),hash=fcHash_(registry);
      if(old && (old.status==="cancelled" || old.registry_sha===hash && old.request_id===row.request_id))return;
      if(fsActive_(row.team_id) || fsLease_(row.team_id))return;
      fcPut_(key,{team_id:row.team_id,request_id:row.request_id,bundle_sha:approved[0].bundle_sha,registry,
        registry_sha:hash,generation:old?old.generation+1:1,status:"queued",updated_at:now_()});
    });
    return {jobs:fcList_("teamruntime:").map(j=>({...j,active_attempt:Boolean(fsActive_(j.team_id)),
      reserved:Boolean(fsLease_(j.team_id)),submission:JSON.parse(requests.find(r=>r.request_id===j.request_id).submission_json),
      versions:versions.find(r=>r.request_id===j.request_id)||null}))};
  }
  if(action==="team_update") {
    const key="teamruntime:"+b.team_id,job=fcGet_(key,null);
    fcCheck_(job && job.generation===b.generation && job.registry_sha===b.registry_sha,"Stale team generation.");
    fcCheck_(job.status!=="cancelled" && !fsActive_(b.team_id) && !fsLease_(b.team_id),"Team is cancelled, reserved or executing.");
    fcCheck_(["building","validating","ready","blocked"].includes(b.status),"Invalid team state.");
    if(b.status==="ready") {
      const e=b.endpoint,p=b.proof;
      fcCheck_(e && e.protocol==="rsc-real-chunk-v2" && e.request_id===job.request_id && e.bundle_sha===job.bundle_sha && e.generation===job.generation,"Wrong team endpoint.");
      fcCheck_(/^wss:\/\/[A-Za-z0-9.:-]+\/?$/.test(e.url) && typeof e.token==="string" && e.token.length>=32,"Authenticated TLS required.");
      fcCheck_(p && p.gpu==="NVIDIA GeForce RTX 5090" && p.tls && p.single_worker && p.task_switch && p.chunk_inference,"Team/chunk validation required.");
      job.registry.forEach(item=>{
        const result=p.tasks[item.task],config=b.tasks[item.task];
        fcCheck_(result && result.reset && result.feedback && result.actions && config && /^[a-f0-9]{64}$/.test(config.task_config_sha),"Every registered task needs verified chunks and feedback.");
        fcPut_("endpoint:"+job.request_id+":"+item.task,{...e,task:item.task,task_config_sha:config.task_config_sha,instruction:config.instruction});
      });
    }
    Object.assign(job,{status:b.status,note:String(b.note||"").slice(0,2000),updated_at:now_(),proof:b.proof||job.proof||null});fcPut_(key,job);
    job.registry.forEach(item=>{const k="runtime:"+job.request_id+":"+item.task,r=fcGet_(k,null);if(r && r.recipe_sha===item.recipe_sha){Object.assign(r,{status:b.status,note:job.note,generation:job.generation});fcPut_(k,r);}});
    if(["ready","blocked"].includes(b.status))fcNotify_(fcHash_([key,job.generation,b.status]),"[RoboSynChallenge] Finals team service "+b.status,job.request_id+"\n"+job.note,fcMeta_(job.request_id).owner||undefined);
    return {recorded:true};
  }
  if(action==="team_rebuild" || action==="team_cancel") {
    const key="teamruntime:"+fsTeam_(b.request_id),job=fcGet_(key,null);fcCheck_(job,"No team runtime.");
    fcCheck_(!fsActive_(job.team_id) && !fsLease_(job.team_id),"Release the reservation or finish/discard the active rollout first.");
    const reason=finalsText_(b.reason,"Reason",2000);
    if(action==="team_cancel"){job.status="cancelled";fsDropLease_(job.request_id);}
    else {fcCheck_(job.status!=="cancelled","Cancelled team cannot auto-restart.");if(!["queued","building","validating"].includes(job.status)){job.generation++;job.status="queued";}}
    job.note=reason;fcPut_(key,job);
    job.registry.forEach(item=>{const k="runtime:"+job.request_id+":"+item.task,r=fcGet_(k,null);r.status=job.status;r.generation=job.generation;fcPut_(k,r);});
    return {status:job.status,generation:job.generation};
  }
  throw new Error("Unknown team administration operation.");
}

function fsCards_(who) {
  const cards=fcCards_(who),roster=JSON.parse(config_("FINALS_ROSTER_JSON","[]")).concat(JSON.parse(config_("FINALS_TEST_ROSTER_JSON","[]")));
  if(!fcRequestCache_)fcRequestCache_=finalsRows_();
  const rows=Object.fromEntries(fcRequestCache_.map(r=>[r.request_id,r]));
  const teams=Object.fromEntries(fcList_("teamruntime:").map(t=>[t.team_id,t]));
  const metas=Object.fromEntries(fcList_("review:").map(m=>[m.request_id,m]));
  const active=new Set(fcList_("attempt:").filter(a=>a.status==="running").map(a=>rows[a.request_id]?.team_id));
  const leases=Object.fromEntries(fcList_("lease:").filter(l=>Date.parse(l.expires_at)>Date.now() || active.has(l.team_id)).map(l=>[l.team_id,l]));
  return cards.filter(c=>c.status==="pending" && teams[rows[c.request_id]?.team_id]?.request_id===c.request_id).map(c=>{
    const row=rows[c.request_id],meta=metas[c.request_id]||{platform_checks:{}},team=teams[row.team_id],lease=leases[row.team_id];
    return {...c,team_id:row.team_id,team_name:(roster.find(r=>r.team_id===row.team_id)||{}).team_name||row.team_id,
      ready:Boolean(c.endpoint_ready && team.status==="ready" && meta.submission_checked && meta.platform_checks[c.platform] && !active.has(row.team_id) && (!lease || lease.platform===who.platform)),
      runtime_status:team.status,runtime_note:team.note||"",generation:team.generation};
  });
}

function fsStream_(who,action,b) {
  fcCheck_(who.role==="operator","Platform identity required.");
  fcCheck_(["stream_poll","stream_claim","stream_release"].includes(action),"Unknown stream operation.");
  const key="stream:"+who.platform;
  if(action==="stream_release") {
    const lease=fcList_("lease:").find(l=>l.id===b.lease_id && l.platform===who.platform);
    if(!lease)return {released:true};
    fcCheck_(!fsActive_(lease.team_id),"No releasable platform reservation.");fsDropLease_(lease.request_id);return {released:true};
  }
  const current=fcGet_(key,{setting:"base",waiting_since:null}),cards=fsCards_(who);
  const own=fcList_("lease:").find(l=>l.platform===who.platform && l.id && fsLease_(l.team_id)?.id===l.id);
  if(own) {
    if(b.lease_id && b.lease_id!==own.id)throw new Error("Reservation mismatch.");
    if(action==="stream_claim")fcCheck_(b.request_id===own.request_id && b.task===own.task && b.slot===own.slot,"Platform already reserved a different slot.");
    own.expires_at=new Date(Date.now()+180000).toISOString();fcPut_("lease:"+own.team_id,own);
    return {reservation:own,setting:current.setting,card:cards.find(c=>c.request_id===own.request_id && c.task===own.task && c.slot===own.slot)||own.card,
      endpoint:fcGet_("endpoint:"+own.request_id+":"+own.task,null)};
  }
  if(b.setting){fcCheck_(FC_SETTINGS.includes(b.setting),"Unknown setting.");current.setting=b.setting;current.waiting_since=null;}
  const sort=(a,b)=>a.task.localeCompare(b.task) || String(a.variant||"").localeCompare(String(b.variant||"")) || a.slot-b.slot || a.request_id.localeCompare(b.request_id);
  let available=cards.filter(c=>c.setting===current.setting && c.ready).sort(sort),switched=false;
  if(available.length)current.waiting_since=null;
  else if(cards.length){
    if(!current.waiting_since)current.waiting_since=now_();
    if(!cards.some(c=>c.setting===current.setting) || Date.now()-Date.parse(current.waiting_since)>=1800000){
      const alternatives=cards.filter(c=>c.setting!==current.setting).sort((a,b)=>Number(b.ready)-Number(a.ready)||FC_SETTINGS.indexOf(a.setting)-FC_SETTINGS.indexOf(b.setting)||sort(a,b));
      if(alternatives.length){current.setting=alternatives[0].setting;current.waiting_since=now_();switched=true;available=cards.filter(c=>c.setting===current.setting && c.ready).sort(sort);}
    }
  }else current.waiting_since=null;
  fcPut_(key,current);
  if(action==="stream_claim") {
    const card=available.find(c=>c.request_id===b.request_id && c.task===b.task && c.slot===b.slot);
    fcCheck_(card && !fsLease_(card.team_id),"Candidate no longer available; refresh the stream.");
    const lease={id:Utilities.getUuid().replace(/-/g,""),team_id:card.team_id,request_id:card.request_id,task:card.task,slot:card.slot,
      platform:who.platform,generation:card.generation,card,expires_at:new Date(Date.now()+180000).toISOString()};
    fcPut_("lease:"+card.team_id,lease);
    return {reservation:lease,card,setting:current.setting,endpoint:fcGet_("endpoint:"+card.request_id+":"+card.task,null)};
  }
  fcCheck_(action==="stream_poll","Unknown stream operation.");
  return {setting:current.setting,switched,card:available[0]||null,ready_count:available.length,
    pending_count:cards.length,waiting_since:current.waiting_since,
    switch_after_seconds:current.waiting_since?Math.max(0,1800-Math.floor((Date.now()-Date.parse(current.waiting_since))/1000)):null,
    waiting:cards.filter(c=>c.setting===current.setting && !c.ready).map(c=>({request_id:c.request_id,task:c.task,status:c.runtime_status,note:c.runtime_note}))};
}

function fsStart_(who,b) {
  const team=fsJob_(b.request_id);if(!team)return;
  const lease=fsLease_(team.team_id);
  fcCheck_(lease && lease.id===b.lease_id && lease.platform===who.platform && lease.request_id===b.request_id && lease.task===b.task && lease.slot===b.slot && lease.generation===team.generation,"Reserve the exact team/task slot before starting.");
  fcCheck_(!fsActive_(team.team_id),"This team's single CCI is busy on another platform.");
}
