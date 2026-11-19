-- 8D local/controlled readiness only. No flag activation, Cron or network.
ALTER TABLE public.study_notification_preferences
 ADD COLUMN reminder_locale text CHECK(reminder_locale IN ('en','vi')),
 ADD COLUMN locale_confirmed_at timestamptz,
 ADD CONSTRAINT ls_explicit_reminder_locale CHECK((reminder_locale IS NULL)=(locale_confirmed_at IS NULL));
CREATE FUNCTION public.ls_set_study_reminder_locale(p_locale text)
RETURNS public.study_notification_preferences LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid();r public.study_notification_preferences; BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_locale IS NULL OR p_locale NOT IN ('en','vi') THEN RAISE EXCEPTION 'Invalid reminder locale' USING ERRCODE='22023'; END IF;
 PERFORM public.ls_notification_lock_owner(u);
 INSERT INTO public.study_notification_preferences(user_id,reminder_locale,locale_confirmed_at)
 VALUES(u,p_locale,clock_timestamp()) ON CONFLICT(user_id) DO UPDATE
 SET reminder_locale=excluded.reminder_locale,locale_confirmed_at=excluded.locale_confirmed_at RETURNING * INTO r;
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.ls_set_study_reminder_locale(text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.ls_set_study_reminder_locale(text) TO authenticated;

CREATE FUNCTION public.ls_notification_resend_context(p_job_id uuid) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT base||jsonb_build_object('contextHash',encode(sha256(convert_to(base::text,'UTF8')),'hex')) FROM (
 SELECT jsonb_build_object('userId',j.user_id,'jobId',j.id,'sessionId',s.id,'taskId',t.id,'taskTitle',t.title,
 'recipient',a.email,'verified',a.email_confirmed_at IS NOT NULL AND (a.banned_until IS NULL OR a.banned_until<=clock_timestamp()),
 'locale',p.reminder_locale,'localeConfirmed',p.locale_confirmed_at IS NOT NULL,
 'suppressed',EXISTS(SELECT 1 FROM public.study_notification_suppressions sup
 JOIN public.study_notification_recipient_identities i ON i.user_id=sup.user_id AND i.recipient_fingerprint=sup.recipient_fingerprint
 WHERE sup.user_id=j.user_id AND sup.revoked_at IS NULL AND i.email_hash=encode(sha256(convert_to(split_part(a.email,'@',1)||'@'||lower(split_part(a.email,'@',2)),'UTF8')),'hex')),
 'scheduledStartAt',to_char(s.scheduled_start_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'scheduledEndAt',to_char(s.scheduled_end_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'timezone',s.timezone,
 'leadMinutes',p.lead_minutes,'idempotencyKey',j.idempotency_key,'lifecycleFingerprint',j.lifecycle_fingerprint,
 'eligible',coalesce(policy.eligible,false) AND j.cancel_requested_at IS NULL AND j.lifecycle_fingerprint=policy.fingerprint
 AND j.due_at=policy.due_at AND s.scheduled_start_at>clock_timestamp() AND j.due_at<=clock_timestamp()) base
 FROM public.study_notification_jobs j
 JOIN public.task_study_sessions s ON s.id=j.session_id AND s.user_id=j.user_id AND s.schedule_revision=j.schedule_revision
 JOIN public.tasks t ON t.id=s.task_id AND t.user_id=s.user_id
 JOIN public.task_study_schedules sc ON sc.id=s.schedule_id AND sc.user_id=s.user_id AND sc.task_id=t.id
 JOIN auth.users a ON a.id=j.user_id
 JOIN public.study_notification_preferences p ON p.user_id=j.user_id
 CROSS JOIN LATERAL public.ls_notification_session_policy(s.id) policy WHERE j.id=p_job_id) x;
$$;
REVOKE ALL ON FUNCTION public.ls_notification_resend_context(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.ls_notification_resolve_resend_context(p_job_id uuid,p_lease_token uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.study_notification_jobs WHERE id=p_job_id AND
 ((p_lease_token IS NULL AND status='pending') OR (status='leased' AND lease_token=p_lease_token AND lease_until>clock_timestamp()))) THEN RETURN NULL; END IF;
 RETURN public.ls_notification_resend_context(p_job_id);
END $$;
REVOKE ALL ON FUNCTION public.ls_notification_resolve_resend_context(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ls_notification_resolve_resend_context(uuid,uuid) TO service_role;
CREATE FUNCTION public.ls_notification_preview_resend(p_batch_size integer DEFAULT 5) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_batch_size IS NULL OR p_batch_size NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Invalid batch' USING ERRCODE='22023'; END IF;
 RETURN coalesce((SELECT jsonb_agg(id) FROM (SELECT id FROM public.study_notification_jobs WHERE status='pending'
 AND due_at<=clock_timestamp() ORDER BY due_at,id LIMIT p_batch_size) x),'[]');
END $$;
REVOKE ALL ON FUNCTION public.ls_notification_preview_resend(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ls_notification_preview_resend(integer) TO service_role;

ALTER TABLE public.study_notification_unsubscribe_tokens ADD CONSTRAINT ls_token_owner_identity_unique UNIQUE(token_hash,user_id,recipient_fingerprint);
CREATE TABLE public.study_notification_resend_payloads(
 job_id uuid PRIMARY KEY,user_id uuid NOT NULL,context_hash text NOT NULL CHECK(context_hash ~ '^[a-f0-9]{64}$'),
 payload_fingerprint text NOT NULL CHECK(payload_fingerprint ~ '^[a-f0-9]{64}$'),
 recipient_fingerprint text NOT NULL CHECK(recipient_fingerprint ~ '^[a-f0-9]{64}$'),locale text NOT NULL CHECK(locale IN ('en','vi')),
 token_hash text NOT NULL,encrypted_payload text NOT NULL CHECK(length(encrypted_payload) BETWEEN 30 AND 350000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(job_id,user_id) REFERENCES public.study_notification_jobs(id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(token_hash,user_id,recipient_fingerprint) REFERENCES public.study_notification_unsubscribe_tokens(token_hash,user_id,recipient_fingerprint) ON DELETE CASCADE
);
ALTER TABLE public.study_notification_resend_payloads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.study_notification_resend_payloads FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.study_notification_resend_payloads TO service_role;
COMMENT ON TABLE public.study_notification_resend_payloads IS
 'Immutable AES-256-GCM envelope v1. Contains encrypted email/capability only; key stays server-side. Never plaintext token/email or browser access.';
CREATE FUNCTION public.ls_notification_immutable_payload() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Immutable provider payload' USING ERRCODE='22023'; END $$;
REVOKE ALL ON FUNCTION public.ls_notification_immutable_payload() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable_resend_payload BEFORE UPDATE ON public.study_notification_resend_payloads FOR EACH ROW EXECUTE FUNCTION public.ls_notification_immutable_payload();
CREATE FUNCTION public.ls_notification_load_resend_payload(p_job_id uuid,p_lease_token uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT to_jsonb(p) FROM public.study_notification_resend_payloads p JOIN public.study_notification_jobs j ON j.id=p.job_id
 WHERE j.id=p_job_id AND j.status='leased' AND j.lease_token=p_lease_token AND j.lease_until>clock_timestamp();
$$;
REVOKE ALL ON FUNCTION public.ls_notification_load_resend_payload(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ls_notification_load_resend_payload(uuid,uuid) TO service_role;
CREATE FUNCTION public.ls_notification_prepare_resend_payload(p_job_id uuid,p_lease_token uuid,p_context_hash text,p_expected_email text,
 p_recipient_fingerprint text,p_payload_fingerprint text,p_encrypted_payload text,p_token_hash text,p_locale text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid;c jsonb;r public.study_notification_resend_payloads;BEGIN
 SELECT user_id INTO u FROM public.study_notification_jobs WHERE id=p_job_id;
 IF u IS NULL THEN RAISE EXCEPTION 'Invalid lease' USING ERRCODE='PT409'; END IF;
 PERFORM public.ls_notification_lock_owner(u);
 PERFORM 1 FROM public.study_notification_jobs WHERE id=p_job_id AND status='leased' AND lease_token=p_lease_token AND lease_until>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid lease' USING ERRCODE='PT409'; END IF;
 PERFORM public.ls_notification_bind_recipient(u,p_expected_email,p_recipient_fingerprint);
 c:=public.ls_notification_resend_context(p_job_id);
 IF c IS NULL OR NOT coalesce((c->>'eligible')::boolean,false) OR NOT coalesce((c->>'localeConfirmed')::boolean,false)
 OR c->>'contextHash' IS DISTINCT FROM p_context_hash OR c->>'locale' IS DISTINCT FROM p_locale THEN
 RAISE EXCEPTION 'Stale or incomplete submission context' USING ERRCODE='PT409'; END IF;
 SELECT * INTO r FROM public.study_notification_resend_payloads WHERE job_id=p_job_id;
 IF FOUND THEN
 IF r.context_hash<>p_context_hash OR r.recipient_fingerprint<>p_recipient_fingerprint THEN
 RAISE EXCEPTION 'Immutable submission context changed' USING ERRCODE='PT409'; END IF;
 RETURN to_jsonb(r); END IF;
 -- Token hash and encrypted immutable snapshot commit together, before handoff.
 PERFORM public.ls_notification_issue_unsubscribe_token(u,p_expected_email,p_recipient_fingerprint,p_token_hash);
 INSERT INTO public.study_notification_resend_payloads(job_id,user_id,context_hash,payload_fingerprint,recipient_fingerprint,locale,token_hash,encrypted_payload)
 VALUES(p_job_id,u,p_context_hash,p_payload_fingerprint,p_recipient_fingerprint,p_locale,p_token_hash,p_encrypted_payload) RETURNING * INTO r;
 RETURN to_jsonb(r);
END $$;
REVOKE ALL ON FUNCTION public.ls_notification_prepare_resend_payload(uuid,uuid,text,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ls_notification_prepare_resend_payload(uuid,uuid,text,text,text,text,text,text,text) TO service_role;
CREATE FUNCTION public.ls_notification_authorize_resend_payload(p_job_id uuid,p_lease_token uuid,p_expected_email text,p_recipient_fingerprint text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid;c jsonb;r public.study_notification_resend_payloads;BEGIN
 PERFORM 1 FROM public.study_notification_dispatch_control WHERE singleton AND enabled FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('authorized',false,'reason','dispatch_off'); END IF;
 SELECT user_id INTO u FROM public.study_notification_jobs WHERE id=p_job_id;
 IF u IS NULL THEN RAISE EXCEPTION 'Invalid lease' USING ERRCODE='PT409'; END IF;
 PERFORM public.ls_notification_lock_owner(u);
 PERFORM 1 FROM public.study_notification_jobs WHERE id=p_job_id FOR UPDATE;
 SELECT * INTO r FROM public.study_notification_resend_payloads WHERE job_id=p_job_id;
 c:=public.ls_notification_resend_context(p_job_id);
 IF r.job_id IS NULL OR c->>'contextHash' IS DISTINCT FROM r.context_hash OR r.recipient_fingerprint IS DISTINCT FROM p_recipient_fingerprint
 OR NOT EXISTS(SELECT 1 FROM public.study_notification_unsubscribe_tokens WHERE token_hash=r.token_hash AND used_at IS NULL AND revoked_at IS NULL AND expires_at>clock_timestamp()) THEN
 RETURN jsonb_build_object('authorized',false,'reason','stale_payload'); END IF;
 RETURN public.ls_notification_authorize_resend_attempt(p_job_id,p_lease_token,p_expected_email,p_recipient_fingerprint,r.payload_fingerprint,r.locale,true);
END $$;
REVOKE ALL ON FUNCTION public.ls_notification_authorize_resend_payload(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ls_notification_authorize_resend_payload(uuid,uuid,text,text) TO service_role;
