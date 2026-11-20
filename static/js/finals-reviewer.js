(() => {
  'use strict';
  const root=document.getElementById('finals-reviewer'),key='rsc-reviewer-credentials-v1';
  const stages=['Submission check','Cloud model','Platform check','Capture & upload','Result review'];
  const tasks=['click_bell','drawer_open_place','handle_basket','item_assembly','items_handover','manipulate_pipette','mixer_operating','sample_loading','table_rearrangement','water_pouring'];
  let credentials=null,data=null,selected=null,stage=0,busy=false,error='',search='';
  const mailKeys=new Map();
  try{credentials=JSON.parse(sessionStorage.getItem(key));}catch{}
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const label=v=>String(v).replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
  const icon=n=>`<i data-lucide="${n}" aria-hidden="true"></i>`;
  const btn=(action,text,symbol,attrs='')=>`<button class="button button-secondary" type="button" data-action="${action}" ${attrs}>${icon(symbol)}${text}</button>`;
  const table=(headers,rows)=>`<div class="finals-table-scroll"><table class="finals-review-table"><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const current=()=>data?.requests.find(r=>r.request_id===selected);
  const admin=()=>data?.viewer.role==='admin';
  const editable=job=>data?.viewer.can_review_all_requests===true||admin()||(data?.viewer.role==='evaluator'&&job.review.owner===data.viewer.email);
  const options=(values,value)=>values.map(v=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(label(v))}</option>`).join('');
  const taskSelect=(name='task')=>`<label>Task<select name="${name}">${options(tasks)}</select></label>`;
  const workerStatus=worker=>!worker?.last_seen?'Not connected':`${Date.now()-Date.parse(worker.last_seen)>180000?'Stale':'Online'} · ${worker.last_seen}`;
  function correctionInbox(job) {
    const replies=job.correction_intake||[];
    if(!replies.length)return '';
    return `<section class="finals-review-notes"><h4>Correction replies · ${replies.length}</h4><p>Automatically registered for organizer review. Receiving a reply does not approve or deploy the correction.</p>${replies.map(reply=>`<details><summary>${esc(label(reply.status))} · ${esc(reply.received_at)} · revision ${esc(reply.source_revision)}</summary><p>${esc(reply.subject)}</p><p>${esc(reply.note)}</p><p>Source request: ${esc(reply.request_id)} · Gmail message: ${esc(reply.gmail_message_id)}</p>${(reply.commit_candidates||[]).map(link=>`<p>Candidate commit: <code style="overflow-wrap:anywhere">${esc(link)}</code></p>`).join('')}${!(reply.commit_candidates||[]).length?'<p>No unambiguous commit link extracted. Review the original reply for mapping changes or missing details.</p>':''}<p>Registration: ${esc(reply.registered_at)}</p></details>`).join('')}</section>`;
  }
  function preparationStatus(job) {
    const p=job.preparation_status,preview=p?.preview;
    return `<dl class="reviewer-meta"><div><dt>Code preparation</dt><dd>${esc(p?label(p.status):'Not yet checked')}</dd></div>
      ${p?`<div><dt>Last update</dt><dd>${esc(p.updated_at)}</dd></div>`:''}
      ${preview?`<div><dt>Provisional branch (not final)</dt><dd><a href="https://github.com/ZhaoRunyi/robosynchallenge_real/tree/${encodeURIComponent(preview.branch)}" target="_blank" rel="noopener noreferrer">${esc(preview.branch)}</a></dd></div><div><dt>Preview commit</dt><dd>${esc(preview.bundle_sha)}</dd></div><div><dt>Participant commit</dt><dd>${esc(preview.source_sha)}</dd></div>`:''}
      ${p?.note?`<div><dt>Preparation detail</dt><dd>${esc(p.note)}</dd></div>`:''}
      ${p?.error_type?`<div><dt>Error</dt><dd>${esc(p.error_type)}</dd></div>`:''}
      ${p?.next_retry_at?`<div><dt>Next retry</dt><dd>${esc(p.next_retry_at)} · attempt ${esc(p.attempts)}</dd></div>`:''}</dl>`;
  }
  const check=(name,text,checked,extra='')=>`<label class="finals-review-check"><input type="checkbox" data-check="${name}" ${checked?'checked':''} ${extra}>${text}</label>`;
  const cleanupDetail=attempt=>attempt.cleanup?.state==='complete'?` · ${esc(attempt.cleanup.archived)} archived`:attempt.cleanup?.state==='retry'?' · storage cleanup retrying':attempt.cleanup?.state==='pending'?' · storage cleanup queued':'';
  const evidence=attempt=>attempt.status==='deleted'?'Discarded'+cleanupDetail(attempt):attempt.evidence_withdrawn?'Withdrawn'+cleanupDetail(attempt):!attempt.uploaded?'Pending':!attempt.evidence?.length?'Stored':
    `<details class="finals-evidence"><summary>Evidence (${attempt.evidence.length} files)</summary>${attempt.evidence.map(file=>`<dl><dt>Storage location</dt><dd><code>${esc(file.target)}</code></dd><dt>Size</dt><dd>${esc(Number(file.size).toLocaleString())} bytes</dd><dt>SHA256</dt><dd><code>${esc(file.sha256)}</code></dd>${file.object_id?`<dt>Object ID</dt><dd><code>${esc(file.object_id)}</code></dd>`:''}</dl>`).join('')}</details>`;
  async function api(action,body={}) {
    const response=await fetch(window.ROBO_SYN_CONFIG.API_BASE_URL,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({action,body,reviewer_email:credentials.email,reviewer_token:credentials.token})});
    if(!response.ok)throw Error('Backend connection failed ('+response.status+').');
    const result=await response.json();if(!result.ok)throw Error(/\u9501\u8d85\u65f6/.test(result.error||'')?'The controller is busy. Please retry.':result.error||'Request rejected.');return result;
  }
  function discardButton(attempt,locked) {
    return !locked&&['success','failure'].includes(attempt.status)?btn('discard-attempt','Discard','trash-2',`data-attempt="${esc(attempt.id)}" aria-label="Discard ${esc(label(attempt.task))} slot ${esc(attempt.slot)}"`):'';
  }
  function content(job) {
    const submission=job.submission,review=job.review,locked=!editable(job);
    if(stage===0)return `${correctionInbox(job)}${preparationStatus(job)}<dl class="reviewer-meta"><div><dt>Final prepared commit</dt><dd>${esc(job.preparation?.bundle_sha||'Not finalized')}</dd></div><div><dt>Version cutoff</dt><dd>${esc(submission.version_cutoff_at)}</dd></div><div><dt>Repository</dt><dd>${esc(submission.repository)}</dd></div><div><dt>Assigned reviewer</dt><dd>${esc(review.owner||'Unassigned')}</dd></div></dl>
      ${admin()?`<form class="finals-review-form" data-form="owner"><label>Reviewer<select name="email" required><option value="">Select reviewer</option>${(data.reviewers||[]).map(r=>`<option ${r.email===review.owner?'selected':''}>${esc(r.email)}</option>`).join('')}</select></label><button class="button button-secondary">${icon('user-check')}Assign reviewer</button></form>`:''}
      ${table(['Task','Policy','Checkpoint IDs'],submission.tasks.map(t=>[esc(label(t.task)),esc(t.policy_path),esc(t.checkpoint_ids?.join(', ')||t.no_weights_reason||'None')]))}
      <details class="finals-review-notes"><summary>Participant commands and dependencies</summary><pre>${esc(submission.dependency_notes)}\n\n${esc(submission.tasks.map(t=>t.task+'\n'+t.run_notes).join('\n\n'))}</pre></details>
      <fieldset class="reviewer-readonly" ${locked?'disabled':''}>${check('submission','Repository, policy entrypoints and checkpoint mapping verified',review.submission_checked,job.preparation?'':'disabled')}</fieldset>`;
    if(stage===1)return `${table(['Task','Model runtime','Generation','Validation'],tasks.map(t=>{const j=job.runtimes.find(r=>r.task===t);return [esc(label(t)),esc(j?.status||'Awaiting reviewed build recipe'),esc(j?.generation||'-'),esc(j?.note||'')];}))}
      ${admin()?`<details class="finals-review-notes"><summary>Approve cloud build recipe</summary><form class="finals-review-form" data-form="recipe">${taskSelect()}<label>Runtime recipe (JSON)<textarea name="recipe" required spellcheck="false" placeholder='{"policy_path":"policy/act","args":{},"instruction":"...","install":[],"image":"registry/image@sha256:..."}'></textarea></label><button class="button button-primary">${icon('cloud-upload')}Approve & build</button></form></details>`:''}
      <fieldset class="reviewer-readonly" ${locked?'disabled':''}><form class="finals-review-form" data-form="rebuild">${taskSelect()}<label>Connection or runtime issue<textarea name="reason" required maxlength="2000"></textarea></label><button class="button button-secondary">${icon('refresh-cw')}Request rebuild</button></form></fieldset>`;
    if(stage===2)return `${table(['Platform','Enrollment','Reference part'],data.platforms.map(p=>[esc(p.platform),p.enrolled?'Ready':'Not enrolled',p.part_registered?'Registered':'Pending local import']))}
      ${table(['Task','Platform','Plan'],tasks.map(t=>{const a=job.assignments.find(a=>a.task===t);return [esc(label(t)),esc(a?.platform||'Unassigned'),a?'20 slots / 5 settings':'Pending'];}))}
      ${admin()?`<form class="finals-review-form" data-form="route">${taskSelect()}<label>Platform<select name="platform">${options(['platform_1','platform_2','platform_3'])}</select></label><button class="button button-secondary">${icon('route')}Assign task</button></form>`:''}
      <fieldset class="reviewer-readonly" ${locked?'disabled':''}>${[...new Set(job.assignments.map(a=>a.platform))].map(p=>check('platform',esc(p)+': cameras, alignment, controls and emergency stop checked on site',review.platform_checks[p],`data-platform="${p}"`)).join('')}</fieldset>`;
    if(stage===3)return `${table(['Task','Platform','Finished','Uploaded'],tasks.map(t=>{const a=job.attempts.filter(a=>a.task===t&&a.status!=='deleted'),route=job.assignments.find(a=>a.task===t);return [esc(label(t)),esc(route?.platform||'-'),a.filter(a=>['success','failure'].includes(a.status)).length+' / 20',a.filter(a=>a.uploaded).length+' / 20'];}))}
      ${table(['Task / slot','Reviewer','Status','Evidence','Actions'],job.attempts.map(a=>[esc(label(a.task))+' / '+esc(a.slot)+'<br><small>'+esc(a.id.slice(0,8))+'</small>',esc(a.reviewer),esc(a.status),evidence(a),discardButton(a,locked)]))}`;
    return `<fieldset class="reviewer-readonly" ${locked?'disabled':''}>${tasks.map(t=>{const count=job.attempts.filter(a=>a.task===t&&a.uploaded&&a.status!=='deleted').length;return check('accept',esc(label(t))+' ('+count+'/20 uploaded)',review.accepted[t],`data-task="${t}" ${count===20?'':'disabled'}`);}).join('')}</fieldset>
      ${tasks.filter(t=>job.attempts.some(a=>a.task===t&&a.uploaded&&a.status!=='deleted')).map(t=>`<details class="finals-review-notes"><summary>${esc(label(t))} evidence</summary>${job.attempts.filter(a=>a.task===t&&a.uploaded&&a.status!=='deleted').sort((a,b)=>a.slot-b.slot).map(a=>`<section class="finals-evidence-attempt"><h4>Slot ${esc(a.slot)} / ${esc(label(a.status))}</h4>${evidence(a)}${discardButton(a,locked)}</section>`).join('')}</details>`).join('')}`;
  }
  function render() {
    const heading=`<header class="reviewer-heading"><div><h1>Real-finals evaluation</h1></div>${credentials?btn('logout','Sign out','log-out'):''}</header>`;
    if(!data){root.innerHTML=heading+`<form class="finals-review-form finals-review-login" data-form="login"><label>Reviewer email<input type="email" name="email" autocomplete="username" required></label><label>Access token<input type="password" name="token" autocomplete="current-password" required></label><button class="button button-primary" ${busy?'disabled':''}>${icon('log-in')}Sign in</button><p role="alert">${esc(error)}</p></form>`;window.lucide?.createIcons();return;}
    const requests=data.requests.filter(r=>!r.is_test),units=requests.reduce((n,r)=>n+r.progress.completed,0),complete=requests.filter(r=>r.progress.completed===5).length;
    const job=current();
    root.innerHTML=heading+`<div class="reviewer-progress"><strong>Finals progress</strong><progress max="${Math.max(1,requests.length*5)}" value="${units}" aria-label="Finals stages"></progress><span>${complete} / ${requests.length} requests · ${units} / ${requests.length*5} stages</span></div><div class="finals-review-toolbar">${btn('refresh','Refresh','refresh-cw')}<span>${esc(data.viewer.email)}</span><span>Preparation worker: ${esc(workerStatus(data.preparation_worker))}</span><span>Model worker: ${esc(workerStatus(data.worker))}</span></div>${error?`<p class="reviewer-error" role="alert">${esc(error)}</p>`:''}
      <div class="reviewer-layout"><aside class="reviewer-sidebar"><div class="reviewer-sidebar-head"><h2>Requests</h2><span>${data.requests.length}</span></div><input class="reviewer-search" aria-label="Search requests" type="search" value="${esc(search)}" placeholder="Team or request"><div class="reviewer-queue">${data.requests.filter(r=>(r.team_name+' '+r.request_id).toLowerCase().includes(search.toLowerCase())).map(r=>`<button type="button" class="reviewer-job ${selected===r.request_id?'selected':''}" data-request="${esc(r.request_id)}"><strong>${esc(r.team_name)}${r.is_test?' (test)':''}</strong><span>${esc(r.request_id)}</span><small>${r.progress.completed}/5 stages · ${r.progress.collected}/200 uploads</small><progress max="5" value="${r.progress.completed}"></progress></button>`).join('')||'<p class="reviewer-empty">No requests assigned.</p>'}</div></aside>
      ${job?`<article class="reviewer-detail"><header class="reviewer-detail-head"><div><span class="reviewer-id">${esc(job.request_id)}</span><h2>${esc(job.team_name)}</h2><p>${esc(job.submission.method_name)} · ${esc(job.email)}</p></div><span class="reviewer-state">${job.progress.completed} / 5 stages</span></header><nav class="reviewer-stage-nav" aria-label="Evaluation stages">${stages.map((s,i)=>`<button type="button" data-stage="${i}" class="${stage===i?'active':''} ${job.progress.steps[i]?'done':''}" aria-current="${stage===i?'step':'false'}"><span class="reviewer-step-number">${job.progress.steps[i]?icon('check'):i+1}</span>${s}</button>`).join('')}</nav><div class="reviewer-stage-body"><div class="reviewer-stage-title"><h3>${stages[stage]}</h3><span>${stage+1} / 5</span></div>${!editable(job)?'<p class="reviewer-notice">Read-only</p>':''}${content(job)}</div><footer class="reviewer-footer">${btn('previous','Previous','arrow-left',stage===0?'disabled':'')}${btn('next','Next','arrow-right',stage===4?'disabled':'')}</footer></article>`:'<div class="reviewer-empty">No finals request is selected.</div>'}</div>`;
    if(job && editable(job))root.querySelector('.reviewer-stage-body')?.insertAdjacentHTML('beforeend',`<details class="finals-review-notes"><summary>Issue / Send email</summary><form class="finals-review-form" data-form="issue"><label>Subject<input name="subject" required maxlength="200"></label><label>Message<textarea name="text" required maxlength="10000"></textarea></label><span>To: ${esc(job.email)}</span><button class="button button-secondary">${icon('send')}Send email</button></form>${(job.messages||[]).map(m=>`<p>${esc(m.subject)} · ${esc(m.status)}${m.sent_at?' · '+esc(m.sent_at):''}</p>`).join('')}</details>`);
    window.lucide?.createIcons();
  }
  async function refresh(quiet=false) {
    if(busy)return;busy=true;
    try{const next=await api('finals_reviewer_list');data=next;if(!data.requests.some(r=>r.request_id===selected))selected=data.requests[0]?.request_id||null;error='';if(!quiet||!root.contains(document.activeElement)||!document.activeElement.matches('input,textarea,select'))render();}
    catch(e){error=e.message;if(!quiet)render();}finally{busy=false;}
  }
  async function mutate(action,body){if(busy)return;busy=true;error='';try{await api(action,body);}catch(e){error=e.message;busy=false;render();return;}busy=false;await refresh();}
  root.addEventListener('click',event=>{
    const request=event.target.closest('[data-request]'),step=event.target.closest('[data-stage]'),button=event.target.closest('[data-action]'),action=button?.dataset.action;
    if(request){selected=request.dataset.request;stage=0;render();}else if(step){stage=Number(step.dataset.stage);render();}
    else if(action==='refresh')refresh();else if(action==='previous'||action==='next'){stage+=action==='next'?1:-1;render();}
    else if(action==='discard-attempt'&&!busy){
      const job=current(),attempt=job?.attempts.find(a=>a.id===button.dataset.attempt);
      if(!attempt||!editable(job)||!['success','failure'].includes(attempt.status))return;
      if(!window.confirm(`Discard ${job.team_name} / ${label(attempt.task)} / episode ${attempt.slot} (${label(attempt.status)}, ${attempt.id.slice(0,8)})? This result will no longer count. The episode will reopen and evidence cleanup will be queued.`))return;
      mutate('finals_reviewer_discard',{request_id:job.request_id,task:attempt.task,attempt_id:attempt.id,expected_status:attempt.status,reason:'Reviewer discarded this individual episode from the evaluation website.'});
    }
    else if(action==='logout'){sessionStorage.removeItem(key);credentials=null;data=null;error='';render();}
  });
  root.addEventListener('input',event=>{if(event.target.matches('.reviewer-search')){search=event.target.value;const position=event.target.selectionStart;render();const input=root.querySelector('.reviewer-search');input.focus();input.setSelectionRange(position,position);}});
  root.addEventListener('change',event=>{const el=event.target;if(el.dataset.check)mutate('finals_reviewer_check',{request_id:selected,check:el.dataset.check,checked:el.checked,platform:el.dataset.platform,task:el.dataset.task});});
  root.addEventListener('submit',async event=>{
    event.preventDefault();const form=event.target,kind=form.dataset.form,values=Object.fromEntries(new FormData(form));if(!kind)return;
    if(kind==='login'){credentials={email:values.email.trim().toLowerCase(),token:values.token};await refresh();if(data)sessionStorage.setItem(key,JSON.stringify(credentials));return;}
    const body={request_id:selected,...values},job=current();let action;
    if(kind==='owner')action='finals_admin_control_assign_owner';
    if(kind==='route'){action='finals_admin_control_assign';body.bundle_sha=job.preparation?.bundle_sha;}
    if(kind==='recipe'){action='finals_admin_control_runtime_approve';try{body.recipe={...JSON.parse(values.recipe),transport:'chunk-v2'};}catch{error='Invalid recipe JSON.';render();return;}}
    if(kind==='rebuild')action='finals_reviewer_rebuild';
    if(kind==='issue'){action='finals_reviewer_issue';if(!window.confirm('Send this email to '+job.email+'?'))return;const fingerprint=JSON.stringify([selected,values.subject,values.text]);if(!mailKeys.has(fingerprint))mailKeys.set(fingerprint,crypto.randomUUID().replaceAll('-',''));body.retry_key=mailKeys.get(fingerprint);}
    if(action)await mutate(action,body);
  });
  render();if(credentials)refresh();setInterval(()=>{if(credentials&&!document.hidden)refresh(true);},30000);
})();
