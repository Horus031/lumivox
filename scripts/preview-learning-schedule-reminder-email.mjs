// Offline template QA only: no provider/client/key/DB import or email sending.
// Node 22: node --experimental-strip-types scripts/preview-learning-schedule-reminder-email.mjs
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderReminderEmail } from '../apps/web/features/learning-schedule/notifications/reminder-email-template.ts';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const directory=resolve(root,'docs/learning-schedule/evidence/step-8a');
const require=createRequire(new URL('../apps/web/package.json',import.meta.url));
const { chromium }=require('@playwright/test');
await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true});
const network=[];
try {
  const context=await browser.newContext({javaScriptEnabled:false});
  await context.route(/^https?:\/\//,async route=>{network.push(new URL(route.request().url()).origin);await route.abort();});
  const page=await context.newPage();
  for(const locale of ['en','vi']) {
    const content=renderReminderEmail({taskId:'7e000000-0000-4000-8000-000000000001',taskTitle:locale==='vi'?'Ôn tập React Hooks':'Review React Hooks',
      locale,scheduledStartAt:'2026-11-07T12:00:00Z',scheduledEndAt:'2026-11-07T13:00:00Z',timezone:'Asia/Ho_Chi_Minh',leadMinutes:15},
      {trustedOrigin:'https://app.lumivox.test',unsubscribeUrl:'https://app.lumivox.test/reminder-unsubscribe?token=preview-only'});
    const file=resolve(directory,`reminder-${locale}.html`);
    await writeFile(file,content.html+'\n');await writeFile(resolve(directory,`reminder-${locale}.txt`),content.text+'\n');
    await page.goto(pathToFileURL(file).href);
    for(const width of [640,390]) {
      await page.setViewportSize({width,height:844});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Email preview overflow');
      await page.screenshot({path:resolve(directory,`reminder-${locale}-${width}.png`),fullPage:true});
    }
  }
  assert.deepEqual(network,[],'Offline previews must not request network resources');
  console.log('PASS: EN/VI HTML + text, 640/390px screenshots, no overflow, zero network requests');
} finally {await browser.close();}
