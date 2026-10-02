// POST /api/voice/speak — premium text-to-speech. Body: { text }. Returns audio/mpeg.
// Provider: OpenAI (default) or ElevenLabs (set TTS_PROVIDER=elevenlabs).
import { errorResponse, HttpError, verifyRequestUser } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function openaiSpeech(text: string): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new HttpError(500, "Premium voice needs OPENAI_API_KEY.");
  return fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
      voice: process.env.OPENAI_TTS_VOICE || "alloy",
      input: text,
      response_format: "mp3",
      instructions: "Warm, friendly, natural pace. Like a helpful friend, not a news reader.",
    }),
  });
}

async function elevenLabsSpeech(text: string): Promise<Response> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) throw new HttpError(500, "Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID.");
  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL_ID || "eleven_flash_v2_5" }),
  });
}

export async function POST(req: Request) {
  try {
    await verifyRequestUser(req);
    const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
    const text = typeof body?.text === "string" ? body.text.trim().slice(0, 4000) : "";
    if (!text) throw new HttpError(400, "Nothing to say.");

    const upstream = process.env.TTS_PROVIDER === "elevenlabs" ? await elevenLabsSpeech(text) : await openaiSpeech(text);
    if (!upstream.ok || !upstream.body) {
      console.error("TTS failed", upstream.status, await upstream.text().catch(() => ""));
      throw new HttpError(502, "Voice generation failed.");
    }
    return new Response(upstream.body, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
