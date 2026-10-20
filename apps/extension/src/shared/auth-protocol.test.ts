import { describe, expect, it } from "vitest";

import {
  authResult,
  isAuthRequest,
  isAuthResponse,
} from "./auth-protocol";

const envelope = {
  channel: "lumivox.extension",
  version: 1,
};

describe("Extension authentication protocol", () => {
  it("accepts valid login messages", () => {
    expect(
      isAuthRequest({
        ...envelope,
        type: "AUTH_LOGIN",
        email: "student@example.test",
        password: "example-password",
      }),
    ).toBe(true);
  });

  it("rejects invalid credentials", () => {
    expect(
      isAuthRequest({
        ...envelope,
        type: "AUTH_LOGIN",
        email: "",
        password: "123",
      }),
    ).toBe(false);
  });

  it("rejects unsupported versions", () => {
    expect(
      isAuthRequest({
        ...envelope,
        version: 2,
        type: "AUTH_STATUS",
      }),
    ).toBe(false);
  });

  it("accepts status and logout", () => {
    expect(
      isAuthRequest({
        ...envelope,
        type: "AUTH_STATUS",
      }),
    ).toBe(true);

    expect(
      isAuthRequest({
        ...envelope,
        type: "AUTH_LOGOUT",
      }),
    ).toBe(true);
  });

  it("only accepts well-formed auth responses", () => {
    const response = authResult(
      "signed_in",
      {
        id: "user-id",
        email: "student@example.test",
      },
    );

    expect(isAuthResponse(response)).toBe(true);

    expect(
      isAuthResponse({
        ...response,
        state: "unknown",
      }),
    ).toBe(false);
  });

  it("never serializes credentials into results", () => {
    const response = authResult(
      "signed_in",
      {
        id: "user-id",
        email: "student@example.test",
      },
    );

    expect(response).not.toHaveProperty(
      "access_token",
    );

    expect(response).not.toHaveProperty(
      "refresh_token",
    );

    expect(response).not.toHaveProperty(
      "password",
    );
  });
});