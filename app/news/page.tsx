"use client";
import { useCallback, useEffect, useState } from "react";
import AppShell, { buttonClass, Card, inputClass } from "@/components/AppShell";
import { auth } from "@/lib/firebase";

type NewsItem = { headline: string; summary: string; whyItMatters?: string; source?: string; url?: string };
type Digest = { items?: NewsItem[]; text?: string; topic: string; generatedAt: string };

const TOPICS = ["Top news in India", "Mumbai", "Tech & AI", "Indian startups & jobs market", "Telecom & electronics", "Markets & economy"];
const CACHE_KEY = "news-digest-cache";

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

export default function NewsPage() {
  const [topic, setTopic] = useState(TOPICS[0]!);
  const [custom, setCustom] = useState("");
  const [digest, setDigest] = useState<Digest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Show the last digest instantly (per-device cache), refresh on demand.
  useEffect(() => {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null") as Digest | null;
      if (cached) {
        setDigest(cached);
        setTopic(cached.topic);
      }
    } catch {}
  }, []);

  const load = useCallback(async (t: string) => {
    setTopic(t);
    setLoading(true);
    setError(null);
    try {
      const user = auth?.currentUser;
      if (!user) throw new Error("Please sign in again.");
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ topic: t }),
      });
      const data = (await res.json()) as Digest & { error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't load news.");
      setDigest(data);
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
      } catch {}
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load news.");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <AppShell title="News digest" subtitle="Live web search · summarised for you">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {TOPICS.map((t) => (
          <button
            key={t}
            onClick={() => load(t)}
            disabled={loading}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${topic === t ? "border-teal-500 bg-teal-500/10 text-teal-200" : "border-neutral-700 text-neutral-400"}`}
          >
            {t}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (custom.trim()) load(custom.trim());
        }}
        className="flex gap-2"
      >
        <input className={inputClass} placeholder="Any topic, e.g. 'ISRO missions'" value={custom} onChange={(e) => setCustom(e.target.value)} />
        <button className={buttonClass} disabled={loading || !custom.trim()}>
          Go
        </button>
      </form>

      {error && <p className="text-sm text-amber-400">{error}</p>}

      {loading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-neutral-900" />
          ))}
          <p className="text-center text-xs text-neutral-500">Searching the web… this takes 10–30 seconds.</p>
        </div>
      )}

      {!loading && !digest && (
        <Card>
          <p className="text-sm text-neutral-400">Pick a topic above to get today&apos;s digest.</p>
        </Card>
      )}

      {!loading && digest && (
        <>
          <p className="text-xs text-neutral-500">
            {digest.topic} · updated {new Date(digest.generatedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}{" "}
            <button onClick={() => load(digest.topic)} className="text-teal-400">
              refresh
            </button>
          </p>
          {digest.items?.map((item, i) => (
            <Card key={i}>
              <h3 className="font-medium leading-snug">{item.headline}</h3>
              <p className="mt-1.5 text-sm text-neutral-300">{item.summary}</p>
              {item.whyItMatters && <p className="mt-2 text-xs text-teal-300">↳ {item.whyItMatters}</p>}
              {(item.source || item.url) && (
                <p className="mt-2 text-xs text-neutral-500">
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:text-teal-300">
                      {item.source || hostOf(item.url)} ↗
                    </a>
                  ) : (
                    item.source
                  )}
                </p>
              )}
            </Card>
          ))}
          {digest.text && (
            <Card>
              <p className="whitespace-pre-wrap text-sm text-neutral-300">{digest.text}</p>
            </Card>
          )}
        </>
      )}
    </AppShell>
  );
}
