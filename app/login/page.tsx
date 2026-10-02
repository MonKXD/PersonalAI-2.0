"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, user, router]);

  const onSignIn = async () => {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        setError(code === "auth/unauthorized-domain" ? "Add this domain under Firebase → Authentication → Settings → Authorized domains." : "Sign-in failed. Try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-neutral-950 px-6 text-neutral-100">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-full bg-teal-600 shadow-[0_0_40px_rgba(20,184,166,0.45)]">
          <svg viewBox="0 0 24 24" className="h-9 w-9 fill-none stroke-white stroke-2" strokeLinecap="round">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold">Your AI Agent</h1>
        <p className="mt-2 text-sm text-neutral-400">Talk to it, log your day, track your study and stay on top of news.</p>
        <button
          onClick={onSignIn}
          disabled={busy || loading}
          className="mt-8 flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 font-medium text-neutral-900 hover:bg-neutral-200 disabled:opacity-50"
        >
          <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          {busy ? "Signing in…" : "Continue with Google"}
        </button>
        {error && <p className="mt-4 text-sm text-amber-400">{error}</p>}
      </div>
    </main>
  );
}
