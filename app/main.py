import csv
import io
import json
import logging
import os
import sqlite3
import sys
from contextlib import contextmanager
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

VERSION = "2.0"
BASE = Path(__file__).parent


def _default_db() -> Path:
    if getattr(sys, "frozen", False):  # запущено из .exe → данные в профиле пользователя
        return Path(os.getenv("APPDATA") or Path.home() / ".config") / "FlowDo" / "flowdo.db"
    return BASE.parent / "data" / "flowdo.db"


DB_PATH = Path(os.getenv("FLOWDO_DB", _default_db()))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)
logging.basicConfig(filename=DB_PATH.with_name("flowdo.log"), level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(message)s")
log_ = logging.getLogger("flowdo")

# Версионируемые миграции: база старых версий обновляется автоматически, данные не теряются
MIGRATIONS = [
    """CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
        priority INTEGER NOT NULL DEFAULT 1, done INTEGER NOT NULL DEFAULT 0, due TEXT,
        tags TEXT NOT NULL DEFAULT '', position REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL, completed_at TEXT);""",
    """CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, position REAL NOT NULL DEFAULT 0);
    ALTER TABLE tasks ADD COLUMN project_id INTEGER;
    ALTER TABLE tasks ADD COLUMN subtasks TEXT NOT NULL DEFAULT '[]';
    CREATE TABLE activity (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, task_id INTEGER,
        action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '');""",
]


@contextmanager
def db():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    try:
        yield con
        con.commit()
    finally:
        con.close()


with db() as _c:
    _v = _c.execute("PRAGMA user_version").fetchone()[0]
    for _i in range(_v, len(MIGRATIONS)):
        _c.executescript(MIGRATIONS[_i])
        _c.execute(f"PRAGMA user_version={_i + 1}")
        log_.info("migrated to v%d", _i + 1)


class Sub(BaseModel):
    t: str = Field(max_length=200)
    d: bool = False


class TaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    notes: str = ""
    priority: int = Field(1, ge=0, le=3)
    due: Optional[str] = None
    tags: list[str] = []
    done: bool = False
    project_id: Optional[int] = None
    subtasks: list[Sub] = []


class TaskPatch(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=300)
    notes: Optional[str] = None
    priority: Optional[int] = Field(None, ge=0, le=3)
    due: Optional[str] = None
    tags: Optional[list[str]] = None
    done: Optional[bool] = None
    project_id: Optional[int] = None
    subtasks: Optional[list[Sub]] = None


class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)


class Reorder(BaseModel):
    ids: list[int]


class ImportData(BaseModel):
    projects: list[dict] = []
    tasks: list[dict] = []


def now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def out(r: sqlite3.Row) -> dict:
    d = dict(r)
    d["done"] = bool(d["done"])
    d["tags"] = [t for t in d["tags"].split(",") if t]
    d["subtasks"] = json.loads(d["subtasks"] or "[]")
    return d


def audit(con, action: str, task_id=None, detail: str = ""):
    con.execute("INSERT INTO activity (ts, task_id, action, detail) VALUES (?,?,?,?)",
                (now(), task_id, action, detail[:200]))


def join_tags(tags) -> str:
    return ",".join(x.strip() for x in tags if x.strip())


app = FastAPI(title="FlowDo", version=VERSION)


# ---------- задачи ----------
@app.get("/api/tasks")
def list_tasks():
    with db() as con:
        return [out(r) for r in con.execute("SELECT * FROM tasks ORDER BY position")]


@app.post("/api/tasks", status_code=201)
def create_task(t: TaskIn):
    with db() as con:
        top = con.execute("SELECT COALESCE(MIN(position), 0) FROM tasks").fetchone()[0]
        cur = con.execute(
            "INSERT INTO tasks (title, notes, priority, done, due, tags, position, created_at, completed_at, project_id, subtasks)"
            " VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (t.title.strip(), t.notes, t.priority, int(t.done), t.due or None, join_tags(t.tags), top - 1, now(),
             now() if t.done else None, t.project_id, json.dumps([s.model_dump() for s in t.subtasks], ensure_ascii=False)))
        audit(con, "created", cur.lastrowid, t.title)
        return out(con.execute("SELECT * FROM tasks WHERE id=?", (cur.lastrowid,)).fetchone())


@app.patch("/api/tasks/{task_id}")
def update_task(task_id: int, p: TaskPatch):
    f = p.model_dump(exclude_unset=True)
    action = "updated"
    if "tags" in f:
        f["tags"] = join_tags(f["tags"])
    if "subtasks" in f:
        f["subtasks"] = json.dumps(f["subtasks"], ensure_ascii=False)
    if "done" in f:
        action = "completed" if f["done"] else "reopened"
        f["completed_at"] = now() if f["done"] else None
        f["done"] = int(f["done"])
    if "due" in f and not f["due"]:
        f["due"] = None
    with db() as con:
        if f:
            cur = con.execute(f"UPDATE tasks SET {', '.join(k + '=?' for k in f)} WHERE id=?", (*f.values(), task_id))
            if cur.rowcount == 0:
                raise HTTPException(404, "Задача не найдена")
        row = con.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Задача не найдена")
        audit(con, action, task_id, row["title"])
        return out(row)


@app.delete("/api/tasks/{task_id}", status_code=204)
def delete_task(task_id: int):
    with db() as con:
        row = con.execute("SELECT title FROM tasks WHERE id=?", (task_id,)).fetchone()
        con.execute("DELETE FROM tasks WHERE id=?", (task_id,))
        if row:
            audit(con, "deleted", task_id, row["title"])


@app.post("/api/reorder", status_code=204)
def reorder(r: Reorder):
    with db() as con:
        con.executemany("UPDATE tasks SET position=? WHERE id=?", [(i, t) for i, t in enumerate(r.ids)])


