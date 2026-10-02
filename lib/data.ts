// Shared Firestore types + helpers for client pages.
// Schema is shared with the voice agent's tools (lib/agent/tools.ts) — keep them in sync.
import { collection, type CollectionReference, type DocumentData, type Timestamp } from "firebase/firestore";
import { requireDb } from "@/lib/firebase";

export type MoneyLog = {
  id: string;
  type: "expense" | "income";
  amount: number;
  category: string;
  note?: string;
  source?: "app" | "voice";
  createdAt: Timestamp | null;
};

export type WellnessLog = {
  id: string;
  type: "wellness";
  sleep_hours?: number;
  water_glasses?: number;
  mood?: number;
  exercise_minutes?: number;
  note?: string;
  source?: "app" | "voice";
  createdAt: Timestamp | null;
};

export type Log = MoneyLog | WellnessLog;

export type Task = {
  id: string;
  title: string;
  category: string;
  due: Timestamp | null;
  done: boolean;
  createdAt: Timestamp | null;
};

export type Exam = { id: string; subject: string; date: string /* YYYY-MM-DD */; createdAt: Timestamp | null };
export type Topic = { id: string; examId: string; title: string; done: boolean; createdAt: Timestamp | null };

export const userCol = (uid: string, name: "logs" | "tasks" | "exams" | "topics" | "memories"): CollectionReference<DocumentData> =>
  collection(requireDb(), "users", uid, name);

export const EXPENSE_CATEGORIES = ["food", "travel", "shopping", "bills", "education", "entertainment", "health", "other"];
export const INCOME_CATEGORIES = ["stipend", "freelance", "pocket money", "gift", "other"];

export const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function daysUntil(isoDate: string): number {
  const target = new Date(isoDate + "T00:00:00");
  return Math.ceil((target.getTime() - startOfToday().getTime()) / 86_400_000);
}

export const MOODS = ["", "😞", "😕", "😐", "🙂", "😄"];
