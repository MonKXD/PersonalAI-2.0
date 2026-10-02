"use client";
// The talk-to-it screen: tap the orb, speak, hear the answer.
// "Conversation mode" keeps listening after each reply, like a phone call with your assistant.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import { useVoice, type VoiceEngine } from "@/lib/voice/useVoice";

type ClientAction =
  | { type: "open_url"; url: string; label: string }
  | { type: "call"; phone: string; label: string }
  | { type: "timer"; seconds: number; label: string };

type Turn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: ClientAction[];
  toolsUsed?: string[];
};

const SETTINGS_KEY = "voice-assistant-settings";
const TOOL_LABELS: Record<string, string> = {
  web_search: "searched the web",
  log_money: "logged money",
  log_wellness: "logged wellness",
  get_money_summary: "checked spending",
  add_task: "added task",
  list_tasks: "checked tasks",
  complete_task: "completed task",
  get_study_overview: "checked exams",
  remember_fact: "remembered",
  forget_fact: "forgot",
  device_action: "device action",
  get_current_datetime: "checked time",
};

const SUGGESTIONS = [
  "I spent 120 rupees on lunch",
  "What's the latest tech news in India?",
  "Remind me to revise Microwave Engineering tomorrow at 6 pm",
  "How much did I spend this week?",
  "How many days until my next exam?",
  "Find product analyst internships in Mumbai",
];

const uid = () => Math.random().toString(36).slice(2);

async function getToken(): Promise<string> {
  const user = auth?.currentUser;
  if (!user) throw new Error("Please sign in again.");
  return user.getIdToken();
}

