"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { Bell, CalendarDays, ChevronDown, List, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field";

import { formatStudyDate } from "../schedule-presentation";
import { createStudyScheduleAction } from "../schedule.actions";

import { getTaskStudyScheduleAction } from "../schedule.queries.actions";

import { ScheduleDraftEditor } from "./schedule-draft-editor";
import { StudySessionsList } from "./study-sessions-list";
import { StudyTaskReminderToggle } from "./study-task-reminder-toggle";

import type { StudyScheduleInput } from "../schedule-engine";

import { ScheduleRevisionEditor } from "./schedule-revision-editor";

type Props = {
  taskId: string;
  eligible: boolean;
  onEditingChange?: (editing: boolean) => void;
};

type LoadedSchedule = NonNullable<
  Extract<Awaited<ReturnType<typeof getTaskStudyScheduleAction>>, { success: true }>["schedule"]
>;

function defaultDraft(): StudyScheduleInput {
  // Generate a local calendar date, not an ISO UTC date.
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Ho_Chi_Minh";

  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  // Keep the default simple. The user chooses the end date.
  return {
    startsOn: today,
    endsOn: today,
    timezone,
    slots: [
      {
        weekday: ((now.getDay() + 6) % 7) + 1,
        startTime: "19:00",
        endTime: "20:00",
      },
    ],
  };
}

