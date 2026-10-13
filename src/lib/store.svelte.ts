import { api, type Project, type Task, type TaskInput, type TaskPatch } from "./api";
import { addDays, daysBetween, prettyDate, today } from "./dates";

export type ViewKind = "all" | "inbox" | "today" | "upcoming" | "done" | "project" | "stats" | "activity" | "settings";
export type View = { kind: ViewKind; id?: number };
export type Sort = "manual" | "priority" | "due";
export type Theme = "system" | "dark" | "light";
export type Group = { key: string; title: string; tone?: string; tasks: Task[] };
export type Toast = { id: number; text: string; action?: string; run?: () => void; tone?: "ok" | "err" };

export const PRIO = ["Низкий", "Обычный", "Высокий", "Срочный"] as const;
export const ACCENTS = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#ec4899"];
export const PROJECT_COLORS = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#14b8a6", "#64748b"];

export const SMART: { kind: ViewKind; title: string; icon: string; color: string; key?: string }[] = [
  { kind: "today", title: "Сегодня", icon: "sun", color: "#f59e0b", key: "1" },
  { kind: "upcoming", title: "Предстоящие", icon: "calendar", color: "#ef4444", key: "2" },
  { kind: "inbox", title: "Входящие", icon: "inbox", color: "#3b82f6", key: "3" },
  { kind: "all", title: "Все задачи", icon: "layers", color: "#8b5cf6", key: "4" },
  { kind: "done", title: "Выполненные", icon: "done", color: "#10b981", key: "5" },
];
export const PAGES: { kind: ViewKind; title: string; icon: string }[] = [
  { kind: "stats", title: "Аналитика", icon: "chart" },
  { kind: "activity", title: "Журнал", icon: "history" },
  { kind: "settings", title: "Настройки", icon: "settings" },
];

const pref =<T>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem("flowdo." + k);
    return v == null ? d : JSON.parse(v);
  } catch {
    return d;
  }
};
const setPref = (k: string, v: unknown) => {
  try { localStorage.setItem("flowdo." + k, JSON.stringify(v)); } catch {}
};

class Store {
  tasks = $state<Task[]>([]);
  projects = $state<Project[]>([]);
  ready = $state(false);
  version = $state("");

  view = $state<View>(pref("view", { kind: "today" }));
  sort = $state<Sort>(pref("sort", "manual"));
  tag = $state<string | null>(null);
  showDone = $state<boolean>(pref("showDone", false));
  theme = $state<Theme>(pref("theme", "system"));
  accent = $state<string>(pref("accent", ACCENTS[0]));
  sidebar = $state<boolean>(pref("sidebar", true));

  openId = $state<number | null>(null);
  selectedId = $state<number | null>(null);
  completing = $state<number[]>([]);
  toasts = $state<Toast[]>([]);
  palette = $state(false);
  celebrate = $state(0);
  projectDialog = $state<{ id: number | null } | null>(null);
  menu = $state<{ x: number; y: number; id: number } | null>(null);
  dragId = $state<number | null>(null);
  dragProject = $state<number | null>(null);

  // ---------- производные ----------
  get project() { return this.view.kind === "project" ? this.projects.find((p) => p.id === this.view.id) ?? null : null; }
  get openTask() { return this.tasks.find((t) => t.id === this.openId) ?? null; }
  get isListView() { return !["stats", "activity", "settings"].includes(this.view.kind); }
  get allTags() { return [...new Set(this.tasks.filter((t) => !t.done).flatMap((t) => t.tags))].sort(); }

  /** Все задачи, относящиеся к разделу (и активные, и выполненные). Отсюда же — счётчики и прогресс. */
  inScope(view: View, t: Task): boolean {
    const now = today();
    switch (view.kind) {
      case "inbox": return t.project_id == null;
      case "today": return t.done ? (t.completed_at ?? "").slice(0, 10) === now : !!t.due && t.due <= now;
      case "upcoming": return !!t.due && t.due > now;
      case "project": return t.project_id === view.id;
      case "done": return t.done;
      default: return true;
    }
  }

  count(view: View) { return this.tasks.filter((t) => !t.done && this.inScope(view, t)).length; }

  get scope() { return this.tasks.filter((t) => this.inScope(this.view, t)); }

  get progress() {
    const s = this.scope, done = s.filter((t) => t.done).length;
    const late = s.filter((t) => !t.done && t.due && t.due < today()).length;
    return { total: s.length, done, left: s.length - done, late, pct: s.length ? Math.round((done / s.length) * 100) : 0 };
  }

  private matches(t: Task) { return !this.tag || t.tags.includes(this.tag); }

  get active() {
    const list = this.scope.filter((t) => (!t.done || this.completing.includes(t.id)) && this.matches(t));
    const byDue = (a: Task, b: Task) => (a.due ?? "9999").localeCompare(b.due ?? "9999");
    if (this.sort === "priority") return [...list].sort((a, b) => b.priority - a.priority || byDue(a, b));
    if (this.sort === "due" || this.view.kind === "upcoming") return [...list].sort((a, b) => byDue(a, b) || b.priority - a.priority);
    return list;
  }

