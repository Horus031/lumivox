import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomBytes, randomUUID, createHash, createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { reminderRecipientFingerprint } from '../apps/web/features/learning-schedule/notifications/resend-webhook.ts';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dedicated=process.argv.includes('--dedicated-ingress');
const ingress=dedicated || process.argv.includes('--public-ingress');
const container=ingress?'supabase_db_lumivox-11c5d':'supabase_db_lumivox-proj';
const owner=randomUUID(),task=randomUUID(),schedule=randomUUID(),session=randomUUID();
const q=value=>`'${String(value).replaceAll("'","''")}'`;
const wait=ms=>new Promise(done=>setTimeout(done,ms));
const sql=command=>execFileSync('docker',['exec',container,'psql','-X','-At','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-c',command],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const cli=process.env.SUPABASE_CLI_PATH ?? 'C:\\Users\\Dell\\AppData\\Local\\npm-cache\\_npx\\aa8e5c70f9d8d161\\node_modules\\@supabase\\cli-windows-x64\\bin\\supabase.exe';
const report={baseline:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),startedAt:new Date().toISOString(),checks:[],cleanup:false};
let server,browser,publicServer;
const bridgeSecret=randomBytes(32).toString('hex');
const identityKey=randomBytes(32).toString('hex'),email='unsubscribe-http@example.invalid';
const signingBytes=randomBytes(32),signingSecret=`whsec_${signingBytes.toString('base64')}`,receiptIds=[];
const fp=reminderRecipientFingerprint(email,identityKey);
const tokenPair=()=>{const token=randomBytes(32).toString('base64url');return {token,hash:createHash('sha256').update(token).digest('hex')};};
const issue=()=>{const result=tokenPair();sql(`SELECT public.ls_notification_issue_unsubscribe_token(${q(owner)},${q(email)},${q(fp)},${q(result.hash)});`);return result;};
const state=()=>JSON.parse(sql(`SELECT json_build_object('consent',(SELECT study_email_enabled FROM public.study_notification_preferences WHERE user_id=${q(owner)}),'pending',(SELECT count(*) FROM public.study_notification_jobs WHERE user_id=${q(owner)} AND status='pending'),'used',(SELECT count(*) FROM public.study_notification_unsubscribe_tokens WHERE user_id=${q(owner)} AND used_at IS NOT NULL));`));
try {
 const args=['status','--output','json'];
 if(ingress){
  const workdir=process.env.LUMIVOX_RESEND_TEST_WORKDIR;
  assert(workdir,'Set LUMIVOX_RESEND_TEST_WORKDIR to the disposable stack');
  const config=await readFile(resolve(workdir,'supabase/config.toml'),'utf8');
  assert.match(config,/^project_id\s*=\s*"lumivox-11c5d"\s*$/m);
  args.push('--workdir',workdir);
 }
 const status=JSON.parse(execFileSync(cli,args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}));
 assert.equal(status.API_URL,ingress?'http://127.0.0.1:56321':'http://127.0.0.1:55321');
 if(ingress) assert.match(status.DB_URL,/@127\.0\.0\.1:56322\//);
 assert.equal(sql('SELECT count(*) FROM auth.users;'),'0');
 assert.equal(sql('SELECT enabled FROM public.study_notification_dispatch_control;'),'f');
 assert.equal(sql('SELECT enabled FROM public.ls_missed_sweep_control;'),'f');
 sql(`BEGIN;INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(${q(owner)},${q(email)},clock_timestamp());
 SELECT set_config('request.jwt.claim.sub',${q(owner)},true);SELECT public.ls_set_study_notification_preferences(true);
 INSERT INTO public.tasks(id,user_id,title,status) VALUES(${q(task)},${q(owner)},'8C HTTP fixture','todo');
 INSERT INTO public.task_study_schedules(id,user_id,task_id,starts_on,ends_on,timezone) VALUES(${q(schedule)},${q(owner)},${q(task)},'2030-01-07','2030-01-07','UTC');
 INSERT INTO public.task_study_sessions(id,user_id,task_id,schedule_id,schedule_revision,logical_occurrence_key,local_date,local_start_time,local_end_time,timezone,scheduled_start_at,scheduled_end_at)
 VALUES(${q(session)},${q(owner)},${q(task)},${q(schedule)},1,'8c-http','2030-01-07','10:00','11:00','UTC','2030-01-07T10:00Z','2030-01-07T11:00Z');COMMIT;`);
 const pair=issue();let ownReady=false;
 server=spawn(process.execPath,[resolve(root,'apps/web/node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3109'],{
 cwd:resolve(root,'apps/web'),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,
 NEXT_PUBLIC_SUPABASE_URL:status.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:status.ANON_KEY,NEXT_PUBLIC_SUPABASE_ANON_KEY:status.ANON_KEY,
 SUPABASE_SECRET_KEY:status.SERVICE_ROLE_KEY,SUPABASE_SERVICE_ROLE_KEY:status.SERVICE_ROLE_KEY,
 STUDY_REMINDER_RECIPIENT_HMAC_KEY:identityKey,RESEND_STUDY_REMINDER_WEBHOOK_SECRET:signingSecret,RESEND_API_KEY:'',
 RESEND_STUDY_REMINDER_API_KEY:'',STUDY_REMINDER_REAL_SEND_ENABLED:'false',STUDY_REMINDER_DISPATCH_SECRET:identityKey,
 STUDY_REMINDER_SETTINGS_ENABLED:'false',UNSUBSCRIBE_BRIDGE_SECRET:bridgeSecret}});
 server.stdout.on('data',data=>{if(data.toString().includes('Ready in')) ownReady=true;});server.stderr.resume();
 const base='http://127.0.0.1:3109',deadline=Date.now()+15000;
 while(!ownReady&&Date.now()<deadline){assert.equal(server.exitCode,null);await wait(100);}assert(ownReady);
 let publicBase=base;
 if(dedicated){
  const requireIngress=createRequire(resolve(root,'apps/unsubscribe-ingress/package.json'));
  const bundle=await requireIngress('esbuild').build({
   stdin:{contents:'export * from "./handler"; export * from "./bridge";',resolveDir:resolve(root,'apps/unsubscribe-ingress')},
   platform:'node',format:'esm',bundle:true,write:false,
  });
  const {handleIngress,consumeThroughBridge}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
  publicServer=createServer(async(req,res)=>{
   const request=new Request(`http://127.0.0.1${req.url}`,{
    method:req.method,headers:req.headers,...(req.method==='POST'?{body:req,duplex:'half'}:{}),
   });
   const response=await handleIngress(request,{
    isRateLimited:async()=>false,
    consume:hash=>consumeThroughBridge(hash,{UNSUBSCRIBE_BRIDGE_ORIGIN:'https://protected.example.invalid',UNSUBSCRIBE_BRIDGE_SECRET:bridgeSecret},
     async()=>'local-oidc-fixture',async(url,options)=>{
      const upstream=await fetch(new URL(url.pathname,base),options);
      if(![204,404].includes(upstream.status)) console.error(`Unexpected local bridge status ${upstream.status}`);
      return upstream;
     }),
   });
   res.writeHead(response.status,Object.fromEntries(response.headers));
   res.end(await response.text());
  });
  publicServer.listen(0,'127.0.0.1');
  await once(publicServer,'listening');
  publicBase=`http://127.0.0.1:${publicServer.address().port}`;
  const internal=`${base}/api/internal/study-reminders/unsubscribe`;
  assert.equal((await fetch(internal,{method:'POST',headers:{Authorization:`Bearer ${identityKey}`}})).status,401);
  assert.equal((await fetch(internal,{method:'POST',headers:{Authorization:`Bearer ${bridgeSecret}`,'x-lumivox-unsubscribe-hash':'invalid'}})).status,400);
 }
 const endpoint=token=>`${publicBase}/api/study-reminders/unsubscribe?token=${encodeURIComponent(token)}`;
 const post=token=>fetch(endpoint(token),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'List-Unsubscribe=One-Click',redirect:'manual'});
 const before=state();assert.deepEqual(before,{consent:true,pending:1,used:0});
 const get=await fetch(endpoint(pair.token));assert.equal(get.status,200);assert.deepEqual(state(),before);
 report.checks.push({case:'US-01 API GET no mutation',status:200});
 if(ingress){
  const getWithoutToken=await fetch(`${publicBase}/api/study-reminders/unsubscribe`,{redirect:'manual'});
  assert.equal(getWithoutToken.status,200);
  assert.equal(getWithoutToken.headers.get('referrer-policy'),'no-referrer');
  assert.equal((await post('invalid')).status,400);
  const malformed=await fetch(endpoint(pair.token),{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',redirect:'manual'});
  assert.equal(malformed.status,415);
  assert.deepEqual(state(),before);
  const old=issue();
  const form=new FormData();
  form.set('List-Unsubscribe','One-Click');
  const multipart=await fetch(endpoint(pair.token),{method:'POST',body:form,redirect:'manual'});
  assert.equal(multipart.status,200);
  assert.equal(multipart.headers.get('location'),null);
  assert.equal(multipart.headers.get('set-cookie'),null);
  assert.deepEqual(state(),{consent:false,pending:0,used:1});
  sql(`BEGIN;SELECT set_config('request.jwt.claim.sub',${q(owner)},true);
   SELECT public.ls_set_study_notification_preferences(true);COMMIT;`);
  const restored=state();
  assert.deepEqual(restored,{consent:true,pending:1,used:1});
  const pref=()=>sql(`SELECT updated_at FROM public.study_notification_preferences WHERE user_id=${q(owner)};`);
  const updatedAt=pref();
  assert.equal((await post(pair.token)).status,200);
  assert.equal((await post(old.token)).status,400);
  assert.deepEqual(state(),restored);
  assert.equal(pref(),updatedAt);
  const dispatch=(authorization)=>fetch(`${base}/api/internal/study-reminders/dispatch`,{
   method:'POST',headers:{'Content-Type':'application/json',...(authorization?{Authorization:authorization}:{})},
   body:'{"dryRun":false,"batchSize":1}',redirect:'manual',
  });
  assert.equal((await dispatch()).status,401);
  const disabled=await dispatch(`Bearer ${identityKey}`);
  assert.equal(disabled.status,503);
  assert.deepEqual(await disabled.json(),{error:'real_send_disabled'});
  assert.deepEqual(state(),restored);
  console.log(JSON.stringify({get:200,invalid:400,malformed:415,multipart:200,replay:200,oldUnused:400,
   before,afterOptOut:{consent:false,pending:0,used:1},afterReconsent:restored,dispatchUnauthorized:401,dispatchDisabled:503}));
 } else {
 const require=createRequire(resolve(root,'apps/web/package.json'));const {chromium}=require('@playwright/test');
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 const external=[];await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.origin!==base){external.push(url.hostname);return route.abort();}return route.continue();
 });
 const page=await context.newPage();const artifact=resolve(root,'docs/learning-schedule/evidence/step-8c');await mkdir(artifact,{recursive:true});
 for(const locale of ['vi','en']) {
  const response=await page.goto(`${base}/${locale}/study-reminders/unsubscribe?token=${pair.token}`,{waitUntil:'networkidle'});
  assert.equal(response.status(),200);assert.equal(response.headers()['referrer-policy'],'no-referrer');
  const button=page.getByRole('button',{name:locale==='vi'?'Xác nhận ngừng nhận email':'Confirm unsubscribe'});
  assert(await button.isVisible());assert.deepEqual(state(),before);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  await page.screenshot({path:resolve(artifact,`unsubscribe-${locale}-390.png`),fullPage:true,caret:'initial'});
  report.checks.push({case:`US-01 ${locale} page GET/mobile`,status:200});
 }
 assert.deepEqual(external,[],'Capability landing must not request Analytics or external assets');
 // Production build sets an inert fixture measurement ID to exercise the
 // analytics guard with a configured provider, not an empty-env false positive.
 const normalHtml=await(await fetch(base)).text();
 assert(normalHtml.includes('G-TESTPRIVACY'),'Build with process-only G-TESTPRIVACY to exercise privacy guard');
 const button=page.getByRole('button',{name:'Confirm unsubscribe'});await button.focus();
 const submitted=page.waitForResponse(r=>r.url().startsWith(`${base}/api/study-reminders/unsubscribe`)&&r.request().method()==='POST');
 await page.keyboard.press('Enter');const result=await submitted;assert.equal(result.status(),200);
 assert.deepEqual(state(),{consent:false,pending:0,used:1});
 report.checks.push({case:'US-02/05/06 actual keyboard form POST -> local DB',status:200});
 const replay=await post(pair.token);assert.equal(replay.status,200);assert.equal(replay.headers.get('location'),null);
 const success=await replay.text();assert(!success.includes(pair.token)&&!success.includes(owner)&&!success.includes(email));
 assert.deepEqual(state(),{consent:false,pending:0,used:1});report.checks.push({case:'US-03 replay no-op',status:200});
 const expired=issue();sql(`UPDATE public.study_notification_unsubscribe_tokens SET expires_at=created_at+interval '1 microsecond' WHERE token_hash=${q(expired.hash)};`);
 const revoked=issue();sql(`SELECT public.ls_notification_revoke_unsubscribe_token(${q(revoked.hash)});`);
 let rejection;
 for(const [kind,token] of [['expired',expired.token],['revoked',revoked.token],['forged',tokenPair().token]]) {
  const response=await post(token);assert.equal(response.status,400);const text=await response.text();
  if(rejection) assert.equal(text,rejection);rejection=text;report.checks.push({case:`US-04 ${kind}`,status:400});
 }
 // Simulated previously accepted provider evidence, not a send. Verify actual
 // signed HTTP ingestion now propagates Permanent proof into suppression.
 const message=randomUUID();
 sql(`INSERT INTO public.study_notification_deliveries(job_id,user_id,attempt_number,provider,provider_message_id,status,handoff_token,recipient_fingerprint,provider_payload_fingerprint,submission_locale,locale_policy)
 SELECT id,user_id,1,'resend',${q(message)},'accepted',${q(randomUUID())},${q(fp)},${q('b'.repeat(64))},'en','explicit-trusted-command-v1' FROM public.study_notification_jobs WHERE user_id=${q(owner)};`);
 async function signed(type,id=randomUUID()) {
  if(!receiptIds.includes(id)) receiptIds.push(id);
  const raw=JSON.stringify({type,created_at:new Date().toISOString(),data:{email_id:message,to:[email],...(type==='email.bounced'?{bounce:{type:'Permanent',subType:'NoEmail',message:'fixture only'}}:{})}});
  const timestamp=String(Math.floor(Date.now()/1000));
  return {raw,headers:{'svix-id':id,'svix-timestamp':timestamp,'svix-signature':`v1,${createHmac('sha256',signingBytes).update(`${id}.${timestamp}.${raw}`).digest('base64')}`}};
 }
 const event=await signed('email.bounced');
 for(let i=0;i<2;i++) {
  const response=await fetch(`${base}/api/webhooks/resend/study-reminders`,{method:'POST',body:event.raw,headers:event.headers});assert.equal(response.status,200);
  report.checks.push({case:i?'US-07 signed bounce replay':'US-07 actual signed Permanent bounce',status:200});
 }
 const late=await signed('email.delivered');
 assert.equal((await fetch(`${base}/api/webhooks/resend/study-reminders`,{method:'POST',body:late.raw,headers:late.headers})).status,200);
 assert.equal(sql(`SELECT reason FROM public.study_notification_suppressions WHERE user_id=${q(owner)};`),'hard_bounce');
 report.checks.push({case:'US-08 late delivered retains suppression',status:200});
 report.externalRequests=external.length;report.providerRequests=0;
 }
} finally {
 if(publicServer) await new Promise((resolve,reject)=>publicServer.close(error=>error?reject(error):resolve()));
 if(browser) await browser.close();
 if(server){server.kill();await Promise.race([new Promise(done=>server.once('exit',done)),wait(3000)]);}
 try {
  sql(`DELETE FROM public.tasks WHERE id=${q(task)} AND user_id=${q(owner)};
  DELETE FROM public.study_notification_webhook_receipts WHERE provider_event_id IN (${receiptIds.length?receiptIds.map(q).join(','):"''"});
  DELETE FROM auth.users WHERE id=${q(owner)};`);
  const counts=JSON.parse(sql(`SELECT json_build_object('users',(SELECT count(*) FROM auth.users),'tasks',(SELECT count(*) FROM public.tasks),'tokens',(SELECT count(*) FROM public.study_notification_unsubscribe_tokens),'identities',(SELECT count(*) FROM public.study_notification_recipient_identities),'jobs',(SELECT count(*) FROM public.study_notification_jobs),'deliveries',(SELECT count(*) FROM public.study_notification_deliveries),'receipts',(SELECT count(*) FROM public.study_notification_webhook_receipts),'suppressions',(SELECT count(*) FROM public.study_notification_suppressions));`));
  assert(Object.values(counts).every(x=>x===0));report.cleanup=true;report.finalCounts=counts;
  report.gates=JSON.parse(sql(`SELECT json_build_object('dispatch',(SELECT enabled FROM public.study_notification_dispatch_control),'sweep',(SELECT enabled FROM public.ls_missed_sweep_control),'reminderCron',(SELECT count(*) FROM cron.job WHERE jobname ILIKE '%remind%'));`));
  assert.deepEqual(report.gates,{dispatch:false,sweep:false,reminderCron:0});
 } finally {
  report.completedAt=new Date().toISOString();
  if(!ingress) await writeFile(resolve(root,'docs/learning-schedule/phase-08-unsubscribe-http.json'),JSON.stringify(report,null,2)+'\n');
 }
}
console.log(ingress ? 'PASS: local public-ingress HTTP contract, zero provider requests, clean/OFF'
 : `PASS: ${report.checks.length} HTTP/browser checks, zero external/provider requests, clean/OFF`);
