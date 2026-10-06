## Phase 7 — PASS

Mình đã verify lại cả source, CI và production database. Phase này pass sạch.

`main` hiện ở commit `b35b5d1f…`, `product-release` ở `b9366198…`, và cả hai cùng tree SHA `7cf4880b…`. Commit triển khai Phase 7 là `9ecae229…` với đúng scope analytics: PBI, mastery aggregation, Weekly Reflection, UI/i18n, unit tests và migration index.

CI trên `main` đều xanh: Web lint/unit/build, AI API unit tests, Supabase migration replay và Production Database/Services đều `success`. `product-release` cũng xanh ở Web, AI API, migration replay và preview.

Code semantics cũng đúng. PBI vẫn giữ weights `30/25/25/10/10`, đổi version thành `v1.1-root-task-rolling-7-day`, đồng thời root-task filtering loại subtasks và cancelled tasks. `review_mastery_analytics.py` chỉ nhận `passed`/`failed`, tách `review_attempts` khỏi `reviewed_tasks`, aggregate weak areas bằng `casefold()` và không đưa review score vào PBI.

Weekly Reflection đã lên `weekly-reflection-v2`; mastery trend chỉ được directional khi sample đủ, một Task retry nhiều lần không bị coi là nhiều Task, weak areas là neutral evidence, và UI giữ các mastery fields optional nên reflection cũ vẫn render được. EN/VI đều có mastery section.

Migration `20261006031805_add_review_mastery_analytics_index` đã nằm trên production và index thật sự tồn tại:

```text
idx_task_review_attempts_user_completed
(user_id, completed_at DESC)
WHERE status IN ('passed', 'failed')
```

Có một chi tiết production bạn không cần sửa: hiện các row cũ vẫn chỉ có `v1.0-rolling-7-day` và `weekly-reflection-v1`. Điều này bình thường vì sau deploy chưa có snapshot/reflection mới được generate. Lần generate kế tiếp mới bắt đầu xuất hiện `v1.1-root-task-rolling-7-day` và `weekly-reflection-v2`.

Ngoài ra mình đã verify ba RPC Review quan trọng hiện đều là `SECURITY INVOKER`, `anon/authenticated` không execute được và `service_role` mới execute được.

---

# Phase 8 — Reliability, Idempotency, Security & Audit

Đây là phase hardening. Từ đây không thêm workflow/product feature lớn nữa.

Hiện kiến trúc đã có nhiều lớp bảo vệ tốt, nhưng có ba failure mode đáng xử lý trước production maturity:

```text
Generate Review
_check_active_attempt()
      ↓
_next_attempt_number()
      ↓
insert attempt
```

Ba thao tác này chưa atomic. Hai request đồng thời có thể cùng vượt `_check_active_attempt()` rồi một request đập unique constraint và thành `500`.

Tương tự:

```text
submit
 ↓
DB commit thành công
 ↓
network response bị mất
 ↓
client retry
 ↓
attempt không còn ready
 ↓
409
```

Về dữ liệu thì đúng, nhưng về retry semantics chưa idempotent.

Cuối cùng, nếu AI worker chết sau khi tạo:

```text
status = generating
```

nhưng trước `_mark_generation_failed()`, unique active-attempt sẽ khiến Task bị khóa khỏi Review mãi cho đến khi can thiệp thủ công.

Đó là ba vấn đề chính của Phase 8.

---

## 8.1 Branch

```bash
git checkout product-release
git pull origin product-release

git checkout -b feat/workspace-phase-8-reliability-security
```

Mình khuyên Phase 8 làm trong cùng branch nhưng chia thành 3 commits:

```text
1. db: atomic + idempotent review lifecycle
2. api: timeout/retry/rate-limit/security hardening
3. tests: concurrency/audit/security gates
```

---

# 8.2 Migration

Tạo migration bằng CLI, không tự đặt timestamp:

```bash
npx supabase migration new harden_task_review_workflow
```

Phase này thêm hai field:

```text
generation_request_id
submission_fingerprint
```

và một audit table:

```text
task_status_events
```

Schema đầu migration:

```sql
begin;

alter table public.task_review_attempts
add column if not exists generation_request_id uuid;

alter table public.task_review_attempts
add column if not exists submission_fingerprint text;


create unique index if not exists
idx_task_review_attempts_generation_request
on public.task_review_attempts(
  user_id,
  task_id,
  generation_request_id
)
where generation_request_id is not null;


alter table public.task_review_attempts
drop constraint if exists
task_review_submission_fingerprint_format;

alter table public.task_review_attempts
add constraint task_review_submission_fingerprint_format
check (
  submission_fingerprint is null
  or submission_fingerprint ~ '^[0-9a-f]{64}$'
);
```

