# Redis Rate Limit Policy

## Purpose

The purpose of the Redis rate limit layer is to protect expensive operations in Lumivox, especially AI and analytics workflows that call the FastAPI backend or Gemini API.

## Rate-Limited Actions

| Feature | Key Pattern | Limit | Window |
|---|---|---:|---|
| PBI refresh | `pbi-refresh:{userId}` | 5 | 10 minutes |
| Native task risk refresh | `native-task-risk-refresh:{userId}` | 5 | 10 minutes |
| Native task AI insight | `native-task-ai-insight:{userId}` | 3 | 10 minutes |
| Weekly reflection | `weekly-reflection:{userId}` | 2 | 1 day |
| Engagement recalculation | `engagement-recalculate:{userId}` | 10 | 10 minutes |

## Design Notes

- Rate limits are applied per authenticated user.
- Core CRUD operations are not rate-limited because they are central to the user experience.
- Realtime chat and presence are not rate-limited through Redis in the current version because Supabase Realtime handles the channel transport.
- The most expensive operations are protected first.

## User Experience

When a user exceeds a limit, the application returns a friendly message such as:

```txt
Too many requests. Please try again in 3 minute(s).