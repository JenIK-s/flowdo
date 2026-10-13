import { invoke } from "@tauri-apps/api/core";

export type Sub = { t: string; d: boolean };

export type Task = {
  id: number;
  title: string;
  notes: string;
  priority: number;
  done: boolean;
  due: string | null;
  tags: string[];
  position: number;
  created_at: string;
  completed_at: string | null;
  project_id: number | null;
  subtasks: Sub[];
};

export type Project = { id: number; name: string; color: string; position: number };
export type Activity = { id: number; ts: string; task_id: number | null; action: string; detail: string };

export type TaskInput = Partial<Omit<Task, "id" | "position" | "created_at" | "completed_at">> & { title: string };
export type TaskPatch = Partial<Omit<Task, "id" | "position" | "created_at" | "completed_at">>;

/** Внутри Tauri — вызовы Rust; в обычном браузере (vite dev) — демо-хранилище в памяти. */
const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const call = <T>(cmd: string, args?: Record<string, unknown>): Promise<T> =>
  inTauri ? invoke<T>(cmd, args) : import("./mock").then((m) => m.mock<T>(cmd, args ?? {}));

export const api = {
  inTauri,
  bootstrap: () => call<{ tasks: Task[]; projects: Project[]; version: string }>("bootstrap"),
  createTask: (input: TaskInput) => call<Task>("create_task", { input }),
  updateTask: (id: number, patch: TaskPatch) => call<Task>("update_task", { id, patch }),
  deleteTask: (id: number) => call<Task>("delete_task", { id }),
  restoreTasks: (tasks: Task[]) => call<Task[]>("restore_tasks", { tasks }),
  reorderTasks: (ids: number[]) => call<void>("reorder_tasks", { ids }),
  clearCompleted: (project: number | null) => call<Task[]>("clear_completed", { project }),
  createProject: (name: string, color?: string) => call<Project>("create_project", { name, color }),
  updateProject: (id: number, patch: { name?: string; color?: string }) => call<Project>("update_project", { id, patch }),
  deleteProject: (id: number) => call<void>("delete_project", { id }),
  reorderProjects: (ids: number[]) => call<void>("reorder_projects", { ids }),
  activity: (limit = 300) => call<Activity[]>("activity", { limit }),
  exportFile: (path: string, format: "json" | "csv") => call<void>("export_file", { path, format }),
  importFile: (path: string) => call<number>("import_file", { path }),
};
