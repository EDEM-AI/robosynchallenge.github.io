const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const net=require('node:net');
const {spawn}=require('node:child_process');
const {once}=require('node:events');

(async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rsc-paper-ui-'));
  const socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');
  const port=socket.address().port;await new Promise(r=>socket.close(r));
  const token=crypto.randomBytes(24).toString('hex');
  const config=path.join(directory,'config.json');
  fs.writeFileSync(config,JSON.stringify({users:['preliminary','finalist'].map(name=>({email:name+'@example.test',team_name:name==='finalist'?'Finalist team':'Preliminary team',token_status:'active',token_sha256:crypto.createHash('sha256').update(token).digest('hex')})),properties:{
    PAPER_DEADLINE_AT:'2099-01-01T00:00:00Z',FINALS_ROSTER_JSON:JSON.stringify([{email:'finalist@example.test',team_id:'finalist_team',team_name:'Finalist team',enabled:true}]),
  }}),{mode:0o600});
  let child,browser;
  const start=async()=>{
    child=spawn(process.execPath,[path.join(__dirname,'../tools/preview_finals.cjs'),config,path.join(directory,'state'),String(port)],{stdio:['ignore','pipe','pipe']});
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Preview timeout')),5000);child.stdout.once('data',()=>{clearTimeout(timer);resolve();});child.once('exit',code=>{clearTimeout(timer);reject(Error('Preview exited '+code));});});
  };
  const stop=async()=>{if(child&&child.exitCode===null){const done=once(child,'exit');child.kill();await done;}};
  const base='http://127.0.0.1:'+port;
  const pdf=Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
  const screenshots=process.env.RSC_SCREENSHOTS||'/tmp/rsc-finals-browser/screenshots';fs.mkdirSync(screenshots,{recursive:true});
  try {
    await start();
    browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
    for(const width of [1440,390,320]) {
      const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(base+'/#/workshop',{waitUntil:'domcontentloaded'});
      await page.getByRole('link',{name:'Submit a paper',exact:true}).click();
      await page.getByRole('heading',{name:'Submit your paper.'}).waitFor();
      assert.equal(page.url(),base+'/#/workshop/submit');
      await page.screenshot({path:screenshots+'/paper-login-'+width+'.png',fullPage:true});
      const downloading=page.waitForEvent('download');
      await page.getByRole('link',{name:'Download template'}).click();
      const download=await downloading;assert.equal(download.suggestedFilename(),'RoboSynChallenge-2026-submission-template.zip');
      const chunks=[];for await(const chunk of await download.createReadStream())chunks.push(chunk);
      assert.deepEqual(Buffer.concat(chunks),fs.readFileSync(path.join(__dirname,'../material/RoboSynChallenge-2026-submission-template.zip')));
      await page.getByLabel('Registered email').fill('preliminary@example.test');
      await page.getByLabel('Access token').fill(token);
      await page.locator('#paper-login button').click();
      await page.locator('#paper-account').waitFor({state:'visible'});
      assert.equal(await page.locator('#paper-stage').textContent(),'Preliminary');
      assert.equal(await page.locator('#paper-login').isVisible(),false);
      const choose=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Submit a paper'}).click();
      await (await choose).setFiles({name:'report.pdf',mimeType:'application/pdf',buffer:pdf});
      await page.waitForFunction(()=>document.querySelector('#paper-status').textContent.includes('Saved locally'));
      assert.equal(await page.locator('#paper-receipts li').count(),1);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:screenshots+'/paper-upload-'+width+'.png',fullPage:true});
      await page.locator('#paper-file').setInputFiles({name:'renamed.pdf',mimeType:'application/pdf',buffer:pdf});
      await page.waitForFunction(()=>document.querySelector('#paper-status').textContent.startsWith('Already received'));
      assert.equal(await page.locator('#paper-receipts li').count(),1);
      await page.locator('#paper-file').setInputFiles({name:'bad.pdf',mimeType:'application/pdf',buffer:Buffer.from('not a PDF')});
      await page.waitForFunction(()=>document.querySelector('#paper-status').textContent.includes('not a complete PDF'));
      assert.equal(await page.locator('#paper-receipts li').count(),1);
      await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('#paper-account').waitFor({state:'visible'});
      assert.equal(await page.locator('#paper-receipts li').count(),1);
      assert.deepEqual(errors,[]);
      await context.close();
    }
    await stop();await start();
    const context=await browser.newContext(),page=await context.newPage();
    await page.goto(base+'/#/workshop/submit',{waitUntil:'domcontentloaded'});
    await page.getByLabel('Registered email').fill('finalist@example.test');await page.getByLabel('Access token').fill(token);await page.locator('#paper-login button').click();
    await page.locator('#paper-account').waitFor({state:'visible'});
    assert.equal(await page.locator('#paper-stage').textContent(),'Finals');assert.equal(await page.locator('#paper-receipts li').count(),0);
    await page.locator('#paper-file').setInputFiles({name:'finals.pdf',mimeType:'application/pdf',buffer:pdf});
    await page.waitForFunction(()=>document.querySelector('#paper-status').textContent.includes('Saved locally'));
    const records=JSON.parse(fs.readFileSync(path.join(directory,'state/papers.json')));
    assert.equal(records.length,2);assert.deepEqual(records.map(r=>r.stage),['preliminary','finals']);
    assert.equal(fs.readdirSync(path.join(directory,'state/papers/outbox')).length,2);
    await page.getByRole('button',{name:'Sign out'}).click();
    await page.goto(base+'/#/workshop/submit',{waitUntil:'domcontentloaded'});
    assert.equal(await page.locator('#paper-login').isVisible(),true);
    await context.close();
    console.log('Paper UI/HTTP: workshop link, login, native file picker, exact template download, PDF upload, duplicates, rejection, restart persistence, stage isolation, logout, desktop/mobile passed. No production writes or email.');
  } finally {if(browser)await browser.close();await stop();fs.rmSync(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
