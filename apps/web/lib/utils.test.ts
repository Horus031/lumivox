import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("application token overrides", () => {
  it("resolves typography without dropping independent text colors", () => {
    expect(cn("text-body text-foreground", "text-lg"))
      .toBe("text-foreground text-lg");
    expect(cn("text-sm", "text-section")).toBe("text-section");
  });

  it("resolves semantic spacing and partial padding overrides", () => {
    expect(cn("p-card pt-0", "p-6")).toBe("p-6");
    expect(cn("p-6", "p-card pt-0")).toBe("p-card pt-0");
    expect(cn("h-touch", "h-11")).toBe("h-11");
    expect(cn("size-icon", "size-6")).toBe("size-6");
  });

  it("preserves independent breakpoint overrides", () => {
    expect(cn("h-touch sm:h-control", "sm:h-10"))
      .toBe("h-touch sm:h-10");
  });
});