  get completed() {
    return this.scope
      .filter((t) => t.done && !this.completing.includes(t.id) && this.matches(t))
      .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
  }

  get groups(): Group[] {
    const list = this.view.kind === "done" ? this.completed : this.active;
    const bucket = (key: string, title: string, tone?: string) => ({ key, title, tone, tasks: [] as Task[] });
    const by = (fn: (t: Task) => [string, string, string?]) => {
      const m = new Map<string, Group>();
      for (const t of list) {
        const [k, title, tone] = fn(t);
        if (!m.has(k)) m.set(k, bucket(k, title, tone));
        m.get(k)!.tasks.push(t);
      }
      return [...m.values()];
    };
    if (this.view.kind === "done") return by((t) => { const d = (t.completed_at ?? "").slice(0, 10); return [d, d ? prettyDate(d) : "Ранее"]; });
    if (this.view.kind === "today")
      return by((t) => (t.due! < today() ? ["late", "Просрочено", "late"] : ["today", "Сегодня"])).sort((a, b) => +(b.key === "late") - +(a.key === "late"));
    if (this.view.kind === "upcoming") return by((t) => [t.due!, prettyDate(t.due!)]);
    if (this.sort === "priority") return by((t) => [String(t.priority), PRIO[t.priority], "p" + t.priority]);
    if (this.sort === "due")
      return by((t) => {
        if (!t.due) return ["none", "Без срока"];
        const d = daysBetween(today(), t.due);
        return d < 0 ? ["late", "Просрочено", "late"] : d === 0 ? ["today", "Сегодня"] : d === 1 ? ["tomorrow", "Завтра"] : d < 7 ? ["week", "На этой неделе"] : ["later", "Позже"];
      });
    return [bucket("all", "", undefined)].map((g) => ({ ...g, tasks: list }));
  }

  get canDrag() { return this.sort === "manual" && !this.tag && ["all", "inbox", "project", "today"].includes(this.view.kind); }

  /** Плоский порядок видимых задач — для навигации с клавиатуры. */
  get flat() { return [...this.groups.flatMap((g) => g.tasks), ...(this.showDone && this.view.kind !== "done" ? this.completed : [])]; }

  // ---------- загрузка и настройки ----------
  async load() {
    try {
      const s = await api.bootstrap();
      this.tasks = s.tasks;
      this.projects = s.projects;
      this.version = s.version;
      if (this.view.kind === "project" && !this.project) this.view = { kind: "today" };
    } catch (e) {
      this.error(e);
    }
    this.ready = true;
  }

  go(view: View) {
    this.view = view;
    this.tag = null;
    this.selectedId = null;
    setPref("view", view);
  }
  setSort(s: Sort) { this.sort = s; setPref("sort", s); }
  toggleShowDone() { this.showDone = !this.showDone; setPref("showDone", this.showDone); }
  setTheme(t: Theme) { this.theme = t; setPref("theme", t); }
  setAccent(c: string) { this.accent = c; setPref("accent", c); }
  toggleSidebar() { this.sidebar = !this.sidebar; setPref("sidebar", this.sidebar); }

  // ---------- уведомления ----------
  private toastSeq = 0;
  toast(text: string, opts: Omit<Toast, "id" | "text"> = {}) {
    const id = ++this.toastSeq;
    this.toasts = [...this.toasts.slice(-2), { id, text, ...opts }];
    setTimeout(() => this.dismiss(id), opts.run ? 6000 : 3200);
  }
  dismiss(id: number) { this.toasts = this.toasts.filter((t) => t.id !== id); }
  error(e: unknown) { this.toast(String((e as any)?.message ?? e), { tone: "err" }); }

  // ---------- задачи ----------
  private put(t: Task) {
    const i = this.tasks.findIndex((x) => x.id === t.id);
    if (i >= 0) this.tasks[i] = t;
    else this.tasks = [...this.tasks, t].sort((a, b) => a.position - b.position);
  }

  /** Значения по умолчанию для новой задачи в текущем разделе. */
  defaults(): Partial<TaskInput> {
    const v = this.view;
    return {
      project_id: v.kind === "project" ? v.id : null,
      due: v.kind === "today" ? today() : v.kind === "upcoming" ? addDays(1) : null,
      tags: this.tag ? [this.tag] : [],
    };
  }

  async add(input: TaskInput) {
    try {
      const t = await api.createTask(input);
      this.tasks = [t, ...this.tasks];
      if (!this.inScope(this.view, t)) {
        const where = t.project_id ? this.projects.find((p) => p.id === t.project_id)?.name : t.due ? prettyDate(t.due) : "Входящие";
        this.toast(`Задача добавлена → ${where}`, { tone: "ok" });
      }
      return t;
    } catch (e) {
      this.error(e);
    }
  }