`generation_request_id` không `NOT NULL` vì attempts của Phase 5–7 chưa có field này.

---

# 8.3 Atomic begin-generation RPC

Phần quan trọng nhất của Phase 8 là đưa:

```text
active-attempt check
+
stale recovery
+
attempt number
+
attempt creation
```

vào **một Postgres transaction + task row lock**.

Thêm vào migration:

```sql
create or replace function public.begin_task_review_generation(
  p_user_id uuid,
  p_task_id uuid,
  p_expected_status public.task_status,
  p_expected_updated_at timestamptz,
  p_generation_request_id uuid,
  p_pass_threshold numeric,
  p_task_snapshot jsonb,
  p_source_snapshot jsonb,
  p_stale_after_seconds integer default 900
)
returns table (
  attempt_id uuid,
  attempt_number integer,
  attempt_status public.task_review_attempt_status,
  reused boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_task_status public.task_status;
  v_task_updated_at timestamptz;

  v_existing public.task_review_attempts%rowtype;

  v_next_attempt_number integer;
  v_attempt_id uuid;
begin
  if p_generation_request_id is null then
    raise exception
      'Generation request id is required.';
  end if;

  if p_pass_threshold < 50
    or p_pass_threshold > 100
  then
    raise exception
      'Review pass threshold must be between 50 and 100.';
  end if;

  if p_stale_after_seconds < 60
    or p_stale_after_seconds > 3600
  then
    raise exception
      'Invalid stale generation window.';
  end if;


  -- Serialize review lifecycle changes for this Task.
  select
    task.status,
    task.updated_at
  into
    v_task_status,
    v_task_updated_at
  from public.tasks task
  where task.id = p_task_id
    and task.user_id = p_user_id
    and task.parent_task_id is null
  for update;

  if not found then
    raise exception
      'Review requires an owned root task.';
  end if;


  -- Recover a worker/process that died after reserving an
  -- attempt but before finishing generation.
  update public.task_review_attempts attempt
  set
    status = 'generation_failed',
    generation_error =
      'AI Review generation did not finish. Please try again.'
  where attempt.user_id = p_user_id
    and attempt.task_id = p_task_id
    and attempt.status = 'generating'
    and attempt.created_at <
      now()
      - make_interval(
          secs => p_stale_after_seconds
        );


  -- Exact infrastructure retry.
  select attempt.*
  into v_existing
  from public.task_review_attempts attempt
  where attempt.user_id = p_user_id
    and attempt.task_id = p_task_id
    and attempt.generation_request_id =
      p_generation_request_id
  limit 1;

  if found then
    return query
    select
      v_existing.id,
      v_existing.attempt_number,
      v_existing.status,
      true;

    return;
  end if;


  if p_expected_status not in (
    'in_progress'::public.task_status,
    'overdue'::public.task_status
  ) then
    raise exception
      'Task must be active before review.';
  end if;


  if v_task_status <> p_expected_status
    or v_task_updated_at <> p_expected_updated_at
  then
    raise exception
      'Task changed before review generation started.';
  end if;


  if exists (
    select 1
    from public.tasks child
    where child.parent_task_id = p_task_id
      and child.user_id = p_user_id
      and child.status not in (
        'completed'::public.task_status,
        'cancelled'::public.task_status
      )
  ) then
    raise exception
      'All active subtasks must be resolved before review.';
  end if;


  -- Different retry/request while another valid generation
  -- is already running: return that attempt rather than 500.
  select attempt.*
  into v_existing
  from public.task_review_attempts attempt
  where attempt.user_id = p_user_id
    and attempt.task_id = p_task_id
    and attempt.status in (
      'generating',
      'ready'
    )
  order by attempt.attempt_number desc
  limit 1;

  if found then
    return query
    select
      v_existing.id,
      v_existing.attempt_number,
      v_existing.status,
      true;

    return;
  end if;


  select
    coalesce(
      max(attempt.attempt_number),
      0
    ) + 1
  into v_next_attempt_number
  from public.task_review_attempts attempt
  where attempt.task_id = p_task_id;


  insert into public.task_review_attempts (
    user_id,
    task_id,
    attempt_number,
    status,
    pass_threshold,
    task_snapshot,
    source_snapshot,
    generation_request_id
  )
  values (
    p_user_id,
    p_task_id,
    v_next_attempt_number,
    'generating',
    p_pass_threshold,
    p_task_snapshot,
    p_source_snapshot,
    p_generation_request_id
  )
  returning id
  into v_attempt_id;


  return query
  select
    v_attempt_id,
    v_next_attempt_number,
    'generating'::public.task_review_attempt_status,
    false;
end;
$$;


revoke all
on function public.begin_task_review_generation(
  uuid,
  uuid,
  public.task_status,
  timestamptz,
  uuid,
  numeric,
  jsonb,
  jsonb,
  integer
)
from public, anon, authenticated;


grant execute
on function public.begin_task_review_generation(
  uuid,
  uuid,
  public.task_status,
  timestamptz,
  uuid,
  numeric,
  jsonb,
  jsonb,
  integer
)
to service_role;
```

