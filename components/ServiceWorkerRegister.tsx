"use client";
import { useEffect } from "react";

// Registers public/sw.js in production so the app is installable ("Add to Home Screen").
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("SW registration failed", err));
  }, []);
  return null;
}
