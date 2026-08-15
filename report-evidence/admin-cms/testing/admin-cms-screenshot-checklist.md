# Admin CMS Screenshot Checklist

## Purpose

This checklist identifies screenshots that should be collected for the final report and presentation.

## Required Screenshots

| Screenshot | Route | Purpose | Captured |
|---|---|---|---|
| Admin dashboard overview | `/en/admin` | Show system metrics |  |
| Admin user management | `/en/admin/users` | Show user search and management |  |
| Admin user detail | `/en/admin/users/[userId]` | Show user activity summary |  |
| Admin document management | `/en/admin/documents` | Show document processing status |  |
| Admin document detail | `/en/admin/documents/[documentId]` | Show chunks and RAG health |  |
| Admin group management | `/en/admin/groups` | Show group moderation |  |
| Admin group detail | `/en/admin/groups/[groupId]` | Show members/messages moderation |  |
| Admin AI monitoring | `/en/admin/ai` | Show AI observability metrics |  |
| Admin AI session detail | `/en/admin/ai/sessions/[sessionId]` | Show RAG conversation inspection |  |
| CMS settings | `/en/admin/settings` | Show feature flags and defaults |  |
| Non-admin blocked route | `/en/admin` using normal user | Show access control |  |

## Optional Screenshots

| Screenshot | Route | Purpose | Captured |
|---|---|---|---|
| Dark mode admin dashboard | `/en/admin` | Show dark mode support |  |
| Mobile admin table scroll | `/en/admin/users` | Show responsive design |  |
| Empty-source RAG alert | `/en/admin/ai` | Show AI quality monitoring |  |
| Archived group state | `/en/admin/groups` | Show moderation lifecycle |  |