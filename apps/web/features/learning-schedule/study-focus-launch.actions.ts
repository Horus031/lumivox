"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { AiApiError, fetchAiApi } from "@/lib/ai-api/fetch-ai-api";
import { isFocusV2CreationEnabled } from "@/features/focus-sessions/focus-v2-release";
import {
  focusV2PreferencesSchema,
  type FocusV2Preferences,
} from "@/features/focus-sessions/focus-v2-preferences";

type StartStudyFocusInput = FocusV2Preferences & {
  studySessionId: string;
  launchRequestId: string;
};

const inputSchema = focusV2PreferencesSchema
  .extend({
    studySessionId: z.uuid(),
    launchRequestId: z.uuid(),
  })
  .strict();
const responseSchema = z.object({ session_id: z.uuid(), replay: z.boolean() });
const errorCodes = {
  400: "invalidInput",
  403: "notAuthorized",
  409: "requestConflict",
  410: "ineligibleSession",
  422: "invalidInput",
  423: "activeFocusConflict",
  429: "retryableConflict",
} as const;
type ErrorCode = (typeof errorCodes)[keyof typeof errorCodes] | "uncertain";
type StartStudyFocusResult =
  | { success: true; focusSessionId: string; replay: boolean }
  | { success: false; code: ErrorCode };

export async function startStudyFocusAction(
  input: StartStudyFocusInput,
): Promise<StartStudyFocusResult> {
  const auth = await requireUser().catch(() => null);
  if (!auth) return { success: false, code: "notAuthorized" };
  if (!isFocusV2CreationEnabled()) return { success: false, code: "ineligibleSession" };
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { success: false, code: "invalidInput" };
  const config = parsed.data;

  try {
    const raw = await fetchAiApi<unknown>({
      path: "/api/v1/focus-v2/create-from-study-session",
      retries: 0,
      body: {
        user_id: auth.user.id,
        study_session_id: config.studySessionId,
        launch_request_id: config.launchRequestId,
        focus_minutes: config.focusMinutes,
        short_break_minutes: config.shortBreakMinutes,
        long_break_minutes: config.longBreakMinutes,
        round_count: config.roundCount,
        long_break_every: config.longBreakEvery,
        auto_start_breaks: config.autoStartBreaks,
        auto_start_focus: config.autoStartFocus,
      },
    });
    const response = responseSchema.parse(raw);
    return { success: true, focusSessionId: response.session_id, replay: response.replay };
  } catch (error) {
    const code =
      error instanceof AiApiError ? errorCodes[error.status as keyof typeof errorCodes] : undefined;
    return { success: false, code: code ?? "uncertain" };
  }
}
