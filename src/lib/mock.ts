// Демо-бэкенд для запуска интерфейса в обычном браузере (npm run dev) без Rust.
import type { Activity, Project, Task } from "./api";
import { addDays, today } from "./dates";

const KEY = "flowdo-mock";
type Db = { tasks: Task[]; projects: Project[]; activity: Activity[]; seq: number };

const now = () => new Date().toISOString().slice(0, 19);

function seed(): Db {
  const db: Db = { tasks: [], projects: [], activity: [], seq: 1 };
  db.projects = [
    { id: 1, name: "Работа", color: "#8b5cf6", position: 1 },
    { id: 2, name: "Дом", color: "#10b981", position: 2 },
  ];
  const mk = (title: string, o: Partial<Task> = {}) =>
    db.tasks.push({
      id: db.seq++, title, notes: "", priority: 1, done: false, due: null, tags: [], position: db.seq,
      created_at: now(), completed_at: null, project_id: null, subtasks: [], ...o,
    });
  mk("Подготовить квартальный отчёт", { priority: 3, due: today(), project_id: 1, tags: ["отчёты"],
    subtasks: [{ t: "Собрать метрики", d: true }, { t: "Сделать слайды", d: false }] });
  mk("Созвон с командой дизайна", { priority: 2, due: addDays(1), project_id: 1 });
  mk("Купить продукты", { due: today(), project_id: 2, tags: ["покупки"], notes: "Молоко, хлеб, кофе" });
  mk("Записаться к стоматологу", { priority: 2, due: addDays(-1) });
  mk("Прочитать «Deep Work»", { priority: 0, tags: ["книги"] });
  mk("Полить цветы", { done: true, completed_at: now(), project_id: 2 });
  return db;
}

function load(): Db {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return seed();
}

const db = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {} };
const log = (action: string, detail = "", task_id: number | null = null) =>
  db.activity.unshift({ id: db.seq++, ts: now(), action, detail, task_id });
const find = (id: number) => {
  const t = db.tasks.find((x) => x.id === id);
  if (!t) throw "Задача не найдена";
  return t;
};

export async function mock<T>(cmd: string, a: any): Promise<T> {
  const r = run(cmd, a);
  save();
  return structuredClone(r) as T;
}

function run(cmd: string, a: any): unknown {
  switch (cmd) {
    case "bootstrap":
      return { tasks: [...db.tasks].sort((x, y) => x.position - y.position), projects: db.projects, version: "dev" };
    case "create_task": {
      const top = Math.min(0, ...db.tasks.map((t) => t.position));
      const t: Task = {
        id: db.seq++, title: a.input.title.trim(), notes: a.input.notes ?? "", priority: a.input.priority ?? 1,
        done: !!a.input.done, due: a.input.due ?? null, tags: a.input.tags ?? [], position: top - 1, created_at: now(),
        completed_at: null, project_id: a.input.project_id ?? null, subtasks: a.input.subtasks ?? [],
      };
      db.tasks.unshift(t);
      log("created", t.title, t.id);
      return t;
    }
    case "update_task": {
      const t = find(a.id);
      const p = { ...a.patch };
      let action = "updated";
      if ("done" in p && p.done !== t.done) {
        action = p.done ? "completed" : "reopened";
        t.completed_at = p.done ? now() : null;
      }
      Object.assign(t, p);
      log(action, t.title, t.id);
      return t;
    }
    case "delete_task": {
      const t = find(a.id);
      db.tasks = db.tasks.filter((x) => x.id !== a.id);
      log("deleted", t.title, t.id);
      return t;
    }
    case "restore_tasks":
      db.tasks.push(...a.tasks);
      db.tasks.sort((x, y) => x.position - y.position);
      a.tasks.forEach((t: Task) => log("restored", t.title, t.id));
      return a.tasks;
    case "reorder_tasks":
      a.ids.forEach((id: number, i: number) => { const t = db.tasks.find((x) => x.id === id); if (t) t.position = i; });
      db.tasks.sort((x, y) => x.position - y.position);
      return null;
    case "clear_completed": {
      const gone = db.tasks.filter((t) => t.done && (a.project == null || t.project_id === a.project));
      db.tasks = db.tasks.filter((t) => !gone.includes(t));
      log("cleared", `Удалено выполненных: ${gone.length}`);
      return gone;
    }
    case "create_project": {
      if (db.projects.some((p) => p.name === a.name.trim())) throw "Проект с таким названием уже существует";
      const p = { id: db.seq++, name: a.name.trim(), color: a.color ?? "#3b82f6", position: db.projects.length + 1 };
      db.projects.push(p);
      log("project_created", p.name);
      return p;
    }
    case "update_project": {
      const p = db.projects.find((x) => x.id === a.id)!;
      return Object.assign(p, a.patch);
    }
    case "delete_project":
      db.tasks.forEach((t) => { if (t.project_id === a.id) t.project_id = null; });
      db.projects = db.projects.filter((p) => p.id !== a.id);
      return null;
    case "reorder_projects":
      a.ids.forEach((id: number, i: number) => { const p = db.projects.find((x) => x.id === id); if (p) p.position = i; });
      db.projects.sort((x, y) => x.position - y.position);
      return null;
    case "activity":
      return db.activity.slice(0, a.limit);
    default:
      throw `Команда «${cmd}» доступна только в приложении`;
  }
}
