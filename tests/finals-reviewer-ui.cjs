const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const tasks=['click_bell','drawer_open_place','handle_basket','item_assembly','items_handover','manipulate_pipette','mixer_operating','sample_loading','table_rearrangement','water_pouring'];
const job={request_id:'real_ui_fixture',team_name:'Evaluation interface fixture',email:'team@example.test',is_test:false,
  submission:{method_name:'Method under review',repository:'https://github.com/example/repo',version_cutoff_at:'2026-11-16T12:00:00Z',dependency_notes:'pip install -r policy/act/requirements.txt',tasks:tasks.map(task=>({task,policy_path:'policy/act',checkpoint_ids:['act'],run_notes:'bash policy/act/eval.sh --task '+task}))},
  review:{owner:'reviewer@example.test',submission_checked:false,platform_checks:{},accepted:{}},progress:{steps:[false,false,false,false,false],completed:0,collected:1,ready:0},preparation:{bundle_sha:'a'.repeat(40)},runtimes:[],assignments:[],attempts:[{id:'fixture_attempt',task:'click_bell',slot:1,status:'success',uploaded:true,reviewer:'reviewer@example.test',evidence:[{target:'drive:RoboSynChallenge2026/real_stage/evidence/real_ui_fixture/click_bell/fixture_attempt/evidence.zip',size:1234,sha256:'b'.repeat(64),object_id:'private-object'}]}]};
(async()=>{
  const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
  const dir='/tmp/rsc-finals-browser/screenshots';fs.mkdirSync(dir,{recursive:true});
  for(const width of [1440,390,320]){
    const context=await browser.newContext({viewport:{width,height:950}}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));let requests=0;
    await page.route('https://script.google.com/**',async route=>{
      const payload=route.request().postDataJSON();assert.equal(payload.reviewer_email,'reviewer@example.test');
      if(payload.action==='finals_reviewer_list'){
        requests++;await route.fulfill({json:{ok:true,viewer:{email:'reviewer@example.test',role:'admin'},requests:[job],platforms:[1,2,3].map(i=>({platform:'platform_'+i,enrolled:i===1,part_registered:i===1})),reviewers:[{email:'reviewer@example.test',role:'admin'}],worker:{last_seen:'2026-11-12T02:00:00Z'}}});
      }else{assert.equal(payload.action,'finals_reviewer_check');assert.equal(payload.body.check,'submission');job.review.submission_checked=payload.body.checked;await route.fulfill({json:{ok:true}});}
    });
    await page.goto('http://127.0.0.1:8098/eval_backend/finals/');
    await page.getByLabel('Reviewer email').fill('reviewer@example.test');await page.getByLabel('Access token').fill('fixture-only');
    await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.locator('.reviewer-detail').waitFor();
    for(let stage=0;stage<5;stage++){
      await page.locator('[data-stage="'+stage+'"]').click();
      if(stage===4){await page.getByText('Click Bell evidence',{exact:true}).click();await page.locator('.finals-evidence summary').click();assert.match(await page.locator('.finals-evidence').textContent(),/private-object/);assert.ok(await page.locator('.finals-evidence').evaluate(el=>el.scrollWidth<=el.clientWidth),'Evidence metadata overflows');}
      assert.ok(await page.locator('.reviewer-stage-title h3').textContent());
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal page overflow '+width+' stage '+stage);
      await page.screenshot({path:dir+'/finals-review-'+width+'-'+stage+'.png',fullPage:true});
    }
    await page.locator('[data-stage="0"]').click();
    await page.locator('[data-check="submission"]').setChecked(!job.review.submission_checked);
    await page.waitForFunction(()=>!document.querySelector('[role="alert"]'));
    await page.getByRole('button',{name:'Refresh',exact:true}).click();
    assert.ok(requests>=2);assert.deepEqual(errors,[]);
    await context.close();
  }
  await browser.close();console.log('Finals reviewer UI: five stages, authenticated API, review checks, 1440/390/320 responsive layouts passed.');
})().catch(e=>{console.error(e);process.exit(1);});
