// Everything the voice assistant can DO.
// Each tool = a schema Claude sees + an executor that runs on the server.
// To add a new ability: add a definition to TOOL_DEFINITIONS and a matching
// case in executeTool(). (Or run the /add-agent-tool slash command in Claude Code.)
import type Anthropic from "@anthropic-ai/sdk";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { createEvent, listEvents, summarizeInbox } from "./google-tools";

export const TIMEZONE = "Asia/Kolkata";

/** Actions the phone/browser performs after the reply (open apps, timers…). */
export type ClientAction =
  | { type: "open_url"; url: string; label: string }
  | { type: "call"; phone: string; label: string }
  | { type: "timer"; seconds: number; label: string };

export type ToolContext = {
  uid: string;
  clientActions: ClientAction[];
};

// Firestore paths — all data lives under users/{uid}/… (matches firestore.rules).
// Field names are shared with the app pages (see lib/data.ts) — keep them in sync.
const col = (uid: string, name: "logs" | "tasks" | "memories" | "exams" | "topics") =>
  adminDb().collection("users").doc(uid).collection(name);

// ---------------------------------------------------------------------------
// Tool schemas (what Claude sees)
// ---------------------------------------------------------------------------
export const TOOL_DEFINITIONS: Anthropic.ToolUnion[] = [
  {
    // Server-side web search, run by Anthropic — gives live news, scores, prices, etc.
    type: "web_search_20250305",
    name: "web_search",
    max_uses: 3,
    user_location: { type: "approximate", city: "Mumbai", region: "Maharashtra", country: "IN", timezone: TIMEZONE },
  },
  {
    name: "get_current_datetime",
    description: "Get the current date, day and time in Harsh's timezone (Mumbai). Use before anything date-relative.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "log_money",
    description: "Log an expense or income entry. Use when Harsh says he spent, paid, bought, received or earned money.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["expense", "income"] },
        amount: { type: "number", description: "Amount in INR (rupees)" },
        category: {
          type: "string",
          description: "e.g. food, travel, shopping, bills, education, entertainment, stipend, freelance, other",
        },
        note: { type: "string", description: "Short description, e.g. 'auto to college'" },
      },
      required: ["kind", "amount", "category"],
    },
  },
  {
    name: "log_wellness",
    description: "Log wellness data: sleep, water, mood, exercise. Include only the fields Harsh mentioned.",
    input_schema: {
      type: "object",
      properties: {
        sleep_hours: { type: "number" },
        water_glasses: { type: "number" },
        mood: { type: "integer", minimum: 1, maximum: 5, description: "1 = awful, 5 = great" },
        exercise_minutes: { type: "number" },
        note: { type: "string" },
      },
    },
  },
  {
    name: "get_money_summary",
    description: "Summarise expenses and income over the last N days, with totals per category.",
    input_schema: {
      type: "object",
      properties: { days: { type: "integer", minimum: 1, maximum: 90, description: "Defaults to 7" } },
    },
  },
  {
    name: "summarize_inbox",
    description:
      "Read Harsh's Gmail (read-only) and return recent emails (sender, subject, snippet). Defaults to unread inbox mail. Summarise the result aloud briefly. Use Gmail search syntax in query, e.g. 'from:amazon newer_than:2d'.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Gmail search query. Default: is:unread in:inbox" },
        max_results: { type: "integer", minimum: 1, maximum: 15, description: "Defaults to 8" },
      },
    },
  },
  {
    name: "list_events",
    description: "List Google Calendar events starting now (or from a given time) for the next N days.",
    input_schema: {
      type: "object",
      properties: {
        days: { type: "integer", minimum: 1, maximum: 30, description: "Defaults to 1 (today onward)" },
        from_iso: { type: "string", description: "ISO 8601 start, e.g. 2026-10-05T00:00:00+05:30. Defaults to now." },
      },
    },
  },
  {
    name: "create_event",
    description: "Create a Google Calendar event. Resolve relative dates ('tomorrow 5pm') using the current IST time first.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        start_iso: { type: "string", description: "ISO 8601 date-time in IST, e.g. 2026-10-05T18:00:00+05:30" },
        duration_minutes: { type: "integer", description: "Defaults to 60" },
        location: { type: "string" },
        description: { type: "string" },
      },
      required: ["title", "start_iso"],
    },
  },
  {
    name: "add_task",
    description: "Add a to-do, study task or reminder to Harsh's task list.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        due: { type: "string", description: "ISO 8601 date-time in IST, e.g. 2026-10-05T18:00:00+05:30. Omit if no due time." },
        category: { type: "string", enum: ["study", "job", "personal", "health", "money"] },
      },
      required: ["title"],
    },
  },
  {
    name: "list_tasks",
    description: "List Harsh's open tasks (soonest due first).",
    input_schema: {
      type: "object",
      properties: { category: { type: "string", enum: ["study", "job", "personal", "health", "money"] } },
    },
  },
  {
    name: "complete_task",
    description: "Mark an open task as done, matched by words from its title.",
    input_schema: {
      type: "object",
      properties: { title_contains: { type: "string" } },
      required: ["title_contains"],
    },
  },
  {
    name: "get_study_overview",
    description: "Get Harsh's upcoming exams (days left) and syllabus completion per exam. Use for questions about exams, study progress or what to study.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "remember_fact",
    description:
      "Save a durable fact about Harsh for future conversations (preferences, people, exam dates, goals). Only when he states it or asks you to remember.",
    input_schema: {
      type: "object",
      properties: { fact: { type: "string" } },
      required: ["fact"],
    },
  },
  {
    name: "forget_fact",
    description: "Delete a remembered fact, matched by words it contains.",
    input_schema: {
      type: "object",
      properties: { contains: { type: "string" } },
      required: ["contains"],
    },
  },
  {
    name: "device_action",
    description:
      "Do something on Harsh's phone/laptop: open a website, search YouTube, open Google Maps directions, draft a WhatsApp message, start a phone call, or set a timer.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["open_website", "youtube", "maps", "whatsapp", "call", "timer"] },
        value: {
          type: "string",
          description:
            "open_website: full URL. youtube: search query. maps: destination. whatsapp: phone with country code (digits only) or empty. call: phone number. timer: seconds as a number.",
        },
        message: { type: "string", description: "whatsapp: message text. timer: what the timer is for." },
      },
      required: ["action", "value"],
    },
  },
];

