-- Run aggregate reports with privileged operator access. No learner content is selected.
begin read only;

select count(*) as completed_turns,
  percentile_cont(0.50) within group (order by latency_ms) as p50_precompletion_ms,
  percentile_cont(0.95) within group (order by latency_ms) as p95_precompletion_ms
from public.rag_chat_turns
where status = 'completed'
  and completed_at >= now() - interval '24 hours'
  and latency_ms is not null;

select provider, model_name, stage, count(*) as recorded_attempts,
  count(*) filter (where status = 'dispatch_pending') as unresolved_intents,
  count(*) filter (where status = 'unknown') as unknown_outcomes,
  count(*) filter (where total_tokens is null) as missing_total_usage,
  sum(total_tokens) as known_total_tokens
from public.rag_provider_attempts
where created_at >= now() - interval '24 hours'
group by provider, model_name, stage;

-- Combine this per-model view with the actual configured chain to classify fallback.
select provider, model_name, stage, status, error_code, count(*) as attempt_count
from public.rag_provider_attempts
where created_at >= now() - interval '24 hours'
group by provider, model_name, stage, status, error_code;

-- Track incomplete intents on interrupted or already terminated operations.
select a.stage, a.provider, count(*) as unresolved_intents,
  count(*) filter (where coalesce(t.lease_expires_at, p.lease_expires_at) < now()) as past_lease_expiry
from public.rag_provider_attempts a
left join public.rag_chat_turns t on (t.id,t.user_id) = (a.turn_id,a.user_id)
left join public.rag_chat_preparations p on (p.id,p.user_id) = (a.preparation_id,a.user_id)
where a.status = 'dispatch_pending'
  and a.created_at >= now() - interval '24 hours'
group by a.stage, a.provider;

commit;
