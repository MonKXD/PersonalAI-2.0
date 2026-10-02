// POST /api/voice/transcribe — premium speech-to-text (OpenAI).
// Body: multipart/form-data with an "audio" file. Returns { text }.
import { errorResponse, HttpError, verifyRequestUser } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024; // ~10 MB is several minutes of speech

export async function POST(req: Request) {
  try {
    await verifyRequestUser(req);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new HttpError(500, "Premium voice needs OPENAI_API_KEY. Switch to Free voice in settings, or add the key.");

    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob) || audio.size === 0) throw new HttpError(400, "No audio received.");
    if (audio.size > MAX_BYTES) throw new HttpError(413, "Recording is too long.");

    const filename = audio.type.includes("mp4") ? "speech.mp4" : audio.type.includes("ogg") ? "speech.ogg" : "speech.webm";
    const upstream = new FormData();
    upstream.append("file", audio, filename);
    upstream.append("model", process.env.OPENAI_STT_MODEL || "gpt-4o-mini-transcribe");
    // Helps with Indian names, places and Hinglish words.
    upstream.append("prompt", "Mumbai, Thadomal Shahani, EXTC, rupees, Harsh. The speaker may mix Hindi and English.");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
    });
    if (!res.ok) {
      console.error("Transcription failed", res.status, await res.text());
      throw new HttpError(502, "Couldn't understand the audio. Try again.");
    }
    const data = (await res.json()) as { text?: string };
    return Response.json({ text: (data.text ?? "").trim() });
  } catch (err) {
    return errorResponse(err);
  }
}
