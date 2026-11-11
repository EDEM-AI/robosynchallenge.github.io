const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const tasks=['click_bell','drawer_open_place','handle_basket','item_assembly','items_handover','manipulate_pipette','mixer_operating','sample_loading','table_rearrangement','water_pouring'];
(async()=>{
  const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
  const dir=process.env.RSC_SCREENSHOTS||'/tmp/rsc-finals-browser/screenshots'; fs.mkdirSync(dir,{recursive:true});
  for(const width of [1440,390,320]) {
    const context=await browser.newContext({viewport:{width,height:950}});
    const page=await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    let eligible=true, requests=[], retryKey;
    await page.route('**/api/finals',async route=>{
      const data=route.request().postDataJSON(); let result;
      if(data.action==='login') result={ok:true,session_id:'ui-session'};
      else if(data.action==='finals_status') result={ok:true,eligible,intake_open:eligible,is_test:true,team_name:'Test team',tasks,requests};
      else {
        assert.equal(data.submission.tasks.length,10); assert.equal(data.submission.commit,undefined);
        assert.equal(data.submission.checkpoints[0].revision,undefined);
        retryKey=data.submission_key;
        const request={request_id:'real_ui_test',revision:1,status:'test_submitted',created_at:'2026-11-12'};
        requests=[request]; result={ok:true,request};
      }
      await route.fulfill({json:result});
    });
    await page.goto('http://127.0.0.1:8096/finals/',{waitUntil:'domcontentloaded'});
    await page.getByLabel('Registered email').fill('preview@example.test');
    await page.getByLabel('Access token').fill('ui-fixture');
    await page.screenshot({path:dir+'/login-'+width+'.png'});
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await page.locator('#submission').waitFor({state:'visible'});
    assert.equal(await page.locator('#tasks > details').count(),10);
    assert.equal(await page.locator('#tasks > details[open]').count(),0);
    assert.equal(await page.locator('#submission [name="commit"], #checkpoints [name="revision"]').count(),0);
    assert.equal(await page.locator('#login-section').isVisible(),false);
    assert.equal(await page.locator('#task-count').textContent(),'0 / 10');
    assert.equal(await page.getByLabel('Access token').inputValue(),'');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:dir+'/form-'+width+'.png',fullPage:true});
    if(width===1440) {
      for(const [name,value] of Object.entries({method_name:'Test method',repository:'https://github.com/example/policy',code_ref:'',compute_notes:'RTX5090',description:'Test description',dependency_notes:'Test environment',data_sources:'Official data'})) await page.locator('#submission [name="'+name+'"]').fill(value);
      for(const [name,value] of Object.entries({id:'weights',repo:'example/weights',ref:'',path:''})) await page.locator('#checkpoints [name="'+name+'"]').fill(value);
      for(const task of tasks) {
        const row=page.locator('[data-task="'+task+'"]');
        await row.locator('summary').click();
        await row.locator('[name="policy_path"]').fill('policy/act');
        await row.locator('[name="checkpoint_ids"]').fill('weights');
        await row.locator('[name="run_notes"]').fill('bash policy/act/eval.sh --task '+task);
        await row.locator('summary').click();
      }
      assert.equal(await page.locator('#task-count').textContent(),'10 / 10');
      await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('#submission').waitFor({state:'visible'});
      assert.equal(await page.locator('#task-count').textContent(),'10 / 10');
      assert.equal(await page.locator('#submission [name="method_name"]').inputValue(),'Test method');
      await page.locator('#tasks > details').first().evaluate(el=>el.querySelector('[name="run_notes"]').value='');
      await page.locator('#submission').evaluate(form=>form.reportValidity());
      assert.equal(await page.locator('#tasks > details').first().getAttribute('open'),'');
      await page.locator('#tasks > details').first().locator('[name="run_notes"]').fill('bash policy/act/eval.sh --task click_bell');
      await page.locator('#tasks > details').first().locator('summary').click();
      await page.screenshot({path:dir+'/form-complete.png',fullPage:true});
      await page.locator('#submission [type=checkbox]').check();
      await page.getByRole('button',{name:'Submit finals request'}).click();
      await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Received'));
      assert.ok(retryKey);
      eligible=false;
      await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('#not-finalist').waitFor({state:'visible'});
      assert.equal(await page.locator('#submission').isVisible(),false);
      assert.equal(await page.locator('#history').isVisible(),false);
      await page.screenshot({path:dir+'/nonfinalist.png'});
    } else {
      const row=page.locator('#tasks > details').first();
      await row.locator('summary').click();
      assert.ok(await row.locator('[name="run_notes"]').isVisible());
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await row.scrollIntoViewIfNeeded();
      await page.screenshot({path:dir+'/task-open-'+width+'.png'});
    }
    assert.deepEqual(errors,[]);
    let apiCalls=0;
    page.on('request',request=>{if(request.url().includes('/api/finals')) apiCalls++;});
    await page.goto('http://127.0.0.1:8096/finals/preview/preliminary/',{waitUntil:'domcontentloaded'});
    await page.locator('#not-finalist').waitFor({state:'visible'});
    assert.equal(await page.locator('form').count(),0);
    assert.equal(await page.locator('#identity').textContent(),'Preview participant');
    assert.equal(await page.getByRole('link',{name:'RoboSynChallenge paper'}).getAttribute('href'),'https://arxiv.org/abs/2608.12416');
    assert.equal(apiCalls,0);
    await page.waitForFunction(()=>[...document.images].every(image=>image.complete && image.naturalWidth>0));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:dir+'/preliminary-preview-'+width+'.png'});
    await context.close();
  }
  await browser.close(); console.log('Finals UI: login, collapsed tasks, draft restore, hidden-field validation, submit, nonfinalist isolation, 1440/390/320 widths passed.');
})().catch(error=>{console.error(error);process.exit(1);});
