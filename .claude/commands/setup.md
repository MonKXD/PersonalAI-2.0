---
description: First-time setup — check env, install, build, and tell me what's missing
---

Help me get this app running for the first time. Go step by step and stop to tell me exactly what to
do whenever something needs my input (I'm doing this on my Mac).

1. Check Node is >= 20 (`node -v`). If not, tell me how to install it with nvm.
2. Run `npm install`.
3. Check whether `.env.local` exists. If not, copy `.env.example` to `.env.local`.
   Without printing any secret values, check which required variables are still empty:
   `NEXT_PUBLIC_FIREBASE_*`, `FIREBASE_ADMIN_*`, `ANTHROPIC_API_KEY` (and `OPENAI_API_KEY` if I want
   premium voice). For each missing one, tell me exactly where in the Firebase / Anthropic / OpenAI
   console to get it. (You may run a small node script that reports only "set" / "empty" per key.)
4. Remind me to enable **Google** under Firebase → Authentication → Sign-in method, and to create the
   Firestore database if it doesn't exist.
5. Deploy security rules: `npx firebase-tools login` then
   `npx firebase-tools deploy --only firestore:rules --project <my project id>`.
6. Run `npm run build` and fix anything that fails.
7. Tell me to run `npm run dev` and open http://localhost:3000, then what to say to the assistant to
   test each feature.
8. Finally, walk me through deploying to Vercel (import GitHub repo, add env vars, add the Vercel
   domain to Firebase Authorized domains) and installing it on my phone.
