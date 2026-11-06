-- 8C: local-ready unsubscribe and suppression; no activation, Cron or network.
CREATE TABLE public.study_notification_recipient_identities(
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 recipient_fingerprint text NOT NULL CHECK(recipient_fingerprint ~ '^[a-f0-9]{64}$'),
 email_hash text CHECK(email_hash ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(user_id,recipient_fingerprint), UNIQUE(user_id,email_hash)
);
-- Private secondary digest binds a trusted HMAC to the current Auth email.
-- No raw destination or HMAC secret is stored in PostgreSQL. NULL hash means
-- historical correlated provider identity, not proof of the current address.
ALTER TABLE public.study_notification_deliveries ADD CONSTRAINT ls_delivery_owner_unique UNIQUE(id,user_id);
ALTER TABLE public.study_notification_webhook_receipts ADD COLUMN bounce_kind text CHECK(bounce_kind IN ('Permanent','Transient','Undetermined'));
CREATE TABLE public.study_notification_suppressions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,
 recipient_fingerprint text NOT NULL,reason text NOT NULL CHECK(reason IN ('hard_bounce','complaint','provider_suppressed','manual_block')),
 source_event_id uuid REFERENCES public.study_notification_webhook_receipts(id),delivery_id uuid,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),revoked_at timestamptz,
 FOREIGN KEY(user_id,recipient_fingerprint) REFERENCES public.study_notification_recipient_identities(user_id,recipient_fingerprint) ON DELETE CASCADE,
 FOREIGN KEY(delivery_id,user_id) REFERENCES public.study_notification_deliveries(id,user_id) ON DELETE CASCADE,
 UNIQUE(source_event_id)
);
CREATE INDEX ls_active_suppression ON public.study_notification_suppressions(user_id,recipient_fingerprint) WHERE revoked_at IS NULL;
CREATE TABLE public.study_notification_unsubscribe_tokens(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,recipient_fingerprint text NOT NULL,
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL CHECK(isfinite(expires_at)),
 used_at timestamptz,revoked_at timestamptz,
 CHECK(expires_at>created_at),
 FOREIGN KEY(user_id,recipient_fingerprint) REFERENCES public.study_notification_recipient_identities(user_id,recipient_fingerprint) ON DELETE CASCADE
);
ALTER TABLE public.study_notification_recipient_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_notification_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_notification_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.study_notification_recipient_identities,public.study_notification_suppressions,
 public.study_notification_unsubscribe_tokens FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.study_notification_recipient_identities,public.study_notification_suppressions,
 public.study_notification_unsubscribe_tokens TO service_role;