@app.delete("/api/completed", status_code=204)
def clear_completed():
    with db() as con:
        n = con.execute("DELETE FROM tasks WHERE done=1").rowcount
        audit(con, "cleared", detail=f"Удалено выполненных: {n}")


# ---------- проекты ----------
@app.get("/api/projects")
def list_projects():
    with db() as con:
        return [dict(r) for r in con.execute("SELECT * FROM projects ORDER BY position, id")]


@app.post("/api/projects", status_code=201)
def create_project(p: ProjectIn):
    with db() as con:
        try:
            cur = con.execute("INSERT INTO projects (name, position) VALUES (?, (SELECT COALESCE(MAX(position),0)+1 FROM projects))", (p.name.strip(),))
        except sqlite3.IntegrityError:
            raise HTTPException(409, "Проект с таким названием уже существует")
        return dict(con.execute("SELECT * FROM projects WHERE id=?", (cur.lastrowid,)).fetchone())


@app.patch("/api/projects/{pid}")
def rename_project(pid: int, p: ProjectIn):
    with db() as con:
        try:
            con.execute("UPDATE projects SET name=? WHERE id=?", (p.name.strip(), pid))
        except sqlite3.IntegrityError:
            raise HTTPException(409, "Проект с таким названием уже существует")
        return dict(con.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone())


@app.delete("/api/projects/{pid}", status_code=204)
def delete_project(pid: int):
    with db() as con:  # задачи не удаляем — переводим в «без проекта»
        con.execute("UPDATE tasks SET project_id=NULL WHERE project_id=?", (pid,))
        con.execute("DELETE FROM projects WHERE id=?", (pid,))


# ---------- журнал и аналитика ----------
@app.get("/api/activity")
def activity(limit: int = 150):
    with db() as con:
        return [dict(r) for r in con.execute("SELECT * FROM activity ORDER BY id DESC LIMIT ?", (min(limit, 500),))]


@app.get("/api/stats")
def stats():
    with db() as con:
        rows = con.execute("SELECT priority, done, due, completed_at FROM tasks").fetchall()
    today = date.today()
    days = [(today - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]
    week = {d: 0 for d in days}
    for r in rows:
        if r["completed_at"] and r["completed_at"][:10] in week:
            week[r["completed_at"][:10]] += 1
    return {
        "total": len(rows),
        "done": sum(r["done"] for r in rows),
        "overdue": sum(1 for r in rows if not r["done"] and r["due"] and r["due"] < today.isoformat()),
        "by_priority": [sum(1 for r in rows if not r["done"] and r["priority"] == p) for p in range(4)],
        "week": [{"day": d, "n": n} for d, n in week.items()],
    }


# ---------- экспорт / импорт ----------
@app.get("/api/export.json")
def export_json():
    with db() as con:
        data = {"version": VERSION, "exported_at": now(),
                "projects": [dict(r) for r in con.execute("SELECT * FROM projects")],
                "tasks": [out(r) for r in con.execute("SELECT * FROM tasks ORDER BY position")]}
    return Response(json.dumps(data, ensure_ascii=False, indent=2), media_type="application/json",
                    headers={"Content-Disposition": "attachment; filename=flowdo.json"})


@app.get("/api/export.csv")
def export_csv():
    names = ["Низкий", "Обычный", "Высокий", "Срочный"]
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["ID", "Проект", "Задача", "Заметки", "Приоритет", "Статус", "Срок", "Теги", "Подзадачи", "Создана", "Выполнена"])
    with db() as con:
        pr = {r["id"]: r["name"] for r in con.execute("SELECT id, name FROM projects")}
        for r in map(out, con.execute("SELECT * FROM tasks ORDER BY position")):
            subs = "; ".join(("[x] " if s["d"] else "[ ] ") + s["t"] for s in r["subtasks"])
            w.writerow([r["id"], pr.get(r["project_id"], ""), r["title"], r["notes"], names[r["priority"]],
                        "Выполнена" if r["done"] else "В работе", r["due"] or "", ", ".join(r["tags"]), subs,
                        r["created_at"], r["completed_at"] or ""])
    return Response(buf.getvalue().encode("utf-8-sig"), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": "attachment; filename=flowdo.csv"})


@app.post("/api/import")
def import_data(d: ImportData):
    with db() as con:
        pm, n = {}, 0
        for p in d.projects:
            name = str(p.get("name", "")).strip()[:40]
            if name:
                row = con.execute("SELECT id FROM projects WHERE name=?", (name,)).fetchone()
                pm[p.get("id")] = row["id"] if row else con.execute(
                    "INSERT INTO projects (name, position) VALUES (?,?)", (name, len(pm) + 100)).lastrowid
        for t in d.tasks:
            title = str(t.get("title", "")).strip()[:300]
            if not title:
                continue
            done = int(bool(t.get("done")))
            top = con.execute("SELECT COALESCE(MIN(position), 0) FROM tasks").fetchone()[0]
            con.execute(
                "INSERT INTO tasks (title, notes, priority, done, due, tags, position, created_at, completed_at, project_id, subtasks)"
                " VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (title, str(t.get("notes", "")), min(3, max(0, int(t.get("priority", 1)))), done, t.get("due") or None,
                 join_tags(t.get("tags", [])), top - 1, now(), now() if done else None, pm.get(t.get("project_id")),
                 json.dumps(t.get("subtasks", []), ensure_ascii=False)))
            n += 1
        audit(con, "imported", detail=f"Задач: {n}")
    return {"tasks": n}


@app.get("/api/version")
def version():
    return {"version": VERSION}


app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")


@app.get("/")
def index():
    return FileResponse(BASE / "static" / "index.html")