// ---------------------------------------------------------------------------
// Executors (what actually happens)
// ---------------------------------------------------------------------------
type Input = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

export function nowInIST() {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
}

export async function executeTool(name: string, input: Input, ctx: ToolContext): Promise<unknown> {
  switch (name) {
    case "get_current_datetime":
      return { now: nowInIST(), iso: new Date().toISOString(), timezone: TIMEZONE };

    case "log_money": {
      const amount = num(input.amount);
      const kind = input.kind === "income" ? "income" : "expense";
      if (!amount || amount <= 0) return { error: "Amount must be a positive number." };
      const ref = await col(ctx.uid, "logs").add({
        type: kind,
        amount,
        category: str(input.category) || "other",
        note: str(input.note),
        source: "voice",
        createdAt: FieldValue.serverTimestamp(),
      });
      return { saved: true, id: ref.id, kind, amount };
    }

    case "log_wellness": {
      const entry: Record<string, unknown> = { type: "wellness", source: "voice", createdAt: FieldValue.serverTimestamp() };
      for (const k of ["sleep_hours", "water_glasses", "mood", "exercise_minutes"]) {
        const v = num(input[k]);
        if (v !== undefined) entry[k] = v;
      }
      if (str(input.note)) entry.note = str(input.note);
      if (Object.keys(entry).length <= 3) return { error: "Nothing to log — no wellness values given." };
      const ref = await col(ctx.uid, "logs").add(entry);
      return { saved: true, id: ref.id };
    }

    case "get_money_summary": {
      const days = Math.min(Math.max(num(input.days) ?? 7, 1), 90);
      const since = Timestamp.fromMillis(Date.now() - days * 86_400_000);
      const snap = await col(ctx.uid, "logs").where("createdAt", ">=", since).orderBy("createdAt", "desc").get();
      const totals = { expense: 0, income: 0 };
      const byCategory: Record<string, number> = {};
      let count = 0;
      snap.forEach((doc) => {
        const d = doc.data();
        if (d.type !== "expense" && d.type !== "income") return;
        const amt = typeof d.amount === "number" ? d.amount : 0;
        totals[d.type as "expense" | "income"] += amt;
        if (d.type === "expense") byCategory[d.category ?? "other"] = (byCategory[d.category ?? "other"] ?? 0) + amt;
        count++;
      });
      return { days, entries: count, totalSpent: totals.expense, totalEarned: totals.income, spentByCategory: byCategory };
    }

    case "add_task": {
      const title = str(input.title);
      if (!title) return { error: "Task needs a title." };
      const dueStr = str(input.due);
      const due = dueStr && !Number.isNaN(Date.parse(dueStr)) ? Timestamp.fromDate(new Date(dueStr)) : null;
      const ref = await col(ctx.uid, "tasks").add({
        title,
        category: str(input.category) || "personal",
        due,
        done: false,
        source: "voice",
        createdAt: FieldValue.serverTimestamp(),
      });
      return { saved: true, id: ref.id, title, due: dueStr || null };
    }

    case "list_tasks": {
      const snap = await col(ctx.uid, "tasks").where("done", "==", false).limit(50).get();
      const category = str(input.category);
      const tasks = snap.docs
        .map((d) => {
          const t = d.data();
          return { id: d.id, title: t.title as string, category: t.category as string, due: (t.due as Timestamp | null)?.toDate() ?? null };
        })
        .filter((t) => !category || t.category === category)
        .sort((a, b) => (a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity))
        .slice(0, 15)
        .map((t) => ({
          ...t,
          due: t.due ? t.due.toLocaleString("en-IN", { timeZone: TIMEZONE, dateStyle: "medium", timeStyle: "short" }) : null,
        }));
      return { open: tasks.length, tasks };
    }

    case "complete_task": {
      const needle = str(input.title_contains).toLowerCase();
      const snap = await col(ctx.uid, "tasks").where("done", "==", false).limit(100).get();
      const match = snap.docs.find((d) => String(d.data().title ?? "").toLowerCase().includes(needle));
      if (!match) return { error: `No open task matching "${needle}".` };
      await match.ref.update({ done: true, completedAt: FieldValue.serverTimestamp() });
      return { completed: match.data().title };
    }

    case "summarize_inbox":
      return summarizeInbox(ctx.uid, input);

    case "list_events":
      return listEvents(ctx.uid, input);

    case "create_event":
      return createEvent(ctx.uid, input);

    case "get_study_overview": {
      const [examsSnap, topicsSnap] = await Promise.all([col(ctx.uid, "exams").get(), col(ctx.uid, "topics").get()]);
      const today = new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }));
      today.setHours(0, 0, 0, 0);
      const topics = topicsSnap.docs.map((d) => d.data());
      const exams = examsSnap.docs
        .map((d) => {
          const e = d.data();
          const mine = topics.filter((t) => t.examId === d.id);
          const pending = mine.filter((t) => !t.done).map((t) => String(t.title));
          return {
            subject: String(e.subject),
            date: String(e.date),
            daysLeft: Math.ceil((new Date(`${e.date}T00:00:00`).getTime() - today.getTime()) / 86_400_000),
            topicsDone: mine.length - pending.length,
            topicsTotal: mine.length,
            pendingTopics: pending.slice(0, 10),
          };
        })
        .filter((e) => e.daysLeft >= 0)
        .sort((a, b) => a.daysLeft - b.daysLeft);
      return { upcomingExams: exams };
    }

    case "remember_fact": {
      const fact = str(input.fact);
      if (!fact) return { error: "Nothing to remember." };
      await col(ctx.uid, "memories").add({ fact, createdAt: FieldValue.serverTimestamp() });
      return { remembered: fact };
    }

    case "forget_fact": {
      const needle = str(input.contains).toLowerCase();
      const snap = await col(ctx.uid, "memories").get();
      const matches = snap.docs.filter((d) => String(d.data().fact ?? "").toLowerCase().includes(needle));
      await Promise.all(matches.map((m) => m.ref.delete()));
      return { forgotten: matches.length };
    }

    case "device_action":
      return queueDeviceAction(input, ctx);

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

