# Personal AI Agent — Claude Code project memory

## Who / what
Harsh (final-year EXTC student, Mumbai, IST) is building a personal AI agent for daily life.
**Next.js 14 (App Router) PWA** + **Firebase Auth (Google) + Firestore** + **Claude API with tool use**.
Deploy target: **Vercel**. Used mainly on his phone ("Add to Home Screen").

The centrepiece is a **talk-back voice assistant** (like Siri/Gemini): he speaks, it understands,
DOES things with tools, and answers out loud.

## House rules
- Write complete, runnable files — never fragments or "…rest unchanged".
- Real integrations only, no mock data.
- Design: dark charcoal (neutral-900/950) + teal accents. Mobile-first, safe-area aware.
  Reuse `AppShell`, `Card`, `inputClass`, `buttonClass` from `components/AppShell.tsx`.
- TypeScript strict. Keep `typescript` on **^5** and `tailwindcss` on **^3** (Next 14 doesn't support TS 7).
- Never commit secrets. Keys live in `.env.local` (local) and Vercel env vars (prod).
- After any change, run `npm run build` and fix every error before saying you're done.
- Update `docs/BUILD_STATUS.md` at the end of every session.

## Architecture
```
app/
  layout.tsx               AuthProvider + service worker registration
  manifest.ts              PWA manifest (icons in public/icons, SW in public/sw.js)
  login/page.tsx           Google sign-in
  page.tsx                 Dashboard: today's money, wellness, next exam, open tasks
  wellness/page.tsx        Money (expense/income) + wellness logging, 7-day summary
  study/page.tsx           Exams + countdown, syllabus checklist per exam, to-dos/reminders
  news/page.tsx            News digest by topic (live web search)
  assistant/page.tsx       Voice assistant screen
  api/agent/route.ts       News digest: Claude + web_search → JSON items
  api/assistant/route.ts   Voice agent turn: verify user → runAgent()
  api/voice/transcribe     Premium speech-to-text (OpenAI)
  api/voice/speak          Premium text-to-speech (OpenAI or ElevenLabs)
components/
  AppShell.tsx             Header + bottom tab bar + AuthGuard; Card/input/button styles
  AuthGuard.tsx            Redirects to /login when signed out
  VoiceAssistant.tsx       Orb UI, chat, settings, client actions, timers
  ServiceWorkerRegister.tsx
lib/
  firebase.ts              Client Firebase (browser-only init; requireDb())
  auth-context.tsx         AuthProvider / useAuth() — Google sign-in
  data.ts                  Shared Firestore types + helpers for pages
  firebase-admin.ts        Server Admin SDK + Firebase ID-token verification
  agent/tools.ts           ALL voice-agent abilities: schemas + executors
  agent/run-agent.ts       Claude tool-use loop + voice-style system prompt
  google.ts                Server Google OAuth (Gmail read-only + Calendar), token refresh, googleApi()
  agent/google-tools.ts    Gmail/Calendar tool executors
  voice/useVoice.ts        Free (Web Speech) / Premium (OpenAI) listen + speak hook
```

### Security model
- Client pages read/write Firestore directly; `firestore.rules` restricts each user to `users/{uid}/**`.
- Every API route requires `Authorization: Bearer <Firebase ID token>`, verified with firebase-admin,
  so nobody else can spend the Claude/OpenAI keys. Server writes use the Admin SDK.

### How a voice turn works
1. Tap orb → `useVoice.listen()` (free: browser SpeechRecognition `en-IN`; premium: MediaRecorder with
   silence detection → `/api/voice/transcribe`).
2. Text → `POST /api/assistant` with the last 12 turns.
3. Server runs `runAgent()`: Claude calls tools in a loop of up to 8 steps.
4. Returns `{ reply, clientActions, toolsUsed }`. Client runs actions (open URL, tel:, timer) and speaks
   `reply` (free: speechSynthesis; premium: `/api/voice/speak`, falls back to free on error).
5. **Conversation mode** auto-listens again; silence or "stop/bye" ends it.

### Firestore data (all under `users/{uid}/…`) — shared by pages (lib/data.ts) and agent tools
- `logs`     `{ type: "expense"|"income", amount, category, note, source, createdAt }`
             `{ type: "wellness", sleep_hours?, water_glasses?, mood(1-5)?, exercise_minutes?, note?, source, createdAt }`
- `tasks`    `{ title, category: study|job|personal|health|money, due: Timestamp|null, done, source, createdAt, completedAt? }`
- `exams`    `{ subject, date: "YYYY-MM-DD", createdAt }`
- `topics`   `{ examId, title, done, createdAt }`
- `memories` `{ fact, createdAt }` → injected into the voice system prompt each turn.
If you change a field, change it in BOTH `lib/data.ts` (+ pages) and `lib/agent/tools.ts`.

### Voice agent tools (lib/agent/tools.ts)
web_search (Anthropic server tool, Mumbai) · get_current_datetime · log_money · log_wellness ·
get_money_summary · add_task · list_tasks · complete_task · get_study_overview · remember_fact ·
forget_fact · summarize_inbox · list_events · create_event · device_action (open_website, youtube, maps, whatsapp, call, timer).

**To add a tool:** schema in `TOOL_DEFINITIONS`, a `case` in `executeTool()`, a label in `TOOL_LABELS`
in `components/VoiceAssistant.tsx`, then build. Slash command: `/add-agent-tool`.

## Environment variables (see .env.example)
NEXT_PUBLIC_FIREBASE_* (client) · FIREBASE_ADMIN_PROJECT_ID / _CLIENT_EMAIL / _PRIVATE_KEY (server) ·
ANTHROPIC_API_KEY · ANTHROPIC_MODEL (optional, default `claude-sonnet-4-5`; set the newest Sonnet ID from
https://docs.claude.com/en/docs/about-claude/models/overview) · OPENAI_API_KEY (premium voice only) ·
optional OPENAI_STT_MODEL / OPENAI_TTS_MODEL / OPENAI_TTS_VOICE · GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (Gmail+Calendar) · optional TTS_PROVIDER=elevenlabs +
ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID.

## Honest limits (tell Harsh if he asks)
- A PWA can't do an always-on "Hey Siri" wake word, read notifications or control other apps. It opens
  apps via URLs (WhatsApp, Maps, YouTube, tel:) — that's device_action.
- iOS: free speech recognition is unreliable inside an installed home-screen PWA → use Premium there.
- Mic needs HTTPS (Vercel) or localhost. Timers/reminders only alert while the app is open.

## Roadmap
1. ~~Google OAuth (Gmail + Calendar)~~ — done (needs real-key testing).
2. Jobs: Adzuna/Jooble API → `search_openings` tool + a /jobs page (web_search covers lookups for now).
3. Push notifications (FCM) so reminders/timers fire when the app is closed.
4. Streaming replies (speak the first sentence while the rest generates) for lower latency.
5. Course & skill discovery for job readiness.
