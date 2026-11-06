import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { randomUUID, randomBytes, createHmac } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleStudyReminderWebhook, reminderRecipientFingerprint } from '../apps/web/features/learning-schedule/notifications/resend-webhook.ts';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const container='supabase_db_lumivox-proj';
const owner=randomUUID();
const q=value=>`'${String(value).replaceAll("'","''")}'`;
const wait=ms=>new Promise(done=>setTimeout(done,ms));
// LOCAL ONLY. Three real PostgreSQL connections; no provider API/key, gate ON,
// webhook registration, remote database or live recipient. Fixtures cleaned.
class Connection {
  constructor(name) {
    this.name = name;
    this.active = null;
    this.stderr = [];
    this.closed = false;

    this.child = spawn(
      "docker",
      [
        "exec", "-i", container,
        "psql", "-X", "-A", "-t", "-q",
        "-U", "postgres", "-d", "postgres",
      ],
      {
        cwd: root,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    createInterface({ input: this.child.stdout })
      .on("line", line => {
        if (!this.active) return;

        if (line === this.active.marker) {
          const pending = this.active;
          this.active = null;
          clearTimeout(pending.timer);

          pending.resolve({
            text: pending.lines.join("\n"),
            errors: this.stderr.splice(0),
          });
        } else {
          this.active.lines.push(line);
        }
      });

    createInterface({ input: this.child.stderr })
      .on("line", line => this.stderr.push(line));

    this.child.on("error", error => this.fail(error));

    this.child.on("exit", code => {
      if (!this.closed) {
        this.fail(
          new Error(`${name}: psql exited with code ${code}`),
        );
      }
    });
  }

  fail(error) {
    if (!this.active) return;

    const pending = this.active;
    this.active = null;
    clearTimeout(pending.timer);
    pending.reject(error);
  }

  exec(sql) {
    assert(!this.active, `${this.name}: command already active`);

    return new Promise((resolveCommand, reject) => {
      const marker =
        `__LS_DONE_${randomUUID().replaceAll("-", "")}`;

      const timer = setTimeout(() => {
        this.fail(
          new Error(`${this.name}: command exceeded 15 seconds`),
        );
      }, 15000);

      this.active = {
        marker,
        timer,
        lines: [],
        resolve: resolveCommand,
        reject,
      };

      this.stderr.length = 0;

      this.child.stdin.write(
        `${sql}\n` +
        "\\echo __LS_SQLSTATE :SQLSTATE\n" +
        "\\echo __LS_LAST_ERROR :LAST_ERROR_MESSAGE\n" +
        `\\echo ${marker}\n`,
      );
    }).then(result => {
      const lines = result.text.split("\n");

      const state = lines
        .findLast(x => x.startsWith("__LS_SQLSTATE "))
        ?.split(" ")[1];

      const message = lines
        .findLast(x => x.startsWith("__LS_LAST_ERROR "))
        ?.slice("__LS_LAST_ERROR ".length);

      return {
        state,
        message: state === "00000" ? null : message,
        text: lines.filter(
          x => !x.startsWith("__LS_SQLSTATE ") &&
               !x.startsWith("__LS_LAST_ERROR "),
        ).join("\n").trim(),
        errors: result.errors,
      };
    });
  }

  async ok(sql) {
    const result = await this.exec(sql);

    assert.equal(
      result.state,
      "00000",
      `${this.name}: ${result.state}: ` +
        `${result.message ?? ""}\n${result.errors.join("\n")}`,
    );

    return result.text;
  }

  async json(sql) {
    return JSON.parse(await this.ok(sql));
  }

  async init() {
    await this.ok(`
      \\set ON_ERROR_STOP off
      \\set VERBOSITY verbose
      SET application_name =
        ${q(`lumivox-notification-cc-${this.name}`)};
      SET lock_timeout = '5s';
      SET statement_timeout = '10s';
    `);

    this.pid = Number(
      await this.ok("SELECT pg_backend_pid();"),
    );
  }

  async begin(role = "authenticated") {
    assert(
      ["authenticated", "service_role"].includes(role),
      "Unexpected test role",
    );

    await this.ok(`
      BEGIN;
      SET LOCAL ROLE ${role};
      ${role === "authenticated" ? `
        SET LOCAL "request.jwt.claim.sub" = ${q(owner)};
        SET LOCAL "request.jwt.claim.role" = 'authenticated';
      ` : ""}
    `);
  }

  async close() {
    if (this.closed) return;

    this.closed = true;

    if (this.active) {
      this.fail(new Error(`${this.name}: closing active command`));
    }

    this.child.stdin.end("ROLLBACK;\n\\q\n");

    await Promise.race([
      new Promise(done => this.child.once("exit", done)),
      wait(2000),
    ]);

    if (this.child.exitCode === null) {
      this.child.kill();
    }
  }
}

const [a,b,observer]=['8b-A','8b-B','8b-observer'].map(name=>new Connection(name));
const report={baseline:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
 startedAt:new Date().toISOString(),runs:[],http:[],cleanup:false};
const eventIds=[];
let nextServer;
const identityKey=randomBytes(32).toString('hex');
const recipient=reminderRecipientFingerprint('fixture@example.invalid',identityKey);
const payloadFingerprint='b'.repeat(64);
async function fixture() {
 const task=randomUUID(),schedule=randomUUID(),session=randomUUID(),job=randomUUID(),delivery=randomUUID(),token=randomUUID();
 await observer.ok(`BEGIN;
 INSERT INTO public.tasks(id,user_id,title,status) VALUES(${q(task)},${q(owner)},'8B fixture','todo');
 INSERT INTO public.task_study_schedules(id,user_id,task_id,starts_on,ends_on,timezone)
 VALUES(${q(schedule)},${q(owner)},${q(task)},'2030-01-07','2030-01-07','UTC');
 INSERT INTO public.task_study_sessions(id,user_id,task_id,schedule_id,schedule_revision,logical_occurrence_key,
 local_date,local_start_time,local_end_time,timezone,scheduled_start_at,scheduled_end_at)
 VALUES(${q(session)},${q(owner)},${q(task)},${q(schedule)},1,${q(session)},'2030-01-07','10:00','11:00','UTC','2030-01-07T10:00Z','2030-01-07T11:00Z');
 INSERT INTO public.study_notification_jobs(id,user_id,session_id,schedule_revision,due_at,idempotency_key,status,attempt_count)
 VALUES(${q(job)},${q(owner)},${q(session)},1,now(),${q(job)},'failed',1);
 INSERT INTO public.study_notification_deliveries(id,job_id,user_id,attempt_number,provider,status,handoff_token,
 recipient_fingerprint,provider_payload_fingerprint,submission_locale,locale_policy)
 VALUES(${q(delivery)},${q(job)},${q(owner)},1,'resend','submitting',${q(token)},${q(recipient)},${q(payloadFingerprint)},'en','explicit-trusted-command-v1'); COMMIT;`);
 return {delivery,token,job,message:randomUUID()};
}
const outcome=f=>`SELECT public.ls_notification_record_resend_outcome(${q(f.delivery)},${q(f.token)},${q(payloadFingerprint)},'accepted',${q(f.message)});`;
function eventSql(f) {
 const id=randomUUID();eventIds.push(id);
 return `SELECT public.ls_notification_ingest_resend(${q(id)},${q(f.message)},'email.delivered','2026-11-06T00:00:00Z',${q(recipient)},${q('c'.repeat(64))});`;
}
async function blocked(waiter,blocker) {
 const deadline=Date.now()+3000;
 while(Date.now()<deadline) {
  const pids=await observer.json(`SELECT to_json(pg_blocking_pids(${waiter.pid}));`);
  if(pids.includes(blocker.pid)) return {waiter:waiter.pid,blocker:blocker.pid,observed:pids};
  await wait(20);
 }
 throw new Error('Expected correlation blocker not observed');
}
async function finalState(f) {
 const result=await observer.json(`SELECT json_build_object('delivery',d.status,'job',j.status,
 'receipts',(SELECT count(*) FROM public.study_notification_webhook_receipts WHERE provider_message_id=${q(f.message)}))
 FROM public.study_notification_deliveries d JOIN public.study_notification_jobs j ON j.id=d.job_id WHERE d.id=${q(f.delivery)};`);
 assert.deepEqual(result,{delivery:'delivered',job:'sent',receipts:1});return result;
}
try {
 for(const c of [a,b,observer]) await c.init();
 const target=await observer.ok(`SELECT current_database()||':'||current_setting('port');`);
 assert.equal(target,'postgres:5432'); // via fixed local-only Docker container above
 assert.equal(await observer.ok(`SELECT count(*) FROM auth.users;`),'0','Requires disposable empty local DB');
 const gates=()=>observer.json(`SELECT json_build_object('dispatch',(SELECT enabled FROM public.study_notification_dispatch_control),'sweep',(SELECT enabled FROM public.ls_missed_sweep_control),'reminderCron',(SELECT count(*) FROM cron.job WHERE jobname ILIKE '%remind%'));`);
 assert.deepEqual(await gates(),{dispatch:false,sweep:false,reminderCron:0});
 await observer.ok(`INSERT INTO auth.users(id,email) VALUES(${q(owner)},'8b-concurrency@example.invalid');`);
 for(const order of ['acceptance-first','webhook-first']) for(let repeat=1;repeat<=3;repeat++) {
  const f=await fixture();
  await a.begin('service_role'); await b.begin('service_role');
  await a.ok(order==='acceptance-first'?outcome(f):eventSql(f));
  const pending=b.exec(order==='acceptance-first'?eventSql(f):outcome(f));
  const blocker=await blocked(b,a); await a.ok('COMMIT;');
  const result=await pending;assert.equal(result.state,'00000'); await b.ok('COMMIT;');
  report.runs.push({order,repeat,blocker,sqlstate:result.state,final:await finalState(f)});
 }
 // Signed fixtures through actual verifier + LOCAL PostgREST HTTP persistence.
 const cli='C:\\Users\\Dell\\AppData\\Local\\npm-cache\\_npx\\aa8e5c70f9d8d161\\node_modules\\@supabase\\cli-windows-x64\\bin\\supabase.exe';
 const status=JSON.parse(execFileSync(cli,['status','--output','json'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}));
 assert.equal(status.API_URL,'http://127.0.0.1:55321');
 const secretBytes=randomBytes(32),signingSecret=`whsec_${secretBytes.toString('base64')}`;
 const f=await fixture(), id=randomUUID();eventIds.push(id);
 const raw=JSON.stringify({type:'email.delivered',created_at:'2026-11-06T00:00:00Z',data:{email_id:f.message,to:['fixture@example.invalid']}});
 const timestamp=String(Math.floor(Date.now()/1000));
 const headers={'svix-id':id,'svix-timestamp':timestamp,'svix-signature':`v1,${createHmac('sha256',secretBytes).update(`${id}.${timestamp}.${raw}`).digest('base64')}`};
 const persist=async event=>{
  const response=await fetch(`${status.API_URL}/rest/v1/rpc/ls_notification_ingest_resend`,{
   method:'POST',headers:{apikey:status.ANON_KEY,Authorization:`Bearer ${status.SERVICE_ROLE_KEY}`,'Content-Type':'application/json'},
   body:JSON.stringify({p_event_id:event.eventId,p_message_id:event.messageId,p_event_type:event.eventType,p_event_at:event.eventAt,p_recipient_fingerprint:event.recipientFingerprint,p_payload_fingerprint:event.payloadFingerprint}),signal:AbortSignal.timeout(4000)});
  if(!response.ok) throw new Error('Local persistence failed');
 };
 let post=()=>handleStudyReminderWebhook(new Request('http://localhost/webhook-fixture',{method:'POST',body:raw,headers}),{signingSecret,identityKey,persist});
 if(process.argv.includes('--next-http')) {
  // Own production server only; never reuse/mutate the user's dev server.
  // Both Supabase schemas are local. Generated keys are test-only process env.
  nextServer=spawn(process.execPath,[resolve(root,'apps/web/node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3108'],{
   cwd:resolve(root,'apps/web'),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,
    NEXT_PUBLIC_SUPABASE_URL:status.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:status.ANON_KEY,NEXT_PUBLIC_SUPABASE_ANON_KEY:status.ANON_KEY,
    SUPABASE_SECRET_KEY:status.SERVICE_ROLE_KEY,SUPABASE_SERVICE_ROLE_KEY:status.SERVICE_ROLE_KEY,
    RESEND_STUDY_REMINDER_WEBHOOK_SECRET:signingSecret,STUDY_REMINDER_RECIPIENT_HMAC_KEY:identityKey,
    RESEND_API_KEY:'',STUDY_REMINDER_SETTINGS_ENABLED:'false'},
  });
  // Require readiness from OUR child, never mistake a preexisting listener for
  // this fixture server. Drain without echoing config/output to artifacts.
  let ownServerReady=false;
  nextServer.stdout.on('data',chunk=>{if(chunk.toString().includes('Ready in')) ownServerReady=true;});
  nextServer.stderr.resume();
  const endpoint='http://127.0.0.1:3108/api/webhooks/resend/study-reminders';
  const deadline=Date.now()+15000;let ready=false;
  while(Date.now()<deadline) {
   if(nextServer.exitCode!==null) throw new Error('Owned Next HTTP server exited');
   try {if(ownServerReady){const probe=await fetch(endpoint,{signal:AbortSignal.timeout(1000)});if(probe.status===405){ready=true;break;}}} catch {}
   await wait(100);
  }
  assert(ready,'Owned Next production server did not become ready');
  post=()=>fetch(endpoint,{method:'POST',body:raw,headers,signal:AbortSignal.timeout(5000)});
  const forged=await fetch(endpoint,{method:'POST',body:raw,headers:{...headers,'svix-signature':'v1,forged'}});
  assert.equal(forged.status,401);report.http.push({case:'actual-next-route-invalid-signature',status:401});
  assert.equal(await observer.ok(`SELECT count(*) FROM public.study_notification_webhook_receipts WHERE provider_event_id=${q(id)};`),'0');
  report.actualNextHttp=true;
 }
 for(let retry=0;retry<2;retry++) {
  const response=await post();
  assert.equal(response.status,200); report.http.push({case:retry?'duplicate':'signed-local-postgrest',status:response.status});
 }
 await a.begin('service_role');await a.ok(outcome(f));await a.ok('COMMIT;');await finalState(f);
 // Database-unavailable response, no acknowledgement. This is a deliberately
 // failing port, not a destructive outage of the local PostgreSQL service.
 const failure=await handleStudyReminderWebhook(new Request('http://localhost/webhook-fixture',{method:'POST',body:raw,headers}),
 {signingSecret,identityKey,persist:async()=>{throw new Error('injected DB failure');}});
 assert.equal(failure.status,503);report.http.push({case:'persistence-failure',status:503});
 report.gates=await gates();assert.deepEqual(report.gates,{dispatch:false,sweep:false,reminderCron:0});
 report.providerRequests=0;
} finally {
 if(nextServer) {
  nextServer.kill();
  await Promise.race([new Promise(done=>nextServer.once('exit',done)),wait(3000)]);
 }
 for(const c of [a,b]) { try {await c.ok('ROLLBACK;');} catch {} }
 try {
  await observer.ok(`DELETE FROM public.study_notification_webhook_receipts WHERE provider_event_id IN (${eventIds.length?eventIds.map(q).join(','):"''"});
  DELETE FROM public.tasks WHERE user_id=${q(owner)} AND title='8B fixture'; DELETE FROM auth.users WHERE id=${q(owner)};`);
  const counts=await observer.json(`SELECT json_build_object('users',(SELECT count(*) FROM auth.users),'tasks',(SELECT count(*) FROM public.tasks),'jobs',(SELECT count(*) FROM public.study_notification_jobs),'deliveries',(SELECT count(*) FROM public.study_notification_deliveries),'receipts',(SELECT count(*) FROM public.study_notification_webhook_receipts));`);
  assert.deepEqual(counts,{users:0,tasks:0,jobs:0,deliveries:0,receipts:0}); report.cleanup=true;report.finalCounts=counts;
 } finally {for(const c of [a,b,observer]) await c.close();}
 report.completedAt=new Date().toISOString();
 await writeFile(resolve(root,'docs/learning-schedule/phase-08-resend-webhooks.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(`PASS: ${report.runs.length} two-connection races, ${report.runs.length} observed blockers, signed local persistence, clean fixtures, zero provider requests`);

