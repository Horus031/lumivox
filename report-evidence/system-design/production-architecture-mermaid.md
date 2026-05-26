# Production Architecture Mermaid Diagram

```mermaid
flowchart TD
    U[User Browser] --> V[Vercel Next.js Web App]

    V --> SA[Server Actions]
    V --> API[Next.js API Routes]
    V --> SC[Supabase Client]

    SA --> R[Upstash Redis]
    SA --> F[Render FastAPI AI API]

    API --> LK[LiveKit Cloud]

    SC --> SB[Supabase Auth + Postgres + Realtime]

    F --> SB
    F --> G[Gemini API]
    F --> ST[Supabase Storage ML Artefacts]

    SB --> DB[(Postgres Tables)]
    SB --> RT[Realtime Channels]

    LK --> Voice[Voice Rooms]