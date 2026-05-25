# Lumivox Production Architecture

## 1. Overview

Lumivox is deployed as a multi-service web application consisting of:

- Next.js web application deployed on Vercel
- FastAPI AI service deployed on Render
- Supabase Cloud for authentication, database, row-level security, and realtime features
- LiveKit Cloud for voice room functionality
- Gemini API for structured AI-generated explanations
- Upstash Redis for rate limiting and short-lived caching

## 2. Production Architecture Diagram

```txt
User Browser
   |
   v
Vercel - Next.js Web App
   |
   |-- Supabase Client
   |     |-- Auth
   |     |-- Postgres RLS
   |     |-- Realtime channels
   |
   |-- Server Actions
   |     |-- Upstash Redis rate limit / cache
   |     |-- Internal call to FastAPI AI API
   |
   |-- API Route
         |-- LiveKit voice token generation

Render - FastAPI AI API
   |
   |-- PBI calculation
   |-- Native task risk calculation
   |-- Weekly reflection generation
   |-- Engagement recalculation
   |-- Deadline-risk research model runtime
   |-- Gemini API integration
   |
   v
Supabase Cloud
   |
   |-- profiles
   |-- goals
   |-- tasks
   |-- focus_sessions
   |-- pbi_snapshots
   |-- native_task_risk_assessments
   |-- weekly_reflections
   |-- reward_ledger
   |-- study_rooms
   |-- study_room_messages

LiveKit Cloud
   |
   |-- Study room voice channels

Gemini API
   |
   |-- Evidence-grounded structured AI output
```

## 3. Key Design Decisions

### 3.1. Next.js on Vercel

The frontend is deployed on Vercel because the application is built with Next.js App Router, Server Actions, server components, and API routes.

### 3.2. FastAPI on Render

The AI backend is deployed separately from the web application to isolate heavier backend workloads such as model loading, risk calculation, AI generation, and behavioural analytics processing.

### 3.3. Supabase as Backend Data Layer

Supabase is used for authentication, PostgreSQL storage, row-level security, and realtime collaboration. This reduces infrastructure complexity while still supporting relational data modelling and realtime study rooms.

### 3.4. LiveKit for Voice

Voice rooms are handled by LiveKit instead of custom WebRTC implementation. This avoids the complexity of peer connection management, SFU operation, and audio stream routing.

### 3.5. Upstash Redis for Hardening

Redis is used as a lightweight protection layer for expensive AI operations. Rate limits prevent repeated button clicks or request bursts from overloading the AI backend or increasing LLM cost.


## 4. Data Flow Examples
### 4.1. Refresh PBI
User clicks Refresh PBI
→ Next.js Server Action
→ Redis rate limit check
→ FastAPI PBI endpoint
→ Supabase inserts PBI snapshot
→ Dashboard revalidates
### 4.2. Generate AI Insight
User clicks Generate AI Insight
→ Next.js Server Action
→ Redis rate limit check
→ FastAPI builds deterministic evidence
→ Gemini generates structured explanation
→ Supabase stores AI insight card
→ UI refreshes
### 4.3. Study Room Realtime Chat
User sends chat message
→ Supabase insert into study_room_messages
→ Supabase Realtime broadcasts change
→ Other room members receive message without refresh
### 4.4. Voice Room
User clicks Join Voice
→ Next.js API route verifies Supabase membership
→ API route creates LiveKit token
→ Browser connects to LiveKit room
→ LiveKit handles audio transport
### 4.5. Engagement Streak Update
User completes valid task or focus session
→ Server Action updates task/focus session
→ Engagement cache invalidated
→ FastAPI recalculates streak/token status
→ Supabase updates user_engagement_stats
→ Layout revalidates
→ Sidebar mini stats update