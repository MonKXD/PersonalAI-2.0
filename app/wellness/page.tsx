"use client";
import { useEffect, useMemo, useState } from "react";
import { addDoc, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, Timestamp, where } from "firebase/firestore";
import AppShell, { buttonClass, Card, inputClass } from "@/components/AppShell";
import { useAuth } from "@/lib/auth-context";
import { requireDb } from "@/lib/firebase";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, inr, MOODS, userCol, type Log } from "@/lib/data";

export default function WellnessPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"money" | "wellness">("money");
  const [recent, setRecent] = useState<Log[]>([]);
  const [week, setWeek] = useState<Log[]>([]);

  useEffect(() => {
    if (!user) return;
    const col = userCol(user.uid, "logs");
    const weekAgo = Timestamp.fromMillis(Date.now() - 7 * 86_400_000);
    const u1 = onSnapshot(query(col, orderBy("createdAt", "desc"), limit(30)), (s) =>
      setRecent(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Log))
    );
    const u2 = onSnapshot(query(col, where("createdAt", ">=", weekAgo), orderBy("createdAt", "desc")), (s) =>
      setWeek(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Log))
    );
    return () => {
      u1();
      u2();
    };
  }, [user]);

  const weekly = useMemo(() => {
    const byCat: Record<string, number> = {};
    let spent = 0;
    let earned = 0;
    const sleep: number[] = [];
    for (const l of week) {
      if (l.type === "wellness") {
        if (typeof l.sleep_hours === "number") sleep.push(l.sleep_hours);
      } else if (l.type === "expense") {
        spent += l.amount;
        byCat[l.category] = (byCat[l.category] ?? 0) + l.amount;
      } else earned += l.amount;
    }
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const avgSleep = sleep.length ? sleep.reduce((a, b) => a + b, 0) / sleep.length : null;
    return { spent, earned, cats, avgSleep };
  }, [week]);

  const remove = (id: string) => user && deleteDoc(doc(requireDb(), "users", user.uid, "logs", id));

  return (
    <AppShell title="Money & wellness" subtitle="Log by hand here, or just tell your assistant">
      <div className="grid grid-cols-2 rounded-xl border border-neutral-800 bg-neutral-900 p-1 text-sm">
        {(["money", "wellness"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-lg py-2 capitalize ${tab === t ? "bg-teal-600 text-white" : "text-neutral-400"}`}>
            {t}
          </button>
        ))}
      </div>

      {user && (tab === "money" ? <MoneyForm uid={user.uid} /> : <WellnessForm uid={user.uid} />)}

      <Card title="Last 7 days">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-lg font-semibold text-rose-300">{inr(weekly.spent)}</p>
            <p className="text-[11px] text-neutral-400">spent</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-emerald-300">{inr(weekly.earned)}</p>
            <p className="text-[11px] text-neutral-400">earned</p>
          </div>
          <div>
            <p className="text-lg font-semibold">{weekly.avgSleep != null ? `${weekly.avgSleep.toFixed(1)}h` : "–"}</p>
            <p className="text-[11px] text-neutral-400">avg sleep</p>
          </div>
        </div>
        {weekly.cats.length > 0 && (
          <ul className="mt-4 space-y-2">
            {weekly.cats.map(([cat, amt]) => (
              <li key={cat} className="text-xs">
                <div className="mb-1 flex justify-between">
                  <span className="capitalize text-neutral-300">{cat}</span>
                  <span className="text-neutral-400">{inr(amt)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-neutral-800">
                  <div className="h-1.5 rounded-full bg-teal-500" style={{ width: `${(amt / weekly.spent) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Recent entries">
        {recent.length === 0 && <p className="text-sm text-neutral-400">No entries yet.</p>}
        <ul className="divide-y divide-neutral-800">
          {recent.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate">
                  {l.type === "wellness" ? (
                    <>
                      {[
                        l.sleep_hours != null && `😴 ${l.sleep_hours}h`,
                        l.water_glasses != null && `💧 ${l.water_glasses}`,
                        l.mood && MOODS[l.mood],
                        l.exercise_minutes != null && `🏃 ${l.exercise_minutes}m`,
                      ]
                        .filter(Boolean)
                        .join("  ")}
                    </>
                  ) : (
                    <>
                      <span className={l.type === "expense" ? "text-rose-300" : "text-emerald-300"}>
                        {l.type === "expense" ? "−" : "+"}
                        {inr(l.amount)}
                      </span>{" "}
                      <span className="capitalize text-neutral-300">{l.category}</span>
                    </>
                  )}
                </p>
                <p className="truncate text-xs text-neutral-500">
                  {l.note ? `${l.note} · ` : ""}
                  {l.createdAt?.toDate().toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) ?? "just now"}
                  {l.source === "voice" ? " · 🎙" : ""}
                </p>
              </div>
              <button onClick={() => remove(l.id)} aria-label="Delete entry" className="shrink-0 rounded-lg px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-800 hover:text-rose-300">
                ✕
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </AppShell>
  );
}

function MoneyForm({ uid }: { uid: string }) {
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("food");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const cats = kind === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0) return;
    setBusy(true);
    try {
      await addDoc(userCol(uid, "logs"), { type: kind, amount: value, category, note: note.trim(), source: "app", createdAt: serverTimestamp() });
      setAmount("");
      setNote("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <form onSubmit={submit} className="space-y-3">
        <div className="flex gap-2">
          {(["expense", "income"] as const).map((k) => (
            <button
              type="button"
              key={k}
              onClick={() => {
                setKind(k);
                setCategory(k === "expense" ? "food" : "stipend");
              }}
              className={`flex-1 rounded-lg border py-1.5 text-sm capitalize ${kind === k ? "border-teal-500 bg-teal-500/10 text-teal-200" : "border-neutral-700 text-neutral-400"}`}
            >
              {k}
            </button>
          ))}
        </div>
        <input className={inputClass} inputMode="decimal" placeholder="Amount (₹)" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        <div className="flex flex-wrap gap-2">
          {cats.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-full border px-3 py-1 text-xs capitalize ${category === c ? "border-teal-500 text-teal-200" : "border-neutral-700 text-neutral-400"}`}
            >
              {c}
            </button>
          ))}
        </div>
        <input className={inputClass} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className={`${buttonClass} w-full`} disabled={busy || !amount}>
          {busy ? "Saving…" : `Add ${kind}`}
        </button>
      </form>
    </Card>
  );
}

function WellnessForm({ uid }: { uid: string }) {
  const [sleep, setSleep] = useState("");
  const [water, setWater] = useState("");
  const [exercise, setExercise] = useState("");
  const [mood, setMood] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const entry: Record<string, unknown> = { type: "wellness", source: "app", createdAt: serverTimestamp() };
    if (sleep) entry.sleep_hours = Number(sleep);
    if (water) entry.water_glasses = Number(water);
    if (exercise) entry.exercise_minutes = Number(exercise);
    if (mood) entry.mood = mood;
    if (note.trim()) entry.note = note.trim();
    if (Object.keys(entry).length <= 3) return;
    setBusy(true);
    try {
      await addDoc(userCol(uid, "logs"), entry);
      setSleep("");
      setWater("");
      setExercise("");
      setMood(0);
      setNote("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <input className={inputClass} inputMode="decimal" placeholder="Sleep (h)" value={sleep} onChange={(e) => setSleep(e.target.value)} />
          <input className={inputClass} inputMode="numeric" placeholder="Water 🥛" value={water} onChange={(e) => setWater(e.target.value)} />
          <input className={inputClass} inputMode="numeric" placeholder="Exercise (m)" value={exercise} onChange={(e) => setExercise(e.target.value)} />
        </div>
        <div className="flex justify-between">
          {[1, 2, 3, 4, 5].map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => setMood(m === mood ? 0 : m)}
              className={`grid h-11 w-11 place-items-center rounded-full text-xl ${mood === m ? "bg-teal-600/30 ring-2 ring-teal-500" : "bg-neutral-800"}`}
              aria-label={`Mood ${m}`}
            >
              {MOODS[m]}
            </button>
          ))}
        </div>
        <input className={inputClass} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className={`${buttonClass} w-full`} disabled={busy}>
          {busy ? "Saving…" : "Log wellness"}
        </button>
      </form>
    </Card>
  );
}
