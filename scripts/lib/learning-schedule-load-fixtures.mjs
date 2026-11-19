import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { pool } from "./learning-schedule-load-metrics.mjs";

export const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
export const psql = [
  "exec",
  "-i",
  "supabase_db_lumivox-proj",
  "psql",
  "-X",
  "-qAt",
  "-v",
  "ON_ERROR_STOP=1",
  "-U",
  "postgres",
  "-d",
  "postgres",
];
export const sql = (query) =>
  execFileSync("docker", psql, {
    input: query,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  }).trim();
export const json = (query) => JSON.parse(sql(query));

export function verifyEmpty() {
  const state = sql(`SELECT (SELECT count(*) FROM auth.users),(SELECT count(*) FROM public.tasks),
    (SELECT count(*) FROM public.study_notification_jobs),(SELECT count(*) FROM public.focus_sessions),
    (SELECT count(*) FROM public.study_notification_webhook_receipts),
    (SELECT enabled FROM public.study_notification_dispatch_control),(SELECT enabled FROM public.ls_missed_sweep_control),
    (SELECT count(*) FROM cron.job WHERE jobname ILIKE '%remind%' OR jobname ILIKE '%notification%')`);
  assert.equal(state, "0|0|0|0|0|f|f|0", "Disposable local DB must be empty with gates OFF");
  return state;
}

export async function seedProfile(admin, profile, users) {
  const password = randomUUID();
  await pool(
    Array.from({ length: profile.users }, (_, i) => i),
    10,
    async (index) => {
      const email = `load-${randomUUID()}@example.invalid`;
      const result = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      assert.ifError(result.error);
      users[index] = { id: result.data.user.id, email, password };
    },
  );
  const other = Math.floor((profile.sessions - profile.history - 12) / (users.length - 2));
  const remainder = profile.sessions - profile.history - 12 - other * (users.length - 2);
  const lengths = users.map((_, i) =>
    i === 0 ? profile.history : i === 1 ? 12 : other + (i === 2 ? remainder : 0),
  );
  assert.equal(
    lengths.reduce((a, b) => a + b, 0),
    profile.sessions,
  );
  sql(`BEGIN;
    CREATE TEMP TABLE owners (uid uuid, n int, persona int);
    INSERT INTO owners VALUES ${users.map((u, i) => `(${q(u.id)},${lengths[i]},${i})`).join(",")};
    INSERT INTO public.profiles(id,onboarding_completed) SELECT uid,true FROM owners
      ON CONFLICT(id) DO UPDATE SET onboarding_completed=true;
    CREATE TEMP TABLE plans AS
      SELECT uid,persona,gen_random_uuid() task,gen_random_uuid() schedule,k,
        LEAST(50,n-k*50) days,(now() AT TIME ZONE 'UTC')::date last_day
      FROM owners CROSS JOIN LATERAL generate_series(0,(n-1)/50) k;
    INSERT INTO public.tasks(id,user_id,title,status)
      SELECT task,uid,'Load Task '||persona||'-'||k,'todo' FROM plans;
    INSERT INTO public.task_study_schedules(id,user_id,task_id,starts_on,ends_on,timezone)
      SELECT schedule,uid,task,last_day-days+1,last_day,'UTC' FROM plans;
    INSERT INTO public.task_study_schedule_slots(user_id,schedule_id,weekday,start_time,end_time)
      SELECT uid,schedule,d,time '10:00',time '11:00' FROM plans CROSS JOIN generate_series(1,7) d;
    INSERT INTO public.task_study_schedule_revisions(user_id,schedule_id,revision,starts_on,ends_on,timezone,slots_snapshot)
      SELECT uid,schedule,1,last_day-days+1,last_day,'UTC',
        (SELECT jsonb_agg(jsonb_build_object('weekday', d,'startTime','10:00','endTime','11:00')) FROM generate_series(1,7) d) FROM plans;
    INSERT INTO public.task_study_sessions(user_id,task_id,schedule_id,schedule_revision,source_slot_id,logical_occurrence_key,
      local_date,local_start_time,local_end_time,timezone,scheduled_start_at,scheduled_end_at,status,completed_at,cancellation_reason)
    SELECT p.uid,p.task,p.schedule,1,slot.id,(p.last_day-g)::text,p.last_day-g,time '10:00',time '11:00','UTC',
      ((p.last_day-g)+time '10:00') AT TIME ZONE 'UTC',((p.last_day-g)+time '11:00') AT TIME ZONE 'UTC',
      CASE WHEN g=0 THEN 'scheduled' WHEN g%7=0 THEN 'cancelled' WHEN g%3=0 THEN 'completed' ELSE 'missed' END,
      CASE WHEN g>0 AND g%7<>0 AND g%3=0 THEN ((p.last_day-g)+time '10:30') AT TIME ZONE 'UTC' END,
      CASE WHEN g>0 AND g%7=0 THEN 'schedule_changed' END
    FROM plans p CROSS JOIN LATERAL generate_series(0,p.days-1) g
    JOIN public.task_study_schedule_slots slot ON slot.schedule_id=p.schedule AND slot.weekday=extract(isodow FROM p.last_day-g);
    INSERT INTO public.task_study_session_events(user_id,session_id,event_type,from_status,to_status,event_key,created_at)
      SELECT s.user_id,s.id,s.status,'scheduled',s.status,'load:'||s.id,
        coalesce(s.completed_at,s.scheduled_start_at-interval '1 hour')
      FROM public.task_study_sessions s WHERE s.status IN ('completed','cancelled');
    WITH target AS (
      SELECT s.id,s.user_id,s.task_id FROM public.task_study_sessions s JOIN plans p ON s.task_id=p.task
      WHERE p.persona=0 AND p.k=0 AND s.local_date=p.last_day
    ), focus AS (
      INSERT INTO public.focus_sessions(user_id,task_id,planned_minutes,status,started_at,ended_at,actual_focus_minutes)
      SELECT user_id,task_id,5,'completed',now()-interval '1 hour',now()-interval '30 minutes',1
      FROM target CROSS JOIN generate_series(1,201) RETURNING id,user_id,task_id
    )
    INSERT INTO public.task_study_focus_attributions(user_id,task_id,study_session_id,focus_session_id)
      SELECT f.user_id,f.task_id,t.id,f.id FROM focus f JOIN target t USING(user_id,task_id);
    COMMIT;
    ANALYZE public.task_study_sessions; ANALYZE public.task_study_session_events;
    ANALYZE public.task_study_focus_attributions; ANALYZE public.focus_sessions;`);
  return lengths;
}

