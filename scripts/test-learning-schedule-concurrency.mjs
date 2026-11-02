// LOCAL ONLY. Three independent psql processes inside the known local Docker DB.
// No remote URL or credentials accepted. Requires only Node.js and Docker CLI.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const container = 'supabase_db_lumivox-proj';
const owner = 'd1000000-0000-4000-8000-000000000001';
const task = 'd2000000-0000-4000-8000-000000000001';
const email = 'ls-concurrency@example.invalid';
const title = 'Concurrency create-versus-close';
const options = process.argv.slice(2);
const option = (name, fallback) => {
  const at = options.indexOf(name);
  return at < 0 ? fallback : options[at + 1];
};
for (let i = 0; i < options.length; i += 2) {
  assert(['--iterations', '--output'].includes(options[i]), `Unknown option ${options[i]}`);
  assert(options[i + 1], `Missing value for ${options[i]}`);
}
const iterations = Number(option('--iterations', '3'));
assert(Number.isInteger(iterations) && iterations >= 2 && iterations <= 20,
  '--iterations must be an integer from 2 to 20');
const outputPath = resolve(root, option('--output', 'docs/learning-schedule/concurrency-results.json'));
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

const slots = (start, end) => JSON.stringify([{ weekday: 1, startTime: start, endTime: end }]);
const occurrences = (start, end) => JSON.stringify([{
  localDate: '2030-01-07', localStartTime: start, localEndTime: end,
  timezone: 'Asia/Ho_Chi_Minh', scheduledStartAt: `2030-01-07T${String(Number(start.slice(0, 2)) - 7).padStart(2, '0')}:00:00Z`,
  scheduledEndAt: `2030-01-07T${String(Number(end.slice(0, 2)) - 7).padStart(2, '0')}:00:00Z`,
  slotIndex: 0, occurrenceKey: `2030-01-07|1|${start}|${end}`,
}]);
const create = () => `SELECT public.ls_create_schedule(${q(task)},'2030-01-07','2030-01-07',
 'Asia/Ho_Chi_Minh',${q(slots('19:00', '20:00'))}::jsonb,${q(occurrences('19:00', '20:00'))}::jsonb);`;
const revise = schedule => `SELECT public.ls_revise_schedule(${q(schedule)},1,'2030-01-07','2030-01-07',
 'Asia/Ho_Chi_Minh',${q(slots('20:00', '21:00'))}::jsonb,${q(occurrences('20:00', '21:00'))}::jsonb);`;
const reschedule = (session, stamp, key) => `SELECT public.ls_reschedule_session(${q(session)},${q(stamp)},
 '2030-01-07','18:00','19:00','2030-01-07T11:00:00Z','2030-01-07T12:00:00Z',${q(key)});`;
const closeTask = `UPDATE public.tasks SET status='completed' WHERE id=${q(task)};`;
const report = { baseline: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  startedAt: new Date().toISOString(), localContainer: container, iterations,
  lockTimeout: '5s', statementTimeout: '10s', harnessDeadline: '15s', runs: [] };
const connections = [new Connection('A'), new Connection('B'), new Connection('observer')];
const [a, b, observer] = connections;
let fixtureOwned = false;
let failure;