  async update(id: number, patch: TaskPatch) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    Object.assign(t, patch); // мгновенный отклик, сервер подтвердит
    try {
      this.put(await api.updateTask(id, patch));
    } catch (e) {
      this.error(e);
      await this.load();
    }
  }

  async toggle(id: number) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    const done = !t.done;
    const wasLeft = this.progress.left;
    if (done) {
      this.completing = [...this.completing, id];
      setTimeout(() => (this.completing = this.completing.filter((x) => x !== id)), 700);
    }
    await this.update(id, { done });
    if (done) {
      if (wasLeft === 1 && this.progress.left === 0 && this.isListView) this.celebrate++;
      this.toast("Задача выполнена", { action: "Отменить", run: () => this.update(id, { done: false }), tone: "ok" });
    }
  }

  async remove(id: number) {
    try {
      const t = await api.deleteTask(id);
      this.tasks = this.tasks.filter((x) => x.id !== id);
      if (this.openId === id) this.openId = null;
      this.toast(`Удалено: «${t.title.slice(0, 40)}»`, { action: "Вернуть", run: () => this.restore([t]) });
    } catch (e) {
      this.error(e);
    }
  }

  async restore(tasks: Task[]) {
    try {
      (await api.restoreTasks(tasks)).forEach((t) => this.put(t));
    } catch (e) {
      this.error(e);
    }
  }

  async duplicate(id: number) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    const { title, notes, priority, due, tags, project_id, subtasks } = t;
    const copy = await this.add({ title: title + " (копия)", notes, priority, due, tags, project_id, subtasks: subtasks.map((s) => ({ ...s, d: false })) });
    if (copy) this.openId = copy.id;
  }

  async clearCompleted() {
    const project = this.view.kind === "project" ? this.view.id! : null;
    try {
      const gone = await api.clearCompleted(project);
      if (!gone.length) return this.toast("Нет выполненных задач");
      const ids = new Set(gone.map((t) => t.id));
      this.tasks = this.tasks.filter((t) => !ids.has(t.id));
      this.toast(`Убрано выполненных: ${gone.length}`, { action: "Вернуть", run: () => this.restore(gone) });
    } catch (e) {
      this.error(e);
    }
  }

  /** Переставляет задачу перед/после другой и сохраняет общий порядок. */
  async reorder(dragId: number, targetId: number, after: boolean) {
    if (dragId === targetId) return;
    const list = [...this.tasks];
    const from = list.findIndex((t) => t.id === dragId);
    const [moved] = list.splice(from, 1);
    const to = list.findIndex((t) => t.id === targetId) + (after ? 1 : 0);
    list.splice(to, 0, moved);
    list.forEach((t, i) => (t.position = i));
    this.tasks = list;
    try {
      await api.reorderTasks(list.map((t) => t.id));
    } catch (e) {
      this.error(e);
    }
  }

  /** Перетаскивание задачи на раздел в боковой панели. */
  async dropOn(view: View, id: number) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    if (view.kind === "project") await this.update(id, { project_id: view.id! });
    else if (view.kind === "inbox") await this.update(id, { project_id: null });
    else if (view.kind === "today") await this.update(id, { due: today() });
    else if (view.kind === "upcoming") await this.update(id, { due: addDays(1) });
    else if (view.kind === "done" && !t.done) return this.toggle(id);
    else return;
    this.toast("Задача перенесена", { tone: "ok" });
  }

  // ---------- проекты ----------
  async saveProject(id: number | null, name: string, color: string) {
    try {
      if (id == null) {
        const p = await api.createProject(name, color);
        this.projects = [...this.projects, p];
        this.go({ kind: "project", id: p.id });
      } else {
        const p = await api.updateProject(id, { name, color });
        this.projects = this.projects.map((x) => (x.id === id ? p : x));
      }
      return true;
    } catch (e) {
      this.error(e);
      return false;
    }
  }

  async deleteProject(id: number) {
    try {
      await api.deleteProject(id);
      this.projects = this.projects.filter((p) => p.id !== id);
      this.tasks.forEach((t) => { if (t.project_id === id) t.project_id = null; });
      if (this.view.kind === "project" && this.view.id === id) this.go({ kind: "inbox" });
      this.toast("Проект удалён, задачи перенесены во «Входящие»");
    } catch (e) {
      this.error(e);
    }
  }

  async reorderProjects(dragId: number, targetId: number) {
    const list = [...this.projects];
    const [m] = list.splice(list.findIndex((p) => p.id === dragId), 1);
    list.splice(list.findIndex((p) => p.id === targetId), 0, m);
    this.projects = list;
    await api.reorderProjects(list.map((p) => p.id)).catch((e) => this.error(e));
  }
}

export const store = new Store();
