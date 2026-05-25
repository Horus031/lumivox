# Production Incident Playbook

## 1. FastAPI AI API Down

### Symptoms
- PBI refresh fails
- AI insight generation fails
- Weekly reflection fails
- Engagement recalculation fails

### Checks
1. Open Render logs.
2. Check `/api/v1/health`.
3. Check environment variables.
4. Check model artefact download from Supabase Storage.

### Recovery
- Redeploy Render service.
- Verify `SUPABASE_SERVICE_ROLE_KEY`.
- Verify model artefact exists in Supabase Storage.
- Check Gemini API quota.

---

## 2. Supabase Auth Redirect Issue

### Symptoms
- Login works locally but fails in production.
- User is not redirected correctly after sign in.

### Checks
1. Supabase Auth URL Configuration.
2. Site URL.
3. Redirect URLs.
4. Vercel domain.

### Recovery
- Add production domain to redirect URLs.
- Redeploy frontend if env changed.

---

## 3. Realtime Unauthorized Error

### Symptoms
- Study room presence shows unauthorized.
- Chat does not update.
- Member roster fails to sync.

### Checks
1. Supabase Realtime settings.
2. Public channel access setting.
3. `realtime.messages` policies.
4. Room membership row exists.

### Recovery
- Ensure public channel access is disabled.
- Verify membership authorization function.
- Verify user is active study room member.

---

## 4. Gemini API Quota Error

### Symptoms
- AI insight generation returns quota or 429 errors.
- Weekly reflection fails.

### Checks
1. Gemini usage dashboard.
2. API key validity.
3. Model name.
4. Rate limit logs.

### Recovery
- Wait for quota reset.
- Enable billing if needed.
- Reduce generation frequency.
- Use cheaper/faster model.

---

## 5. Redis / Upstash Error

### Symptoms
- Rate limit helper fails.
- AI actions may bypass rate limiting if Redis unavailable.

### Checks
1. Upstash REST URL.
2. Upstash REST token.
3. Vercel environment variables.
4. Vercel redeployment after env update.

### Recovery
- Fix env variables.
- Redeploy Vercel.
- The app can continue functioning because Redis failure should not break core functionality.

---

## 6. LiveKit Voice Issue

### Symptoms
- Join Voice fails.
- Participant count does not update.
- Audio does not connect.

### Checks
1. LiveKit URL.
2. API key and secret.
3. Browser microphone permission.
4. User active study room membership.
5. Vercel API route logs.

### Recovery
- Verify LiveKit env variables.
- Redeploy Vercel.
- Ask user to allow microphone access.