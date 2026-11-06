import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeFile,mkdir} from 'node:fs/promises';
import {loadReminderRuntime} from './lib/load-learning-schedule-runtime.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(resolve(root,'apps/web/package.json'));
const {createClient}=require('@supabase/supabase-js'),{createServerClient}=require('@supabase/ssr'),{chromium}=require('@playwright/test');
const cli='C:\\Users\\Dell\\AppData\\Local\\npm-cache\\_npx\\aa8e5c70f9d8d161\\node_modules\\@supabase\\cli-windows-x64\\bin\\supabase.exe';
const q=x=>`'${String(x).replaceAll("'","''")}'`,wait=ms=>new Promise(done=>setTimeout(done,ms));
const sql=query=>execFileSync('docker',['exec','supabase_db_lumivox-proj','psql','-X','-At','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-c',query],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const report={baseline:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),startedAt:new Date().toISOString(),checks:[],cleanup:false,realProviderRequests:0};
let server,browser,admin,auth,owner;const task=randomUUID(),schedule=randomUUID(),session=randomUUID();
const email=`worker-ui-${randomUUID()}@example.invalid`,password=randomBytes(24).toString('base64url');
const secret=randomBytes(32).toString('hex'),encryption=randomBytes(32).toString('base64'),identity=randomBytes(32).toString('hex');
const signingBytes=randomBytes(32),signingSecret=`whsec_${signingBytes.toString('base64')}`,receiptIds=[];
const safeLogs=[];
try {
 const status=JSON.parse(execFileSync(cli,['status','--output','json'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}));
 assert.equal(status.API_URL,'http://127.0.0.1:55321');assert.equal(sql('SELECT count(*) FROM auth.users;'),'0');
 assert.equal(sql('SELECT enabled FROM public.study_notification_dispatch_control;'),'f');
 admin=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(created.error,null);owner=created.data.user.id;
 assert.equal((await admin.from('profiles').upsert({id:owner,onboarding_completed:true})).error,null);
 sql(`BEGIN;SELECT set_config('request.jwt.claim.sub',${q(owner)},true);SELECT public.ls_set_study_notification_preferences(true);
 DO $f$ DECLARE st timestamptz:=date_trunc('milliseconds',clock_timestamp())+interval '5 minutes';z text;d date;BEGIN
 z:=CASE WHEN extract(hour FROM clock_timestamp() AT TIME ZONE 'UTC') BETWEEN 2 AND 20 THEN 'UTC' ELSE 'Etc/GMT+12' END;d:=(st AT TIME ZONE z)::date;
 INSERT INTO public.tasks(id,user_id,title,status) VALUES(${q(task)},${q(owner)},'8D HTTP fixture','todo');
 INSERT INTO public.task_study_schedules(id,user_id,task_id,starts_on,ends_on,timezone) VALUES(${q(schedule)},${q(owner)},${q(task)},d,d,z);
 INSERT INTO public.task_study_sessions(id,user_id,task_id,schedule_id,schedule_revision,logical_occurrence_key,local_date,local_start_time,local_end_time,timezone,scheduled_start_at,scheduled_end_at)
 VALUES(${q(session)},${q(owner)},${q(task)},${q(schedule)},1,'8d-http',d,(st AT TIME ZONE z)::time,((st+interval '30 minutes') AT TIME ZONE z)::time,z,st,st+interval '30 minutes');
 INSERT INTO public.study_notification_jobs(user_id,session_id,schedule_revision,due_at,next_attempt_at,idempotency_key,lifecycle_fingerprint)
 SELECT user_id,${q(session)},1,due_at,due_at,${q(randomUUID())},fingerprint FROM public.ls_notification_session_policy(${q(session)});END $f$;COMMIT;`);
 let ready=false;
 server=spawn(process.execPath,[resolve(root,'apps/web/node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3110'],{
 cwd:resolve(root,'apps/web'),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,
 NEXT_PUBLIC_SUPABASE_URL:status.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:status.ANON_KEY,NEXT_PUBLIC_SUPABASE_ANON_KEY:status.ANON_KEY,
 SUPABASE_SECRET_KEY:status.SERVICE_ROLE_KEY,SUPABASE_SERVICE_ROLE_KEY:status.SERVICE_ROLE_KEY,
 STUDY_REMINDER_DISPATCH_SECRET:secret,STUDY_REMINDER_REAL_SEND_ENABLED:'false',STUDY_REMINDER_TEST_RECIPIENTS:email,
 STUDY_REMINDER_PAYLOAD_ENCRYPTION_KEY:encryption,STUDY_REMINDER_RECIPIENT_HMAC_KEY:identity,
 RESEND_STUDY_REMINDER_WEBHOOK_SECRET:signingSecret,
 STUDY_REMINDER_FROM:'Lumivox <study@example.invalid>',STUDY_REMINDER_TRUSTED_ORIGIN:'https://app.lumivox.test',
 STUDY_REMINDER_SETTINGS_ENABLED:'true',RESEND_STUDY_REMINDER_API_KEY:'',RESEND_API_KEY:''}});
 server.stdout.on('data',chunk=>{const text=chunk.toString();if(text.includes('Ready in'))ready=true;
 for(const line of text.split('\n')) {const start=line.indexOf('study_reminder_dispatch ');if(start>=0){try{safeLogs.push(JSON.parse(line.slice(start+'study_reminder_dispatch '.length)));}catch{}}}});
 server.stderr.resume();const end=Date.now()+15000;while(!ready&&Date.now()<end){assert.equal(server.exitCode,null);await wait(100);}assert(ready);
 const base='http://127.0.0.1:3110',endpoint=`${base}/api/internal/study-reminders/dispatch`;
 const post=(body,credential=secret)=>fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',...(credential?{Authorization:`Bearer ${credential}`}:{})},body:JSON.stringify(body),redirect:'manual'});
 assert.equal((await fetch(endpoint)).status,405);report.checks.push({case:'POST only',status:405});
 assert.equal((await post({dryRun:true},'')).status,401);assert.equal((await post({dryRun:true},'wrong')).status,401);report.checks.push({case:'RI-15 missing/wrong auth',status:401});
 assert.equal((await post({dryRun:false})).status,503);report.checks.push({case:'RI-01 actual feature OFF',status:503});
 assert.equal((await post({dryRun:true,recipient:email})).status,400);report.checks.push({case:'no caller-selected identity',status:400});
 let preview=await post({dryRun:true});assert.equal(preview.status,200);let json=await preview.json();assert.equal(json.counts.eligible,0);report.checks.push({case:'unconfirmed locale dry-run ineligible',status:200});
 const cookies=[];auth=createServerClient(status.API_URL,status.ANON_KEY,{cookies:{getAll:()=>[],setAll:values=>{cookies.push(...values);}}});
 assert.equal((await auth.auth.signInWithPassword({email,password})).error,null);
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await context.addCookies(cookies.filter(x=>x.value).map(x=>({name:x.name,value:x.value,domain:'127.0.0.1',path:'/',sameSite:'Lax',secure:false,httpOnly:false})));
 const blocked=[];await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===base||url.origin===status.API_URL)return route.continue();blocked.push(url.hostname);return route.abort();});
 const page=await context.newPage();const dir=resolve(root,'docs/learning-schedule/evidence/step-8d');await mkdir(dir,{recursive:true});
 for(const locale of ['en','vi']) {
  await page.goto(`${base}/${locale}/settings`,{waitUntil:'networkidle'});
  const section=page.getByTestId('study-notification-settings'),select=section.locator('[name="reminderLocale"]');await select.waitFor({state:'visible'});
  if(locale==='en') assert.equal(await select.inputValue(),'');
  await select.selectOption(locale);const button=section.getByRole('button',{name:locale==='en'?'Save email language':'Lưu ngôn ngữ email',exact:true});
  await button.focus();await page.keyboard.press('Enter');
  const deadline=Date.now()+5000;let saved=false;
  while(Date.now()<deadline){if(sql(`SELECT reminder_locale FROM public.study_notification_preferences WHERE user_id=${q(owner)};`)===locale){saved=true;break;}await wait(50);}assert(saved);
  await page.waitForFunction(()=>!document.querySelector('[name="reminderLocale"]').disabled);
  assert.equal(sql(`SELECT study_email_enabled FROM public.study_notification_preferences WHERE user_id=${q(owner)};`),'t');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await section.screenshot({path:resolve(dir,`reminder-language-${locale}-390.png`),caret:'initial'});
  report.checks.push({case:`RI-06 actual ${locale} Settings action persists explicit locale`,status:200});
 }
 preview=await post({dryRun:true});assert.equal(preview.status,200);json=await preview.json();assert.equal(json.counts.eligible,1);
 assert(!JSON.stringify(json).includes(email)&&!JSON.stringify(json).includes(owner));report.checks.push({case:'authenticated dry-run after explicit locale',status:200});
 assert.equal(sql('SELECT count(*) FROM public.study_notification_resend_payloads;'),'0');assert.equal(sql('SELECT count(*) FROM public.study_notification_deliveries;'),'0');
 assert.equal(sql('SELECT count(*) FROM public.study_notification_unsubscribe_tokens;'),'0');
 assert(safeLogs.length>=2);assert(!JSON.stringify(safeLogs).includes(email)&&!JSON.stringify(safeLogs).includes(secret));
 for(const entry of safeLogs) assert(Object.keys(entry).every(k=>['batchId','durationMs','classification','counts'].includes(k)));
 report.safeLogEntries=safeLogs.length;report.blockedExternalRequests=blocked.length;report.dryRunWrites=0;
 // Complete the pipeline with the ACTUAL worker + adapter and an injected SDK
 // port. The mock provider consumes its issued one-click capability over HTTP
 // after durable handoff, then reports acceptance. No Resend network client.
 const runtime=await loadReminderRuntime(root),message=randomUUID();
 const {ResendReminderProvider}=await import(new URL('../apps/web/.next/step-8d-runtime/resend-reminder-provider.mjs',import.meta.url));
 let mockCalls=0;
 const mock=new ResendReminderProvider({emails:{send:async(request,options)=>{
  mockCalls++;assert(options.idempotencyKey);assert.equal(request.headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');
  const url=new URL(request.headers['List-Unsubscribe'].slice(1,-1));
  const local=new URL(url.pathname+url.search,base);const get=await fetch(local);assert.equal(get.status,200);
  assert.equal(sql(`SELECT study_email_enabled FROM public.study_notification_preferences WHERE user_id=${q(owner)};`),'t');
  const response=await fetch(local,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'List-Unsubscribe=One-Click'});
  assert.equal(response.status,200);return {data:{id:message},error:null};
 }}},'Lumivox <study@example.invalid>');
 sql('UPDATE public.study_notification_dispatch_control SET enabled=true;');
 const counts=await runtime.worker.dispatchResendReminders(runtime.store.createResendDispatchStore(admin),mock,{
  enabled:true,allowlist:runtime.resolver.configuredReminderRecipients(email),identityKey:identity,encryptionKey:Buffer.from(encryption,'base64'),
  from:'Lumivox <study@example.invalid>',trustedOrigin:'https://app.lumivox.test',
 });
 assert.equal(counts.accepted,1);assert.equal(mockCalls,1);assert.equal(sql(`SELECT study_email_enabled FROM public.study_notification_preferences WHERE user_id=${q(owner)};`),'f');
 assert.equal(sql(`SELECT submission_locale FROM public.study_notification_deliveries WHERE user_id=${q(owner)};`),'vi');
 report.mockSubmissions=mockCalls;report.checks.push({case:'RI-07/09/13 actual worker -> injected SDK -> real one-click POST -> accepted outcome',status:200});
 const eventId=randomUUID();receiptIds.push(eventId);
 const raw=JSON.stringify({type:'email.delivered',created_at:new Date().toISOString(),data:{email_id:message,to:[email]}}),timestamp=String(Math.floor(Date.now()/1000));
 const response=await fetch(`${base}/api/webhooks/resend/study-reminders`,{method:'POST',body:raw,headers:{'svix-id':eventId,'svix-timestamp':timestamp,
  'svix-signature':`v1,${createHmac('sha256',signingBytes).update(`${eventId}.${timestamp}.${raw}`).digest('base64')}`}});
 assert.equal(response.status,200);assert.equal(sql(`SELECT status FROM public.study_notification_deliveries WHERE user_id=${q(owner)};`),'delivered');
 report.checks.push({case:'actual signed callback correlates same worker Email ID',status:200});
} finally {
 if(browser)await browser.close();if(server){server.kill();await Promise.race([new Promise(done=>server.once('exit',done)),wait(3000)]);}
 try {
  if(auth)await auth.auth.signOut();
  sql('UPDATE public.study_notification_dispatch_control SET enabled=false;');
  if(owner){sql(`DELETE FROM public.tasks WHERE id=${q(task)} AND user_id=${q(owner)};
   DELETE FROM public.study_notification_webhook_receipts WHERE provider_event_id IN (${receiptIds.length?receiptIds.map(q).join(','):"''"});`);assert.equal((await admin.auth.admin.deleteUser(owner)).error,null);}
  report.finalCounts=JSON.parse(sql(`SELECT json_build_object('users',(SELECT count(*) FROM auth.users),'tasks',(SELECT count(*) FROM public.tasks),'jobs',(SELECT count(*) FROM public.study_notification_jobs),'deliveries',(SELECT count(*) FROM public.study_notification_deliveries),'payloads',(SELECT count(*) FROM public.study_notification_resend_payloads),'tokens',(SELECT count(*) FROM public.study_notification_unsubscribe_tokens));`));
  assert(Object.values(report.finalCounts).every(x=>x===0));report.cleanup=true;
  report.gates=JSON.parse(sql(`SELECT json_build_object('dispatch',(SELECT enabled FROM public.study_notification_dispatch_control),'sweep',(SELECT enabled FROM public.ls_missed_sweep_control),'reminderCron',(SELECT count(*) FROM cron.job WHERE jobname ILIKE '%remind%'));`));
  assert.deepEqual(report.gates,{dispatch:false,sweep:false,reminderCron:0});
 }finally{report.completedAt=new Date().toISOString();await writeFile(resolve(root,'docs/learning-schedule/phase-08-resend-worker-http.json'),JSON.stringify(report,null,2)+'\n');}
}
console.log(`PASS: ${report.checks.length} HTTP/browser checks, no real transport, dry-run writes zero, clean/OFF`);
