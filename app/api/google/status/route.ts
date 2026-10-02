// GET /api/google/status — is Google connected?   DELETE — disconnect and revoke.
import { errorResponse, verifyRequestUser } from "@/lib/firebase-admin";
import { disconnect, isConnected } from "@/lib/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await verifyRequestUser(req);
    return Response.json(await isConnected(user.uid));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await verifyRequestUser(req);
    await disconnect(user.uid);
    return Response.json({ connected: false });
  } catch (err) {
    return errorResponse(err);
  }
}
