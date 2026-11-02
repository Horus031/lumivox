import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = process.cwd();
const container = 'supabase_db_lumivox-proj';
const owner = randomUUID();
const email = `attendance-race-${owner}@example.invalid`;
const title = 'Attendance concurrency fixture';
const q = value => `'${String(value).replaceAll("'", "''")}'`;
const wait = ms => new Promise(done => setTimeout(done, ms));
class Connection {
  constructor(name) {
    this.name = name;
    this.child = spawn('docker', ['exec', '-i', container, 'psql', '-X', '-A', '-t', '-q',
      '-U', 'postgres', '-d', 'postgres'], { cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.active = null;
    this.stderr = [];
    createInterface({ input: this.child.stdout }).on('line', line => {
      if (!this.active) return;
      if (line === this.active.marker) {
        const pending = this.active;
        this.active = null;
        clearTimeout(pending.timer);
        pending.resolve({ text: pending.lines.join('\n'), errors: this.stderr.splice(0) });
      } else this.active.lines.push(line);
    });
    // psql sends diagnostics to stderr; merge at the command boundary using a
    // stdout SQLSTATE probe as well, so pipe scheduling cannot hide SQL errors.
    createInterface({ input: this.child.stderr }).on('line', line => this.stderr.push(line));
    this.child.on('error', error => this.fail(error));
    this.child.on('exit', code => this.fail(new Error(`${name}: psql exited (${code})`)));
  }
  fail(error) {
    if (this.active) {
      clearTimeout(this.active.timer);
      this.active.reject(error);
      this.active = null;
    }
  }
  exec(sql) {
    assert(!this.active, `${this.name}: concurrent command on one connection`);
    return new Promise((resolveCommand, reject) => {
      const marker = `__LS_DONE_${randomUUID().replaceAll('-', '')}`;
      const timer = setTimeout(() => this.fail(new Error(`${this.name}: harness deadline 15s exceeded`)), 15000);
      this.active = { marker, timer, lines: [], resolve: resolveCommand, reject };
      this.stderr.length = 0;
      this.child.stdin.write(`${sql}\n\\echo __LS_SQLSTATE :SQLSTATE\n\\echo __LS_LAST_ERROR :LAST_ERROR_MESSAGE\n\\echo ${marker}\n`);
    }).then(result => {
      const lines = result.text.split('\n');
      const state = lines.findLast(line => line.startsWith('__LS_SQLSTATE '))?.split(' ')[1];
      const errorMessage = lines.findLast(line => line.startsWith('__LS_LAST_ERROR '))?.slice('__LS_LAST_ERROR '.length);
      return { text: lines.filter(line => !line.startsWith('__LS_SQLSTATE ') && !line.startsWith('__LS_LAST_ERROR ')).join('\n').trim(),
        state, errorMessage: state === '00000' ? null : errorMessage, errors: result.errors };
    });
  }
  async ok(sql) {
    const result = await this.exec(sql);
    assert.equal(result.state, '00000', `${this.name}: ${result.state}: ${result.errors.join('\n')} ${result.text}`);
    return result.text;
  }
  async json(sql) { return JSON.parse(await this.ok(sql)); }
  async init() {
    await this.ok(`\\set ON_ERROR_STOP off\n\\set VERBOSITY verbose\nSET application_name=${q(`lumivox-concurrency-${this.name}`)};
      SET lock_timeout='5s'; SET statement_timeout='10s';`);
    this.pid = Number(await this.ok('SELECT pg_backend_pid();'));
  }
  async begin() {
    await this.ok(`BEGIN; SET LOCAL ROLE authenticated;
      SET LOCAL "request.jwt.claim.sub"=${q(owner)};
      SET LOCAL "request.jwt.claim.role"='authenticated';`);
  }
  async close() {
    if (this.closed) return;
    this.closed = true;
    if (this.active) this.fail(new Error(`${this.name}: closing pending query`));
    this.child.stdin.end('ROLLBACK;\n\\q\n');
    await Promise.race([new Promise(done => this.child.once('exit', done)), wait(2000)]);
    if (this.child.exitCode === null) this.child.kill();
  }
}

const report = { baseline: execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  startedAt: new Date().toISOString(), localContainer: container, runs: [] };
const connections = [new Connection('start-A'), new Connection('start-B'), new Connection('start-observer')];
const [a,b,observer] = connections;
let task = null; let owned = false; let failure;
async function cleanTask() {
  if (!task) return;
  const existing = await observer.json(`SELECT coalesce((SELECT to_jsonb(t) FROM public.tasks t WHERE id=${q(task)}),'null'::jsonb);`);
  assert(!existing || (existing.user_id===owner && existing.title===title),'Refusing foreign fixture cleanup');
  await observer.ok(`DELETE FROM public.tasks WHERE id=${q(task)};`);
}
async function snapshot(session) {
  return observer.json(`SELECT jsonb_build_object('status',s.status,'minutes',s.actual_study_minutes,
    'completedAt',s.completed_at,'taskStatus',t.status,
    'events',(SELECT count(*) FROM public.task_study_session_events WHERE session_id=s.id),
    'startedEvents',(SELECT count(*) FROM public.task_study_session_events WHERE session_id=s.id AND event_type='started'))
    FROM public.task_study_sessions s JOIN public.tasks t ON t.id=s.task_id WHERE s.id=${q(session)};`);
}
try {
  await Promise.all(connections.map(c=>c.init()));
  report.backendPids = connections.map(c=>c.pid); assert.equal(new Set(report.backendPids).size,3);
  await observer.ok(`INSERT INTO auth.users(id,email) VALUES (${q(owner)},${q(email)});
    INSERT INTO public.profiles(id) VALUES (${q(owner)}) ON CONFLICT DO NOTHING;`); owned=true;
  for (let iteration=1;iteration<=3;iteration++) for (const exactRetry of [false,true]) {
    await cleanTask(); task=randomUUID(); const schedule=randomUUID(); const session=randomUUID(); const key=randomUUID();
    await observer.ok(`INSERT INTO public.tasks(id,user_id,title,status) VALUES (${q(task)},${q(owner)},${q(title)},'todo');
      INSERT INTO public.task_study_schedules(id,task_id,user_id,starts_on,ends_on,timezone)
       SELECT ${q(schedule)},${q(task)},${q(owner)},(now() AT TIME ZONE z)::date-1,(now() AT TIME ZONE z)::date+1,z
       FROM (SELECT CASE WHEN EXTRACT(HOUR FROM now() AT TIME ZONE 'UTC') BETWEEN 6 AND 17 THEN 'UTC' ELSE 'Etc/GMT+12' END z) t;
      INSERT INTO public.task_study_sessions(id,user_id,task_id,schedule_id,schedule_revision,logical_occurrence_key,local_date,
        local_start_time,local_end_time,timezone,scheduled_start_at,scheduled_end_at,updated_at)
       SELECT ${q(session)},${q(owner)},${q(task)},${q(schedule)},1,'start-race',
         ((now()-interval '2 minutes') AT TIME ZONE timezone)::date,
         ((now()-interval '2 minutes') AT TIME ZONE timezone)::time,
         ((now()+interval '30 minutes') AT TIME ZONE timezone)::time,timezone,
         now()-interval '2 minutes',now()+interval '30 minutes',now()-interval '10 minutes'
       FROM public.task_study_schedules WHERE id=${q(schedule)};`);
    const stamp = await observer.ok(`SELECT updated_at FROM public.task_study_sessions WHERE id=${q(session)};`);
    const command = eventKey => `SELECT public.ls_start_study_session(${q(session)},${q(stamp)},${q(eventKey)});`;
    await a.begin(); await a.ok(`SELECT id FROM public.tasks WHERE id=${q(task)} FOR UPDATE;`);
    assert.equal(await a.ok(command(key)),session);
    await b.begin(); const pending=b.exec(command(exactRetry?key:randomUUID()));
    let blockers=[]; const deadline=Date.now()+3500;
    while(Date.now()<deadline) { blockers=await observer.json(`SELECT to_json(pg_blocking_pids(${b.pid}));`); if(blockers.includes(a.pid))break; await wait(30); }
    assert(blockers.includes(a.pid),'Missing observed blocking relation');
    await a.ok('COMMIT;'); const second=await pending;
    if(exactRetry) { assert.equal(second.state,'00000'); assert.equal(second.text,session); await b.ok('COMMIT;'); }
    else { assert.equal(second.state,'22023'); assert.equal(second.errorMessage,'Session is not eligible for starting'); await b.ok('ROLLBACK;'); }
    const final=await snapshot(session);
    assert.deepEqual(final,{status:'in_progress',minutes:null,completedAt:null,taskStatus:'todo',events:1,startedEvents:1});
    await b.begin(); assert.equal(await b.ok(command(key)),session); await b.ok('COMMIT;');
    assert.deepEqual(await snapshot(session),final);
    report.runs.push({iteration,name:exactRetry?'double-start-exact-key':'double-start-distinct-keys',status:'PASS',blockers,
      firstSessionId:session,secondSqlstate:second.state,durableReplay:'PASS',final});
    process.stdout.write(`PASS ${iteration}/3 ${report.runs.at(-1).name}\n`);
  }
  report.status='PASS';
} catch(error) { failure=error; report.status='FAIL';report.failure=String(error.stack); }
finally {
  for(const c of [a,b]) { if(c.active)await c.close(); else await c.exec('ROLLBACK;').catch(()=>{}); }
  if(owned) try {
    await cleanTask(); await observer.ok(`DELETE FROM auth.users WHERE id=${q(owner)} AND email=${q(email)};`);
    assert.equal(await observer.ok(`SELECT count(*) FROM auth.users WHERE id=${q(owner)};`),'0');
    report.openWorkerTransactions=Number(await observer.ok(`SELECT count(*) FROM pg_stat_activity WHERE pid IN (${a.pid},${b.pid}) AND xact_start IS NOT NULL;`));
    report.remainingWorkerLocks=Number(await observer.ok(`SELECT count(*) FROM pg_locks WHERE pid IN (${a.pid},${b.pid});`));
    assert.equal(report.openWorkerTransactions,0); assert.equal(report.remainingWorkerLocks,0);report.cleanup='PASS';
  } catch(error) { failure??=error;report.status='FAIL';report.cleanup='FAIL';report.cleanupError=String(error); }
  await Promise.all(connections.map(c=>c.close()));report.finishedAt=new Date().toISOString();
  await writeFile(resolve(root,'docs/learning-schedule/phase-05-start-concurrency.json'),JSON.stringify(report,null,2)+'\n');
}
if(failure) { process.stderr.write(String(failure.stack)+'\n');process.exitCode=1; }
else process.stdout.write(`PASS: ${report.runs.length} races; durable replay and cleanup verified\n`);
