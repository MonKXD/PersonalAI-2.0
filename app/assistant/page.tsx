"use client";
// /assistant — the voice assistant screen (signed-in only).
// NOTE for Claude Code: match the AuthGuard import style used by app/wellness/page.tsx
// (default vs named export).
import AuthGuard from "@/components/AuthGuard";
import VoiceAssistant from "@/components/VoiceAssistant";

export default function AssistantPage() {
  return (
    <AuthGuard>
      <VoiceAssistant />
    </AuthGuard>
  );
}
