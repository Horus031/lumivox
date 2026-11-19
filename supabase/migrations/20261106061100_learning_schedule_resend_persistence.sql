-- 8B persistence only: no worker wiring, dispatch activation, Cron or network.
-- Lock order for these trusted commands: provider correlation -> owner -> Job
-- -> Delivery -> Receipts. Call in a fresh transaction, not inside parent writes.
DO $$
DECLARE c text;
BEGIN
 SELECT conname INTO STRICT c FROM pg_catalog.pg_constraint
 WHERE conrelid='public.study_notification_deliveries'::regclass AND contype='c'
 AND pg_catalog.pg_get_constraintdef(oid) LIKE '%provider = ''fake''%';
 EXECUTE format('ALTER TABLE public.study_notification_deliveries DROP CONSTRAINT %I',c);
END $$;
ALTER TABLE public.study_notification_deliveries
 ADD CONSTRAINT study_notification_deliveries_provider_check CHECK(provider IN ('fake','resend')),
 ADD COLUMN recipient_fingerprint text,
 ADD COLUMN provider_payload_fingerprint text,
 ADD COLUMN submission_locale text,
 ADD COLUMN locale_policy text,
 ADD COLUMN provider_accepted_at timestamptz,
 ADD COLUMN last_provider_event_at timestamptz,
 ADD CONSTRAINT study_notification_resend_context CHECK(provider<>'resend' OR (
   recipient_fingerprint IS NOT NULL AND recipient_fingerprint ~ '^[a-f0-9]{64}$'
   AND provider_payload_fingerprint IS NOT NULL AND provider_payload_fingerprint ~ '^[a-f0-9]{64}$'
   AND submission_locale IS NOT NULL AND submission_locale IN ('en','vi')
   AND locale_policy IS NOT NULL AND locale_policy='explicit-trusted-command-v1'
   AND handoff_token IS NOT NULL));
CREATE UNIQUE INDEX study_notification_provider_message_unique
 ON public.study_notification_deliveries(provider,provider_message_id) WHERE provider_message_id IS NOT NULL;
COMMENT ON COLUMN public.study_notification_deliveries.submission_locale IS
 'Explicit en/vi snapshot from trusted submission command, no Accept-Language/default inference. Persisted profile locale UI is deferred.';

CREATE FUNCTION public.ls_notification_immutable_resend_context() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF OLD.provider='resend' AND ROW(NEW.provider,NEW.job_id,NEW.user_id,NEW.attempt_number,
 NEW.recipient_fingerprint,NEW.provider_payload_fingerprint,NEW.submission_locale,NEW.locale_policy,NEW.handoff_token)
 IS DISTINCT FROM ROW(OLD.provider,OLD.job_id,OLD.user_id,OLD.attempt_number,
 OLD.recipient_fingerprint,OLD.provider_payload_fingerprint,OLD.submission_locale,OLD.locale_policy,OLD.handoff_token)
 OR OLD.provider='fake' AND NEW.provider<>'fake' THEN
 RAISE EXCEPTION 'Immutable submission context' USING ERRCODE='22023'; END IF;
 IF OLD.provider='resend' AND OLD.provider_message_id IS NOT NULL
 AND NEW.provider_message_id IS DISTINCT FROM OLD.provider_message_id THEN
 RAISE EXCEPTION 'Immutable provider message ID' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.ls_notification_immutable_resend_context() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER immutable_resend_context BEFORE UPDATE ON public.study_notification_deliveries
 FOR EACH ROW EXECUTE FUNCTION public.ls_notification_immutable_resend_context();

CREATE TABLE public.study_notification_webhook_receipts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider text NOT NULL CHECK(provider='resend'),
 provider_event_id text NOT NULL CHECK(length(provider_event_id)<=256 AND provider_event_id ~ '^[A-Za-z0-9_-]+$'),
 provider_message_id text NOT NULL CHECK(length(provider_message_id)<=256 AND provider_message_id ~ '^[A-Za-z0-9_-]+$'),
 event_type text NOT NULL CHECK(event_type IN ('email.sent','email.delivered','email.delivery_delayed',
 'email.bounced','email.complained','email.failed','email.suppressed')),
 provider_event_at timestamptz NOT NULL CHECK(isfinite(provider_event_at)),
 recipient_fingerprint text NOT NULL CHECK(recipient_fingerprint ~ '^[a-f0-9]{64}$'),
 payload_fingerprint text NOT NULL CHECK(payload_fingerprint ~ '^[a-f0-9]{64}$'),
 -- Only safe typed event fields are retained. Never raw payload, recipient,
 -- subject, bounce text, message headers or Task content.
 payload_subset jsonb NOT NULL CHECK(payload_subset='{}'::jsonb),
 processing_status text NOT NULL DEFAULT 'unmatched' CHECK(processing_status IN ('unmatched','processed','recipient_mismatch')),
 processed_at timestamptz, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(provider,provider_event_id)
);
CREATE INDEX study_notification_receipt_correlation ON public.study_notification_webhook_receipts(provider_message_id,recipient_fingerprint);
ALTER TABLE public.study_notification_webhook_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.study_notification_webhook_receipts FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.study_notification_webhook_receipts TO service_role;
-- Writes only through trusted commands. Receipts are append-only facts; only
-- processing metadata is updated by the internal projector.

