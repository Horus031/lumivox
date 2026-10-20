import type { Session } from "@supabase/supabase-js";
import {
  authResult,
  type AuthRequest,
  type AuthResponse,
} from "./shared/auth-protocol";
import { getExtensionAuthClient } from "./auth-client";

declare const __LUMIVOX_API_ORIGIN__: string;

type VerifiedUser = {
  id: string;
  email: string;
};

function isVerifiedUser(value: unknown): value is { user: VerifiedUser } {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const object = value as Record<string, unknown>;
  const user = object.user;

  if (typeof user !== "object" || user === null) {
    return false;
  }

  const record = user as Record<string, unknown>;

  return typeof record.id === "string" && typeof record.email === "string";
}

async function verifyWithWebsite(session: Session): Promise<AuthResponse> {
  const response = await fetch(`${__LUMIVOX_API_ORIGIN__}/api/extension/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (response.status === 401) {
    const client = await getExtensionAuthClient();

    try {
      const { error } = await client.auth.signOut({
        scope: "local",
      });

      if (error) {
        return authResult(
          "unavailable",
          undefined,
          "Phiên không hợp lệ nhưng chưa thể xóa credential.",
        );
      }
    } catch {
      return authResult(
        "unavailable",
        undefined,
        "Chưa thể xóa credential không hợp lệ.",
      );
    }

    return authResult(
      "signed_out",
      undefined,
      "Phiên đăng nhập đã hết hiệu lực.",
    );
  }

  if (!response.ok) {
    return authResult(
      "unavailable",
      undefined,
      "Lumivox API tạm thời không khả dụng.",
    );
  }

  const payload: unknown = await response.json();

  if (!isVerifiedUser(payload) || payload.user.id !== session.user.id) {
    return authResult(
      "unavailable",
      undefined,
      "Không thể xác minh đúng tài khoản.",
    );
  }

  return authResult("signed_in", payload.user);
}

async function getAuthStatus(): Promise<AuthResponse> {
  const client = await getExtensionAuthClient();

  const { data, error } = await client.auth.getSession();

  if (error) {
    return authResult(
      "unavailable",
      undefined,
      "Không thể khôi phục phiên đăng nhập.",
    );
  }

  if (!data.session) {
    return authResult("signed_out");
  }

  return verifyWithWebsite(data.session);
}

async function login(email: string, password: string): Promise<AuthResponse> {
  const client = await getExtensionAuthClient();

  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error || !data.session) {
    return authResult(
      "signed_out",
      undefined,
      "Đăng nhập thất bại. Hãy kiểm tra thông tin tài khoản.",
    );
  }

  return verifyWithWebsite(data.session);
}

async function logout(): Promise<AuthResponse> {
  const client = await getExtensionAuthClient();

  const { error } = await client.auth.signOut({
    scope: "local",
  });

  if (error) {
    return authResult(
      "unavailable",
      undefined,
      "Chưa thể đăng xuất an toàn. Hãy thử lại.",
    );
  }

  return authResult("signed_out");
}

export async function handleAuthRequest(
  request: AuthRequest,
): Promise<AuthResponse> {
  try {
    switch (request.type) {
      case "AUTH_STATUS":
        return await getAuthStatus();

      case "AUTH_LOGIN":
        return await login(request.email, request.password);

      case "AUTH_LOGOUT":
        return await logout();
    }
  } catch {
    return authResult(
      "unavailable",
      undefined,
      "Không thể kết nối dịch vụ xác thực.",
    );
  }
}
