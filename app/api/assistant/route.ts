// POST /api/assistant — one conversational turn with the voice agent.
// Body: { message: string, history?: { role: "user" | "assistant", content: string }[] }
// Header: Authorization: Bearer <Firebase ID token>
import { runAgent, type ChatTurn } from "@/lib/agent/run-agent";
import { errorResponse, HttpError, verifyRequestUser } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // web search + several tool calls can take a while

export async function POST(req: Request) {
  try {
    const user = await verifyRequestUser(req);
    const body = (await req.json().catch(() => null)) as { message?: unknown; history?: unknown } | null;

    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!message) throw new HttpError(400, "Say something first.");
    if (message.length > 4000) throw new HttpError(400, "That message is too long.");

    const history: ChatTurn[] = Array.isArray(body?.history)
      ? (body!.history as unknown[])
          .filter(
            (t): t is ChatTurn =>
              typeof t === "object" &&
              t !== null &&
              ((t as ChatTurn).role === "user" || (t as ChatTurn).role === "assistant") &&
              typeof (t as ChatTurn).content === "string" &&
              (t as ChatTurn).content.length > 0
          )
          .slice(-12)
      : [];

    const result = await runAgent({ uid: user.uid, userName: user.name, history, message });
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