Sau thay đổi này:

```text
Request A
   ↓
lock Task
   ↓
create attempt #1
   ↓
unlock
   ↓
LLM

Request B
   ↓
lock Task
   ↓
find attempt #1
   ↓
return attempt #1
```

Không còn race ở `_next_attempt_number()`.

---

# 8.4 Idempotent Review submission

Không nên sửa signature RPC Phase 6 trực tiếp vì lúc deploy rolling, AI service cũ có thể vẫn đang gọi RPC cũ.

Tạo **V2**:

```text
finalize_task_review_submission_v2
```

và giữ V1 đến Phase 9 cleanup.

Thêm:

```sql
create or replace function public.finalize_task_review_submission_v2(
  p_attempt_id uuid,
  p_user_id uuid,
  p_task_id uuid,
  p_score numeric,
  p_feedback_payload jsonb,
  p_weak_areas jsonb,
  p_submission_fingerprint text
)
returns table (
  attempt_id uuid,
  attempt_status public.task_review_attempt_status,
  score numeric,
  pass_threshold numeric,
  task_status public.task_status,
  task_updated_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_threshold numeric;

  v_existing_status
    public.task_review_attempt_status;

  v_existing_score numeric;

  v_existing_fingerprint text;

  v_attempt_status
    public.task_review_attempt_status;

  v_task_status public.task_status;
  v_task_updated_at timestamptz;

  v_affected integer;
begin
  if p_score < 0
    or p_score > 100
  then
    raise exception
      'Review score must be between 0 and 100.';
  end if;

  if p_submission_fingerprint
    !~ '^[0-9a-f]{64}$'
  then
    raise exception
      'Invalid submission fingerprint.';
  end if;

  if jsonb_typeof(
    p_feedback_payload
  ) <> 'object'
  then
    raise exception
      'Feedback payload must be an object.';
  end if;

  if jsonb_typeof(
    p_weak_areas
  ) <> 'array'
  then
    raise exception
      'Weak areas must be an array.';
  end if;


  select
    attempt.status,
    attempt.pass_threshold,
    attempt.score,
    attempt.submission_fingerprint
  into
    v_existing_status,
    v_threshold,
    v_existing_score,
    v_existing_fingerprint
  from public.task_review_attempts attempt
  where attempt.id = p_attempt_id
    and attempt.user_id = p_user_id
    and attempt.task_id = p_task_id
  for update;


  if not found then
    raise exception
      'Review attempt was not found.';
  end if;


  -- Response-loss / network retry.
  if v_existing_status in (
    'passed',
    'failed'
  ) then
    if v_existing_fingerprint
      is distinct from
      p_submission_fingerprint
    then
      raise exception
        'Review was already submitted with a different answer payload.';
    end if;


    select
      task.status,
      task.updated_at
    into
      v_task_status,
      v_task_updated_at
    from public.tasks task
    where task.id = p_task_id
      and task.user_id = p_user_id;


    if not found then
      raise exception
        'Task no longer exists.';
    end if;


    return query
    select
      p_attempt_id,
      v_existing_status,
      v_existing_score,
      v_threshold,
      v_task_status,
      v_task_updated_at;

    return;
  end if;


  if v_existing_status <> 'ready' then
    raise exception
      'Review attempt is not ready for submission.';
  end if;


  if not exists (
    select 1
    from public.task_review_answer_keys answer_key
    where answer_key.attempt_id =
      p_attempt_id
      and answer_key.user_id =
        p_user_id
  ) then
    raise exception
      'Review answer key is missing.';
  end if;


  if not exists (
    select 1
    from public.tasks task
    where task.id = p_task_id
      and task.user_id = p_user_id
      and task.parent_task_id is null
      and task.status = 'in_review'
  ) then
    raise exception
      'Task is no longer in review.';
  end if;


  if p_score >= v_threshold then
    v_attempt_status =
      'passed';

    v_task_status =
      'completed';
  else
    v_attempt_status =
      'failed';

    v_task_status =
      'in_progress';
  end if;


  update public.task_review_attempts
  set
    status =
      v_attempt_status,

    score =
      p_score,

    feedback_payload =
      p_feedback_payload,

    weak_areas =
      p_weak_areas,

    submission_fingerprint =
      p_submission_fingerprint,

    submitted_at =
      now(),

    completed_at =
      now()
  where id = p_attempt_id
    and user_id = p_user_id
    and task_id = p_task_id
    and status = 'ready';


  get diagnostics
    v_affected = row_count;


  if v_affected <> 1 then
    raise exception
      'Review attempt changed before submission completed.';
  end if;


  update public.tasks
  set
    status =
      v_task_status,

    completed_at =
      case
        when v_attempt_status =
          'passed'
        then now()
        else null
      end
  where id = p_task_id
    and user_id = p_user_id
    and parent_task_id is null
    and status = 'in_review'
  returning updated_at
  into v_task_updated_at;


  if v_task_updated_at is null then
    raise exception
      'Task changed before review submission completed.';
  end if;


  return query
  select
    p_attempt_id,
    v_attempt_status,
    p_score,
    v_threshold,
    v_task_status,
    v_task_updated_at;
end;
$$;


revoke all
on function public.finalize_task_review_submission_v2(
  uuid,
  uuid,
  uuid,
  numeric,
  jsonb,
  jsonb,
  text
)
from public, anon, authenticated;


grant execute
on function public.finalize_task_review_submission_v2(
  uuid,
  uuid,
  uuid,
  numeric,
  jsonb,
  jsonb,
  text
)
to service_role;
```