export default function VoiceAssistant() {
  const [engine, setEngine] = useState<VoiceEngine>("free");
  const [conversationMode, setConversationMode] = useState(true);
  const [muted, setMuted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [thinking, setThinking] = useState(false);
  const [typed, setTyped] = useState("");
  const [timers, setTimers] = useState<{ id: string; label: string; endsAt: number }[]>([]);
  const [, forceTick] = useState(0);

  const voice = useVoice(getToken, engine);
  const turnsRef = useRef<Turn[]>([]);
  const activeRef = useRef(false); // true while a voice loop is running
  const scrollRef = useRef<HTMLDivElement>(null);

  turnsRef.current = turns;

  // Load / save settings (per-device convenience only).
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      if (s.engine === "free" || s.engine === "premium") setEngine(s.engine);
      if (typeof s.conversationMode === "boolean") setConversationMode(s.conversationMode);
      if (typeof s.muted === "boolean") setMuted(s.muted);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ engine, conversationMode, muted }));
    } catch {}
  }, [engine, conversationMode, muted]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, thinking, voice.interim]);

  // Countdown display for timers.
  useEffect(() => {
    if (!timers.length) return;
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [timers.length]);

  const runActions = useCallback(
    (actions: ClientAction[]) => {
      for (const a of actions) {
        if (a.type === "open_url") {
          // Popups after an async call can be blocked; the chip in the chat is the fallback.
          window.open(a.url, "_blank", "noopener");
        } else if (a.type === "call") {
          window.location.href = `tel:${a.phone}`;
        } else if (a.type === "timer") {
          const id = uid();
          setTimers((ts) => [...ts, { id, label: a.label, endsAt: Date.now() + a.seconds * 1000 }]);
          if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
          setTimeout(() => {
            setTimers((ts) => ts.filter((t) => t.id !== id));
            const msg = `Timer done: ${a.label}`;
            if ("Notification" in window && Notification.permission === "granted") new Notification(msg);
            if ("vibrate" in navigator) navigator.vibrate?.([300, 150, 300]);
            voice.speak(msg);
          }, a.seconds * 1000);
        }
      }
    },
    [voice]
  );

  /** Sends one message to the agent and speaks the reply. Returns false on failure. */
  const ask = useCallback(
    async (text: string): Promise<boolean> => {
      const message = text.trim();
      if (!message) return false;
      const history = turnsRef.current.map(({ role, content }) => ({ role, content }));
      setTurns((t) => [...t, { id: uid(), role: "user", content: message }]);
      setThinking(true);
      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { Authorization: `Bearer ${await getToken()}`, "Content-Type": "application/json" },
          body: JSON.stringify({ message, history }),
        });
        const data = (await res.json()) as { reply?: string; clientActions?: ClientAction[]; toolsUsed?: string[]; error?: string };
        if (!res.ok) throw new Error(data.error || "The assistant couldn't respond.");
        const reply = data.reply ?? "";
        const actions = data.clientActions ?? [];
        setTurns((t) => [...t, { id: uid(), role: "assistant", content: reply, actions, toolsUsed: data.toolsUsed }]);
        setThinking(false);
        runActions(actions);
        if (!muted) await voice.speak(reply);
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Something went wrong.";
        setTurns((t) => [...t, { id: uid(), role: "assistant", content: `⚠️ ${msg}` }]);
        setThinking(false);
        return false;
      }
    },
    [muted, runActions, voice]
  );

  /** Voice loop: listen → ask → speak → (listen again if conversation mode). */
  const startVoice = useCallback(async () => {
    voice.unlockAudio();
    activeRef.current = true;
    while (activeRef.current) {
      const heard = await voice.listen();
      if (!activeRef.current) break;
      if (!heard) break; // silence ends the conversation
      if (/^(stop|cancel|bye|goodbye|that's all|thank you,? that's all)\.?$/i.test(heard.trim())) {
        if (!muted) await voice.speak("Okay, talk soon.");
        break;
      }
      const ok = await ask(heard);
      if (!ok || !conversationMode) break;
    }
    activeRef.current = false;
  }, [ask, conversationMode, muted, voice]);

  const onOrbTap = () => {
    if (voice.status === "listening") return voice.stopListening();
    if (voice.status === "speaking") {
      voice.stopSpeaking();
      return;
    }
    if (activeRef.current || thinking) {
      activeRef.current = false;
      voice.stopListening();
      voice.stopSpeaking();
      return;
    }
    startVoice();
  };

  const onSubmitTyped = (e: React.FormEvent) => {
    e.preventDefault();
    voice.unlockAudio();
    const text = typed;
    setTyped("");
    ask(text);
  };

  const state = thinking ? "thinking" : voice.status;
  const stateLabel: Record<string, string> = {
    idle: activeRef.current ? "…" : "Tap to talk",
    listening: "Listening…",
    transcribing: "Got it…",
    thinking: "Thinking…",
    speaking: "Speaking — tap to interrupt",
  };

  return (
    <div className="mx-auto flex h-[100dvh] max-w-2xl flex-col bg-neutral-950 text-neutral-100">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 border-b border-neutral-800 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link href="/" aria-label="Back to home" className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100">
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">Assistant</h1>
          <p className="text-xs text-neutral-400">
            {engine === "premium" ? "Premium voice" : "Free voice"} · {conversationMode ? "Conversation mode" : "One question at a time"}
          </p>
        </div>
        <button
          onClick={() => setShowSettings((s) => !s)}
          className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:border-teal-500 hover:text-teal-300"
          aria-expanded={showSettings}
        >
          Settings
        </button>
      </header>

      {showSettings && (
        <section className="space-y-3 border-b border-neutral-800 bg-neutral-900 px-4 py-4 text-sm">
          <div>
            <p className="mb-2 text-neutral-400">Voice engine</p>
            <div className="grid grid-cols-2 gap-2">
              {(["free", "premium"] as const).map((e) => (
                <button
                  key={e}
                  onClick={() => setEngine(e)}
                  className={`rounded-lg border px-3 py-2 text-left ${
                    engine === e ? "border-teal-500 bg-teal-500/10 text-teal-200" : "border-neutral-700 text-neutral-300"
                  }`}
                >
                  <span className="block font-medium">{e === "free" ? "Free" : "Premium"}</span>
                  <span className="block text-xs text-neutral-400">
                    {e === "free" ? "Browser speech · no cost" : "Natural voice · OpenAI (small cost)"}
                  </span>
                </button>
              ))}
            </div>
            {engine === "free" && !voice.support.browserSTT && (
              <p className="mt-2 text-xs text-amber-400">
                This browser has no free speech recognition — Premium will be used for listening.
              </p>
            )}
          </div>
          <label className="flex items-center justify-between">
            <span>Conversation mode (keep listening after replies)</span>
            <input type="checkbox" className="h-5 w-5 accent-teal-500" checked={conversationMode} onChange={(e) => setConversationMode(e.target.checked)} />
          </label>
          <label className="flex items-center justify-between">
            <span>Mute spoken replies</span>
            <input type="checkbox" className="h-5 w-5 accent-teal-500" checked={muted} onChange={(e) => setMuted(e.target.checked)} />
          </label>
          <button onClick={() => setTurns([])} className="text-xs text-neutral-400 underline hover:text-neutral-200">
            Clear conversation
          </button>
        </section>
      )}

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {turns.length === 0 && (
          <div className="mt-6 space-y-3 text-center">
            <p className="text-neutral-400">Hi Harsh — tap the orb and ask me anything, or try:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    voice.unlockAudio();
                    ask(s);
                  }}
                  className="rounded-full border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:border-teal-500 hover:text-teal-200"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t) => (
          <div key={t.id} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                t.role === "user" ? "bg-teal-600 text-white" : "bg-neutral-800 text-neutral-100"
              }`}
            >
              <p className="whitespace-pre-wrap">{t.content}</p>
              {!!t.toolsUsed?.length && (
                <p className="mt-1.5 text-[11px] text-neutral-400">
                  {[...new Set(t.toolsUsed)].map((n) => TOOL_LABELS[n] ?? n).join(" · ")}
                </p>
              )}
              {t.actions
                ?.filter((a) => a.type !== "timer")
                .map((a, i) => (
                  <a
                    key={i}
                    href={a.type === "call" ? `tel:${a.phone}` : a.type === "open_url" ? a.url : "#"}
                    target={a.type === "open_url" ? "_blank" : undefined}
                    rel="noopener noreferrer"
                    className="mt-2 inline-block rounded-full bg-teal-500/15 px-3 py-1 text-xs font-medium text-teal-300 hover:bg-teal-500/25"
                  >
                    {a.label} ↗
                  </a>
                ))}
            </div>
          </div>
        ))}

        {voice.status === "listening" && voice.interim && (
          <div className="flex justify-end">
            <p className="max-w-[85%] rounded-2xl border border-dashed border-teal-700 px-4 py-2.5 text-sm italic text-teal-200">{voice.interim}</p>
          </div>
        )}
        {thinking && (
          <div className="flex justify-start">
            <div className="flex gap-1 rounded-2xl bg-neutral-800 px-4 py-3">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-teal-400" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Timers */}
      {timers.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {timers.map((t) => {
            const left = Math.max(0, Math.round((t.endsAt - Date.now()) / 1000));
            return (
              <span key={t.id} className="rounded-full bg-neutral-800 px-3 py-1 text-xs text-teal-300">
                ⏱ {t.label} · {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
              </span>
            );
          })}
        </div>
      )}

      {/* Controls */}
      <footer className="border-t border-neutral-800 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
        {voice.error && <p className="mb-2 text-center text-xs text-amber-400">{voice.error}</p>}
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={onOrbTap}
            aria-label={stateLabel[state]}
            className={`relative grid h-20 w-20 place-items-center rounded-full transition-all duration-300 ${
              state === "listening"
                ? "scale-110 bg-teal-500 shadow-[0_0_40px_rgba(20,184,166,0.6)]"
                : state === "speaking"
                ? "bg-teal-700 shadow-[0_0_30px_rgba(20,184,166,0.35)]"
                : state === "thinking" || state === "transcribing"
                ? "animate-pulse bg-neutral-700"
                : "bg-neutral-800 hover:bg-neutral-700"
            }`}
          >
            {state === "listening" && <span className="absolute inset-0 animate-ping rounded-full bg-teal-400/30" />}
            <svg viewBox="0 0 24 24" className="relative h-8 w-8 fill-none stroke-current stroke-2" strokeLinecap="round">
              {state === "speaking" ? (
                <path d="M6 6h12v12H6z" />
              ) : (
                <>
                  <rect x="9" y="3" width="6" height="11" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                </>
              )}
            </svg>
          </button>
          <p className="text-xs text-neutral-400">{stateLabel[state]}</p>
        </div>

        <form onSubmit={onSubmitTyped} className="mt-3 flex gap-2">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Or type here…"
            className="flex-1 rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none placeholder:text-neutral-500 focus:border-teal-500"
          />
          <button
            type="submit"
            disabled={!typed.trim() || thinking}
            className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </footer>
    </div>
  );
}
