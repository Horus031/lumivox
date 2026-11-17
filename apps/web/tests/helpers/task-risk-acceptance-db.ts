import { execFileSync } from "node:child_process";

const stagingProject = "atbdbbamqjmfkvahqidj";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const loopback = new Set(["127.0.0.1", "localhost", "[::1]"]);

// All interpolated values pass through this function, including labels.
export function sqlValue(value: string) {
  return `convert_from(decode('${Buffer.from(value).toString("hex")}','hex'),'UTF8')`;
}

export function requireSetting(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} for the opt-in Task Risk acceptance run.`);
  return value;
}

export function acceptanceConfig(baseURL: string | undefined) {
  const target = requireSetting("TASK_RISK_ACCEPTANCE_TARGET");
  if (!["staging", "qa", "rehearsal"].includes(target)) throw new Error("Unsupported acceptance target");
  const app = new URL(requireSetting("TASK_RISK_ACCEPTANCE_ORIGIN"));
  const cli = process.env.TASK_RISK_ACCEPTANCE_SUPABASE_CLI;
  const db = cli ? null : new URL(requireSetting("TASK_RISK_ACCEPTANCE_DATABASE_URL"));
  const project = requireSetting("TASK_RISK_ACCEPTANCE_PROJECT_REF");
  const api = new URL(requireSetting("TASK_RISK_ACCEPTANCE_SUPABASE_ORIGIN"));
  const actor = requireSetting("TASK_RISK_ACCEPTANCE_USER_ID");
  const email = requireSetting("TASK_RISK_ACCEPTANCE_EMAIL");
  const revision = requireSetting("TASK_RISK_ACCEPTANCE_REVISION");
  if (!uuidPattern.test(actor) || !/^[a-f0-9]{40}$/.test(revision)) throw new Error("Invalid fixture identity or revision");
  if (app.origin !== baseURL || app.href !== app.origin + "/" || api.href !== api.origin + "/") {
    throw new Error("Acceptance requires exact app and Supabase origins and a matching PLAYWRIGHT_BASE_URL");
  }
  if (db && (!["postgresql:", "postgres:"].includes(db.protocol) || db.pathname !== "/postgres" || db.hash || !db.password)) {
    throw new Error("Expected a PostgreSQL connection URL for the isolated target");
  }
  if (target === "rehearsal") {
    if (!db || ![app, db, api].every((url) => loopback.has(url.hostname))) throw new Error("Rehearsals require loopback");
  } else {
    const identityMatches = db ? db.hostname === `db.${project}.supabase.co` ||
      (db.hostname.endsWith(".pooler.supabase.com") && decodeURIComponent(db.username).endsWith(`.${project}`))
      : target === "staging" && project === stagingProject;
    if (!/^[a-z]{20}$/.test(project) || !identityMatches || api.origin !== `https://${project}.supabase.co` || app.protocol !== "https:") {
      throw new Error("Hosted database and Supabase API must identify the same expected project");
    }
    if ((target === "staging") !== (project === stagingProject)) {
      throw new Error("Staging must use the known staging project. QA must use its own project");
    }
    if (target === "qa") {
      const productionRef = requireSetting("TASK_RISK_ACCEPTANCE_PRODUCTION_PROJECT_REF");
      if (!/^[a-z]{20}$/.test(productionRef) || project === productionRef) {
        throw new Error("QA must be distinct from the confirmed production project");
      }
    }
  }
  if (app.username || app.password || api.username || api.password) throw new Error("Origins must not embed credentials");

  function sql<T>(input: string, mode: "read" | "transaction" = "read"): T {
    let output: string;
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (["PGHOSTADDR", "PGSERVICE", "PGSSLROOTCERT"].includes(key.toUpperCase())) delete env[key];
    }
    try {
      if (cli) {
        const raw = execFileSync(cli, ["db", "query", `--remote=${project}`, mode === "read" ? "--read-only" : "--yes", "-o", "json", input], {
          encoding: "utf8", timeout: 20_000, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
        });
        const result = JSON.parse(raw) as { rows: Record<string, T>[] };
        const row = result.rows[0];
        if (result.rows.length !== 1 || Object.keys(row).length !== 1) throw new Error("Expected one SQL result");
        return Object.values(row)[0];
      }
      if (!db) throw new Error("Postgres connection is missing");
      output = execFileSync(process.env.TASK_RISK_ACCEPTANCE_PSQL || "psql",
        ["-X", "-qAt", "-w", "-v", "ON_ERROR_STOP=1"], {
          input, encoding: "utf8", windowsHide: true, timeout: 15_000,
          env: {
            ...env, PGHOST: db.hostname.replace(/[\[\]]/g, ""),
            PGPORT: db.port || "5432", PGDATABASE: "postgres",
            PGUSER: decodeURIComponent(db.username), PGPASSWORD: decodeURIComponent(db.password),
            PGCONNECT_TIMEOUT: "5", PGOPTIONS: "-c statement_timeout=10000 -c lock_timeout=3000",
            PGSSLMODE: target === "rehearsal" ? "disable" : "verify-full",
            ...(target === "rehearsal" ? {} : { PGSSLROOTCERT: process.env.TASK_RISK_ACCEPTANCE_CA || "system" }),
          },
          stdio: ["pipe", "pipe", "pipe"],
        });
    } catch {
      throw new Error("Acceptance SQL command failed. Check the isolated DB access, permissions and schema.");
    }
    return JSON.parse(output) as T;
  }

  const owner = `${sqlValue(actor)}::uuid`;
  return { target, app, api, actor, owner, email, revision, sql };
}