---

# 8.5 Status audit trail

Tạo table:

```sql
create table if not exists public.task_status_events (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references public.profiles(id)
    on delete cascade,

  task_id uuid not null
    references public.tasks(id)
    on delete cascade,

  review_attempt_id uuid
    references public.task_review_attempts(id)
    on delete set null,

  from_status public.task_status not null,
  to_status public.task_status not null,

  source text not null,

  actor_role text not null,

  occurred_at timestamptz
    not null default now()
);


create index if not exists
idx_task_status_events_task_time
on public.task_status_events(
  task_id,
  occurred_at desc
);


create index if not exists
idx_task_status_events_user_time
on public.task_status_events(
  user_id,
  occurred_at desc
);


alter table public.task_status_events
enable row level security;


create policy
"Clients cannot access task status audit events"
on public.task_status_events
for all
to authenticated
using (false)
with check (false);


revoke all
on public.task_status_events
from anon, authenticated;


grant select
on public.task_status_events
to service_role;
```

Audit insert nên đi qua private trigger, không cho browser tự forge events.

```sql
create schema if not exists private;

revoke all
on schema private
from public, anon, authenticated;


create or replace function private.record_task_status_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source text;
  v_attempt_id uuid;
begin
  v_source :=
    case
      when current_user = 'authenticated'
        then 'user_action'

      when
        old.status <> 'in_review'
        and new.status = 'in_review'
        then 'review_generation'

      when
        old.status = 'in_review'
        and new.status = 'completed'
        then 'review_pass'

      when
        old.status = 'in_review'
        and new.status = 'in_progress'
        then 'review_fail'

      else 'service_action'
    end;


  if new.status = 'in_review' then
    select attempt.id
    into v_attempt_id
    from public.task_review_attempts attempt
    where attempt.task_id = new.id
      and attempt.user_id = new.user_id
      and attempt.status = 'ready'
    order by attempt.attempt_number desc
    limit 1;

  elsif old.status = 'in_review' then
    select attempt.id
    into v_attempt_id
    from public.task_review_attempts attempt
    where attempt.task_id = new.id
      and attempt.user_id = new.user_id
      and attempt.status in (
        'passed',
        'failed'
      )
    order by attempt.attempt_number desc
    limit 1;
  end if;


  insert into public.task_status_events (
    user_id,
    task_id,
    review_attempt_id,
    from_status,
    to_status,
    source,
    actor_role
  )
  values (
    new.user_id,
    new.id,
    v_attempt_id,
    old.status,
    new.status,
    v_source,
    current_user
  );


  return new;
end;
$$;


revoke all
on function private.record_task_status_event()
from public, anon, authenticated;


drop trigger if exists
trg_record_task_status_event
on public.tasks;


create trigger trg_record_task_status_event
after update of status
on public.tasks
for each row
when (
  old.status is distinct from new.status
)
execute function
private.record_task_status_event();
```

Sau đó:

```sql
commit;
```

Ở Phase 8 chúng ta tạo explicit grants ngay từ migration. Điều này càng quan trọng vì Supabase đã thông báo từ **30/10/2026** tất cả existing projects sẽ áp dụng behavior mới: table mới trong `public` không còn tự động được expose qua Data API; grants và RLS là hai lớp riêng. [Supabase](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)

---

# 8.6 Generate flow trong AI API

Trong:

```text
services/ai-api/app/schemas/task_review.py
```

thêm vào `GenerateTaskReviewRequest`:

```python
request_id: UUID
```

Trong:

```text
services/ai-api/app/core/config.py
```

thêm:

