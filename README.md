# Personal AI Agent

Your own Siri/Gemini-style assistant plus a daily-life dashboard, built for your phone.

- 🎙 **Talk to it** — it listens, does things, and talks back (free browser voice or premium natural voice)
- 💸 **Money & wellness** — log expenses, income, sleep, water, mood, exercise
- 📚 **Study** — exam countdowns, syllabus checklists, to-dos and reminders
- 📰 **News** — live, summarised digests on any topic
- 📱 **Installable** — "Add to Home Screen" on Android and iPhone

Stack: Next.js 14 · Firebase Auth + Firestore · Claude API (tool use + web search) · Tailwind · Vercel.

---

## Quick start (Mac)

**Easiest:** open this folder in **Claude Code** and run `/setup` — it walks you through everything below.

### 1. Install
```bash
node -v          # needs 20 or newer
npm install
cp .env.example .env.local
```

### 2. Firebase (≈10 min)
1. https://console.firebase.google.com → your project.
2. **Authentication → Sign-in method → Google → Enable.**
3. **Firestore Database → Create database** (production mode, region `asia-south1` Mumbai).
4. **Project settings → General → Your apps → Web app** → copy the config into the
   `NEXT_PUBLIC_FIREBASE_*` lines of `.env.local`.
5. **Project settings → Service accounts → Generate new private key** → from the downloaded JSON copy
   `project_id`, `client_email`, `private_key` into the `FIREBASE_ADMIN_*` lines.
   Keep the JSON file **outside** this folder and never commit it.
6. Deploy the security rules:
   ```bash
   npx firebase-tools login
   npx firebase-tools deploy --only firestore:rules --project YOUR_PROJECT_ID
   ```

### 3. API keys
- **Claude:** https://console.anthropic.com → API keys → `ANTHROPIC_API_KEY`.
- **Premium voice (optional):** https://platform.openai.com/api-keys → `OPENAI_API_KEY`.
  Without it, the free browser voice still works.

### 4. Run
```bash
npm run dev
```
Open http://localhost:3000, sign in with Google, tap the **mic tab** and say
*"I spent 150 rupees on lunch."*

---

## Deploy & install on your phone
1. Push to GitHub → import the repo at https://vercel.com/new.
2. Vercel → Settings → **Environment Variables**: add every variable from `.env.local`
   (paste `FIREBASE_ADMIN_PRIVATE_KEY` exactly, including the `\n`s and quotes).
3. Firebase → Authentication → Settings → **Authorized domains** → add your `*.vercel.app` domain.
4. Open the Vercel URL on your phone:
   - **Android (Chrome):** ⋮ → *Install app*. Free voice works well.
   - **iPhone (Safari):** Share → *Add to Home Screen*. In the assistant's Settings choose **Premium**
     voice — Safari's free speech recognition is unreliable inside home-screen apps.

---

## Things to say to your assistant
| Say | It does |
|---|---|
| "I spent 80 on chai and samosa" | logs an expense |
| "Got my 5000 stipend today" | logs income |
| "Slept 6 hours, had 8 glasses of water, mood 4" | logs wellness |
| "How much did I spend this week?" | spending summary by category |
| "Remind me to revise Microwave Engineering tomorrow at 6 pm" | adds a task |
| "What's on my list?" / "Mark the microwave one done" | lists / completes tasks |
| "How many days until my next exam? What's left to study?" | exam + syllabus overview |
| "What's the latest tech news in India?" | live web search |
| "Find product analyst internships in Mumbai" | live web search |
| "Remember that I prefer evening study sessions" | saves a memory it uses later |
| "Directions to Thadomal Shahani" · "Play lo-fi music on YouTube" | opens Maps / YouTube |
| "WhatsApp mom that I'll be late" · "Set a 25 minute focus timer" | opens WhatsApp / starts a timer |

**Conversation mode** (on by default) keeps listening after each answer — like a call. Stay silent or
say "stop" to end it. You can always type instead.

---

## Project structure
See `CLAUDE.md` for the full architecture, data model and how to add new abilities.

```
app/            pages (/, /login, /wellness, /study, /news, /assistant) + API routes
components/     AppShell, AuthGuard, VoiceAssistant, ServiceWorkerRegister
lib/            firebase, auth, data helpers, agent (tools + loop), voice hook
public/         icons + service worker
.claude/        Claude Code slash commands: /setup, /status, /add-agent-tool
```

## Extending
In Claude Code: `/add-agent-tool <ability>` — e.g. `/add-agent-tool read and summarise my unread Gmail`.
`/status` shows what works and what's next. Roadmap is in `CLAUDE.md`.

## Costs (rough, personal use)
Claude API: a few rupees a day. Premium voice (OpenAI) adds a little — typically under ₹10/day.
Firebase and Vercel free tiers are plenty.

## Troubleshooting
- **"Firebase Admin is not configured"** → `FIREBASE_ADMIN_*` vars missing (locally or on Vercel).
- **Sign-in popup closes / unauthorized domain** → add the domain in Firebase Authorized domains.
- **Mic does nothing** → allow microphone permission; must be HTTPS or localhost.
- **Robotic voice** → switch to Premium in the assistant's Settings (needs `OPENAI_API_KEY`).
- **Build fails after upgrading packages** → keep `typescript` on 5.x and `tailwindcss` on 3.x.
