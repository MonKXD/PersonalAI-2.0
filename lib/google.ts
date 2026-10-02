// Server-only Google OAuth (Gmail read-only + Calendar events) using plain fetch.
// The refresh token lives in users/{uid}/private/google — the "private" collection is
// blocked for clients in firestore.rules, so only the Admin SDK (this server code) can read it.
import { createHmac, timingSafeEqual } from "node:crypto";
import { adminDb, HttpError } from "@/lib/firebase-admin";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

function creds() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new HttpError(500, "Google is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
  }
  return { clientId, clientSecret };
}

/** Redirect URI must match the one registered in Google Cloud exactly. */
export function redirectUri(req: Request) {
  return process.env.GOOGLE_REDIRECT_URI || `${new URL(req.url).origin}/api/google/callback`;
}

const tokenDoc = (uid: string) => adminDb().collection("users").doc(uid).collection("private").doc("google");

// --- signed OAuth state (binds the callback to the signed-in user, 10 min expiry) ---
const sign = (payload: string) => createHmac("sha256", creds().clientSecret).update(payload).digest("base64url");

export function makeState(uid: string) {
  const payload = Buffer.from(JSON.stringify({ uid, exp: Date.now() + 10 * 60_000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readState(state: string | null): string {
  const [payload, sig] = (state ?? "").split(".");
  if (!payload || !sig) throw new HttpError(400, "Invalid state.");
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw new HttpError(400, "Invalid state.");
  const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { uid?: string; exp?: number };
  if (!data.uid || !data.exp || data.exp < Date.now()) throw new HttpError(400, "Sign-in link expired. Try again.");
  return data.uid;
}

export function buildAuthUrl(uid: string, req: Request) {
  const params = new URLSearchParams({
    client_id: creds().clientId,
    redirect_uri: redirectUri(req),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent", // always return a refresh token
    include_granted_scopes: "true",
    state: makeState(uid),
  });
  return `${AUTH_URL}?${params}`;
}

async function tokenRequest(body: Record<string, string>) {
  const { clientId, clientSecret } = creds();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...body }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
  };
  if (!res.ok || !json.access_token) throw new HttpError(502, `Google token error: ${json.error ?? res.status}`);
  return json;
}

export async function connectWithCode(uid: string, code: string, req: Request) {
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri(req) });
  if (!t.refresh_token) throw new HttpError(400, "Google did not return a refresh token. Remove the app at myaccount.google.com/permissions and retry.");
  await tokenDoc(uid).set({
    refreshToken: t.refresh_token,
    scope: t.scope ?? "",
    accessToken: t.access_token,
    expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000,
    connectedAt: Date.now(),
  });
}

export async function isConnected(uid: string) {
  const snap = await tokenDoc(uid).get();
  const scope = String(snap.data()?.scope ?? "");
  return {
    connected: snap.exists && !!snap.data()?.refreshToken,
    gmail: scope.includes("gmail.readonly"),
    calendar: scope.includes("calendar.events"),
  };
}

export async function disconnect(uid: string) {
  const snap = await tokenDoc(uid).get();
  const token = snap.data()?.refreshToken as string | undefined;
  if (token) await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => {});
  await tokenDoc(uid).delete();
}

async function accessToken(uid: string): Promise<string> {
  const snap = await tokenDoc(uid).get();
  const d = snap.data();
  if (!d?.refreshToken) throw new HttpError(400, "Google isn't connected. Open Talk → Settings → Connect Google.");
  if (d.accessToken && typeof d.expiresAt === "number" && d.expiresAt > Date.now() + 60_000) return d.accessToken as string;
  try {
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: d.refreshToken as string });
    await tokenDoc(uid).update({ accessToken: t.access_token, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 });
    return t.access_token!;
  } catch {
    throw new HttpError(400, "Google access expired. Reconnect Google in Talk → Settings.");
  }
}

/** Authenticated call to a Google REST API for this user. */
export async function googleApi<T>(uid: string, url: string, init?: RequestInit): Promise<T> {
  const token = await accessToken(uid);
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new HttpError(502, `Google API ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}
