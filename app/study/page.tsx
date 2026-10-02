"use client";
import { useEffect, useMemo, useState } from "react";
import { addDoc, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, Timestamp, updateDoc, where, writeBatch } from "firebase/firestore";
import AppShell, { buttonClass, Card, inputClass } from "@/components/AppShell";
import { useAuth } from "@/lib/auth-context";
import { requireDb } from "@/lib/firebase";
import { daysUntil, userCol, type Exam, type Task, type Topic } from "@/lib/data";

export default function StudyPage() {
  const { user } = useAuth();
  const [exams, setExams] = useState<Exam[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");

  useEffect(() => {
    if (!user) return;
    const unsubs = [
      onSnapshot(query(userCol(user.uid, "exams"), orderBy("date", "asc")), (s) => setExams(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Exam))),
      onSnapshot(query(userCol(user.uid, "topics"), orderBy("createdAt", "asc")), (s) => setTopics(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Topic))),
      onSnapshot(query(userCol(user.uid, "tasks"), where("done", "==", false)), (s) => setTasks(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Task))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [user]);

  const ref = (col: string, id: string) => doc(requireDb(), "users", user!.uid, col, id);

  const addExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !subject.trim() || !date) return;
    await addDoc(userCol(user.uid, "exams"), { subject: subject.trim(), date, createdAt: serverTimestamp() });
    setSubject("");
    setDate("");
  };

  const deleteExam = async (examId: string) => {
    if (!user || !confirm("Delete this exam and its syllabus?")) return;
    const batch = writeBatch(requireDb());
    topics.filter((t) => t.examId === examId).forEach((t) => batch.delete(ref("topics", t.id)));
    batch.delete(ref("exams", examId));
    await batch.commit();
  };

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !taskTitle.trim()) return;
    await addDoc(userCol(user.uid, "tasks"), {
      title: taskTitle.trim(),
      category: "study",
      due: taskDue ? Timestamp.fromDate(new Date(taskDue)) : null,
      done: false,
      source: "app",
      createdAt: serverTimestamp(),
    });
    setTaskTitle("");
    setTaskDue("");
  };

  const sortedTasks = useMemo(
    () => [...tasks].sort((a, b) => (a.due?.toMillis() ?? Infinity) - (b.due?.toMillis() ?? Infinity)),
    [tasks]
  );

  return (
    <AppShell title="Study" subtitle="Exams, syllabus and to-dos — synced everywhere">
      <Card title="Add an exam">
        <form onSubmit={addExam} className="flex flex-col gap-2 sm:flex-row">
          <input className={inputClass} placeholder="Subject, e.g. Microwave Engineering" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <input className={`${inputClass} sm:w-44`} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className={buttonClass} disabled={!subject.trim() || !date}>
            Add
          </button>
        </form>
      </Card>

      {exams.map((exam) => (
        <ExamCard
          key={exam.id}
          exam={exam}
          topics={topics.filter((t) => t.examId === exam.id)}
          onAddTopic={(title) =>
            user && addDoc(userCol(user.uid, "topics"), { examId: exam.id, title, done: false, createdAt: serverTimestamp() })
          }
          onToggle={(t) => updateDoc(ref("topics", t.id), { done: !t.done })}
          onDeleteTopic={(t) => deleteDoc(ref("topics", t.id))}
          onDelete={() => deleteExam(exam.id)}
        />
      ))}

      <Card title={`To-dos & reminders (${tasks.length})`}>
        <form onSubmit={addTask} className="mb-3 flex flex-col gap-2 sm:flex-row">
          <input className={inputClass} placeholder="e.g. Solve 2019 question paper" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
          <input className={`${inputClass} sm:w-56`} type="datetime-local" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} />
          <button className={buttonClass} disabled={!taskTitle.trim()}>
            Add
          </button>
        </form>
        {sortedTasks.length === 0 && <p className="text-sm text-neutral-400">Nothing pending. Tasks you add by voice show up here too.</p>}
        <ul className="divide-y divide-neutral-800">
          {sortedTasks.map((t) => {
            const overdue = t.due && t.due.toMillis() < Date.now();
            return (
              <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
                <button
                  onClick={() => updateDoc(ref("tasks", t.id), { done: true, completedAt: serverTimestamp() })}
                  aria-label="Mark done"
                  className="h-5 w-5 shrink-0 rounded-md border border-neutral-600 hover:border-teal-400"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate">{t.title}</p>
                  <p className={`text-xs ${overdue ? "text-rose-400" : "text-neutral-500"}`}>
                    <span className="capitalize">{t.category}</span>
                    {t.due && ` · ${t.due.toDate().toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </AppShell>
  );
}

function ExamCard(props: {
  exam: Exam;
  topics: Topic[];
  onAddTopic: (title: string) => unknown;
  onToggle: (t: Topic) => unknown;
  onDeleteTopic: (t: Topic) => unknown;
  onDelete: () => unknown;
}) {
  const { exam, topics } = props;
  const [title, setTitle] = useState("");
  const left = daysUntil(exam.date);
  const done = topics.filter((t) => t.done).length;
  const pct = topics.length ? Math.round((done / topics.length) * 100) : 0;

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">{exam.subject}</h3>
          <p className="text-xs text-neutral-400">
            {new Date(exam.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
          </p>
        </div>
        <div className="text-right">
          <p className={`text-xl font-semibold ${left < 0 ? "text-neutral-500" : left <= 7 ? "text-rose-300" : "text-teal-300"}`}>
            {left < 0 ? "Done" : left === 0 ? "Today" : `${left}d`}
          </p>
          <button onClick={props.onDelete} className="text-[11px] text-neutral-500 hover:text-rose-300">
            delete
          </button>
        </div>
      </div>

      <div className="mb-1 flex justify-between text-xs text-neutral-400">
        <span>Syllabus</span>
        <span>
          {done}/{topics.length} · {pct}%
        </span>
      </div>
      <div className="mb-3 h-1.5 rounded-full bg-neutral-800">
        <div className="h-1.5 rounded-full bg-teal-500 transition-all" style={{ width: `${pct}%` }} />
      </div>

      <ul className="space-y-1.5">
        {props.topics.map((t) => (
          <li key={t.id} className="group flex items-center gap-2 text-sm">
            <input type="checkbox" checked={t.done} onChange={() => props.onToggle(t)} className="h-4 w-4 accent-teal-500" />
            <span className={`flex-1 ${t.done ? "text-neutral-500 line-through" : ""}`}>{t.title}</span>
            <button onClick={() => props.onDeleteTopic(t)} aria-label="Delete topic" className="text-xs text-neutral-600 hover:text-rose-300">
              ✕
            </button>
          </li>
        ))}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          props.onAddTopic(title.trim());
          setTitle("");
        }}
        className="mt-3 flex gap-2"
      >
        <input className={inputClass} placeholder="Add topic / module" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button className={buttonClass} disabled={!title.trim()}>
          +
        </button>
      </form>
    </Card>
  );
}
