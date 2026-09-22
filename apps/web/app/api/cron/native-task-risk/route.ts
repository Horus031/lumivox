import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");

  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return Response.json(
      {
        success: false,
        message: "Unauthorized cron request.",
      },
      {
        status: 401,
      }
    );
  }

  const aiApiBaseUrl = process.env.AI_API_BASE_URL;
  const nativeTaskRiskCronSecret = process.env.NATIVE_TASK_RISK_CRON_SECRET;

  if (!aiApiBaseUrl || !nativeTaskRiskCronSecret) {
    return Response.json(
      {
        success: false,
        message:
          "AI_API_BASE_URL and NATIVE_TASK_RISK_CRON_SECRET must be configured.",
      },
      {
        status: 500,
      }
    );
  }

  const response = await fetch(
    `${aiApiBaseUrl}/api/v1/native-task-risk/cron-refresh`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cron-Secret": nativeTaskRiskCronSecret,
      },
      body: JSON.stringify({
        horizon_days: 14,
        max_users: 50,
        max_tasks_per_user: 8,
        skip_recent_hours: 6,
      }),
      cache: "no-store",
    }
  );

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    return Response.json(
      {
        success: false,
        message: "Native task risk cron refresh failed.",
        payload,
      },
      {
        status: response.status,
      }
    );
  }

  return Response.json({
    success: true,
    payload,
  });
}