"use client";
// Settings row: connect / disconnect Google (Gmail read-only + Calendar) for the voice assistant.
import { useCallback, useEffect, useState } from "react";

type Status = { connected: boolean; gmail: boolean; calendar: boolean };

export default function GoogleConnect({ getToken }: { getToken: () => Promise<string> }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const call = useCallback(
    async (method: "GET" | "DELETE", path: string) => {
      const res = await fetch(path, { method, headers: { Authorization: `Bearer ${await getToken()}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      return json;
    },
    [getToken]
  );

  useEffect(() => {
    call("GET", "/api/google/status").then(setStatus).catch(() => setStatus(null));
    const flag = new URLSearchParams(window.location.search).get("google");
    if (flag === "connected") setMsg("Google connected.");
    else if (flag === "denied") setMsg("Google access was declined.");
    else if (flag === "error") setMsg("Couldn't connect Google. Please try again.");
  }, [call]);

  const connect = async () => {
    setBusy(true);
    setMsg("");
    try {
      const { url } = await call("GET", "/api/google/connect");
      window.location.href = url;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't start Google sign-in.");
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      setStatus(await call("DELETE", "/api/google/status"));
      setMsg("Google disconnected.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't disconnect.");
    }
    setBusy(false);
  };

  return (
    <div>
      <p className="mb-2 text-neutral-400">Google (Gmail read-only + Calendar)</p>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-neutral-700 px-3 py-2">
        <span className="text-xs text-neutral-300">
          {status?.connected ? "Connected — ask about your inbox or schedule." : "Not connected."}
        </span>
        <button
          onClick={status?.connected ? disconnect : connect}
          disabled={busy}
          className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {status?.connected ? "Disconnect" : "Connect"}
        </button>
      </div>
      {msg && <p className="mt-2 text-xs text-teal-300">{msg}</p>}
    </div>
  );
}
