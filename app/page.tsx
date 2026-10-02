"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { onSnapshot, orderBy, query, Timestamp, where } from "firebase/firestore";
import AppShell, { Card } from "@/components/AppShell";
import { useAuth } from "@/lib/auth-context";
import { daysUntil, inr, MOODS, startOfToday, userCol, type Exam, type Log, type Task } from "@/lib/data";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const [todayLogs, setTodayLogs] = useState<Log[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);

  useEffect(() => {
    if (!user) return;
    const since = Timestamp.fromDate(startOfToday());
    const unsubs = [
      onSnapshot(query(userCol(user.uid, "logs"), where("createdAt", ">=", since), orderBy("createdAt", "desc")), (s) =>
        setTodayLogs(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Log))
      ),
      onSnapshot(query(userCol(user.uid, "tasks"), where("done", "==", false)), (s) =>
        setTasks(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Task))
      ),
      onSnapshot(query(userCol(user.uid, "exams"), orderBy("date", "asc")), (s) =>
        setExams(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Exam))
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [user]);

  const today = useMemo(() => {
    let spent = 0;
    let earned = 0;
    const wellness: Record<string, number> = {};
    for (const l of todayLogs) {
      if (l.type !== "wellness") {
        if (l.type === "expense") spent += l.amount;
        else earned += l.amount;
      } else {
        for (const k of ["sleep_hours", "water_glasses", "mood", "exercise_minutes"] as const) {
          const v = l[k];
          if (typeof v === "number") wellness[k] = k === "water_glasses" || k === "exercise_minutes" ? (wellness[k] ?? 0) + v : v;
        }
      }
    }
    return { spent, earned, wellness };
  }, [todayLogs]);

  const nextExam = exams.find((e) => daysUntil(e.date) >= 0);
  const sortedTasks = [...tasks].sort((a, b) => (a.due?.toMillis() ?? Infinity) - (b.due?.toMillis() ?? Infinity)).slice(0, 5);
  const firstName = user?.displayName?.split(" ")[0] ?? "Harsh";

  return (
    <AppShell
      title={`${greeting()}, ${firstName}`}
      subtitle={new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
      action={
        <button onClick={signOut} className="text-xs text-neutral-400 hover:text-neutral-200">
          Sign out
        </button>
      }
    >
      <Link
        href="/assistant"
        className="flex items-center gap-4 rounded-2xl border border-teal-700/60 bg-gradient-to-br from-teal-900/50 to-neutral-900 p-4 hover:border-teal-500"
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-teal-600 shadow-[0_0_24px_rgba(20,184,166,0.45)]">
          <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-white stroke-2" strokeLinecap="round">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        </span>
        <span>
          <span className="block font-medium">Talk to your assistant</span>
          <span className="block text-xs text-neutral-400">&ldquo;I spent 80 on chai and samosa&rdquo; · &ldquo;What&apos;s on my list?&rdquo;</span>
        </span>
      </Link>

      <div className="grid grid-cols-2 gap-3">
        <Card title="Today's money">
          <p className="text-2xl font-semibold text-rose-300">{inr(today.spent)}</p>
          <p className="text-xs text-neutral-400">spent{today.earned ? ` · ${inr(today.earned)} earned` : ""}</p>
        </Card>
        <Card title="Next exam">
          {nextExam ? (
            <>
              <p className="text-2xl font-semibold text-teal-300">{daysUntil(nextExam.date) === 0 ? "Today" : `${daysUntil(nextExam.date)}d`}</p>
              <p className="truncate text-xs text-neutral-400">{nextExam.subject}</p>
            </>
          ) : (
            <Link href="/study" className="text-sm text-teal-400">
              Add exams →
            </Link>
          )}
        </Card>
      </div>

      <Card title="Today's wellness">
        {Object.keys(today.wellness).length ? (
          <div className="grid grid-cols-4 gap-2 text-center">
            <Stat label="Sleep" value={today.wellness.sleep_hours != null ? `${today.wellness.sleep_hours}h` : "–"} />
            <Stat label="Water" value={today.wellness.water_glasses != null ? `${today.wellness.water_glasses}` : "–"} />
            <Stat label="Mood" value={today.wellness.mood ? MOODS[today.wellness.mood] ?? "–" : "–"} />
            <Stat label="Exercise" value={today.wellness.exercise_minutes != null ? `${today.wellness.exercise_minutes}m` : "–"} />
          </div>
        ) : (
          <p className="text-sm text-neutral-400">
            Nothing logged yet.{" "}
            <Link href="/wellness" className="text-teal-400">
              Log now →
            </Link>
          </p>
        )}
      </Card>

      <Card title={`Open tasks (${tasks.length})`}>
        {sortedTasks.length ? (
          <ul className="space-y-2">
            {sortedTasks.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{t.title}</span>
                {t.due && (
                  <span className="shrink-0 text-xs text-neutral-400">
                    {t.due.toDate().toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-neutral-400">No open tasks. Ask your assistant to add one.</p>
        )}
        <Link href="/study" className="mt-3 inline-block text-xs text-teal-400">
          See all →
        </Link>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <QuickLink href="/news" title="News digest" sub="Live headlines" />
        <QuickLink href="/wellness" title="Money & wellness" sub="Log and review" />
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-[11px] text-neutral-400">{label}</p>
    </div>
  );
}

function QuickLink({ href, title, sub }: { href: string; title: string; sub: string }) {
  return (
    <Link href={href} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 hover:border-teal-600">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-neutral-400">{sub}</p>
    </Link>
  );
}