export function TaskStudyScheduleSection({ taskId, eligible, onEditingChange }: Props) {
  const t = useTranslations("learningSchedule");
  const reminderT = useTranslations("studyNotifications");
  const locale = useLocale();
  const router = useRouter();
  const panelId = useId();

  const [schedule, setSchedule] = useState<LoadedSchedule | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editor, setEditor] = useState<"create" | "revise" | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draft, setDraft] = useState<StudyScheduleInput>(() => defaultDraft());
  const [panel, setPanel] = useState<"sessions" | "reminders" | null>(null);

  const [saving, startSaving] = useTransition();
  const saveInFlight = useRef(false);
  const loadRequest = useRef(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);

  const canRevise = eligible && schedule?.status === "active";
  const editing = editor === "create" ? eligible && !schedule : editor === "revise" && canRevise;

  function changeEditor(next: typeof editor) {
    if (!next) restoreFocus.current = true;
    setEditor(next);
  }

  useEffect(() => {
    onEditingChange?.(editing);
    if (editing) headingRef.current?.focus();
    else if (restoreFocus.current && !loading) {
      restoreFocus.current = false;
      (editButtonRef.current ?? headingRef.current)?.focus();
    }
  }, [editing, loading, onEditingChange]);

  const loadSchedule = useCallback(async () => {
    setLoading(true);

    const request = ++loadRequest.current;
    try {
      const result = await getTaskStudyScheduleAction(taskId);
      if (request !== loadRequest.current) return;
      if (result.success) {
        setSchedule(result.schedule);
        setLoadError(null);
      } else {
        setLoadError(t(`errors.${result.code ?? "loadFailed"}`));
      }
    } catch {
      if (request === loadRequest.current) setLoadError(t("errors.loadFailed"));
    } finally {
      if (request === loadRequest.current) setLoading(false);
    }
  }, [taskId, t]);

  useEffect(() => {
    void loadSchedule();
    return () => {
      loadRequest.current += 1;
    };
  }, [loadSchedule]);

  function handleCreate(value: StudyScheduleInput) {
    if (saveInFlight.current || !eligible || schedule) return;
    saveInFlight.current = true;
    setSaveError(null);
    startSaving(async () => {
      try {
        const result = await createStudyScheduleAction({
          taskId,
          ...value,
        });

        if (!result.success) {
          setSaveError(t(`errors.${result.code ?? "saveFailed"}`));
          toast.error(t(`errors.${result.code ?? "saveFailed"}`));
          return;
        }

        toast.success(t("created", { count: result.sessionCount }));

        changeEditor(null);
        await loadSchedule();
        router.refresh();
      } catch {
        setSaveError(t("errors.saveFailed"));
        toast.error(t("errors.saveFailed"));
      } finally {
        saveInFlight.current = false;
      }
    });
  }

  return (
    <section aria-label={t("taskSection")}>
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 basis-48 space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <CalendarDays aria-hidden="true" className="size-icon shrink-0 text-muted-foreground" />
              <h3 ref={headingRef} data-study-schedule-heading tabIndex={-1} className="text-section font-semibold">
                {editing && editor === "create" ? t("add") : t("title")}
              </h3>
              {schedule && !editing && (
                <Badge variant={schedule.status === "active" ? "secondary" : "outline"}>
                  {t(`status.${schedule.status}`)}
                </Badge>
              )}
            </div>
            {schedule && !editing && (
              <>
                <p className="text-body font-medium">
                  <time dateTime={schedule.starts_on}>{formatStudyDate(schedule.starts_on, locale)}</time>
                  {" – "}
                  <time dateTime={schedule.ends_on}>{formatStudyDate(schedule.ends_on, locale)}</time>
                </p>
                <p className="flex flex-wrap gap-x-3 text-caption text-muted-foreground wrap-anywhere">
                  <span>{schedule.timezone}</span>
                  <span>{t("revisionLabel")}: {schedule.revision}</span>
                </p>
              </>
            )}
          </div>
          {!loading && !loadError && !editing && canRevise && (
            <Button ref={editButtonRef} type="button" variant="outline" size="sm" onClick={() => changeEditor("revise")}>
              <Pencil aria-hidden="true" />
              {t("edit")}
            </Button>
          )}
          {!loading && !loadError && !schedule && eligible && !editing && (
            <Button ref={editButtonRef} type="button" size="sm" onClick={() => changeEditor("create")}>
              <Plus aria-hidden="true" />
              {t("add")}
            </Button>
          )}
        </CardHeader>

        {loading ? (
          <CardContent>
            <p role="status" className="text-caption text-muted-foreground">{t("loadingSchedule")}</p>
          </CardContent>
        ) : loadError ? (
          <CardContent className="space-y-2">
            <FieldError>{loadError}</FieldError>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadSchedule()}>{t("retry")}</Button>
          </CardContent>
        ) : editing ? (
          <CardContent>
            {editor === "revise" && schedule ? (
              <ScheduleRevisionEditor
                key={schedule.id}
                scheduleId={schedule.id}
                onCancel={() => changeEditor(null)}
                onSaved={() => {
                  changeEditor(null);
                  void loadSchedule();
                }}
              />
            ) : (
              <fieldset disabled={saving} aria-busy={saving} className="min-w-0 space-y-card">
                <FieldError>{saveError}</FieldError>
                <ScheduleDraftEditor
                  initialValue={draft}
                  disabled={saving}
                  onCancel={() => changeEditor(null)}
                  onContinue={(value) => {
                    setDraft(value);
                    handleCreate(value);
                  }}
                />
              </fieldset>
            )}
          </CardContent>
        ) : schedule ? (
          <>
            <div className="flex flex-wrap gap-1 border-t border-border px-card py-1.5">
              {([
                { value: "sessions", label: t("sessions"), Icon: List },
                { value: "reminders", label: reminderT("taskTitle"), Icon: Bell },
              ] as const).map(({ value, label, Icon }) => (
                <Button
                  key={value}
                  type="button"
                  variant={panel === value ? "secondary" : "ghost"}
                  size="sm"
                  aria-controls={`${panelId}-${value}`}
                  aria-expanded={panel === value}
                  onClick={() => setPanel((current) => current === value ? null : value)}
                >
                  <Icon aria-hidden="true" />
                  {label}
                  <ChevronDown aria-hidden="true" className={panel === value ? "rotate-180" : undefined} />
                </Button>
              ))}
            </div>
            <div id={`${panelId}-sessions`} hidden={panel !== "sessions"}>
              {panel === "sessions" && (
                <CardContent className="border-t border-border pt-card">
                  <StudySessionsList
                    key={`${schedule.id}-${schedule.revision}`}
                    scheduleId={schedule.id}
                    canReschedule={canRevise}
                    canAttend={canRevise}
                  />
                </CardContent>
              )}
            </div>
            <div id={`${panelId}-reminders`} hidden={panel !== "reminders"}>
              {panel === "reminders" && (
                <CardContent className="border-t border-border pt-card">
                  <StudyTaskReminderToggle taskId={taskId} />
                </CardContent>
              )}
            </div>
          </>
        ) : !eligible ? (
          <CardContent>
            <p className="text-caption text-muted-foreground">{t("unavailable")}</p>
          </CardContent>
        ) : null}
      </Card>
    </section>
  );
}