export type AcceptanceConfig = ReturnType<typeof acceptanceConfig>;

export function validateFixtureAccount(cfg: AcceptanceConfig) {
  const valid = cfg.sql<boolean>(`
    select to_json(exists (
      select 1 from auth.users u join public.profiles p on p.id=u.id
      where u.id=${cfg.owner} and lower(u.email)=lower(${sqlValue(cfg.email)}) and p.onboarding_completed
    )
    and not exists (select 1 from public.tasks where user_id=${cfg.owner})
    and not exists (select 1 from public.focus_sessions where user_id=${cfg.owner}));
  `);
  if (!valid) throw new Error("Expected the dedicated acceptance user with a completed profile and no tasks or Focus sessions");
}

export function validateNativeRegistry(cfg: AcceptanceConfig) {
  if (!cfg.sql<boolean>(`
    select to_json(exists(
      select 1 from public.ml_model_versions where is_active
        and model_key='native_task_delay_risk_classifier' and algorithm='logistic_regression_balanced'
    ));
  `)) throw new Error("The target has no active Native Task Risk model registry entry.");
}

export function makeFixture(cfg: AcceptanceConfig, id: string, action: string, label: string) {
  const task = `${sqlValue(id)}::uuid`;
  return cfg.sql<{ due: string; model: string; fixture_prediction: string }>(`
    begin;
    do $fixture$
    begin
      perform pg_advisory_xact_lock(hashtextextended('phase7-acceptance:' || (${cfg.owner})::text,0));
      if exists (select 1 from public.tasks where user_id=${cfg.owner})
        or exists (select 1 from public.focus_sessions where user_id=${cfg.owner}) then
        raise exception 'Dedicated fixture account is already in use';
      end if;
    end
    $fixture$;
    insert into public.tasks(id,user_id,title,due_at,estimated_minutes)
    values(${task},${cfg.owner},'Task Risk Phase 7 acceptance',clock_timestamp()+interval '2 days',60);
    with fixture as (
      insert into public.deadline_risk_predictions(
        user_id,task_id,model_version_id,input_mode,risk_probability,predicted_label,feature_payload,prediction_metadata
      )
      select t.user_id,t.id,m.id,'lumivox_native_features',0.76,true,'{}',jsonb_build_object(
        'phase7_fixture',true,'prediction_mode','native_ml','feature_schema_version','native-task-risk-v2',
        'input_revision',r.revision,'due_at',t.due_at,'risk_band','high','risk_score',76,'reason_summaries','[]'::jsonb,
        'recommended_actions',jsonb_build_array(jsonb_build_object('action_id',${sqlValue(action)},
          'action_type',${sqlValue(action)},'label',${sqlValue(label)},'description','Controlled acceptance fixture',
          'priority',1,'payload','{}'::jsonb))
      )
      from public.tasks t
      join public.native_task_risk_input_revisions r on r.user_id=t.user_id
      cross join public.ml_model_versions m
      where t.id=${task} and m.is_active and m.model_key='native_task_delay_risk_classifier'
        and m.algorithm='logistic_regression_balanced'
      returning id,model_version_id,prediction_metadata
    )
    select coalesce((select jsonb_build_object('due',prediction_metadata->>'due_at','model',model_version_id,
      'fixture_prediction',id) from fixture),'null'::jsonb);
    commit;
  `, "transaction");
}

export function cleanFixture(cfg: AcceptanceConfig, id: string) {
  const task = `${sqlValue(id)}::uuid`;
  const residue = cfg.sql<number>(`
    begin;
    create temporary table phase7_prediction_ids on commit drop as
      select id from public.deadline_risk_predictions where task_id=${task} and user_id=${cfg.owner};
    delete from public.focus_sessions where task_id=${task} and user_id=${cfg.owner};
    delete from public.tasks where id=${task} and user_id=${cfg.owner};
    delete from public.deadline_risk_predictions where user_id=${cfg.owner}
      and id in (select id from phase7_prediction_ids);
    select to_json(
      (select count(*) from public.tasks where id=${task} or parent_task_id=${task}) +
      (select count(*) from public.focus_sessions where task_id=${task}) +
      (select count(*) from public.task_risk_recovery_attempts where task_id=${task}) +
      (select count(*) from task_risk_private.receipts where task_id=${task}) +
      (select count(*) from task_risk_private.reassessments where task_id=${task}) +
      (select count(*) from public.deadline_risk_predictions where id in (select id from phase7_prediction_ids))
    );
    commit;
  `, "transaction");
  if (residue !== 0) throw new Error(`Fixture cleanup incomplete for Task ${id}`);
}
