# Scalability Hardening Summary

## 1. Target Production Load

The production deployment is designed to support an initial evaluation group of approximately 20–50 users. The system is not designed as an enterprise-scale platform at this stage, but it includes several hardening measures to reduce bottlenecks and protect expensive operations.

## 2. Main Bottlenecks Identified

| Bottleneck | Risk | Mitigation |
|---|---|---|
| Repeated AI requests | Increased Gemini/API cost and backend load | Per-user Redis rate limiting |
| Repeated engagement recalculation | Unnecessary FastAPI calls on layout render | 30-second Redis cache |
| Model runtime loading | Large model artefact unavailable in GitHub | Supabase Storage artefact download |
| Realtime study rooms | Unauthorized topic access or stale member state | Supabase Realtime authorization policies |
| Voice rooms | WebRTC complexity and server load | LiveKit Cloud |
| Database access | Cross-user data leakage risk | Supabase Row Level Security |

## 3. Redis Rate Limiting

Redis rate limiting is applied to expensive or repeated AI-related actions:

| Action | Limit |
|---|---:|
| Refresh PBI | 5 requests / 10 minutes / user |
| Native task risk scan | 5 requests / 10 minutes / user |
| Native task AI insight generation | 3 requests / 10 minutes / user |
| Weekly reflection generation | 2 requests / day / user |
| Engagement recalculation fallback | 10 requests / 10 minutes / user |

## 4. Short-Lived Cache

A 30-second Redis cache is used for automatic engagement recalculation. This ensures that the sidebar can initialize streak and token values without repeatedly calling the FastAPI service on every page render.

The cache is invalidated after meaningful user activity such as:

- completing a valid task
- completing a valid focus session
- restoring a frozen streak

## 5. Why Full Queueing Was Not Implemented Yet

A full asynchronous job queue was considered for AI generation and weekly reflection. However, for the current expected evaluation scale of 20–50 users, Redis rate limiting and short-lived caching provide a simpler and lower-risk hardening strategy.

A queue can be introduced in future work for:

- bulk weekly reflection generation
- long-running model inference
- scheduled engagement recalculation
- retraining pipelines
- email or notification jobs

## 6. Final Interpretation

The production hardening strategy prioritizes practical reliability over unnecessary infrastructure complexity. The combination of server-side rate limiting, short-lived caching, Supabase RLS, private realtime channels, and externalized voice/media processing is sufficient for the current evaluation scale while leaving a clear upgrade path for future growth.