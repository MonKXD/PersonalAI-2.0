// Server-only Firebase Admin setup.
// Used by the voice assistant API routes to (1) verify the signed-in user's
// Firebase ID token and (2) read/write that user's Firestore data while the
// agent runs tools on the server.
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function getAdminApp(): App {
  const existing = getApps();
  if (existing.length) return existing[0]!;

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  // Vercel / .env store the key with literal "\n" — convert back to newlines.
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new HttpError(
      500,
      "Firebase Admin is not configured. Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL and FIREBASE_ADMIN_PRIVATE_KEY in .env.local."
    );
  }

  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

export const adminAuth = () => getAuth(getAdminApp());
export const adminDb = () => getFirestore(getAdminApp());

export type RequestUser = { uid: string; name?: string; email?: string };

/** Reads "Authorization: Bearer <Firebase ID token>" and verifies it. */
export async function verifyRequestUser(req: Request): Promise<RequestUser> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new HttpError(401, "Not signed in.");

  const authAdmin = adminAuth(); // throws a clear 500 if env vars are missing
  try {
    const decoded = await authAdmin.verifyIdToken(token);
    return { uid: decoded.uid, name: decoded.name as string | undefined, email: decoded.email };
  } catch {
    throw new HttpError(401, "Your session expired. Please sign in again.");
  }
}

/** Converts any thrown error into a JSON Response. */
export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  console.error(err);
  const message = err instanceof Error ? err.message : "Something went wrong.";
  return Response.json({ error: message }, { status: 500 });
}
