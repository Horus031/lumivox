# Admin CMS Test Matrix

## Purpose

This test matrix verifies that the Lumivox Admin CMS works correctly across dashboard monitoring, user management, document management, group moderation, AI monitoring, and system settings.

## 1. Admin Access Control

| Test Case | Expected Result | Status | Notes |
|---|---|---|---|
| Admin opens `/en/admin` | Admin dashboard loads successfully |  |  |
| Non-admin opens `/en/admin` | User receives 404/not found |  |  |
| Non-admin opens `/en/admin/users` | User receives 404/not found |  |  |
| Non-admin opens `/en/admin/documents` | User receives 404/not found |  |  |
| Non-admin opens `/en/admin/groups` | User receives 404/not found |  |  |
| Non-admin opens `/en/admin/ai` | User receives 404/not found |  |  |
| Non-admin opens `/en/admin/settings` | User receives 404/not found |  |  |

## 2. Admin Dashboard

| Test Case | Expected Result | Status | Notes |
|---|---|---|---|
| Dashboard metrics load | Total users, goals, tasks, focus sessions, documents, groups, and RAG metrics are shown |  |  |
| Recent users table loads | Recent users are displayed |  |  |
| Admin navigation buttons work | Links to users, documents, groups, AI, and settings work |  |  |
| Metrics match database counts | Basic counts align with database queries |  |  |

## 3. User Management

| Test Case | Expected Result | Status | Notes |
|---|---|---|---|
| `/en/admin/users` loads | User management page loads successfully |  |  |
| Search by full name | Matching users are shown |  |  |
| Search by email | Matching users are shown |  |  |
| Search by user id | Matching user is shown |  |  |
| User detail page loads | Activity summary appears correctly |  |  |
| Change user role to admin | User role updates successfully |  |  |
| Change admin role to user | Role updates unless it is the last admin |  |  |
| Remove last admin | System blocks the action |  |  |
| Toggle leaderboard visibility off | User is hidden from global leaderboard |  |  |
| Toggle leaderboard visibility on | User appears again if they have score |  |  |

## 4. Document and RAG Management

| Test Case | Expected Result | Status | Notes |
|---|---|---|---|
| `/en/admin/documents` loads | Document management page loads successfully |  |  |
| Search by file name | Matching documents are shown |  |  |
| Search by owner name/email | Matching documents are shown |  |  |
| Filter completed documents | Only completed documents are shown |  |  |
| Filter failed documents | Only failed documents are shown |  |  |
| Document detail page loads | Metadata, status, and chunk counts appear |  |  |
| Chunk inspection works | Admin can inspect generated chunks |  |  |
| Re-process document | Document processing endpoint is called successfully |  |  |
| Delete document | Storage object, metadata, permissions, and chunks are removed |  |  |

## 5. Group Management and Moderation

| Test Case | Expected Result | Status | Notes |
|---|---|---|---|
| `/en/admin/groups` loads | Group management page loads successfully |  |  |
| Search by group name | Matching groups are shown |  |  |
| Search by owner/email | Matching groups are shown |  |  |
| Filter active groups | Only active groups are shown |  |  |
| Filter archived groups | Only archived groups are shown |  |  |
| Group detail page loads | Members and recent messages are shown |  |  |
| Delete group message | Message is removed from the group chat after refresh |  |  |
| Archive group | Group becomes archived |  |  |
| Archived group blocked in user-facing page | Normal group page no longer opens archived group |  |  |
| Restore group | Group becomes active again |  |  |

## 6. AI Monitoring

| Test Case | Expected Result | Status | Notes |
|---|---|---|---|
| `/en/admin/ai` loads | AI monitoring page loads successfully |  |  |
| AI metrics load | Sessions, messages, latency, context modes, top-k usage appear |  |  |
| Search by user/email/session id | Matching sessions are shown |  |  |
| Filter General AI | Only general AI sessions are shown |  |  |
| Filter Document RAG | Only document RAG sessions are shown |  |  |
| Session detail page loads | Conversation messages are shown |  |  |
| Raw sources/retrieved context opens | Retrieved context JSON is inspectable |  |  |
| Empty-source alert works | Document RAG answers without sources are listed |  |  |

## 7. CMS Settings and Feature Flags

| Test Case | Expected Result | Status | Notes |
|---|---|---|---|
| `/en/admin/settings` loads | CMS settings page loads successfully |  |  |
| Toggle global leaderboard off | Global leaderboard disabled state appears |  |  |
| Toggle global leaderboard on | Global leaderboard works again |  |  |
| Toggle group leaderboard off | Group leaderboard/challenge hidden or disabled |  |  |
| Toggle group leaderboard on | Group leaderboard/challenge works again |  |  |
| Change default RAG top-k | Study Assistant receives new default |  |  |
| Change default prompt variant | Study Assistant receives new default |  |  |
| Change weekly challenge defaults | Group challenge form uses new defaults |  |  |
| Invalid setting value rejected | Database RPC validation blocks invalid values |  |  |

## 8. UI and Responsiveness

| Test Case | Expected Result | Status | Notes |
|---|---|---|---|
| Admin dashboard readable in dark mode | Text and cards are readable |  |  |
| Tables horizontally scroll on mobile | No broken layout |  |  |
| Forms usable on mobile | Inputs and buttons are usable |  |  |
| Admin pages work in `/en` locale | English routes work |  |  |
| Admin pages work in `/vi` locale | Vietnamese routes work if translated |  |  |