import {
  PROTOCOL_CHANNEL,
  PROTOCOL_VERSION,
} from "./protocol";

type Envelope = {
  channel: typeof PROTOCOL_CHANNEL;
  version: typeof PROTOCOL_VERSION;
};

export type AuthStatusRequest = Envelope & {
  type: "AUTH_STATUS";
};

export type AuthLoginRequest = Envelope & {
  type: "AUTH_LOGIN";
  email: string;
  password: string;
};

export type AuthLogoutRequest = Envelope & {
  type: "AUTH_LOGOUT";
};

export type AuthRequest =
  | AuthStatusRequest
  | AuthLoginRequest
  | AuthLogoutRequest;

export type AuthState =
  | "signed_in"
  | "signed_out"
  | "unavailable";

export type AuthResponse = Envelope & {
  type: "AUTH_RESULT";
  state: AuthState;
  user?: {
    id: string;
    email: string;
  };
  message?: string;
};

export function isAuthRequest(
  value: unknown,
): value is AuthRequest {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }

  const v = value as Record<string, unknown>;

  if (
    v.channel !== PROTOCOL_CHANNEL ||
    v.version !== PROTOCOL_VERSION
  ) {
    return false;
  }

  if (
    v.type === "AUTH_STATUS" ||
    v.type === "AUTH_LOGOUT"
  ) {
    return true;
  }

  if (v.type === "AUTH_LOGIN") {
    return (
      typeof v.email === "string" &&
      v.email.length > 0 &&
      v.email.length <= 320 &&
      typeof v.password === "string" &&
      v.password.length >= 6 &&
      v.password.length <= 128
    );
  }

  return false;
}

export function isAuthResponse(
  value: unknown,
): value is AuthResponse {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }

  const v = value as Record<string, unknown>;

  if (
    v.channel !== PROTOCOL_CHANNEL ||
    v.version !== PROTOCOL_VERSION ||
    v.type !== "AUTH_RESULT"
  ) {
    return false;
  }

  if (
    v.state !== "signed_in" &&
    v.state !== "signed_out" &&
    v.state !== "unavailable"
  ) {
    return false;
  }

  if (
    v.message !== undefined &&
    typeof v.message !== "string"
  ) {
    return false;
  }

  if (v.state === "signed_in") {
    if (
      typeof v.user !== "object" ||
      v.user === null
    ) {
      return false;
    }

    const user = v.user as Record<string, unknown>;

    return (
      typeof user.id === "string" &&
      typeof user.email === "string"
    );
  }

  return v.user === undefined;
}

export function authResult(
  state: AuthState,
  user?: { id: string; email: string },
  message?: string,
): AuthResponse {
  return {
    channel: PROTOCOL_CHANNEL,
    version: PROTOCOL_VERSION,
    type: "AUTH_RESULT",
    state,
    ...(user ? { user } : {}),
    ...(message ? { message } : {}),
  };
}