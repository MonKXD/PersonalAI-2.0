---
description: Add a new ability (tool) to the voice assistant
argument-hint: <what the assistant should be able to do>
---

Add a new tool to the voice assistant so it can: **$ARGUMENTS**

Follow the pattern in `lib/agent/tools.ts`:
1. Add a schema to `TOOL_DEFINITIONS` — clear `description` saying *when* Claude should use it,
   tight `input_schema` with enums where possible.
2. Add a `case` to `executeTool()` that validates input, does the real work (Firestore under
   `users/{uid}/…`, or a real external API with the key read from `process.env`), and returns a small
   JSON object. Return `{ error: "…" }` on bad input instead of throwing.
3. If it needs the phone/browser to act, push a `ClientAction` instead and handle it in
   `runActions()` in `components/VoiceAssistant.tsx`.
4. Add a short label to `TOOL_LABELS` in `components/VoiceAssistant.tsx`.
5. If it needs a new env var, add it to `.env.voice.example` and the table in `CLAUDE.md`.
6. If the system prompt in `lib/agent/run-agent.ts` needs a one-line hint, add it.
7. Run `npm run build` and fix errors. Then give me 3 example phrases I can say to test it.

No mock data — if the API needs a key I don't have yet, tell me where to get it.
