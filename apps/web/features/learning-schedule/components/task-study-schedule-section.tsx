"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { createStudyScheduleAction } from "../schedule.actions";

import { getTaskStudyScheduleAction } from "../schedule.queries.actions";

import { ScheduleDraftEditor } from "./schedule-draft-editor";
import { StudySessionsList } from "./study-sessions-list";

import type { StudyScheduleInput } from "../schedule-engine";

type Props = {
  taskId: string;
  eligible: boolean;
};

type LoadedSchedule = NonNullable<
  Extract<
    Awaited<ReturnType<typeof getTaskStudyScheduleAction>>,
    { success: true }
  >["schedule"]
>;

function defaultDraft(): StudyScheduleInput {
  // Generate a local calendar date, not an ISO UTC date.
  const timezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Ho_Chi_Minh";

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

export function TaskStudyScheduleSection({ taskId, eligible }: Props) {
  const router = useRouter();

  const [schedule, setSchedule] = useState<LoadedSchedule | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draft, setDraft] = useState<StudyScheduleInput>(() => defaultDraft());

  const [saving, startSaving] = useTransition();
  const saveInFlight = useRef(false);
  const loadRequest = useRef(0);

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
        setLoadError(result.message);
      }
    } catch {
      if (request === loadRequest.current) setLoadError("Unable to load study schedule.");
    } finally {
      if (request === loadRequest.current) setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    void loadSchedule();
    return () => { loadRequest.current += 1; };
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
          setSaveError(result.message);
          toast.error(result.message);
          return;
        }

        toast.success(`Created ${result.sessionCount} study sessions.`);

        setEditing(false);
        await loadSchedule();
        router.refresh();
      } catch {
        setSaveError("Unable to create the study schedule.");
        toast.error("Unable to create the study schedule.");
      } finally {
        saveInFlight.current = false;
      }
    });
  }

  return (
    <section
      aria-label="Task study schedule"
      className="space-y-4 border-t border-border pt-4"
    >
      <h3 className="font-medium">Study schedule</h3>

      {loading ? (
        <p role="status" className="text-sm">
          Loading study schedule...
        </p>
      ) : loadError ? (
        <div role="alert" className="space-y-2">
          <p className="text-sm">{loadError}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadSchedule()}
          >
            Retry
          </Button>
        </div>
      ) : schedule ? (
        <div className="space-y-2 text-sm">
          <p>
            {schedule.starts_on} – {schedule.ends_on}
          </p>
          <p>Timezone: {schedule.timezone}</p>
          <p>Status: {schedule.status}</p>
          <p>Revision: {schedule.revision}</p>
          <StudySessionsList key={schedule.id} scheduleId={schedule.id} />
        </div>
      ) : !eligible ? (
        <p className="text-sm text-muted-foreground">
          Study scheduling is not available for this Task.
        </p>
      ) : editing ? (
        <fieldset
          disabled={saving}
          aria-busy={saving}
          className={`min-w-0 border-0 p-0 ${saving ? "opacity-60" : ""}`}
        >
          {saveError && <p role="alert" className="text-sm text-red-600">{saveError}</p>}
          <ScheduleDraftEditor
            initialValue={draft}
            onContinue={(value) => {
              setDraft(value);
              handleCreate(value);
            }}
          />

          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => setEditing(false)}
            className="mt-3"
          >
            Cancel
          </Button>
        </fieldset>
      ) : (
        <Button type="button" onClick={() => setEditing(true)}>
          Add study schedule
        </Button>
      )}
    </section>
  );
}