```python
review_generation_stale_seconds: int = 900
```

và `.env.example`:

```env
REVIEW_GENERATION_STALE_SECONDS=900
```

Trong `task_review_service.py`, remove usage của:

```text
_check_active_attempt()
_next_attempt_number()
_create_attempt()
```

và tạo helper:

```python
def _begin_generation_attempt(
    supabase: Any,
    *,
    user_id: str,
    task_id: str,
    request_id: str,
    expected_status: str,
    expected_updated_at: datetime,
    pass_threshold: int,
    task_snapshot: dict[str, Any],
    source_snapshot: dict[str, Any],
) -> dict[str, Any]:
    response = (
        supabase
        .rpc(
            "begin_task_review_generation",
            {
                "p_user_id":
                    user_id,

                "p_task_id":
                    task_id,

                "p_expected_status":
                    expected_status,

                "p_expected_updated_at":
                    expected_updated_at
                    .isoformat(),

                "p_generation_request_id":
                    request_id,

                "p_pass_threshold":
                    pass_threshold,

                "p_task_snapshot":
                    task_snapshot,

                "p_source_snapshot":
                    source_snapshot,

                "p_stale_after_seconds":
                    settings
                    .review_generation_stale_seconds,
            },
        )
        .execute()
    )

    if not response.data:
        raise RuntimeError(
            "Review generation reservation "
            "returned no result."
        )

    return response.data[0]
```

Trong `generate_task_review()` sau khi build preliminary snapshot:

```python
reservation = (
    _begin_generation_attempt(
        supabase,
        user_id=user_id,
        task_id=task_id,
        request_id=str(
            payload.request_id
        ),
        expected_status=(
            payload.expected_status
        ),
        expected_updated_at=(
            payload.expected_updated_at
        ),
        pass_threshold=(
            payload.pass_threshold
        ),
        task_snapshot=(
            task_snapshot
        ),
        source_snapshot=(
            preliminary_source_snapshot
        ),
    )
)

attempt_id = str(
    reservation[
        "attempt_id"
    ]
)

if reservation["reused"]:
    return _load_attempt(
        supabase,
        user_id=user_id,
        attempt_id=attempt_id,
    )
```

Sau đó mới chạy retrieval + LLM như hiện tại.

---

# 8.7 Submission fingerprint

Trong `task_review_service.py` thêm imports:

```python
import hashlib
import json
```

Thêm helper:

```python
def _submission_fingerprint(
    answers: list[
        TaskReviewAnswerSubmission
    ],
) -> str:
    normalized = [
        {
            "question_id":
                answer.question_id,

            "selected_option_indices":
                sorted(
                    answer
                    .selected_option_indices
                ),
        }
        for answer
        in sorted(
            answers,
            key=lambda item:
                item.question_id,
        )
    ]

    payload = json.dumps(
        normalized,
        ensure_ascii=False,
        sort_keys=True,
        separators=(
            ",",
            ":",
        ),
    )

    return hashlib.sha256(
        payload.encode(
            "utf-8"
        )
    ).hexdigest()
```

Trong `submit_task_review()` tính fingerprint ngay sau khi load attempt:

```python
submission_fingerprint = (
    _submission_fingerprint(
        payload.answers
    )
)
```

Nếu attempt đã final:

```python
if attempt["status"] in {
    "passed",
    "failed",
}:
    if (
        attempt.get(
            "submission_fingerprint"
        )
        == submission_fingerprint
    ):
        return _attempt_response(
            attempt
        )

    raise TaskReviewConflictError(
        "This review was already "
        "submitted with different answers."
    )
```

Quan trọng: check này phải chạy **trước**:

```python
task["status"] != "in_review"
```

vì retry hợp lệ sau lần submit đầu tiên thì Task đã là `completed` hoặc `in_progress`.

Sau scoring gọi:

```python
supabase.rpc(
    "finalize_task_review_submission_v2",
    {
        # existing params...

        "p_submission_fingerprint":
            submission_fingerprint,
    },
)
```

---

# 8.8 Không lưu raw provider error cho browser

Hiện:

```python
generation_error = str(error)[:2000]
```

được ghi vào table mà user có quyền `SELECT`.

Phase 8 đổi `_mark_generation_failed()` thành safe public message:

```python
"generation_error": (
    "AI Review generation did not finish "
    "successfully. Please try again."
),
```

Raw exception chỉ log server-side.

Điều này tránh vô tình đưa provider/internal diagnostics ra client.

---

# 8.9 Harden internal API key

Replace toàn bộ:

```text
services/ai-api/app/security/internal_api_key.py
```

bằng:

