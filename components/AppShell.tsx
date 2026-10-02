"use client";
// Page frame: header + bottom tab bar (thumb-friendly on phone). Wraps pages in AuthGuard.
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import AuthGuard from "@/components/AuthGuard";

const TABS = [
  { href: "/", label: "Home", icon: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" },
  { href: "/wellness", label: "Log", icon: "M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z" },
  { href: "/assistant", label: "Talk", icon: "M9 3h6v11H9zM5 11a7 7 0 0 0 14 0M12 18v3" },
  { href: "/study", label: "Study", icon: "M4 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H4zM20 5h-5a3 3 0 0 0-3 3" },
  { href: "/news", label: "News", icon: "M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5" },
];

export default function AppShell({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  return (
    <AuthGuard>
      <div className="mx-auto min-h-[100dvh] max-w-2xl bg-neutral-950 pb-24 text-neutral-100">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-neutral-800/80 bg-neutral-950/90 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
          <div>
            <h1 className="text-lg font-semibold">{title}</h1>
            {subtitle && <p className="text-xs text-neutral-400">{subtitle}</p>}
          </div>
          {action}
        </header>
        <main className="space-y-4 px-4 py-4">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-800 bg-neutral-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <ul className="mx-auto grid max-w-2xl grid-cols-5">
          {TABS.map((t) => {
            const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
            const isTalk = t.href === "/assistant";
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  className={`flex flex-col items-center gap-1 py-2.5 text-[11px] ${active ? "text-teal-400" : "text-neutral-400 hover:text-neutral-200"}`}
                >
                  <span className={isTalk ? "grid h-9 w-9 place-items-center rounded-full bg-teal-600 text-white" : ""}>
                    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={t.icon} />
                    </svg>
                  </span>
                  {!isTalk && t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </AuthGuard>
  );
}

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-neutral-800 bg-neutral-900 p-4 ${className}`}>
      {title && <h2 className="mb-3 text-sm font-medium text-neutral-300">{title}</h2>}
      {children}
    </section>
  );
}

export const inputClass =
  "w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none placeholder:text-neutral-500 focus:border-teal-500";
export const buttonClass =
  "rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-40";
