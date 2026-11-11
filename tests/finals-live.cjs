const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {chromium} = require('playwright');

(async () => {
  const browser = await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const width of [1440,390]) {
      await page.setViewportSize({width,height:1000});
      for (const [name,path,heading] of [
        ['finals','/finals/','Sign in'],
        ['papers','/#/workshop/submit','Submit your paper.'],
        ['evaluation','/#/evaluation','Sim first. Robot final.'],
      ]) {
        await page.goto('https://robosyn-bench.net'+path,{waitUntil:'networkidle'});
        const actual = await page.locator('h1:visible').innerText();
        assert.equal(actual,heading);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        await page.screenshot({path:`/tmp/rsc-finals-browser/screenshots/live-${name}-${width}.png`,fullPage:true});
        console.log(JSON.stringify({path,width,heading:actual}));
      }
    }
    const template = await page.request.get('https://robosyn-bench.net/material/RoboSynChallenge-2026-submission-template.zip');
    assert.equal(template.status(),200);
    assert.equal(crypto.createHash('sha256').update(await template.body()).digest('hex'),
      'f10c4aa10a929cf88ea7a9f6e60c28b55e39f12ba43d4128b636d0752b7cbbc1');
    assert.deepEqual(errors,[]);
    console.log('Live public routes, desktop/mobile layout and exact template passed; no submissions sent.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
