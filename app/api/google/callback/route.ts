// GET /api/google/callback — Google redirects here after consent. The signed `state`
// identifies the user; we exchange the code and store the refresh token server-side.
import { connectWithCode, readState } from "@/lib/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (status: string) => Response.redirect(new URL(`/assistant?google=${status}`, url.origin), 302);
  try {
    if (url.searchParams.get("error")) return back("denied");
    const uid = readState(url.searchParams.get("state"));
    const code = url.searchParams.get("code");
    if (!code) return back("error");
    await connectWithCode(uid, code, req);
    return back("connected");
  } catch (err) {
    console.error("Google callback failed", err);
    return back("error");
  }
}
