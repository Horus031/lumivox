-- 9A identity only. No timer/API launch wiring, attendance writes or aggregation.
ALTER TABLE public.focus_sessions ADD CONSTRAINT ls_focus_id_owner_task_unique UNIQUE(id,user_id,task_id);
ALTER TABLE public.task_study_sessions ADD CONSTRAINT ls_study_id_owner_task_unique UNIQUE(id,user_id,task_id);
CREATE TABLE public.task_study_focus_attributions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,
 task_id uuid NOT NULL,study_session_id uuid NOT NULL,focus_session_id uuid NOT NULL UNIQUE,
 attribution_source text NOT NULL DEFAULT 'study_session' CHECK(attribution_source='study_session'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(study_session_id,user_id,task_id) REFERENCES public.task_study_sessions(id,user_id,task_id) ON DELETE CASCADE,
 FOREIGN KEY(focus_session_id,user_id,task_id) REFERENCES public.focus_sessions(id,user_id,task_id) ON DELETE CASCADE
);
CREATE INDEX ls_focus_attribution_owner_study ON public.task_study_focus_attributions(user_id,study_session_id,created_at,id);
CREATE INDEX ls_focus_attribution_task ON public.task_study_focus_attributions(task_id,user_id);
ALTER TABLE public.task_study_focus_attributions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.task_study_focus_attributions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.task_study_focus_attributions TO authenticated,service_role;
CREATE POLICY ls_focus_attribution_owner_read ON public.task_study_focus_attributions
 FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
COMMENT ON TABLE public.task_study_focus_attributions IS
 'Explicit immutable attribution, one Focus -> at most one Study Session. Cancel/revise/reschedule preserves identity; physical parent deletion cascades. No attendance side effects or implicit history backfill.';

-- Existing Focus.task_id uses ON DELETE SET NULL. Remove links BEFORE that
-- referential action on a physical Task delete, so the matching-Task FK does
-- not obstruct the existing deletion contract. This never runs on status edits.
CREATE FUNCTION public.ls_focus_attribution_task_deleted() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 DELETE FROM public.task_study_focus_attributions WHERE task_id=OLD.id AND user_id=OLD.user_id;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.ls_focus_attribution_task_deleted() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER ls_focus_attribution_task_delete BEFORE DELETE ON public.tasks
 FOR EACH ROW EXECUTE FUNCTION public.ls_focus_attribution_task_deleted();

CREATE FUNCTION public.ls_link_study_focus(p_study_session_id uuid,p_focus_session_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid();s public.task_study_sessions;sc public.task_study_schedules;f public.focus_sessions;
 t public.tasks;r public.task_study_focus_attributions;target_task uuid;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_study_session_id IS NULL OR p_focus_session_id IS NULL THEN RAISE EXCEPTION 'Invalid attribution target' USING ERRCODE='22023'; END IF;
 SELECT task_id INTO target_task FROM public.task_study_sessions WHERE id=p_study_session_id AND user_id=u;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid attribution target' USING ERRCODE='22023'; END IF;
 -- Preserve Task -> Schedule -> Study Session order used by attendance/revise.
 SELECT * INTO t FROM public.tasks WHERE id=target_task AND user_id=u FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid attribution target' USING ERRCODE='22023'; END IF;
 SELECT x.* INTO sc FROM public.task_study_schedules x JOIN public.task_study_sessions y
 ON y.schedule_id=x.id AND y.user_id=x.user_id WHERE y.id=p_study_session_id AND y.user_id=u FOR UPDATE OF x;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid attribution target' USING ERRCODE='22023'; END IF;
 SELECT * INTO s FROM public.task_study_sessions WHERE id=p_study_session_id AND user_id=u FOR UPDATE;
 IF NOT FOUND OR s.task_id<>t.id THEN RAISE EXCEPTION 'Invalid attribution target' USING ERRCODE='22023'; END IF;
 -- Focus lifecycle may already own its parent. NOWAIT prevents an inverse wait
 -- through a legacy Task FK update; 55P03 means retry this exact pair later.
 SELECT * INTO f FROM public.focus_sessions WHERE id=p_focus_session_id AND user_id=u FOR UPDATE NOWAIT;
 IF NOT FOUND OR f.task_id IS DISTINCT FROM s.task_id THEN
 RAISE EXCEPTION 'Invalid attribution target' USING ERRCODE='22023'; END IF;
 SELECT * INTO r FROM public.task_study_focus_attributions WHERE focus_session_id=f.id;
 IF FOUND THEN
 IF r.study_session_id=s.id AND r.user_id=u THEN RETURN r.id; END IF;
 RAISE EXCEPTION 'Focus session already attributed' USING ERRCODE='23505'; END IF;
 -- v1: only new active work may be linked. No historical terminal backfill.
 -- Existing exact pairs replay above, even after cancellation/completion.
 IF s.status NOT IN ('scheduled','in_progress') OR sc.status<>'active' OR sc.revision<>s.schedule_revision
 OR t.status::text NOT IN ('todo','in_progress') OR t.parent_task_id IS NOT NULL
 OR f.status::text NOT IN ('ongoing','paused') THEN
 RAISE EXCEPTION 'Attribution target is not active' USING ERRCODE='22023'; END IF;
 INSERT INTO public.task_study_focus_attributions(user_id,task_id,study_session_id,focus_session_id)
 VALUES(u,s.task_id,s.id,f.id) RETURNING * INTO r;
 RETURN r.id;
END $$;
REVOKE ALL ON FUNCTION public.ls_link_study_focus(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.ls_link_study_focus(uuid,uuid) TO authenticated;
