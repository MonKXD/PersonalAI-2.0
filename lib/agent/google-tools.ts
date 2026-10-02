// Gmail (read-only) and Calendar executors for the voice agent. Real Google APIs, per-user OAuth.
import { googleApi } from "@/lib/google";

const TZ = "Asia/Kolkata";
type Input = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const int = (v: unknown, d: number, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : d;

type GmailList = { messages?: { id: string }[] };
type GmailMessage = { id: string; snippet?: string; internalDate?: string; payload?: { headers?: { name: string; value: string }[] } };

export async function summarizeInbox(uid: string, input: Input) {
  const max = int(input.max_results, 8, 1, 15);
  const q = str(input.query) || "is:unread in:inbox";
  const list = await googleApi<GmailList>(
    uid,
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}&q=${encodeURIComponent(q)}`
  );
  const ids = (list.messages ?? []).map((m) => m.id);
  const emails = await Promise.all(
    ids.map(async (id) => {
      const m = await googleApi<GmailMessage>(
        uid,
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`
      );
      const h = (n: string) => m.payload?.headers?.find((x) => x.name.toLowerCase() === n)?.value ?? "";
      return {
        from: h("from").replace(/<.*>/, "").replace(/"/g, "").trim() || h("from"),
        subject: h("subject"),
        snippet: (m.snippet ?? "").slice(0, 160),
        received: m.internalDate ? new Date(Number(m.internalDate)).toLocaleString("en-IN", { timeZone: TZ }) : "",
      };
    })
  );
  return { query: q, count: emails.length, emails };
}

type CalEvent = {
  id: string;
  summary?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

const fmt = (e?: { dateTime?: string; date?: string }) =>
  e?.dateTime ? new Date(e.dateTime).toLocaleString("en-IN", { timeZone: TZ }) : e?.date ? `${e.date} (all day)` : "";

export async function listEvents(uid: string, input: Input) {
  const days = int(input.days, 1, 1, 30);
  const from = str(input.from_iso) ? new Date(str(input.from_iso)) : new Date();
  if (Number.isNaN(from.getTime())) return { error: "from_iso is not a valid date-time." };
  const to = new Date(from.getTime() + days * 86_400_000);
  const params = new URLSearchParams({
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "20",
    timeZone: TZ,
  });
  const res = await googleApi<{ items?: CalEvent[] }>(
    uid,
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`
  );
  const events = (res.items ?? []).map((e) => ({
    title: e.summary ?? "(no title)",
    start: fmt(e.start),
    end: fmt(e.end),
    location: e.location ?? "",
  }));
  return { count: events.length, events };
}

export async function createEvent(uid: string, input: Input) {
  const title = str(input.title);
  const start = new Date(str(input.start_iso));
  if (!title) return { error: "Event needs a title." };
  if (Number.isNaN(start.getTime())) return { error: "start_iso must be an ISO 8601 date-time, e.g. 2026-10-05T18:00:00+05:30." };
  const minutes = int(input.duration_minutes, 60, 5, 24 * 60);
  const end = new Date(start.getTime() + minutes * 60_000);
  const ev = await googleApi<CalEvent & { htmlLink?: string }>(
    uid,
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      body: JSON.stringify({
        summary: title,
        description: str(input.description) || undefined,
        location: str(input.location) || undefined,
        start: { dateTime: start.toISOString(), timeZone: TZ },
        end: { dateTime: end.toISOString(), timeZone: TZ },
      }),
    }
  );
  return { created: true, title, start: fmt(ev.start), end: fmt(ev.end) };
}