/** A single valid Study occurrence with a server-clock-relative UTC instant. */
export function timedFixture(uid, offset = -5, reuse) {
  const task = reuse?.task ?? randomUUID(),
    schedule = reuse?.schedule ?? randomUUID(),
    study = randomUUID();
  return json(`DO $fixture$ DECLARE
    st timestamptz:=date_trunc('minute',clock_timestamp())+make_interval(mins=>${offset});
    z text; d date;
  BEGIN
    z:=CASE WHEN extract(hour FROM st AT TIME ZONE 'UTC') BETWEEN 2 AND 20 THEN 'UTC' ELSE 'Etc/GMT+12' END;
    d:=(st AT TIME ZONE z)::date;
    ${
      reuse
        ? ""
        : `INSERT INTO public.tasks(id,user_id,title,status) VALUES(${q(task)},${q(uid)},'Load workload task','todo');
    INSERT INTO public.task_study_schedules(id,user_id,task_id,starts_on,ends_on,timezone)
      VALUES(${q(schedule)},${q(uid)},${q(task)},d,d,z);`
    }
    INSERT INTO public.task_study_sessions(id,user_id,task_id,schedule_id,schedule_revision,logical_occurrence_key,
      local_date,local_start_time,local_end_time,timezone,scheduled_start_at,scheduled_end_at)
    VALUES(${q(study)},${q(uid)},${q(task)},${q(schedule)},1,${q(study)},d,(st AT TIME ZONE z)::time,
      ((st+interval '25 minutes') AT TIME ZONE z)::time,z,st,st+interval '25 minutes');
  END $fixture$;
  SELECT to_jsonb(s)||jsonb_build_object('task',task_id,'schedule',schedule_id) FROM public.task_study_sessions s WHERE id=${q(study)};`);
}

export function seedQueue(users) {
  const fixtures = Array.from({ length: 100 }, (_, i) => ({
    owner: users[i % 10].id,
    task: randomUUID(),
    schedule: randomUUID(),
    study: randomUUID(),
    job: randomUUID(),
  }));
  sql(`BEGIN;
    CREATE TEMP TABLE jobs(uid uuid,task uuid,schedule uuid,study uuid,job uuid,st timestamptz,zone text,day date);
    INSERT INTO jobs(uid,task,schedule,study,job,st) VALUES
      ${fixtures.map((f) => `(${[f.owner, f.task, f.schedule, f.study, f.job].map(q).join(",")},date_trunc('minute',now())+interval '5 minutes')`).join(",")};
    UPDATE jobs SET zone=CASE WHEN extract(hour FROM st AT TIME ZONE 'UTC') BETWEEN 2 AND 20 THEN 'UTC' ELSE 'Etc/GMT+12' END;
    UPDATE jobs SET day=(st AT TIME ZONE zone)::date;
    INSERT INTO public.study_notification_preferences(user_id,study_email_enabled,consented_at,reminder_locale,locale_confirmed_at)
      SELECT DISTINCT uid,true,now(),'en',now() FROM jobs;
    INSERT INTO public.tasks(id,user_id,title,status) SELECT task,uid,'Load queue fixture','todo' FROM jobs;
    INSERT INTO public.task_study_schedules(id,user_id,task_id,starts_on,ends_on,timezone)
      SELECT schedule,uid,task,day,day,zone FROM jobs;
    INSERT INTO public.task_study_sessions(id,user_id,task_id,schedule_id,schedule_revision,logical_occurrence_key,
      local_date,local_start_time,local_end_time,timezone,scheduled_start_at,scheduled_end_at)
      SELECT study,uid,task,schedule,1,study::text,day,(st AT TIME ZONE zone)::time,
      ((st+interval '25 minutes') AT TIME ZONE zone)::time,zone,st,st+interval '25 minutes' FROM jobs;
    INSERT INTO public.study_notification_jobs(id,user_id,session_id,schedule_revision,due_at,next_attempt_at,idempotency_key,lifecycle_fingerprint)
      SELECT j.job,j.uid,j.study,1,p.due_at,p.due_at,j.job::text,p.fingerprint
      FROM jobs j CROSS JOIN LATERAL public.ls_notification_session_policy(j.study) p;
    UPDATE public.study_notification_dispatch_control SET enabled=true;
    COMMIT;`);
  return fixtures;
}
