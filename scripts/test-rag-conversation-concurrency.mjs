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
const firstConnection = openTransactionConnection();
let fixtureCreated = false;

function reserve(session, requestId) {
  return `select public.rag_v2_reserve_turn('${owner}', '${session}', null, '${requestId}',
    '{"question":"Explain binary search","selected_document_ids":[],"top_k":5,
      "prompt_variant":"grounded_rule","preferred_locale":"en"}'::jsonb);`;
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
    let blocked = false;
    for (let attempt = 0; attempt < 45 && !blocked; attempt++) {
      blocked = await query(`
        select exists (
          select from pg_stat_activity
          where application_name = '${applicationName}'
            and pid <> ${firstPid}
            and ${firstPid} = any(pg_blocking_pids(pid))
        );
      `) === "t";
      if (!blocked) await delay(50);
    }
    assert.ok(blocked, "The second database connection waited on the first reservation");
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

try {
  await query(`
    insert into auth.users (id, email) values ('${owner}', 'rag-race-${owner}@example.test');
    insert into public.profiles (id) values ('${owner}') on conflict (id) do nothing;
    insert into public.rag_chat_sessions (id, user_id, conversation_version)
    values ('${distinctSession}', '${owner}', 2), ('${duplicateSession}', '${owner}', 2);
  `);
  fixtureCreated = true;
  await firstConnection.sql(`${limits} set idle_in_transaction_session_timeout = '15s';`);
  await race(distinctSession, false);
  await race(duplicateSession, true);
} finally {
  firstConnection.close();
  if (fixtureCreated) {
    await query(`delete from auth.users where id = '${owner}';`);
    assert.equal(await query(`select count(*) from public.rag_chat_sessions where user_id = '${owner}';`), "0");
  }
}
