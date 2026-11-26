import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

// Target the same local Docker database as the existing Supabase concurrency tests.
const databaseArgs = [
  "exec", "-i", "supabase_db_lumivox-proj",
  "psql", "-XqAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=terse",
  "-U", "postgres", "-d", "postgres",
];
const run = promisify(execFile);
const limits = "set statement_timeout = '10s'; set lock_timeout = '8s';";

async function query(sql) {
  const { stdout } = await run("docker", [...databaseArgs, "-c", `${limits} ${sql}`], {
    timeout: 15000,
    windowsHide: true,
  });
  return stdout.trim();
}

function openTransactionConnection() {
  const child = spawn("docker", databaseArgs, {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  let waiting;
  let errorOutput = "";
  child.stderr.setEncoding("utf8").on("data", (chunk) => { errorOutput += chunk; });
  child.on("error", (error) => waiting?.reject(error));
  child.on("close", (code) => {
    waiting?.reject(new Error(`psql closed (${code}): ${errorOutput.trim()}`));
  });
  createInterface({ input: child.stdout }).on("line", (line) => {
    if (line === "__RAG_QUERY_END__") {
      const result = waiting;
      waiting = undefined;
      result.resolve(result.lines.join("\n"));
    } else {
      waiting?.lines.push(line);
    }
  });

  return {
    sql(sql) {
      assert.equal(waiting, undefined, "Only one command per connection");
      return new Promise((resolve, reject) => {
        waiting = { resolve, reject, lines: [] };
        child.stdin.write(`${sql}\n\\echo __RAG_QUERY_END__\n`, (error) => {
          if (error) reject(error);
        });
      });
    },
    close() {
      child.stdin.end();
    },
  };
}

const owner = randomUUID();
const distinctSession = randomUUID();
const duplicateSession = randomUUID();
const identicalSummarySession = randomUUID();
const conflictingSummarySession = randomUUID();
const scopedSummarySession = randomUUID();
const documentOwner = randomUUID();
const documentTask = randomUUID();
const documentId = randomUUID();
const firstConnection = openTransactionConnection();
let fixtureCreated = false;

function reserve(session, requestId, documentIds = [], focus = null) {
  return `select public.rag_v2_reserve_turn('${owner}', '${session}', ${focus ? `'${focus}'` : "null"}, '${requestId}',
    '{"question":"Explain binary search","selected_document_ids":${JSON.stringify(documentIds)},"top_k":5,
      "prompt_variant":"grounded_rule","preferred_locale":"en"}'::jsonb);`;
}

async function waitForBlock(applicationName, firstPid) {
  for (let attempt = 0; attempt < 45; attempt++) {
    const blocked = await query(`
      select exists (
        select from pg_stat_activity
        where application_name = '${applicationName}'
          and pid <> ${firstPid}
          and ${firstPid} = any(pg_blocking_pids(pid))
      );
    `);
    if (blocked === "t") return;
    await delay(50);
  }
  assert.fail("The second connection did not wait on the first transaction");
}

async function race(session, duplicate) {
  const firstId = randomUUID();
  const secondId = duplicate ? firstId : randomUUID();
  const applicationName = `rag-race-${secondId}`;

  await firstConnection.sql("begin; set local role service_role;");
  const first = JSON.parse(await firstConnection.sql(reserve(session, firstId)));
  const firstPid = Number(await firstConnection.sql("select pg_backend_pid();"));
  assert.ok(Number.isInteger(firstPid) && firstPid > 0);
  assert.equal(first.outcome, "reserved");
  assert.ok(first.lease_token);

  const contender = query(`
    set application_name = '${applicationName}';
    set local role service_role;
    ${reserve(session, secondId)}
  `).then((result) => ({ result }), (error) => ({ error }));

  try {
    await waitForBlock(applicationName, firstPid);
  } finally {
    await firstConnection.sql("commit;");
  }

  const { result, error } = await contender;
  if (duplicate) {
    if (error) throw error;
    const second = JSON.parse(result);
    assert.equal(second.outcome, "processing");
    assert.equal(second.turn_id, first.turn_id);
    assert.ok(!("lease_token" in second), "Duplicate request must not get a generation lease");
  } else {
    assert.match(error?.stderr ?? "", /^ERROR:\s+RAG_TURN_IN_PROGRESS\s*$/m);
  }

  assert.equal(await query(`
    select count(*)::text || ':' || min(status) from public.rag_chat_turns
    where session_id = '${session}';
  `), "1:processing");
  console.log(`PASS: ${duplicate ? "duplicate request shares one turn and one generation lease" : "distinct request is blocked by the processing turn"}`);
}

async function reserveAfterHistory(session, documentIds = []) {
  for (let index = 0; index < 6; index++) {
    const turn = JSON.parse(await query(reserve(session, randomUUID(), documentIds)));
    await query(`
      select public.rag_v2_complete_turn('${owner}', '${turn.turn_id}', '${turn.lease_token}',
        'Fixture answer', '[]', 'fixture', 'fixture-model', 10, '{}');
    `);
  }
  return JSON.parse(await query(reserve(session, randomUUID(), documentIds)));
}

function save(session, turn, topic = "Binary search") {
  const summary = {
    main_topic: topic, learning_objective: "", covered_concepts: [],
    important_user_context: [], unresolved_questions: [], document_references: [],
    uncertainties: [], continuation_hint: "",
  };
  return `select public.rag_v2_save_summary('${owner}', '${session}', '${turn.turn_id}',
    '${turn.lease_token}', 0, 2, 4, '${JSON.stringify(summary)}', 55, 'extractive',
    '{"schema_version":1,"input_turn_count":2,"batch_size":8}');`;
}

async function summaryCount(session) {
  return query(`select count(*) from public.rag_chat_summaries where session_id = '${session}';`);
}

async function raceSummary(session, samePayload) {
  const turn = await reserveAfterHistory(session);
  const applicationName = `rag-summary-${randomUUID()}`;
  await firstConnection.sql("begin; set local role service_role;");
  let contender;
  let first;
  try {
    first = JSON.parse(await firstConnection.sql(save(session, turn)));
    assert.equal(first.version, 1);
    const firstPid = Number(await firstConnection.sql("select pg_backend_pid();"));
    contender = query(`
      set application_name = '${applicationName}';
      set local role service_role;
      ${save(session, turn, samePayload ? undefined : "Sorting algorithms")}
    `).then((result) => ({ result }), (error) => ({ error }));
    await waitForBlock(applicationName, firstPid);
  } finally {
    await firstConnection.sql("commit;");
  }
  const { result, error } = await contender;
  if (samePayload) {
    if (error) throw error;
    assert.equal(JSON.parse(result).id, first.id);
  } else {
    assert.match(error?.stderr ?? "", /^ERROR:\s+RAG_SUMMARY_CONFLICT\s*$/m);
  }
  assert.equal(await summaryCount(session), "1");
  console.log(`PASS: ${samePayload ? "identical summary writes replay one version" : "different summary writes produce one version and one conflict"}`);
  return turn;
}

async function focusConversation(documents = []) {
  const focus = randomUUID();
  const source = randomUUID();
  const contextMode = documents.length ? "document_rag" : "general";
  await query(`
    insert into public.focus_sessions (id,user_id,planned_minutes,status,ended_at)
    values ('${focus}','${owner}',25,'completed',now());
    insert into public.rag_chat_sessions (id,user_id,focus_session_id,conversation_version,
      selected_document_ids,context_mode,prompt_variant,top_k,preferred_locale)
    values ('${source}','${owner}','${focus}',2,
      '${"{" + documents.join(",") + "}"}'::uuid[],'${contextMode}','grounded_rule',5,'en');
  `);
  return { focus, source, documents };
}

function newChatArguments({ focus, source, documents }, requestId, mode) {
  const payload = JSON.stringify({
    focus_session_id: focus, source_session_id: source, mode, selected_document_ids: documents,
    top_k: 5, prompt_variant: "grounded_rule", preferred_locale: "en",
  });
  return `'${owner}','${focus}','${source}','${requestId}','${payload}'::jsonb`;
}

async function prepareChat(fixture, requestId) {
  const args = newChatArguments(fixture, requestId, "continue");
  return JSON.parse(await query(`select public.rag_v2_prepare_new_chat(${args});`)).revision;
}

function commitChat(fixture, requestId, revision = null) {
  const args = newChatArguments(fixture, requestId, revision ? "continue" : "fresh");
  const memory = {
    schema_version: 1, generation_method: "extractive", token_count: 60,
    summary: {
      main_topic: "Binary search", learning_objective: "", covered_concepts: [],
      important_user_context: [], unresolved_questions: [], document_references: [],
      uncertainties: [], continuation_hint: "",
    },
  };
  const parameters = revision ? `'${JSON.stringify(revision)}','${JSON.stringify(memory)}'` : "null,null";
  return `select public.rag_v2_commit_new_chat(${args},${parameters});`;
}

function completeHistoryTurn(turn) {
  return `select public.rag_v2_complete_turn('${owner}','${turn.turn_id}','${turn.lease_token}',
    'Synthetic answer','[]','fixture','fixture',1,'{}');`;
}

async function reserveFocusTurn(fixture) {
  return JSON.parse(await query(reserve(fixture.source, randomUUID(), fixture.documents, fixture.focus)));
}

async function contend(firstSql, contenderSql, afterBlockedSql) {
  const app = `rag-chat-${randomUUID()}`;
  let other;
  let first;
  await firstConnection.sql("begin; set local role service_role;");
  try {
    first = await firstConnection.sql(firstSql);
    const firstPid = Number(await firstConnection.sql("select pg_backend_pid();"));
    other = query(`set application_name='${app}'; set local role service_role; ${contenderSql}`)
      .then((result) => ({ result }), (error) => ({ error }));
    await waitForBlock(app, firstPid);
    if (afterBlockedSql) await firstConnection.sql(afterBlockedSql);
  } finally {
    await firstConnection.sql("commit;");
  }
  return { first, ...await other };
}

function recoverTurn(fixture, requestId) {
  return `select public.rag_v2_recover_expired_turn('${owner}','${fixture.focus}','${requestId}');`;
}

async function recoveryFixture({ expired = false, documents = [] } = {}) {
  const fixture = await focusConversation(documents);
  const requestId = randomUUID();
  const sql = reserve(fixture.source, requestId, documents, fixture.focus);
  const turn = JSON.parse(await query(sql));
  if (expired) {
    await query(`update public.rag_chat_turns set lease_expires_at=clock_timestamp()-interval '1 second'
      where id='${turn.turn_id}';`);
  }
  return { fixture, requestId, turn, reserveSql: sql };
}

async function recoveryRaces() {
  const committed = await recoveryFixture();
  const completed = await contend(completeHistoryTurn(committed.turn), recoverTurn(committed.fixture, committed.requestId));
  assert.ifError(completed.error);
  // Ignore the completion response and recover using only the original request ID.
  assert.equal(JSON.parse(completed.result).status, "completed");
  const statusSql = `select public.rag_v2_get_operation_status('${owner}',
    '${committed.fixture.focus}','${committed.requestId}','ask');`;
  assert.equal(JSON.parse(await query(statusSql)).status, "completed");
  assert.equal(await query(`select count(*) from public.rag_chat_messages
    where turn_id='${committed.turn.turn_id}';`), "2");
  console.log("PASS: committed answer survives a lost response and a competing recovery");

  const expired = await recoveryFixture({ expired: true });
  const expiryWins = await contend(recoverTurn(expired.fixture, expired.requestId), completeHistoryTurn(expired.turn));
  assert.equal(JSON.parse(expiryWins.first).status, "failed");
  assert.match(expiryWins.error?.stderr ?? "", /ERROR:\s+RAG_INVALID_LEASE/);
  assert.equal(await query(`select count(*) from public.rag_chat_messages where turn_id='${expired.turn.turn_id}';`), "0");
  console.log("PASS: expiry recovery prevents late completion and message insert");

  const duplicate = await recoveryFixture({ expired: true });
  const recoverSql = recoverTurn(duplicate.fixture, duplicate.requestId);
  const twice = await contend(recoverSql, recoverSql);
  assert.ifError(twice.error);
  assert.equal(twice.first, twice.result);
  assert.equal(JSON.parse(twice.result).status, "failed");
  assert.equal(await query(`select status || ':' || error_code from public.rag_chat_turns
    where id='${duplicate.turn.turn_id}';`), "failed:lease_expired");
  console.log("PASS: concurrent expiry recovery returns one durable failed state");

  const closing = await recoveryFixture({ expired: true });
  const transition = await contend(recoverTurn(closing.fixture, closing.requestId), commitChat(closing.fixture, randomUUID()));
  assert.ifError(transition.error);
  assert.equal(JSON.parse(transition.result).outcome, "completed");
  assert.equal(await query(`select count(*) from public.rag_chat_turns
    where session_id='${closing.fixture.source}' and status='processing';`), "0");
  console.log("PASS: expiry recovery and New Chat leave no processing turn on a closed source");

  await query(`insert into public.learning_document_permissions (document_id,user_email,created_by)
    values ('${documentId}','rag-race-${owner}@example.test','${documentOwner}');`);
  const revoked = await recoveryFixture({ documents: [documentId] });
  await query(completeHistoryTurn(revoked.turn));
  const lockSource = `select id from public.rag_chat_sessions where id='${revoked.fixture.source}' for update;`;
  const revokeAccess = `reset role; delete from public.learning_document_permissions where document_id='${documentId}';`;
  const replay = await contend(lockSource, revoked.reserveSql, revokeAccess);
  assert.match(replay.error?.stderr ?? "", /ERROR:\s+RAG_DOCUMENT_ACCESS_DENIED/);
  assert.equal(await query(`select status from public.rag_chat_turns where id='${revoked.turn.turn_id}';`), "completed");
  console.log("PASS: replay revalidates document access after waiting on the session lock");
}

async function newChatRaces() {
  for (const duplicate of [true, false]) {
    const fixture = await focusConversation();
    const request = randomUUID();
    const result = await contend(commitChat(fixture, request), commitChat(fixture, duplicate ? request : randomUUID()));
    if (duplicate) {
      assert.ifError(result.error);
      assert.equal(JSON.parse(result.first).target_session_id, JSON.parse(result.result).target_session_id);
    } else {
      assert.match(result.error?.stderr ?? "", /ERROR:\s+RAG_SESSION_CLOSED/);
    }
    assert.equal(await query(`select count(*) from public.rag_chat_transitions
      where source_session_id='${fixture.source}';`), "1");
    console.log(`PASS: ${duplicate ? "duplicate New Chat requests replay one target" : "distinct New Chat requests produce one transition"}`);
  }

  const reservationRace = await focusConversation();
  const afterClosure = await contend(commitChat(reservationRace, randomUUID()),
    reserve(reservationRace.source, randomUUID(), [], reservationRace.focus));
  assert.match(afterClosure.error?.stderr ?? "", /ERROR:\s+RAG_SESSION_CLOSED/);
  assert.equal(await query(`select count(*) from public.rag_chat_turns
    where session_id='${reservationRace.source}' and status='processing';`), "0");
  console.log("PASS: a competing ask cannot reserve against the closed source");

  const completionRace = await focusConversation();
  await query(completeHistoryTurn(await reserveFocusTurn(completionRace)));
  const completionRequest = randomUUID();
  const beforeCompletion = await prepareChat(completionRace, completionRequest);
  const completing = await reserveFocusTurn(completionRace);
  const completion = await contend(completeHistoryTurn(completing),
    commitChat(completionRace, completionRequest, beforeCompletion));
  assert.match(completion.error?.stderr ?? "", /ERROR:\s+RAG_HANDOFF_SOURCE_CHANGED/);
  console.log("PASS: a competing completion changes the prepared handoff revision");

  const summaryRace = await focusConversation();
  for (let index = 0; index < 6; index++) await query(completeHistoryTurn(await reserveFocusTurn(summaryRace)));
  const summaryRequest = randomUUID();
  const beforeSummary = await prepareChat(summaryRace, summaryRequest);
  const summarizing = await reserveFocusTurn(summaryRace);
  const result = await contend(`${save(summaryRace.source, summarizing)}
    update public.rag_chat_turns set lease_expires_at=clock_timestamp()-interval '1 second'
      where id='${summarizing.turn_id}';`, commitChat(summaryRace, summaryRequest, beforeSummary));
  assert.match(result.error?.stderr ?? "", /ERROR:\s+RAG_HANDOFF_SOURCE_CHANGED/);
  assert.equal(await summaryCount(summaryRace.source), "1");
  console.log("PASS: a competing rolling summary invalidates the prepared revision");

  await query(`insert into public.learning_document_permissions (document_id,user_email,created_by)
    values ('${documentId}','rag-race-${owner}@example.test','${documentOwner}');`);
  const revoked = await focusConversation([documentId]);
  await query(completeHistoryTurn(await reserveFocusTurn(revoked)));
  const revokedRequest = randomUUID();
  const beforeRevoke = await prepareChat(revoked, revokedRequest);
  await firstConnection.sql(`delete from public.learning_document_permissions where document_id='${documentId}';`);
  await assert.rejects(query(commitChat(revoked, revokedRequest, beforeRevoke)),
    { stderr: /ERROR:\s+RAG_DOCUMENT_ACCESS_DENIED/ });
  console.log("PASS: document revocation between prepare and commit prevents Continue");

  const rollback = await focusConversation();
  await query(completeHistoryTurn(await reserveFocusTurn(rollback)));
  const rejectedRequest = randomUUID();
  const revision = await prepareChat(rollback, rejectedRequest);
  await firstConnection.sql("begin;");
  try {
    await firstConnection.sql(`
      alter table public.rag_chat_handoffs add constraint phase5_fixture_failure check (false) not valid;
      set local role service_role;
      do $fixture$
      declare constraint_name text;
      begin
        ${commitChat(rollback, rejectedRequest, revision).replace("select public.", "perform public.")}
        raise exception 'Expected handoff insert failure';
      exception when check_violation then
        get stacked diagnostics constraint_name = constraint_name;
        if constraint_name is distinct from 'phase5_fixture_failure' then raise; end if;
      end; $fixture$;
    `);
    assert.equal(await firstConnection.sql(`select status from public.rag_chat_sessions where id='${rollback.source}';`), "active");
    assert.equal(await firstConnection.sql(`select count(*) from public.rag_chat_transitions where source_session_id='${rollback.source}';`), "0");
    assert.equal(await firstConnection.sql(`select count(*) from public.rag_chat_sessions where focus_session_id='${rollback.focus}';`), "1");
  } finally {
    await firstConnection.sql("rollback;");
  }
  console.log("PASS: a failed handoff insert rolls back source closure and target creation");
}

try {
  await query(`
    insert into auth.users (id, email) values
      ('${owner}', 'rag-race-${owner}@example.test'),
      ('${documentOwner}', 'rag-race-${documentOwner}@example.test');
    insert into public.profiles (id) values ('${owner}'), ('${documentOwner}') on conflict (id) do nothing;
    insert into public.tasks (id, user_id, title) values ('${documentTask}', '${documentOwner}', 'Summary fixture');
    insert into public.learning_documents (
      id, owner_id, task_id, file_name, file_path, mime_type, file_size_bytes, visibility
    ) values (
      '${documentId}', '${documentOwner}', '${documentTask}', 'notes.txt',
      'rag-race/${documentId}', 'text/plain', 10, 'shared'
    );
    insert into public.learning_document_permissions (document_id, user_email, created_by)
    values ('${documentId}', 'rag-race-${owner}@example.test', '${documentOwner}');
    insert into public.rag_chat_sessions (id, user_id, conversation_version)
    values ('${distinctSession}', '${owner}', 2), ('${duplicateSession}', '${owner}', 2),
      ('${identicalSummarySession}', '${owner}', 2), ('${conflictingSummarySession}', '${owner}', 2);
    insert into public.rag_chat_sessions (
      id, user_id, conversation_version, selected_document_ids, context_mode, prompt_variant
    ) values ('${scopedSummarySession}', '${owner}', 2, array['${documentId}'::uuid], 'document_rag', 'grounded_rule');
  `);
  fixtureCreated = true;
  await firstConnection.sql(`${limits} set idle_in_transaction_session_timeout = '15s';`);
  await race(distinctSession, false);
  await race(duplicateSession, true);
  const oldWorker = await raceSummary(identicalSummarySession, true);
  await raceSummary(conflictingSummarySession, false);

  await firstConnection.sql(`update public.rag_chat_turns
    set lease_expires_at = clock_timestamp() - interval '1 second' where id = '${oldWorker.turn_id}';`);
  await assert.rejects(query(save(identicalSummarySession, oldWorker, "Expired overwrite")),
    { stderr: /ERROR:\s+RAG_INVALID_LEASE/ });
  assert.equal(await summaryCount(identicalSummarySession), "1");
  assert.equal(await query(`select summary->>'main_topic' from public.rag_chat_summaries
    where session_id = '${identicalSummarySession}';`), "Binary search");
  console.log("PASS: expired worker cannot overwrite the committed summary");

  const scopedTurn = await reserveAfterHistory(scopedSummarySession, [documentId]);
  await firstConnection.sql(`delete from public.learning_document_permissions where document_id = '${documentId}';`);
  await assert.rejects(query(save(scopedSummarySession, scopedTurn)),
    { stderr: /ERROR:\s+RAG_DOCUMENT_ACCESS_DENIED/ });
  assert.equal(await summaryCount(scopedSummarySession), "0");
  console.log("PASS: document revocation before save prevents a summary write");
  await newChatRaces();
  await recoveryRaces();
} finally {
  firstConnection.close();
  if (fixtureCreated) {
    await query(`delete from auth.users where id in ('${owner}', '${documentOwner}');`);
    assert.equal(await query(`select count(*) from public.rag_chat_sessions where user_id = '${owner}';`), "0");
  }
}