```python
from secrets import (
    compare_digest,
)

from fastapi import (
    Header,
    HTTPException,
    status,
)

from app.core.config import (
    settings,
)


def verify_internal_api_key(
    x_lumivox_internal_key:
        str | None
        = Header(
            default=None
        ),
) -> None:
    supplied = (
        x_lumivox_internal_key
        or ""
    )

    expected = (
        settings
        .ai_internal_api_key
        or ""
    )

    if (
        not supplied
        or not expected
        or not compare_digest(
            supplied,
            expected,
        )
    ):
        raise HTTPException(
            status_code=(
                status
                .HTTP_401_UNAUTHORIZED
            ),
            detail=(
                "Invalid internal API key."
            ),
        )
```

---

# 8.10 HTTP timeout + safe retry

`fetch-ai-api.ts` hiện không có timeout.

Replace bằng version có timeout, request correlation và **opt-in retry only**:

```ts
import {
  randomUUID,
} from "node:crypto";


type FetchAiApiOptions = {
  path: string;
  body: unknown;

  timeoutMs?: number;
  retries?: number;

  requestId?: string;
};


export class AiApiError extends Error {
  constructor(
    message: string,

    public readonly status:
      number,

    public readonly requestId:
      string,
  ) {
    super(message);

    this.name =
      "AiApiError";
  }
}


const RETRYABLE_STATUSES =
  new Set([
    502,
    503,
    504,
  ]);


function sleep(
  milliseconds: number,
) {
  return new Promise<void>(
    (resolve) => {
      setTimeout(
        resolve,
        milliseconds,
      );
    },
  );
}


async function readErrorDetail(
  response: Response,
) {
  try {
    const body =
      (await response.json()) as {
        detail?: unknown;
      };

    if (
      typeof body.detail
      === "string"
    ) {
      return body.detail;
    }
  } catch {
    // Fall back below.
  }

  return (
    `AI API request failed `
    + `(${response.status}).`
  );
}


export async function fetchAiApi<
  TResponse
>({
  path,
  body,

  timeoutMs = 30_000,
  retries = 0,

  requestId:
    providedRequestId,
}: FetchAiApiOptions): Promise<TResponse> {
  const apiBaseUrl =
    process.env
      .AI_API_BASE_URL;

  const internalKey =
    process.env
      .AI_INTERNAL_API_KEY;

  if (
    !apiBaseUrl
    || !internalKey
  ) {
    throw new Error(
      "AI backend environment variables "
      + "are not configured correctly.",
    );
  }

  const requestId =
    providedRequestId
    ?? randomUUID();

  const attempts =
    Math.max(
      1,
      retries + 1,
    );

  for (
    let attempt = 0;
    attempt < attempts;
    attempt += 1
  ) {
    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () => {
          controller.abort();
        },
        timeoutMs,
      );

    try {
      const response =
        await fetch(
          [
            apiBaseUrl.replace(
              /\/$/,
              "",
            ),
            path,
          ].join(""),
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              "x-lumivox-internal-key":
                internalKey,

              "x-lumivox-request-id":
                requestId,
            },

            body:
              JSON.stringify(
                body,
              ),

            cache:
              "no-store",

            signal:
              controller.signal,
          },
        );

      if (response.ok) {
        return (
          await response.json()
        ) as TResponse;
      }

      const detail =
        await readErrorDetail(
          response,
        );

      const canRetry =
        RETRYABLE_STATUSES.has(
          response.status,
        )
        && attempt + 1
          < attempts;

      if (canRetry) {
        await sleep(
          300
          * (attempt + 1),
        );

        continue;
      }

      throw new AiApiError(
        `${detail} Reference: ${requestId}`,
        response.status,
        requestId,
      );
    } catch (error) {
      if (
        error
        instanceof AiApiError
      ) {
        throw error;
      }

      if (
        attempt + 1
        < attempts
      ) {
        await sleep(
          300
          * (attempt + 1),
        );

        continue;
      }

      if (
        error
        instanceof Error
        && error.name
          === "AbortError"
      ) {
        throw new Error(
          "AI service timed out. "
          + `Reference: ${requestId}`,
        );
      }

      throw new Error(
        "AI service is temporarily "
        + "unavailable. "
        + `Reference: ${requestId}`,
      );
    } finally {
      clearTimeout(
        timeout,
      );
    }
  }

  throw new Error(
    "AI request did not complete."
  );
}
```

Retry vẫn **opt-in**; đừng bật retries cho các API mutation khác khi chúng chưa idempotent.

---

# 8.11 Web Review action

Generation input thêm:

```ts
requestId: z.string().uuid(),
```

và body AI API:

```ts
request_id:
  parsed.data.requestId,
```

Gọi generation:

```ts
const response =
  await fetchAiApi<
    TaskReviewAttempt
  >({
    path:
      "/api/v1/task-reviews/generate",

    requestId:
      parsed.data.requestId,

    timeoutMs:
      35_000,

    retries:
      1,

    body: {
      // existing fields...

      request_id:
        parsed.data.requestId,
    },
  });
```