async function cleanTask() {
  const current = await observer.json(`SELECT coalesce((SELECT to_jsonb(t) FROM public.tasks t WHERE id=${q(task)}),'null'::jsonb);`);
  assert(!current || (current.user_id === owner && current.title === title), 'Fixture Task ID belongs to other data; refusing cleanup');
  await observer.ok(`DELETE FROM public.tasks WHERE id=${q(task)};`);
}
async function setup(hasSchedule) {
  await cleanTask();
  await observer.ok(`INSERT INTO public.tasks(id,user_id,title,status) VALUES (${q(task)},${q(owner)},${q(title)},'todo');`);
  if (hasSchedule) {
    await a.begin(); await a.ok(create()); await a.ok('COMMIT;');
  }
  return state();
}
async function state() {
  return observer.json(`SELECT jsonb_build_object(
   'task',(SELECT to_jsonb(t) FROM public.tasks t WHERE id=${q(task)}),
   'schedules',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.task_study_schedules s WHERE task_id=${q(task)}),'[]'),
   'slots',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM public.task_study_schedule_slots s JOIN public.task_study_schedules c ON c.id=s.schedule_id WHERE c.task_id=${q(task)}),'[]'),
   'sessions',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.task_study_sessions s WHERE task_id=${q(task)}),'[]'),
   'revisions',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM public.task_study_schedule_revisions s JOIN public.task_study_schedules c ON c.id=s.schedule_id WHERE c.task_id=${q(task)}),'[]'),
   'events',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM public.task_study_session_events e JOIN public.task_study_sessions s ON s.id=e.session_id WHERE s.task_id=${q(task)}),'[]'));`);
}
async function blockedByA() {
  const deadline = Date.now() + 3500;
  while (Date.now() < deadline) {
    const blockers = await observer.json(`SELECT to_json(pg_blocking_pids(${b.pid}));`);
    if (blockers.includes(a.pid)) return blockers;
    await wait(30);
  }
  throw new Error('B was not observed blocked by A within 3.5s');
}
async function race(first, second, expectedState, expectedMessage) {
  await a.begin();
  await a.ok(`SELECT id FROM public.tasks WHERE id=${q(task)} FOR UPDATE;`);
  await b.begin();
  const pending = b.exec(second);
  // Attach a handler immediately so a client deadline cannot become unhandled.
  pending.catch(() => {});
  const blockers = await blockedByA();
  const firstResult = await a.ok(first);
  await a.ok('COMMIT;');
  const secondResult = await pending;
  assert.equal(secondResult.state, expectedState, `B: ${JSON.stringify(secondResult)}`);
  if (expectedMessage) assert.equal(secondResult.errorMessage, expectedMessage);
  await b.ok(expectedState === '00000' ? 'COMMIT;' : 'ROLLBACK;');
  return { blockers, firstResult, secondResult: {
    state: secondResult.state, message: secondResult.errorMessage, value: secondResult.text } };
}
function assertInvariants(s) {
  assert(s.schedules.length <= 1, 'Duplicate schedule');
  if (['completed', 'cancelled'].includes(s.task.status)) {
    assert(s.schedules.every(x => x.status === 'closed'), 'Active schedule on closed Task');
    assert(!s.sessions.some(x => x.status === 'scheduled' && Date.parse(x.scheduled_start_at) > Date.now()),
      'Future scheduled session survived Task close');
  }
  const effective = s.sessions.filter(x => x.status !== 'cancelled').map(x => `${x.schedule_id}|${x.logical_occurrence_key}`);
  assert.equal(new Set(effective).size, effective.length, 'Duplicate effective obligation');
  const eventKeys = s.events.map(x => `${x.session_id}|${x.event_key}`);
  assert.equal(new Set(eventKeys).size, eventKeys.length, 'Duplicate audit command');
  for (const session of s.sessions.filter(x => x.status === 'cancelled')) {
    assert.equal(s.events.filter(e => e.session_id === session.id && e.event_type === 'cancelled').length, 1,
      'Cancelled fixture must have exactly one cancellation event');
  }
}
const scenarios = [
  ['task-close-before-create', false, async () => {
    const trace = await race(closeTask, create(), '22023', 'Task is not eligible for scheduling');
    const s = await state(); assert.equal(s.task.status, 'completed'); assert.equal(s.schedules.length, 0);
    assertInvariants(s); return { ...trace, final: s };
  }],
  ['duplicate-create', false, async () => {
    const trace = await race(create(), create(), '23505');
    const s = await state(); assert.equal(s.schedules.length, 1); assert.equal(s.sessions.length, 1);
    assert.equal(s.slots.length, 1); assert.equal(s.revisions.length, 1); assert.equal(s.events.length, 0);
    assertInvariants(s); return { ...trace, final: s };
  }],
  ['create-before-task-close', false, async () => {
    const trace = await race(create(), closeTask, '00000');
    const s = await state(); assert.equal(s.task.status, 'completed'); assert.equal(s.schedules.length, 1);
    assert.equal(s.events.length, 1); assert.equal(s.sessions[0].cancellation_reason, 'task_closed');
    assertInvariants(s); return { ...trace, final: s };
  }],
  ['revise-vs-revise', true, async initial => {
    const trace = await race(revise(initial.schedules[0].id), revise(initial.schedules[0].id), '40001', 'Stale schedule revision');
    const s = await state(); assert.equal(s.schedules[0].revision, 2); assert.equal(s.revisions.length, 2);
    assert.equal(s.sessions.length, 2); assert.equal(s.events.length, 1);
    assertInvariants(s); return { ...trace, final: s };
  }],
  ['revise-before-reschedule', true, async initial => {
    const x = initial.sessions[0];
    const trace = await race(revise(initial.schedules[0].id), reschedule(x.id, x.updated_at, randomUUID()), '22023', 'Session is not eligible for rescheduling');
    const s = await state(); assert.equal(s.schedules[0].revision, 2); assert.equal(s.events.length, 1);
    assert.equal(s.events[0].event_type, 'cancelled'); assertInvariants(s); return { ...trace, final: s };
  }],
  ['reschedule-before-revise', true, async initial => {
    const x = initial.sessions[0];
    const trace = await race(reschedule(x.id, x.updated_at, randomUUID()), revise(initial.schedules[0].id), '00000');
    const s = await state(); assert.equal(s.schedules[0].revision, 2); assert.equal(s.events.length, 2);
    assert.equal(s.events.filter(e => e.event_type === 'rescheduled').length, 1);
    assert.equal(s.sessions.find(y => y.id === x.id).logical_occurrence_key, x.logical_occurrence_key);
    assertInvariants(s); return { ...trace, final: s };
  }],
  ['reschedule-conflict', true, async initial => {
    const x = initial.sessions[0];
    const trace = await race(reschedule(x.id, x.updated_at, randomUUID()), reschedule(x.id, x.updated_at, randomUUID()), '40001', 'Stale session version');
    const s = await state(); assert.equal(s.events.length, 1); assert.equal(s.sessions[0].id, x.id);
    assertInvariants(s); return { ...trace, final: s };
  }],
  ['reschedule-concurrent-exact-retry', true, async initial => {
    const x = initial.sessions[0]; const key = randomUUID(); const command = reschedule(x.id, x.updated_at, key);
    const trace = await race(command, command, '00000');
    const s = await state(); assert.equal(trace.secondResult.value, x.id); assert.equal(s.events.length, 1);
    assert.equal(s.sessions[0].id, x.id); assertInvariants(s); return { ...trace, final: s };
  }],
  ['retry-after-durable-commit', true, async initial => {
    const x = initial.sessions[0]; const command = reschedule(x.id, x.updated_at, randomUUID());
    await a.begin(); assert.equal(await a.ok(command), x.id); await a.ok('COMMIT;');
    const committed = await state(); assert.equal(committed.events.length, 1);
    await b.begin(); assert.equal(await b.ok(command), x.id); await b.ok('COMMIT;');
    const s = await state(); assert.deepEqual(s, committed); assertInvariants(s);
    return { durableCommitObservedByThirdConnection: true, final: s };
  }],
];
for (const operation of ['reschedule', 'revise', 'task-close']) {
  scenarios.push([`audit-failure-${operation}`, true, async initial => {
    const x = initial.sessions[0];
    await a.begin(); await a.ok('RESET ROLE;');
    await a.ok(`CREATE FUNCTION pg_temp.ls_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.user_id=${q(owner)}::uuid THEN
        RAISE EXCEPTION 'Injected concurrency audit failure' USING ERRCODE='P0001';
      END IF; RETURN NEW; END $$;
      CREATE TRIGGER ls_concurrency_audit_failure BEFORE INSERT ON public.task_study_session_events
      FOR EACH ROW EXECUTE FUNCTION pg_temp.ls_fail_audit(); SET LOCAL ROLE authenticated;`);
    const command = operation === 'reschedule' ? reschedule(x.id, x.updated_at, randomUUID())
      : operation === 'revise' ? revise(initial.schedules[0].id) : closeTask;
    const result = await a.exec(command); assert.equal(result.state, 'P0001');
    assert.equal(result.errorMessage, 'Injected concurrency audit failure');
    await a.ok('ROLLBACK;');
    const s = await state(); assert.deepEqual(s, initial, 'Audit failure leaked committed data'); assertInvariants(s);
    assert.equal(await observer.ok("SELECT count(*) FROM pg_trigger WHERE tgname='ls_concurrency_audit_failure';"), '0');
    return { expectedError: result.state, message: result.errorMessage, rolledBackAllRelatedRows: true, final: s };
  }]);
}

