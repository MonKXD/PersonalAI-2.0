// GET /api/google/connect — returns the Google consent URL for the signed-in user.
// (Fetched with the Firebase ID token, then the browser navigates to the URL.)
import { errorResponse, verifyRequestUser } from "@/lib/firebase-admin";
import { buildAuthUrl } from "@/lib/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await verifyRequestUser(req);
    return Response.json({ url: buildAuthUrl(user.uid, req) });
  } catch (err) {
    return errorResponse(err);
  }
}
