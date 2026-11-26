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

function reserve(session, requestId, documentIds = []) {
  return `select public.rag_v2_reserve_turn('${owner}', '${session}', null, '${requestId}',
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
} finally {
  firstConnection.close();
  if (fixtureCreated) {
    await query(`delete from auth.users where id in ('${owner}', '${documentOwner}');`);
    assert.equal(await query(`select count(*) from public.rag_chat_sessions where user_id = '${owner}';`), "0");
  }
}