try {
  await Promise.all(connections.map(c => c.init()));
  assert.equal(new Set(connections.map(c => c.pid)).size, 3, 'Connections must have distinct backend PIDs');
  report.backendPids = Object.fromEntries(connections.map(c => [c.name, c.pid]));
  const priorUser = await observer.ok(`SELECT email FROM auth.users WHERE id=${q(owner)};`);
  assert(!priorUser || priorUser === email, 'Fixture user ID belongs to other data; refusing setup');
  await cleanTask();
  await observer.ok(`\\set LS_CONCURRENCY_SETUP 1\n${await readFile(resolve(root,
    'supabase/tests/concurrency/learning_schedule_setup.sql'), 'utf8')}`);
  fixtureOwned = true;
  report.setupCommitted = (await state()).task.status === 'todo';
  assert(report.setupCommitted);
  for (let iteration = 1; iteration <= iterations; iteration++) {
    for (const [name, needsSchedule, run] of scenarios) {
      const initial = await setup(needsSchedule);
      const started = Date.now();
      const details = await run(initial);
      report.runs.push({ name, iteration, status: 'PASS', elapsedMs: Date.now() - started, ...details });
      process.stdout.write(`PASS ${iteration}/${iterations} ${name}\n`);
    }
  }
  report.status = 'PASS';
} catch (error) {
  failure = error;
  report.status = 'FAIL'; report.failure = error.stack;
} finally {
  // End worker transactions before cleanup. Observer only removes verified
  // fixture IDs/email; never resets the database or touches unrelated owners.
  for (const c of [a, b]) {
    if (c.active) await c.close();
    else await c.exec('ROLLBACK;').catch(() => {});
  }
  if (fixtureOwned) {
    try {
      await cleanTask();
      await observer.ok(`DELETE FROM auth.users WHERE id=${q(owner)} AND email=${q(email)};`);
      const remaining = await observer.ok(`SELECT count(*) FROM auth.users WHERE id=${q(owner)};`);
      assert.equal(remaining, '0');
      assert.deepEqual(await state(), {
        task: null, schedules: [], slots: [], sessions: [], revisions: [], events: [],
      });
      report.openWorkerTransactions = Number(await observer.ok(`SELECT count(*) FROM pg_stat_activity
        WHERE pid IN (${a.pid},${b.pid}) AND xact_start IS NOT NULL;`));
      report.remainingWorkerLocks = Number(await observer.ok(`SELECT count(*) FROM pg_locks
        WHERE pid IN (${a.pid},${b.pid});`));
      assert.equal(report.openWorkerTransactions, 0);
      assert.equal(report.remainingWorkerLocks, 0);
      report.cleanup = 'PASS';
    } catch (error) { report.cleanup = 'FAIL'; report.cleanupError = String(error); failure ??= error; }
  }
  await Promise.all(connections.map(c => c.close()));
  report.finishedAt = new Date().toISOString();
  if (failure) report.status = 'FAIL';
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(`${report.status}: ${report.runs.length} completed runs; cleanup=${report.cleanup ?? 'not needed'}\n`);
}
if (failure) { process.stderr.write(`${failure.stack}\n`); process.exitCode = 1; }