Tại sao retry này bây giờ an toàn?

```text
first HTTP call
  ↓
attempt reserved
  ↓
network timeout
  ↓
same requestId retried
  ↓
begin RPC finds same attempt
  ↓
returns existing generating attempt
```

không generate quiz lần hai.

Submit:

```ts
await fetchAiApi<TaskReviewAttempt>({
  path:
    "/api/v1/task-reviews/submit",

  timeoutMs:
    15_000,

  retries:
    1,

  body: {
    // current body
  },
});
```

Submit retry an toàn nhờ canonical answer fingerprint.

---

# 8.12 Client polling khi generation bị detached

Trong `TaskReviewPanel`:

```tsx
useEffect(() => {
  if (
    attempt?.status
    !== "generating"
  ) {
    return;
  }

  const interval =
    window.setInterval(
      () => {
        void loadLatest();
      },
      4_000,
    );

  return () => {
    window.clearInterval(
      interval,
    );
  };
}, [
  attempt?.status,
  attempt?.attempt_id,
  loadLatest,
]);
```

Trong `handleGenerate()`:

```tsx
const requestId =
  crypto.randomUUID();

const result =
  await requestTaskReviewAction({
    taskId:
      task.id,

    requestId,

    preferredLocale,

    passThreshold:
      70,
  });
```

Nếu AI trả nhanh, UX giống hiện tại.

Nếu request timeout nhưng backend vẫn chạy, user thấy:

```text
Generating…
```

và panel tự refresh cho tới khi ready/failure.

Nếu process thực sự chết, 15 phút sau request mới sẽ reclaim stale attempt.

---

# 8.13 Production rate limit phải fail closed

Hiện nếu Redis thiếu config:

```text
success: true
```

Điều đó hợp lý cho local dev nhưng không lý tưởng cho endpoint tốn tiền như AI Review.

Mở rộng `RateLimitConfig`:

```ts
mode?:
  | "fail-open"
  | "fail-closed";
```

Nếu Redis không tồn tại hoặc request Redis lỗi:

```ts
if (
  mode
  === "fail-closed"
) {
  return {
    success: false,
    limit,
    remaining: 0,
    reset:
      Date.now() + 5_000,
    message:
      "Request protection is temporarily unavailable. Please try again shortly.",
  };
}
```

Trong Review actions:

```ts
const rateLimitMode =
  process.env.NODE_ENV
  === "production"
    ? "fail-closed"
    : "fail-open";
```

và:

```ts
checkRateLimit({
  key:
    `task-review-generate:${user.id}`,

  limit: 3,

  window:
    "10 m",

  mode:
    rateLimitMode,
});
```

Khi fail:

```ts
message:
  rateLimit.message
  ?? formatRateLimitMessage(
    rateLimit.reset,
  ),
```

Local dev vẫn không bị Redis block.

---

# 8.14 Database audit tests phải vào CI

Hiện CI chỉ chạy:

```text
supabase db reset
```

chứ chưa enforce các file trong:

```text
supabase/tests/
```

Phase 8 sửa `.github/workflows/ci.yml`:

```yaml
- name: Replay migrations from a clean database
  run: supabase db reset

- name: Database tests
  run: supabase test db

- name: Stop local database
  if: always()
  run: supabase stop --no-backup
```

Đây là một thay đổi mình đặc biệt muốn có trước khi đóng Phase 8.

Các SQL tests Phase 5/6/8 sau đó mới thật sự trở thành merge gate thay vì chỉ manual verification.

---

# 8.15 Phase 8 SQL tests

Tạo:

```text
supabase/tests/workspace_phase8.sql
```

Các cases bắt buộc là: gọi `begin_task_review_generation` hai lần với cùng request ID phải trả cùng attempt; request ID khác trong khi attempt đang generating cũng không tạo attempt thứ hai; manually age một generating attempt >15 phút rồi request mới phải chuyển attempt cũ sang `generation_failed` và tạo attempt mới; gọi submission V2 hai lần cùng fingerprint phải success cả hai và chỉ finalize một lần; fingerprint khác sau finalization phải fail; `task_status_events` chỉ có đúng một event cho từng status transition; `authenticated` không execute được begin/finalize RPC và không đọc được audit table/answer keys; `service_role` execute được các RPC.

Sau migration:

```bash
npx supabase db reset
npx supabase test db
```

rồi regenerate:

```bash
npx supabase gen types typescript --local \
  > apps/web/types/database.types.ts
```

---

# 8.16 AI API tests

Trong `test_task_review_service.py` thêm deterministic fingerprint test:

```python
def test_submission_fingerprint_ignores_answer_order():
    first = (
        _submission_fingerprint(
            [
                TaskReviewAnswerSubmission(
                    question_id="q_2",
                    selected_option_indices=[
                        2,
                        0,
                    ],
                ),
                TaskReviewAnswerSubmission(
                    question_id="q_1",
                    selected_option_indices=[
                        1,
                    ],
                ),
            ]
        )
    )

    second = (
        _submission_fingerprint(
            [
                TaskReviewAnswerSubmission(
                    question_id="q_1",
                    selected_option_indices=[
                        1,
                    ],
                ),
                TaskReviewAnswerSubmission(
                    question_id="q_2",
                    selected_option_indices=[
                        0,
                        2,
                    ],
                ),
            ]
        )
    )

    assert first == second
```

Và:

```python
def test_submission_fingerprint_changes_with_answers():
    ...
    assert first != second
```

Thêm unit test cho `compare_digest` internal key.

---

# 8.17 Security Advisor baseline

Mình vừa chạy production advisor. Hiện baseline có:

```text
1 INFO
62 WARN
```

`INFO` là `ml_model_versions` có RLS nhưng chưa policy; 62 WARN chủ yếu là các `SECURITY DEFINER` function cũ callable bởi `authenticated`.

Quan trọng là ba Review RPC chúng ta vừa verify **không nằm trong nhóm đó**.

Không nên mass-revoke 62 functions trong cùng commit mà chưa review authorization semantics từng function; rất dễ làm hỏng Admin CMS, study rooms, leaderboard, v.v.

Trong Phase 8, gate nên là:

```text
no NEW advisor warning introduced
+
Review workflow functions remain
SECURITY INVOKER / service_role-only
```

Sau khi core Phase 8 pass, chúng ta có thể xử lý 62 warnings thành một security-cleanup subphase riêng nếu bạn muốn làm Lumivox thật sạch trước Phase 9.

Supabase hiện cũng đang ở giai đoạn chuyển sang explicit Data API grants, với enforcement trên existing projects ngày 30/10/2026, nên migration mới từ bây giờ nên luôn ghi rõ `GRANT`/`REVOKE` thay vì dựa vào default privilege. [Supabase](https://supabase.com/changelog?types=breaking-change)

---

# 8.18 Không cần bỏ `after()`

`engagement-retention.background.ts` hiện dùng Next.js `after()`.

Mình không khuyên refactor phần đó trong Phase 8. Next.js hiện hỗ trợ `after()` chính thức cho Server Functions và trên Vercel nó dùng `waitUntil()` để giữ invocation sống sau response. Tuy nhiên callback vẫn bị giới hạn bởi configured/default max duration, nên nó phù hợp cho side effect như engagement recalculation, không nên trở thành primary state transition. [Next.js](https://nextjs.org/docs/app/api-reference/functions/after)

Primary state của Review hiện đã nằm trong Postgres transaction, nên architecture này ổn:

```text
PRIMARY
Review DB transaction
→ durable

SECONDARY
after()
→ engagement recalculation
→ already idempotent
```

---

# Definition of Done Phase 8

- `begin_task_review_generation` atomic dưới Task row lock.
- Hai concurrent generation requests không tạo hai active attempts.
- `generation_request_id` làm infrastructure retry idempotent.
- Stuck `generating` attempts được reclaim sau lease timeout.
- Submission có canonical SHA-256 fingerprint.
- Same-answer retry sau response loss trả success.
- Different-answer second submission bị reject.
- V1 submission RPC vẫn tồn tại trong rollout; AI API mới dùng V2.
- Raw provider errors không còn lưu vào user-readable attempt.
- Internal API key dùng constant-time comparison.
- AI HTTP calls có timeout + request correlation.
- Retry chỉ bật trên operations đã idempotent.
- Review rate limiting fail-closed ở production, fail-open local.
- `task_status_events` ghi audit Todo/In Progress/In Review/Completed/Cancelled transitions.
- Browser không thể đọc/forge audit events.
- Answer key vẫn không accessible với authenticated.
- Review RPC mới chỉ service role được execute.
- `supabase test db` trở thành CI merge gate.
- Unit tests cover submission fingerprint.
- SQL tests cover duplicate generation, stale generation, idempotent submit và audit.
- Web lint/unit/build pass.
- AI API pytest pass.
- Supabase migration replay + DB tests pass.
- Production Security Advisor không có warning mới.

Sau Phase 8, chúng ta mới sang **Phase 9 — migration/cleanup & product consolidation**: điều hướng người dùng về Workspace, redirects `/tasks` và `/goals` legacy, loại bỏ UI/workflow cũ không còn cần, cleanup RPC V1 và dead code, rồi final regression toàn bộ Lumivox.