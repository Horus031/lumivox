import { getExtensionAuthClient } from "./auth-client";
import {
  focusResult,
  isFocusSnapshot,
  type FocusRequest,
  type FocusResponse,
} from "./shared/focus-protocol";

declare const __LUMIVOX_API_ORIGIN__: string;

export async function handleFocusRequest(
  request: FocusRequest,
): Promise<FocusResponse> {
  try {
    const client = await getExtensionAuthClient();
    const { data, error } = await client.auth.getSession();

    if (error) {
      return focusResult(
        "unavailable",
        undefined,
        "Không thể khôi phục phiên đăng nhập.",
      );
    }

    if (!data.session) {
      return focusResult("unauthorized");
    }

    const isTransition = request.type === "FOCUS_TRANSITION";

    const response = await fetch(
      `${__LUMIVOX_API_ORIGIN__}/api/extension/focus`,
      {
        method: isTransition ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          Accept: "application/json",
          ...(isTransition ? { "Content-Type": "application/json" } : {}),
        },
        ...(isTransition
          ? {
              body: JSON.stringify({
                sessionId: request.sessionId,
                expectedSegmentId: request.expectedSegmentId,
                action: request.action,
              }),
            }
          : {}),
        cache: "no-store",
        credentials: "omit",
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (response.status === 401) {
      return focusResult(
        "unauthorized",
        undefined,
        "Phiên Extension không còn hợp lệ.",
      );
    }

    if (response.status === 409 || (isTransition && response.status === 404)) {
      return focusResult(
        "conflict",
        undefined,
        "Phiên học đã thay đổi. Hãy đồng bộ lại.",
      );
    }

    if (!response.ok) {
      return focusResult(
        "unavailable",
        undefined,
        "Không thể tải hoặc cập nhật phiên học.",
      );
    }

    const payload: unknown = await response.json();

    if (
      typeof payload !== "object" ||
      payload === null ||
      !("snapshot" in payload)
    ) {
      return focusResult("unavailable");
    }

    const snapshot = payload.snapshot;

    if (snapshot === null) {
      return focusResult("idle", null);
    }

    if (!isFocusSnapshot(snapshot)) {
      return focusResult(
        "unavailable",
        undefined,
        "Server trả về trạng thái không hợp lệ.",
      );
    }

    return focusResult("active", snapshot);
  } catch {
    return focusResult(
      "unavailable",
      undefined,
      "Mất kết nối. Trạng thái chưa được xác nhận.",
    );
  }
}
