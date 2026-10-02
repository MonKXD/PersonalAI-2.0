// POST /api/agent — written news digest with LIVE web search.
// Body: { topic: string }. Returns { items: NewsItem[], generatedAt } (or { text } if parsing fails).
import Anthropic from "@anthropic-ai/sdk";
import { errorResponse, HttpError, verifyRequestUser } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

export type NewsItem = { headline: string; summary: string; whyItMatters?: string; source?: string; url?: string };

export async function POST(req: Request) {
  try {
    await verifyRequestUser(req);
    const body = (await req.json().catch(() => null)) as { topic?: unknown } | null;
    const topic = typeof body?.topic === "string" && body.topic.trim() ? body.topic.trim().slice(0, 200) : "Top news in India";

    const today = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "full" });
    const client = new Anthropic();
    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: `Today is ${today}. Search the web and give me a news digest on: "${topic}".
Pick the 5 most important stories from the last 48 hours. I'm a final-year EXTC engineering student in Mumbai looking for product/data analyst roles, so add a one-line "why it matters" for me where relevant.

Reply with ONLY a JSON array inside <json></json> tags, no other text:
[{"headline": "...", "summary": "2 sentences", "whyItMatters": "1 sentence or empty", "source": "publication name", "url": "https://..."}]`,
      },
    ];

    let finalText = "";
    for (let step = 0; step < 4; step++) {
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 5,
            user_location: { type: "approximate", city: "Mumbai", region: "Maharashtra", country: "IN", timezone: "Asia/Kolkata" },
          },
        ],
        messages,
      });
      messages.push({ role: "assistant", content: res.content });
      finalText = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      if (res.stop_reason !== "pause_turn") break;
    }

    const match = finalText.match(/<json>([\s\S]*?)<\/json>/) ?? finalText.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const raw = JSON.parse(match[1] ?? match[0]) as NewsItem[];
        const items = raw.filter((i) => i && typeof i.headline === "string").slice(0, 8);
        if (items.length) return Response.json({ items, topic, generatedAt: new Date().toISOString() });
      } catch {
        /* fall through to text */
      }
    }
    if (!finalText.trim()) throw new HttpError(502, "No digest came back. Try again.");
    return Response.json({ text: finalText.trim(), topic, generatedAt: new Date().toISOString() });
  } catch (err) {
    return errorResponse(err);
  }
}
