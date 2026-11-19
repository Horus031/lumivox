BEGIN;

CREATE OR REPLACE FUNCTION public.ls_notification_preferences_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.ls_notification_lock_owner(NEW.user_id);
  IF TG_OP = 'UPDATE' AND NEW.study_email_enabled
    AND ROW(OLD.study_email_enabled, OLD.lead_minutes, OLD.consented_at)
      IS NOT DISTINCT FROM ROW(NEW.study_email_enabled, NEW.lead_minutes, NEW.consented_at)
  THEN
    RETURN NEW;
  END IF;

  -- Revocation commits with the consent and job changes under the owner lock.
  PERFORM public.ls_reconcile_study_notifications(NEW.user_id);
  IF TG_OP = 'UPDATE' AND NEW.study_email_enabled AND NOT OLD.study_email_enabled THEN
    UPDATE public.study_notification_unsubscribe_tokens
    SET revoked_at = pg_catalog.clock_timestamp()
    WHERE user_id = NEW.user_id AND used_at IS NULL AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ls_notification_consume_unsubscribe_token(p_token_hash text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_token public.study_notification_unsubscribe_tokens;
  v_owner uuid;
BEGIN
  SELECT user_id INTO v_owner
  FROM public.study_notification_unsubscribe_tokens WHERE token_hash = p_token_hash;
  IF NOT FOUND THEN RETURN false; END IF;

  PERFORM public.ls_notification_lock_owner(v_owner);
  SELECT * INTO v_token
  FROM public.study_notification_unsubscribe_tokens WHERE token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND OR v_token.revoked_at IS NOT NULL OR v_token.expires_at <= pg_catalog.clock_timestamp() THEN
    RETURN false;
  END IF;
  IF v_token.used_at IS NOT NULL THEN RETURN true; END IF;

  -- A token can predate a re-consent that occurred before this migration.
  IF EXISTS (
    SELECT 1 FROM public.study_notification_preferences
    WHERE user_id = v_owner AND consented_at > v_token.created_at
  ) THEN
    UPDATE public.study_notification_unsubscribe_tokens
    SET revoked_at = pg_catalog.clock_timestamp() WHERE id = v_token.id;
    RETURN false;
  END IF;

  INSERT INTO public.study_notification_preferences (user_id, study_email_enabled) VALUES (v_owner, false)
  ON CONFLICT (user_id) DO UPDATE SET study_email_enabled = false;
  UPDATE public.study_notification_unsubscribe_tokens
  SET used_at = pg_catalog.clock_timestamp() WHERE id = v_token.id;
  RETURN true;
END;
$$;

COMMIT;
