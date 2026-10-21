import { describe, expect, it } from "vitest";

import {
  getApprovedSiteOrigin,
  isCheckSiteRequest,
  isCheckSiteResponse,
  isSiteHelloRequest,
  isSiteReadyResponse,
} from "./protocol";

const origins = ["https://www.lumivox.it.com", "http://localhost:3000"];

describe("Lumivox Extension protocol", () => {
  it("accepts an approved Lumivox URL", () => {
    expect(
      getApprovedSiteOrigin("https://www.lumivox.it.com/en/focus", origins),
    ).toBe("https://www.lumivox.it.com");
  });

  it("rejects another website", () => {
    expect(getApprovedSiteOrigin("https://example.com/", origins)).toBeNull();
  });

  it("rejects a deceptive subdomain", () => {
    expect(
      getApprovedSiteOrigin(
        "https://www.lumivox.it.com.evil.example/",
        origins,
      ),
    ).toBeNull();
  });

  it("checks the localhost port", () => {
    expect(getApprovedSiteOrigin("http://localhost:9999", origins)).toBeNull();
  });

  it("rejects malformed URLs", () => {
    expect(getApprovedSiteOrigin("invalid-url", origins)).toBeNull();
  });

  it("accepts a versioned popup request", () => {
    expect(
      isCheckSiteRequest({
        channel: "lumivox.extension",
        version: 1,
        type: "CHECK_SITE",
      }),
    ).toBe(true);
  });

  it("rejects unsupported protocol versions", () => {
    expect(
      isSiteHelloRequest({
        channel: "lumivox.extension",
        version: 999,
        type: "SITE_HELLO",
      }),
    ).toBe(false);
  });

  it("requires a valid site-ready origin", () => {
    expect(
      isSiteReadyResponse({
        channel: "lumivox.extension",
        version: 1,
        type: "SITE_READY",
        origin: "https://www.lumivox.it.com",
      }),
    ).toBe(true);

    expect(
      isSiteReadyResponse({
        channel: "lumivox.extension",
        version: 1,
        type: "SITE_READY",
        origin: 123,
      }),
    ).toBe(false);
  });

  it("validates popup response states", () => {
    expect(
      isCheckSiteResponse({
        channel: "lumivox.extension",
        version: 1,
        type: "CHECK_SITE_RESULT",
        state: "ready",
      }),
    ).toBe(true);

    expect(
      isCheckSiteResponse({
        channel: "lumivox.extension",
        version: 1,
        type: "CHECK_SITE_RESULT",
        state: "authenticated",
      }),
    ).toBe(false);
  });
});
