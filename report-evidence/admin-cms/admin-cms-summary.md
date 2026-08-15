# Admin CMS Summary

## Overview

The Admin CMS was implemented as a production-oriented management layer for Lumivox. It allows administrators to monitor platform activity, manage users, moderate social learning spaces, inspect uploaded documents, observe AI/RAG usage, and configure platform-level feature flags.

## Implemented Modules

| Module | Route | Purpose |
|---|---|---|
| Admin Dashboard | `/en/admin` | Monitor high-level platform metrics |
| User Management | `/en/admin/users` | Search users, inspect user activity, manage roles and leaderboard visibility |
| Document & RAG Management | `/en/admin/documents` | Monitor uploaded documents, processing status, chunks, and moderation |
| Group Management | `/en/admin/groups` | Inspect groups, members, messages, archive groups, and moderate chat |
| AI Monitoring | `/en/admin/ai` | Monitor RAG usage, latency, prompt variants, source quality, and document health |
| CMS Settings | `/en/admin/settings` | Manage feature flags and default platform settings |

## Admin Dashboard Metrics

The dashboard includes:

- Total users
- New users in the last 7 days
- Total goals
- Total tasks and completed tasks
- Focus sessions and total focus minutes
- Uploaded documents
- Processed RAG documents
- Document chunks
- Study groups and messages
- RAG sessions and messages

## User Management

User management supports:

- Search by name, email, or user ID
- User detail view
- Role changes
- Last-admin protection
- Leaderboard visibility toggle
- Activity summary

## Document and RAG Management

Document management supports:

- Search and filter documents
- View document metadata
- View processing status
- Inspect extracted text preview
- Inspect RAG chunks
- Re-process documents
- Delete documents and related chunks/permissions

## Group Management and Moderation

Group management supports:

- Search study groups
- Filter active/archived groups
- View group members
- View recent messages
- Delete problematic messages
- Archive and restore groups

## AI Monitoring

AI monitoring supports:

- RAG session overview
- General AI vs Document RAG usage
- Prompt variant usage
- Top-k usage
- Average and maximum latency
- Assistant answers with retrieved context
- Empty-source RAG answer alerts
- Document processing health summary

## CMS Settings

CMS settings support:

- Global leaderboard feature flag
- Group leaderboard feature flag
- Default RAG top-k
- Default RAG prompt variant
- Weekly challenge default focus target
- Weekly challenge default task target
- Maintenance mode flag

## Production Value

The Admin CMS improves the operational readiness of Lumivox by giving administrators visibility and control over users, content, AI behavior, social spaces, and platform settings.

## Security Value

Admin features are protected by server-side route guards and secured database RPC functions. This provides both application-level and database-level access control.