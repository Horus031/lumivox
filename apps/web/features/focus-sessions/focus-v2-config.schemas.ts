import { z } from "zod";

export const focusV2ConfigSchema = z.object({
  taskId: z.union([z.uuid(), z.literal("")]).default(""),
  focusMinutes: z.number().int().min(5).max(120),
  shortBreakMinutes: z.number().int().min(1).max(30),
  longBreakMinutes: z.number().int().min(5).max(60),
  roundCount: z.number().int().min(1).max(8),
  longBreakEvery: z.number().int().min(2).max(8),
  autoStartBreaks: z.boolean(),
  autoStartFocus: z.boolean(),
}).strict();

export type FocusV2Config = z.infer<typeof focusV2ConfigSchema>;
export type FocusV2SegmentKind = "focus" | "short_break" | "long_break";

export type FocusV2ScheduledSegment = {
  position: number;
  roundNumber: number;
  segmentKind: FocusV2SegmentKind;
  plannedSeconds: number;
};

export const DEFAULT_FOCUS_V2_CONFIG: FocusV2Config = {
  taskId: "",
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  roundCount: 4,
  longBreakEvery: 4,
  autoStartBreaks: false,
  autoStartFocus: false,
};

export function buildFocusV2Schedule(input: FocusV2Config): {
  segments: FocusV2ScheduledSegment[];
  plannedFocusMinutes: number;
  plannedBreakMinutes: number;
  plannedTotalMinutes: number;
} {
  const config = focusV2ConfigSchema.parse(input);
  const segments: FocusV2ScheduledSegment[] = [];
  let plannedBreakMinutes = 0;

  for (let roundNumber = 1; roundNumber <= config.roundCount; roundNumber++) {
    segments.push({
      position: 2 * roundNumber - 1,
      roundNumber,
      segmentKind: "focus",
      plannedSeconds: config.focusMinutes * 60,
    });

    if (roundNumber < config.roundCount) {
      const isLongBreak = roundNumber % config.longBreakEvery === 0;
      const breakMinutes = isLongBreak
        ? config.longBreakMinutes
        : config.shortBreakMinutes;
      segments.push({
        position: 2 * roundNumber,
        roundNumber,
        segmentKind: isLongBreak ? "long_break" : "short_break",
        plannedSeconds: breakMinutes * 60,
      });
      plannedBreakMinutes += breakMinutes;
    }
  }

  const plannedFocusMinutes = config.focusMinutes * config.roundCount;
  return {
    segments,
    plannedFocusMinutes,
    plannedBreakMinutes,
    plannedTotalMinutes: plannedFocusMinutes + plannedBreakMinutes,
  };
}