function queueDeviceAction(input: Input, ctx: ToolContext) {
  const value = str(input.value);
  const message = str(input.message);
  const enc = encodeURIComponent;
  let action: ClientAction | null = null;

  switch (input.action) {
    case "open_website": {
      const url = /^https?:\/\//i.test(value) ? value : `https://${value}`;
      action = { type: "open_url", url, label: `Open ${new URL(url).hostname}` };
      break;
    }
    case "youtube":
      action = { type: "open_url", url: `https://www.youtube.com/results?search_query=${enc(value)}`, label: `YouTube: ${value}` };
      break;
    case "maps":
      action = { type: "open_url", url: `https://www.google.com/maps/dir/?api=1&destination=${enc(value)}`, label: `Directions to ${value}` };
      break;
    case "whatsapp": {
      const phone = value.replace(/\D/g, "");
      action = { type: "open_url", url: `https://wa.me/${phone}?text=${enc(message)}`, label: "Send on WhatsApp" };
      break;
    }
    case "call":
      action = { type: "call", phone: value.replace(/[^\d+]/g, ""), label: `Call ${value}` };
      break;
    case "timer": {
      const seconds = Math.round(Number(value));
      if (!Number.isFinite(seconds) || seconds <= 0) return { error: "Timer needs a positive number of seconds." };
      action = { type: "timer", seconds, label: message || "Timer" };
      break;
    }
  }
  if (!action) return { error: "Unsupported device action." };
  ctx.clientActions.push(action);
  return { queued: true, action: action.type, note: "The app will perform this on Harsh's device right after your reply." };
}

/** Facts saved via remember_fact, injected into the system prompt. */
export async function loadMemories(uid: string): Promise<string[]> {
  const snap = await col(uid, "memories").orderBy("createdAt", "desc").limit(40).get();
  return snap.docs.map((d) => String(d.data().fact ?? "")).filter(Boolean);
}
