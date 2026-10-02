# Personal AI Agent — build status

Last updated: 2026-10-02 (session 2)

Full app regenerated as one cumulative project (replaces the earlier scaffold + separate voice kit).
`npm install && npm run build` verified clean on Next.js 14.2.35.

## Module status
1. **Foundation / auth / dashboard — done.** Google sign-in, AuthGuard, bottom-tab AppShell, PWA
   (manifest, icons, service worker). Dashboard shows today's money, wellness, next exam, open tasks.
2. **Money + wellness log — done.** `/wellness`, Firestore `users/{uid}/logs`, 7-day summary by category, delete.
3. **Study tracker — done.** `/study`, exams + countdown, per-exam syllabus checklist with progress,
   to-dos/reminders. Now persisted to Firestore (`exams`, `topics`, `tasks`).
4. **News digest — done.** `/news`, topic chips + custom topic, **live web search** via `/api/agent`.
5. **Voice assistant — done.** `/assistant`, Free + Premium voice (switchable), conversation mode,
   12 tools (web search, money, wellness, tasks, study overview, memories, device actions).
6. **Gmail + Calendar (Google OAuth) — built, untested with real keys.** Server-side OAuth (`lib/google.ts`, `/api/google/{connect,callback,status}`), refresh token stored in `users/{uid}/private/google` (client access blocked in `firestore.rules`). Tools: `summarize_inbox` (read-only), `list_events`, `create_event`. Connect button in Talk → Settings.
7. **Jobs/internships API (Adzuna/Jooble) — not started** (voice web_search covers lookups for now).

## Needs Harsh (one-time)
- Google Cloud: enable Gmail API + Calendar API, add OAuth consent test user, add redirect URIs `http://localhost:3000/api/google/callback` and `https://<vercel-domain>/api/google/callback`; set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in `.env.local` and Vercel.
- Re-deploy `firestore.rules` (changed: `private` collection is now server-only).
- Fill `.env.local` (Firebase web config, Firebase Admin service account, Anthropic key, optional OpenAI key).
- Enable Google sign-in in Firebase Auth; deploy `firestore.rules`.
- Add the same env vars on Vercel; add the Vercel domain to Firebase Authorized domains.

## Not yet tested end-to-end
Real voice conversation, Firestore reads/writes and live news need real keys — verified only by build,
type-check, route smoke tests (all pages 200, APIs reject unsigned requests) and a login-screen render.
