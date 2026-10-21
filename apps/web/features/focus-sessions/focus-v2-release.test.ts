import { describe, expect, it } from "vitest";
import {
  getFocusV2ReleaseMode,
  isFocusV2CreationEnabled,
  isFocusV2RuntimeEnabled,
} from "./focus-v2-release";

describe("Focus V2 rollout / drain-mode contract", () => {
  it("is off when runtime flag is absent", () => {
    expect(getFocusV2ReleaseMode({})).toBe("off");
    expect(isFocusV2RuntimeEnabled({})).toBe(false);
    expect(isFocusV2CreationEnabled({})).toBe(false);
  });

  it("preserves Phase 3–8 behavior when creation flag is absent", () => {
    const env = { FOCUS_V2_ENABLED: "true" };
    expect(getFocusV2ReleaseMode(env)).toBe("on");
    expect(isFocusV2RuntimeEnabled(env)).toBe(true);
    expect(isFocusV2CreationEnabled(env)).toBe(true);
  });

  it("drain blocks creation but leaves existing runtime available", () => {
    const env = {
      FOCUS_V2_ENABLED: "true",
      FOCUS_V2_CREATION_ENABLED: "false",
    };
    expect(getFocusV2ReleaseMode(env)).toBe("drain");
    expect(isFocusV2RuntimeEnabled(env)).toBe(true);
    expect(isFocusV2CreationEnabled(env)).toBe(false);
  });

  it("creation flag cannot override a disabled runtime", () => {
    const env = {
      FOCUS_V2_ENABLED: "false",
      FOCUS_V2_CREATION_ENABLED: "true",
    };
    expect(getFocusV2ReleaseMode(env)).toBe("off");
    expect(isFocusV2CreationEnabled(env)).toBe(false);
  });

  it("only exact literal false requests drain mode", () => {
    expect(getFocusV2ReleaseMode({
      FOCUS_V2_ENABLED: "true",
      FOCUS_V2_CREATION_ENABLED: "true",
    })).toBe("on");
    expect(getFocusV2ReleaseMode({
      FOCUS_V2_ENABLED: "true",
      FOCUS_V2_CREATION_ENABLED: "FALSE",
    })).toBe("on");
  });
});