CREATE FUNCTION public.ls_notification_project_resend(p_message_id text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.study_notification_deliveries; v_status text; v_last timestamptz;
BEGIN
 SELECT * INTO d FROM public.study_notification_deliveries WHERE provider='resend' AND provider_message_id=p_message_id;
 IF NOT FOUND THEN RETURN; END IF;
 PERFORM public.ls_notification_lock_owner(d.user_id);
 PERFORM 1 FROM public.study_notification_jobs WHERE id=d.job_id FOR UPDATE;
 SELECT * INTO d FROM public.study_notification_deliveries WHERE id=d.id FOR UPDATE;
 -- Separate append-only facts, not last-arrival-wins or event-time-wins.
 -- Complaint and bounce both remain in receipts even if one is projected.
 SELECT CASE
 WHEN bool_or(event_type='email.complained') THEN 'complained'
 WHEN bool_or(event_type='email.bounced') THEN 'bounced'
 WHEN bool_or(event_type='email.suppressed') THEN 'suppressed'
 WHEN bool_or(event_type='email.delivered') THEN 'delivered'
 WHEN bool_or(event_type='email.failed') THEN 'failed'
 WHEN bool_or(event_type IN ('email.sent','email.delivery_delayed')) THEN 'accepted'
 END,max(provider_event_at) INTO v_status,v_last
 FROM public.study_notification_webhook_receipts
 WHERE provider_message_id=p_message_id AND recipient_fingerprint=d.recipient_fingerprint;
 UPDATE public.study_notification_deliveries SET status=coalesce(v_status,status),
 last_provider_event_at=v_last,
 provider_accepted_at=CASE WHEN v_status IN ('accepted','delivered','bounced','complained')
 THEN coalesce(provider_accepted_at,clock_timestamp()) ELSE provider_accepted_at END WHERE id=d.id;
 UPDATE public.study_notification_webhook_receipts SET
 processing_status=CASE WHEN recipient_fingerprint=d.recipient_fingerprint THEN 'processed' ELSE 'recipient_mismatch' END,
 processed_at=clock_timestamp() WHERE provider_message_id=p_message_id AND processing_status='unmatched';
 IF v_status IN ('accepted','delivered','bounced','complained') THEN
 UPDATE public.study_notification_jobs SET status='sent',lease_token=NULL,lease_until=NULL WHERE id=d.job_id;
 ELSIF v_status IN ('failed','suppressed') THEN
 UPDATE public.study_notification_jobs SET status=v_status,lease_token=NULL,lease_until=NULL WHERE id=d.job_id;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.ls_notification_project_resend(text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.ls_notification_ingest_resend(
 p_event_id text,p_message_id text,p_event_type text,p_event_at timestamptz,
 p_recipient_fingerprint text,p_payload_fingerprint text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.study_notification_webhook_receipts; v_replay boolean:=false;
BEGIN
 IF p_event_id IS NULL OR p_message_id IS NULL OR p_event_type IS NULL OR p_event_at IS NULL
 OR p_recipient_fingerprint IS NULL OR p_payload_fingerprint IS NULL THEN
 RAISE EXCEPTION 'Invalid provider event' USING ERRCODE='22023'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ls-resend:'||p_message_id,0));
 INSERT INTO public.study_notification_webhook_receipts(provider,provider_event_id,provider_message_id,
 event_type,provider_event_at,recipient_fingerprint,payload_fingerprint,payload_subset)
 VALUES('resend',p_event_id,p_message_id,p_event_type,p_event_at,p_recipient_fingerprint,p_payload_fingerprint,'{}')
 ON CONFLICT(provider,provider_event_id) DO NOTHING;
 IF NOT FOUND THEN v_replay:=true; END IF;
 SELECT * INTO STRICT r FROM public.study_notification_webhook_receipts WHERE provider='resend' AND provider_event_id=p_event_id;
 IF ROW(r.provider_message_id,r.event_type,r.provider_event_at,r.recipient_fingerprint,r.payload_fingerprint)
 IS DISTINCT FROM ROW(p_message_id,p_event_type,p_event_at,p_recipient_fingerprint,p_payload_fingerprint) THEN
 RAISE EXCEPTION 'Provider event integrity conflict' USING ERRCODE='22023'; END IF;
 IF v_replay AND r.processing_status<>'unmatched' THEN
 RETURN jsonb_build_object('replay',true,'status',r.processing_status); END IF;
 PERFORM public.ls_notification_project_resend(p_message_id);
 SELECT * INTO STRICT r FROM public.study_notification_webhook_receipts WHERE id=r.id;
 RETURN jsonb_build_object('replay',v_replay,'status',r.processing_status);
END $$;
REVOKE ALL ON FUNCTION public.ls_notification_ingest_resend(text,text,text,timestamptz,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ls_notification_ingest_resend(text,text,text,timestamptz,text,text) TO service_role;

-- No send/claim/authorize path is introduced. A future worker must INSERT an
-- explicitly resend handoff with immutable context in its authorization TX.
-- This command records evidence AFTER that TX commits. uncertain is held, never
-- retried here; a later trusted provider ID can resolve it without sending.
CREATE FUNCTION public.ls_notification_record_resend_outcome(
 p_delivery_id uuid,p_handoff_token uuid,p_payload_fingerprint text,p_outcome text,p_message_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.study_notification_deliveries; v_fingerprint text;
BEGIN
 IF p_outcome IS NULL OR p_outcome NOT IN ('accepted','uncertain','rejected') OR
 (p_outcome='accepted' AND (p_message_id IS NULL OR length(p_message_id)>256 OR p_message_id !~ '^[A-Za-z0-9_-]+$')) OR
 (p_outcome<>'accepted' AND p_message_id IS NOT NULL) THEN
 RAISE EXCEPTION 'Invalid provider outcome' USING ERRCODE='22023'; END IF;
 IF p_message_id IS NOT NULL THEN
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ls-resend:'||p_message_id,0)); END IF;
 SELECT * INTO d FROM public.study_notification_deliveries WHERE id=p_delivery_id AND provider='resend';
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid Resend handoff' USING ERRCODE='PT409'; END IF;
 PERFORM public.ls_notification_lock_owner(d.user_id);
 PERFORM 1 FROM public.study_notification_jobs WHERE id=d.job_id FOR UPDATE;
 SELECT * INTO d FROM public.study_notification_deliveries WHERE id=p_delivery_id FOR UPDATE;
 IF p_handoff_token IS NULL OR d.handoff_token IS DISTINCT FROM p_handoff_token OR
 p_payload_fingerprint IS NULL OR d.provider_payload_fingerprint IS DISTINCT FROM p_payload_fingerprint THEN
 RAISE EXCEPTION 'Invalid Resend handoff' USING ERRCODE='PT409'; END IF;
 v_fingerprint:=p_outcome||':'||coalesce(p_message_id,'');
 IF d.outcome_fingerprint=v_fingerprint THEN RETURN jsonb_build_object('replay',true,'status',d.status); END IF;
 IF d.outcome_fingerprint IS NOT NULL AND NOT(d.outcome_fingerprint='uncertain:' AND p_outcome='accepted') THEN
 RAISE EXCEPTION 'Outcome replay mismatch' USING ERRCODE='22023'; END IF;
 UPDATE public.study_notification_deliveries SET provider_message_id=p_message_id,
 outcome_fingerprint=v_fingerprint,
 status=CASE WHEN last_provider_event_at IS NOT NULL THEN status WHEN p_outcome='accepted' THEN 'accepted'
 WHEN p_outcome='uncertain' THEN 'uncertain' ELSE 'failed' END,
 provider_accepted_at=CASE WHEN p_outcome='accepted' THEN coalesce(provider_accepted_at,clock_timestamp()) ELSE provider_accepted_at END
 WHERE id=d.id;
 UPDATE public.study_notification_jobs SET status=CASE WHEN p_outcome='accepted' THEN 'sent' ELSE 'failed' END,
 lease_token=NULL,lease_until=NULL WHERE id=d.job_id;
 IF p_message_id IS NOT NULL THEN PERFORM public.ls_notification_project_resend(p_message_id); END IF;
 RETURN jsonb_build_object('replay',false,'status',(SELECT status FROM public.study_notification_deliveries WHERE id=d.id));
END $$;
REVOKE ALL ON FUNCTION public.ls_notification_record_resend_outcome(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ls_notification_record_resend_outcome(uuid,uuid,text,text,text) TO service_role;

-- Preserve the Phase 07 implementation verbatim except for the provider fence.
-- Abort on a changed baseline rather than silently leaving a cross-provider path.
DO $$
DECLARE source text; fenced text;
BEGIN
 source:=pg_catalog.pg_get_functiondef('public.ls_notification_record_fake_outcome(uuid,uuid,jsonb)'::regprocedure);
 fenced:=replace(source,
 'WHERE job_id=j.id AND handoff_token=p_lease_token FOR UPDATE;',
 'WHERE job_id=j.id AND handoff_token=p_lease_token AND provider=''fake'' FOR UPDATE;');
 IF fenced=source THEN RAISE EXCEPTION 'Unexpected fake outcome implementation'; END IF;
 EXECUTE fenced;
END $$;
