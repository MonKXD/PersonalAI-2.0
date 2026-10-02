"use client";
// Voice input/output with two switchable engines:
//   "free"    → browser Web Speech API (SpeechRecognition + speechSynthesis). No cost.
//   "premium" → mic recording → /api/voice/transcribe, and /api/voice/speak for a natural voice.
import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceEngine = "free" | "premium";
export type VoiceStatus = "idle" | "listening" | "transcribing" | "speaking";

type GetToken = () => Promise<string>;

// Minimal typings for the Web Speech API (not in TS's DOM lib everywhere).
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition || w.webkitSpeechRecognition || null) as (new () => SpeechRecognitionLike) | null;
}

function pickRecordingMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

// A tiny silent WAV used to "unlock" audio playback on iOS during a tap.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

export function useVoice(getToken: GetToken, engine: VoiceEngine) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopRequested = useRef(false);

  const browserSTT = typeof window !== "undefined" && !!getRecognitionCtor();
  const browserTTS = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (typeof window === "undefined") return;
    audioRef.current = new Audio();
    // Voices load asynchronously in Chrome; touching getVoices() warms the list.
    if ("speechSynthesis" in window) window.speechSynthesis.getVoices();
    return () => {
      recognitionRef.current?.abort();
      recorderRef.current?.state === "recording" && recorderRef.current.stop();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      audioRef.current?.pause();
    };
  }, []);

  /** Call inside a tap handler so iOS lets us play audio later. */
  const unlockAudio = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    a.src = SILENT_WAV;
    a.play().catch(() => {});
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    const a = audioRef.current;
    if (a && !a.paused) {
      a.pause();
      a.dispatchEvent(new Event("ended"));
    }
  }, []);

  // ------------------------------------------------------------------ LISTEN
  const listenFree = useCallback(
    () =>
      new Promise<string>((resolve, reject) => {
        const Ctor = getRecognitionCtor();
        if (!Ctor) return reject(new Error("This browser can't do free voice input. Switch to Premium voice or type instead."));
        const rec = new Ctor();
        rec.lang = "en-IN";
        rec.interimResults = true;
        rec.continuous = false;
        rec.maxAlternatives = 1;
        let finalText = "";
        rec.onresult = (e) => {
          let live = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const r = e.results[i]!;
            if (r.isFinal) finalText += r[0]!.transcript;
            else live += r[0]!.transcript;
          }
          setInterim((finalText + " " + live).trim());
        };
        rec.onerror = (e) => {
          if (e.error === "no-speech" || e.error === "aborted") return; // onend resolves with ""
          reject(new Error(e.error === "not-allowed" ? "Microphone permission denied." : `Voice input error: ${e.error}`));
        };
        rec.onend = () => {
          recognitionRef.current = null;
          resolve(finalText.trim());
        };
        recognitionRef.current = rec;
        rec.start();
      }),
    []
  );

  const listenPremium = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone not available in this browser.");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const mime = pickRecordingMime();
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recorderRef.current = recorder;
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    // Simple voice-activity detection: stop after ~1.4s of silence once speech started.
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new AudioCtx();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let heardSpeech = false;
    let silentSince = performance.now();
    const startedAt = performance.now();

    const done = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || mime || "audio/webm" }));
    });
    recorder.start(250);

    const tick = () => {
      if (recorder.state !== "recording") return;
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      const rms = Math.sqrt(sum / buf.length);
      const now = performance.now();
      if (rms > 0.02) {
        heardSpeech = true;
        silentSince = now;
      }
      const silentFor = now - silentSince;
      if ((heardSpeech && silentFor > 1400) || (!heardSpeech && now - startedAt > 7000) || now - startedAt > 30000) {
        recorder.stop();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    const blob = await done;
    stream.getTracks().forEach((t) => t.stop());
    audioCtx.close().catch(() => {});
    recorderRef.current = null;
    if (!heardSpeech || blob.size < 2000) return "";

    setStatus("transcribing");
    const form = new FormData();
    form.append("audio", blob);
    const res = await fetch("/api/voice/transcribe", {
      method: "POST",
      headers: { Authorization: `Bearer ${await getToken()}` },
      body: form,
    });
    const data = (await res.json()) as { text?: string; error?: string };
    if (!res.ok) throw new Error(data.error || "Transcription failed.");
    return data.text ?? "";
  }, [getToken]);

  /** Listens once and resolves with what was said ("" if nothing). */
  const listen = useCallback(async (): Promise<string> => {
    setError(null);
    setInterim("");
    stopRequested.current = false;
    stopSpeaking();
    setStatus("listening");
    try {
      const useFree = engine === "free" && browserSTT;
      const text = useFree ? await listenFree() : await listenPremium();
      setInterim(text);
      return text;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Voice input failed.";
      setError(msg);
      return "";
    } finally {
      setStatus("idle");
    }
  }, [engine, browserSTT, listenFree, listenPremium, stopSpeaking]);

  /** Stops listening early; listen() then resolves with what was captured. */
  const stopListening = useCallback(() => {
    stopRequested.current = true;
    recognitionRef.current?.stop();
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  // ------------------------------------------------------------------- SPEAK
  const speakFree = useCallback(
    (text: string) =>
      new Promise<void>((resolve) => {
        const synth = window.speechSynthesis;
        synth.cancel();
        const voices = synth.getVoices();
        const voice =
          voices.find((v) => v.lang === "en-IN") ||
          voices.find((v) => /en-GB/.test(v.lang) && /female|Google/i.test(v.name)) ||
          voices.find((v) => v.lang.startsWith("en"));
        // Chrome cuts off long utterances — speak sentence by sentence.
        const parts = text.match(/[^.!?]+[.!?]*\s*/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
        parts.forEach((part, i) => {
          const u = new SpeechSynthesisUtterance(part);
          if (voice) u.voice = voice;
          u.lang = voice?.lang ?? "en-IN";
          u.rate = 1.05;
          if (i === parts.length - 1) {
            u.onend = () => resolve();
            u.onerror = () => resolve();
          }
          synth.speak(u);
        });
      }),
    []
  );

  const speakPremium = useCallback(
    async (text: string) => {
      const res = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { Authorization: `Bearer ${await getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Voice playback failed.");
      }
      const url = URL.createObjectURL(await res.blob());
      const a = audioRef.current ?? new Audio();
      await new Promise<void>((resolve) => {
        a.onended = () => resolve();
        a.onerror = () => resolve();
        a.src = url;
        a.play().catch(() => resolve());
      });
      URL.revokeObjectURL(url);
    },
    [getToken]
  );

  const speak = useCallback(
    async (text: string) => {
      if (!text) return;
      setStatus("speaking");
      try {
        if (engine === "premium") {
          try {
            await speakPremium(text);
          } catch (e) {
            // Fall back to the free voice so he still hears the answer.
            setError(e instanceof Error ? e.message : "Premium voice failed.");
            if (browserTTS) await speakFree(text);
          }
        } else if (browserTTS) {
          await speakFree(text);
        }
      } finally {
        setStatus("idle");
      }
    },
    [engine, browserTTS, speakFree, speakPremium]
  );

  return {
    status,
    interim,
    error,
    setError,
    listen,
    stopListening,
    speak,
    stopSpeaking,
    unlockAudio,
    support: { browserSTT, browserTTS },
  };
}