CREATE FUNCTION public.ls_notification_bind_recipient(p_user_id uuid,p_expected_email text,p_fingerprint text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e text; h text;
BEGIN
 PERFORM public.ls_notification_lock_owner(p_user_id);
 SELECT email INTO e FROM auth.users WHERE id=p_user_id AND email_confirmed_at IS NOT NULL
 AND (banned_until IS NULL OR banned_until<=clock_timestamp()) FOR SHARE NOWAIT;
 IF e IS NULL OR p_expected_email IS DISTINCT FROM e OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$' THEN
 RAISE EXCEPTION 'Recipient changed or unverified' USING ERRCODE='PT409'; END IF;
 h:=encode(sha256(convert_to(split_part(e,'@',1)||'@'||lower(split_part(e,'@',2)),'UTF8')),'hex');
 INSERT INTO public.study_notification_recipient_identities(user_id,recipient_fingerprint,email_hash)
 VALUES(p_user_id,p_fingerprint,h) ON CONFLICT(user_id,recipient_fingerprint) DO UPDATE SET email_hash=excluded.email_hash;
END $$;
REVOKE ALL ON FUNCTION public.ls_notification_bind_recipient(uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.ls_notification_issue_unsubscribe_token(p_user_id uuid,p_expected_email text,p_fingerprint text,p_token_hash text,p_replace boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' OR p_replace IS NULL THEN
 RAISE EXCEPTION 'Invalid token command' USING ERRCODE='22023'; END IF;
 PERFORM public.ls_notification_bind_recipient(p_user_id,p_expected_email,p_fingerprint);
 IF p_replace THEN UPDATE public.study_notification_unsubscribe_tokens SET revoked_at=clock_timestamp()
 WHERE user_id=p_user_id AND recipient_fingerprint=p_fingerprint AND revoked_at IS NULL; END IF;
 INSERT INTO public.study_notification_unsubscribe_tokens(user_id,recipient_fingerprint,token_hash,expires_at)
 VALUES(p_user_id,p_fingerprint,p_token_hash,clock_timestamp()+interval '90 days');
END $$;
REVOKE ALL ON FUNCTION public.ls_notification_issue_unsubscribe_token(uuid,text,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ls_notification_issue_unsubscribe_token(uuid,text,text,text,boolean) TO service_role;

CREATE FUNCTION public.ls_notification_revoke_unsubscribe_token(p_token_hash text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid; BEGIN
 SELECT user_id INTO u FROM public.study_notification_unsubscribe_tokens WHERE token_hash=p_token_hash;
 IF u IS NULL THEN RETURN; END IF;
 PERFORM public.ls_notification_lock_owner(u);
 UPDATE public.study_notification_unsubscribe_tokens SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE token_hash=p_token_hash;
END $$;
REVOKE ALL ON FUNCTION public.ls_notification_revoke_unsubscribe_token(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ls_notification_revoke_unsubscribe_token(text) TO service_role;

-- Every consent command must take the owner coordinator BEFORE preference row
-- locks, including existing Settings RPC, to serialize with token consumption.
DO $$ DECLARE s text; n text; BEGIN
 s:=pg_get_functiondef('public.ls_set_study_notification_preferences(boolean,integer,boolean,time,time,text)'::regprocedure);
 n:=replace(s,'INSERT INTO public.study_notification_preferences AS existing',
 'PERFORM public.ls_notification_lock_owner(v_uid); INSERT INTO public.study_notification_preferences AS existing');
 IF n=s THEN RAISE EXCEPTION 'Unexpected preferences command'; END IF; EXECUTE n;
END $$;
CREATE FUNCTION public.ls_notification_consume_unsubscribe_token(p_token_hash text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.study_notification_unsubscribe_tokens; u uuid;
BEGIN
 SELECT user_id INTO u FROM public.study_notification_unsubscribe_tokens WHERE token_hash=p_token_hash;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM public.ls_notification_lock_owner(u);
 SELECT * INTO t FROM public.study_notification_unsubscribe_tokens WHERE token_hash=p_token_hash FOR UPDATE;
 IF t.id IS NULL OR t.revoked_at IS NOT NULL OR t.expires_at<=clock_timestamp() THEN RETURN false; END IF;
 IF t.used_at IS NOT NULL THEN RETURN true; END IF;
 INSERT INTO public.study_notification_preferences(user_id,study_email_enabled) VALUES(u,false)
 ON CONFLICT(user_id) DO UPDATE SET study_email_enabled=false;
 -- Existing lifecycle trigger suppresses ALL pending jobs and marks leased jobs
 -- cancel_requested_at in the same transaction. No provider recall is promised.
 UPDATE public.study_notification_unsubscribe_tokens SET used_at=clock_timestamp() WHERE id=t.id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.ls_notification_consume_unsubscribe_token(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ls_notification_consume_unsubscribe_token(text) TO service_role;

ALTER FUNCTION public.ls_notification_project_resend(text) RENAME TO ls_notification_project_resend_8b;
CREATE FUNCTION public.ls_notification_project_resend(p_message_id text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.study_notification_deliveries; r public.study_notification_webhook_receipts; v_current boolean;
BEGIN
 -- Caller already owns provider correlation lock. Old projector acquires owner
 -- -> Job -> Delivery. Reentrant owner gate protects the following bulk fences.
 PERFORM public.ls_notification_project_resend_8b(p_message_id);
 SELECT * INTO d FROM public.study_notification_deliveries WHERE provider='resend' AND provider_message_id=p_message_id;
 IF NOT FOUND THEN RETURN; END IF;
 FOR r IN SELECT * FROM public.study_notification_webhook_receipts WHERE provider_message_id=p_message_id
 AND recipient_fingerprint=d.recipient_fingerprint AND event_type IN ('email.bounced','email.complained','email.suppressed') LOOP
 INSERT INTO public.study_notification_recipient_identities(user_id,recipient_fingerprint) VALUES(d.user_id,d.recipient_fingerprint) ON CONFLICT DO NOTHING;
 INSERT INTO public.study_notification_suppressions(user_id,recipient_fingerprint,reason,source_event_id,delivery_id)
 VALUES(d.user_id,d.recipient_fingerprint,CASE WHEN r.event_type='email.complained' THEN 'complaint'
 WHEN r.event_type='email.bounced' AND r.bounce_kind='Permanent' THEN 'hard_bounce' ELSE 'provider_suppressed' END,r.id,d.id)
 ON CONFLICT(source_event_id) DO NOTHING;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM public.study_notification_suppressions WHERE user_id=d.user_id
 AND recipient_fingerprint=d.recipient_fingerprint AND revoked_at IS NULL) THEN RETURN; END IF;
 SELECT EXISTS(SELECT 1 FROM public.study_notification_recipient_identities i JOIN auth.users a ON a.id=i.user_id
 WHERE i.user_id=d.user_id AND i.recipient_fingerprint=d.recipient_fingerprint
 AND i.email_hash=encode(sha256(convert_to(split_part(a.email,'@',1)||'@'||lower(split_part(a.email,'@',2)),'UTF8')),'hex')) INTO v_current;
 UPDATE public.study_notification_jobs j SET status=CASE WHEN j.status='pending' THEN 'suppressed' ELSE j.status END,
 cancel_requested_at=CASE WHEN j.status='leased' THEN coalesce(j.cancel_requested_at,clock_timestamp()) ELSE j.cancel_requested_at END
 WHERE j.user_id=d.user_id AND j.status IN ('pending','leased') AND (v_current OR EXISTS(
 SELECT 1 FROM public.study_notification_deliveries x WHERE x.job_id=j.id AND x.provider='resend' AND x.recipient_fingerprint=d.recipient_fingerprint));
END $$;
REVOKE ALL ON FUNCTION public.ls_notification_project_resend(text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.ls_notification_ingest_resend(p_event_id text,p_message_id text,p_event_type text,p_event_at timestamptz,
 p_recipient_fingerprint text,p_payload_fingerprint text,p_bounce_kind text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.study_notification_webhook_receipts; replay boolean:=false;
BEGIN
 IF p_event_id IS NULL OR p_message_id IS NULL OR p_event_type IS NULL OR p_event_at IS NULL OR
 p_recipient_fingerprint IS NULL OR p_payload_fingerprint IS NULL OR
 (p_bounce_kind IS NOT NULL AND (p_event_type<>'email.bounced' OR p_bounce_kind NOT IN ('Permanent','Transient','Undetermined'))) THEN
 RAISE EXCEPTION 'Invalid provider event' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('ls-resend:'||p_message_id,0));
 INSERT INTO public.study_notification_webhook_receipts(provider,provider_event_id,provider_message_id,event_type,
 provider_event_at,recipient_fingerprint,payload_fingerprint,payload_subset,bounce_kind)
 VALUES('resend',p_event_id,p_message_id,p_event_type,p_event_at,p_recipient_fingerprint,p_payload_fingerprint,'{}',p_bounce_kind)
 ON CONFLICT(provider,provider_event_id) DO NOTHING;
 IF NOT FOUND THEN replay:=true; END IF;
 SELECT * INTO STRICT r FROM public.study_notification_webhook_receipts WHERE provider='resend' AND provider_event_id=p_event_id;
 -- Full verified-payload hash already binds bounce data. Do not reject an exact
 -- legacy 8B replay solely because old code did not retain typed bounce_kind.
 -- Keep its original conservative classification; never fabricate old proof.
 IF ROW(r.provider_message_id,r.event_type,r.provider_event_at,r.recipient_fingerprint,r.payload_fingerprint)
 IS DISTINCT FROM ROW(p_message_id,p_event_type,p_event_at,p_recipient_fingerprint,p_payload_fingerprint) THEN
 RAISE EXCEPTION 'Provider event integrity conflict' USING ERRCODE='22023'; END IF;
 IF replay AND r.processing_status<>'unmatched' THEN RETURN jsonb_build_object('replay',true,'status',r.processing_status); END IF;
 PERFORM public.ls_notification_project_resend(p_message_id);
 SELECT * INTO STRICT r FROM public.study_notification_webhook_receipts WHERE id=r.id;
 RETURN jsonb_build_object('replay',replay,'status',r.processing_status);
END $$;
REVOKE ALL ON FUNCTION public.ls_notification_ingest_resend(text,text,text,timestamptz,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ls_notification_ingest_resend(text,text,text,timestamptz,text,text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.ls_notification_ingest_resend(p_event_id text,p_message_id text,p_event_type text,p_event_at timestamptz,
 p_recipient_fingerprint text,p_payload_fingerprint text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT public.ls_notification_ingest_resend(p_event_id,p_message_id,p_event_type,p_event_at,p_recipient_fingerprint,p_payload_fingerprint,NULL);
$$;

-- Explicit real-provider handoff. Existing fake dispatcher cannot use this by
-- accident. Trusted server computes HMAC from Auth email; DB rechecks that exact
-- email under SHARE NOWAIT, then suppression, consent/lease/timing/quiet/gate.
CREATE FUNCTION public.ls_notification_authorize_resend_attempt(p_job_id uuid,p_lease_token uuid,p_expected_email text,
 p_recipient_fingerprint text,p_payload_fingerprint text,p_locale text,p_allowlisted boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.study_notification_jobs; p public.study_notification_preferences; u uuid; v_now timestamptz; reason text; d uuid;
BEGIN
 IF p_payload_fingerprint IS NULL OR p_payload_fingerprint !~ '^[a-f0-9]{64}$' OR p_locale IS NULL OR p_locale NOT IN ('en','vi') THEN
 RAISE EXCEPTION 'Invalid submission context' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM public.study_notification_dispatch_control WHERE singleton AND enabled FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('authorized',false,'reason','dispatch_off'); END IF;
 IF p_allowlisted IS DISTINCT FROM true THEN RETURN jsonb_build_object('authorized',false,'reason','not_allowlisted'); END IF;
 SELECT user_id INTO u FROM public.study_notification_jobs WHERE id=p_job_id;
 IF u IS NULL THEN RAISE EXCEPTION 'Invalid or expired lease' USING ERRCODE='PT409'; END IF;
 PERFORM public.ls_notification_lock_owner(u);
 SELECT * INTO j FROM public.study_notification_jobs WHERE id=p_job_id FOR UPDATE;
 v_now:=clock_timestamp();
 IF j.status<>'leased' OR j.lease_token IS DISTINCT FROM p_lease_token OR j.lease_until<=v_now THEN
 RAISE EXCEPTION 'Invalid or expired lease' USING ERRCODE='PT409'; END IF;
 IF EXISTS(SELECT 1 FROM public.study_notification_deliveries WHERE job_id=j.id AND attempt_number=j.attempt_count) THEN
 RETURN jsonb_build_object('authorized',false,'reason','handoff_already_started'); END IF;
 PERFORM public.ls_notification_bind_recipient(u,p_expected_email,p_recipient_fingerprint);
 SELECT * INTO p FROM public.study_notification_preferences WHERE user_id=u;
 IF NOT public.ls_study_notification_job_is_current(j.id) OR j.due_at>v_now THEN reason:='stale_or_cancelled';
 ELSIF EXISTS(SELECT 1 FROM public.study_notification_suppressions WHERE user_id=u AND recipient_fingerprint=p_recipient_fingerprint AND revoked_at IS NULL) THEN reason:='recipient_suppressed';
 ELSIF public.ls_notification_in_quiet_hours(p.quiet_hours_enabled,p.quiet_start_local,p.quiet_end_local,p.timezone,v_now) THEN reason:='quiet_hours'; END IF;
 IF reason IS NOT NULL THEN UPDATE public.study_notification_jobs SET status='suppressed',lease_token=NULL,lease_until=NULL WHERE id=j.id;
 RETURN jsonb_build_object('authorized',false,'reason',reason); END IF;
 INSERT INTO public.study_notification_deliveries(job_id,user_id,attempt_number,provider,status,handoff_token,
 recipient_fingerprint,provider_payload_fingerprint,submission_locale,locale_policy)
 VALUES(j.id,u,j.attempt_count,'resend','submitting',p_lease_token,p_recipient_fingerprint,p_payload_fingerprint,p_locale,'explicit-trusted-command-v1') RETURNING id INTO d;
 RETURN jsonb_build_object('authorized',true,'deliveryId',d,'idempotencyKey',j.idempotency_key);
END $$;
REVOKE ALL ON FUNCTION public.ls_notification_authorize_resend_attempt(uuid,uuid,text,text,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ls_notification_authorize_resend_attempt(uuid,uuid,text,text,text,text,boolean) TO service_role;

-- Preserve and apply already-correlated 8B facts as conservative suppression;
-- missing historical bounce classification is never invented as hard bounce.
DO $$ DECLARE m text; BEGIN
 FOR m IN SELECT DISTINCT r.provider_message_id FROM public.study_notification_webhook_receipts r
 JOIN public.study_notification_deliveries d ON d.provider='resend' AND d.provider_message_id=r.provider_message_id
 AND d.recipient_fingerprint=r.recipient_fingerprint
 WHERE r.event_type IN ('email.bounced','email.complained','email.suppressed') ORDER BY r.provider_message_id LOOP
 PERFORM pg_advisory_xact_lock(hashtextextended('ls-resend:'||m,0));
 PERFORM public.ls_notification_project_resend(m);
 END LOOP;
END $$;
