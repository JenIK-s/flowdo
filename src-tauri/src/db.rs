//! Хранилище FlowDo: SQLite, версионируемые миграции и вся бизнес-логика над задачами.
//! Функции принимают `&Connection`, поэтому одинаково работают в приложении и в тестах (in-memory).

use std::collections::{HashMap, HashSet};
use std::path::Path;

use chrono::{Local, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;

pub type Res<T> = Result<T, String>;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// Миграции 1–2 совпадают со схемой Python-версии 2.0, поэтому её база подхватывается как есть.
const MIGRATIONS: &[&str] = &[
    "CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
        priority INTEGER NOT NULL DEFAULT 1, done INTEGER NOT NULL DEFAULT 0, due TEXT,
        tags TEXT NOT NULL DEFAULT '', position REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL, completed_at TEXT);",
    "CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, position REAL NOT NULL DEFAULT 0);
     ALTER TABLE tasks ADD COLUMN project_id INTEGER;
     ALTER TABLE tasks ADD COLUMN subtasks TEXT NOT NULL DEFAULT '[]';
     CREATE TABLE activity (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, task_id INTEGER,
        action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '');",
    "ALTER TABLE projects ADD COLUMN color TEXT NOT NULL DEFAULT '#8b5cf6';
     CREATE INDEX IF NOT EXISTS idx_tasks_position ON tasks(position);
     CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);",
];

pub const PALETTE: &[&str] = &["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#14b8a6", "#64748b"];

/// Открывает базу в каталоге данных; при первом запуске переносит базу старой версии.
pub fn open(dir: &Path, legacy: Option<&Path>) -> Res<Connection> {
    std::fs::create_dir_all(dir).map_err(err)?;
    let path = dir.join("flowdo.db");
    if let Some(old) = legacy.filter(|p| p.exists()) {
        if !path.exists() {
            std::fs::copy(old, &path).map_err(err)?;
        }
    }
    let con = Connection::open(path).map_err(err)?;
    con.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;").map_err(err)?;
    migrate(&con)?;
    Ok(con)
}

pub fn migrate(con: &Connection) -> Res<()> {
    let v: usize = con.query_row("PRAGMA user_version", [], |r| r.get(0)).map_err(err)?;
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(v) {
        con.execute_batch(&format!("BEGIN; {sql} PRAGMA user_version={}; COMMIT;", i + 1))
            .map_err(|e| format!("migration {}: {e}", i + 1))?;
    }
    Ok(())
}

// ---------- модели ----------

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Sub {
    pub t: String,
    #[serde(default)]
    pub d: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Task {
    pub id: i64,
    pub title: String,
    pub notes: String,
    pub priority: i64,
    pub done: bool,
    pub due: Option<String>,
    pub tags: Vec<String>,
    pub position: f64,
    pub created_at: String,
    pub completed_at: Option<String>,
    pub project_id: Option<i64>,
    pub subtasks: Vec<Sub>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub position: f64,
}

#[derive(Serialize, Clone, Debug)]
pub struct Activity {
    pub id: i64,
    pub ts: String,
    pub task_id: Option<i64>,
    pub action: String,
    pub detail: String,
}

#[derive(Deserialize, Default)]
#[serde(default)]
pub struct TaskInput {
    pub title: String,
    pub notes: String,
    pub priority: Option<i64>,
    pub due: Option<String>,
    pub tags: Vec<String>,
    pub done: bool,
    pub project_id: Option<i64>,
    pub subtasks: Vec<Sub>,
}

/// Отличает «поле не передано» (None) от «очистить поле» (Some(None)).
fn double<'de, D: Deserializer<'de>, T: Deserialize<'de>>(d: D) -> Result<Option<Option<T>>, D::Error> {
    Option::<T>::deserialize(d).map(Some)
}

#[derive(Deserialize, Default)]
#[serde(default)]
pub struct TaskPatch {
    pub title: Option<String>,
    pub notes: Option<String>,
    pub priority: Option<i64>,
    #[serde(deserialize_with = "double")]
    pub due: Option<Option<String>>,
    pub tags: Option<Vec<String>>,
    pub done: Option<bool>,
    #[serde(deserialize_with = "double")]
    pub project_id: Option<Option<i64>>,
    pub subtasks: Option<Vec<Sub>>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
pub struct ProjectPatch {
    pub name: Option<String>,
    pub color: Option<String>,
}

// ---------- утилиты ----------

pub fn now() -> String {
    Local::now().format("%Y-%m-%dT%H:%M:%S").to_string()
}

fn clean_title(s: &str) -> Res<String> {
    let t = s.trim();
    if t.is_empty() {
        return Err("Название задачи не может быть пустым".into());
    }
    Ok(t.chars().take(300).collect())
}

fn clean_due(due: Option<String>) -> Res<Option<String>> {
    match due.map(|d| d.trim().to_string()).filter(|d| !d.is_empty()) {
        None => Ok(None),
        Some(d) => NaiveDate::parse_from_str(&d, "%Y-%m-%d")
            .map(|_| Some(d.clone()))
            .map_err(|_| format!("Неверная дата: {d}")),
    }
}

fn clean_tags(tags: &[String]) -> String {
    let mut seen = HashSet::new();
    tags.iter()
        .map(|t| t.trim().trim_start_matches('#').replace(',', " ").trim().to_lowercase())
        .filter(|t| !t.is_empty() && seen.insert(t.clone()))
        .collect::<Vec<_>>()
        .join(",")
}

fn clean_subs(subs: &[Sub]) -> String {
    let subs: Vec<Sub> = subs
        .iter()
        .filter(|s| !s.t.trim().is_empty())
        .map(|s| Sub { t: s.t.trim().chars().take(200).collect(), d: s.d })
        .collect();
    serde_json::to_string(&subs).unwrap_or_else(|_| "[]".into())
}

fn clean_name(s: &str) -> Res<String> {
    let n = s.trim();
    if n.is_empty() {
        return Err("Название проекта не может быть пустым".into());
    }
    Ok(n.chars().take(40).collect())
}

fn clean_color(c: &str) -> String {
    let ok = c.len() == 7 && c.starts_with('#') && c[1..].chars().all(|x| x.is_ascii_hexdigit());
    if ok { c.to_lowercase() } else { PALETTE[0].into() }
}

fn task_row(r: &Row) -> rusqlite::Result<Task> {
    let tags: String = r.get("tags")?;
    let subs: String = r.get("subtasks")?;
    Ok(Task {
        id: r.get("id")?,
        title: r.get("title")?,
        notes: r.get("notes")?,
        priority: r.get("priority")?,
        done: r.get::<_, i64>("done")? != 0,
        due: r.get("due")?,
        tags: tags.split(',').filter(|t| !t.is_empty()).map(String::from).collect(),
        position: r.get("position")?,
        created_at: r.get("created_at")?,
        completed_at: r.get("completed_at")?,
        project_id: r.get("project_id")?,
        subtasks: serde_json::from_str(&subs).unwrap_or_default(),
    })
}

fn project_row(r: &Row) -> rusqlite::Result<Project> {
    Ok(Project { id: r.get("id")?, name: r.get("name")?, color: r.get("color")?, position: r.get("position")? })
}

fn audit(con: &Connection, action: &str, task_id: Option<i64>, detail: &str) -> Res<()> {
    let detail: String = detail.chars().take(200).collect();
    con.execute("INSERT INTO activity (ts, task_id, action, detail) VALUES (?1,?2,?3,?4)", params![now(), task_id, action, detail])
        .map_err(err)?;
    // журнал не растёт бесконечно
    con.execute("DELETE FROM activity WHERE id <= (SELECT MAX(id) FROM activity) - 2000", []).map_err(err)?;
    Ok(())
}

/// Транзакция; вложенные вызовы (например, импорт → create_task) выполняются внутри внешней.
fn tx<T>(con: &Connection, f: impl FnOnce() -> Res<T>) -> Res<T> {
    if !con.is_autocommit() {
        return f();
    }
    con.execute_batch("BEGIN").map_err(err)?;
    match f() {
        Ok(v) => {
            con.execute_batch("COMMIT").map_err(err)?;
            Ok(v)
        }
        Err(e) => {
            let _ = con.execute_batch("ROLLBACK");
            Err(e)
        }
    }
}

// ---------- задачи ----------

pub fn get_task(con: &Connection, id: i64) -> Res<Task> {
    con.query_row("SELECT * FROM tasks WHERE id=?1", [id], task_row)
        .optional()
        .map_err(err)?
        .ok_or_else(|| "Задача не найдена".into())
}

pub fn list_tasks(con: &Connection) -> Res<Vec<Task>> {
    let mut st = con.prepare("SELECT * FROM tasks ORDER BY position, id").map_err(err)?;
    let rows = st.query_map([], task_row).map_err(err)?;
    rows.collect::<Result<_, _>>().map_err(err)
}

fn top_position(con: &Connection) -> Res<f64> {
    con.query_row("SELECT COALESCE(MIN(position), 0) FROM tasks", [], |r| r.get(0)).map_err(err)
}

fn ensure_project(con: &Connection, pid: Option<i64>) -> Res<Option<i64>> {
    match pid {
        None => Ok(None),
        Some(id) => {
            let n: i64 = con.query_row("SELECT COUNT(*) FROM projects WHERE id=?1", [id], |r| r.get(0)).map_err(err)?;
            Ok((n > 0).then_some(id))
        }
    }
}

pub fn create_task(con: &Connection, t: TaskInput) -> Res<Task> {
    let title = clean_title(&t.title)?;
    let due = clean_due(t.due)?;
    let project = ensure_project(con, t.project_id)?;
    tx(con, || {
        let ts = now();
        con.execute(
            "INSERT INTO tasks (title, notes, priority, done, due, tags, position, created_at, completed_at, project_id, subtasks)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            params![
                title,
                t.notes,
                t.priority.unwrap_or(1).clamp(0, 3),
                t.done as i64,
                due,
                clean_tags(&t.tags),
                top_position(con)? - 1.0,
                ts,
                t.done.then(|| ts.clone()),
                project,
                clean_subs(&t.subtasks)
            ],
        )
        .map_err(err)?;
        let id = con.last_insert_rowid();
        audit(con, "created", Some(id), &title)?;
        get_task(con, id)
    })
}

pub fn update_task(con: &Connection, id: i64, p: TaskPatch) -> Res<Task> {
    let mut sets: Vec<&str> = vec![];
    let mut vals: Vec<rusqlite::types::Value> = vec![];
    let mut action = "updated";
    use rusqlite::types::Value as V;

    if let Some(t) = p.title {
        sets.push("title");
        vals.push(V::Text(clean_title(&t)?));
    }
    if let Some(n) = p.notes {
        sets.push("notes");
        vals.push(V::Text(n));
    }
    if let Some(pr) = p.priority {
        sets.push("priority");
        vals.push(V::Integer(pr.clamp(0, 3)));
    }
    if let Some(d) = p.due {
        sets.push("due");
        vals.push(clean_due(d)?.map_or(V::Null, V::Text));
    }
    if let Some(t) = p.tags {
        sets.push("tags");
        vals.push(V::Text(clean_tags(&t)));
    }
    if let Some(s) = p.subtasks {
        sets.push("subtasks");
        vals.push(V::Text(clean_subs(&s)));
    }
    if let Some(pid) = p.project_id {
        sets.push("project_id");
        vals.push(ensure_project(con, pid)?.map_or(V::Null, V::Integer));
    }
    if let Some(done) = p.done {
        let cur = get_task(con, id)?;
        if cur.done != done {
            action = if done { "completed" } else { "reopened" };
            sets.push("done");
            vals.push(V::Integer(done as i64));
            sets.push("completed_at");
            vals.push(if done { V::Text(now()) } else { V::Null });
        }
    }
    tx(con, || {
        if !sets.is_empty() {
            let sql = format!(
                "UPDATE tasks SET {} WHERE id=?",
                sets.iter().map(|c| format!("{c}=?")).collect::<Vec<_>>().join(", ")
            );
            vals.push(V::Integer(id));
            let n = con.execute(&sql, rusqlite::params_from_iter(vals.iter())).map_err(err)?;
            if n == 0 {
                return Err("Задача не найдена".into());
            }
        }
        let task = get_task(con, id)?;
        audit(con, action, Some(id), &task.title)?;
        Ok(task)
    })
}

pub fn delete_task(con: &Connection, id: i64) -> Res<Task> {
    let task = get_task(con, id)?;
    tx(con, || {
        con.execute("DELETE FROM tasks WHERE id=?1", [id]).map_err(err)?;
        audit(con, "deleted", Some(id), &task.title)?;
        Ok(task)
    })
}

/// Возвращает удалённые задачи (отмена удаления) с исходными id и позициями.
pub fn restore_tasks(con: &Connection, tasks: Vec<Task>) -> Res<Vec<Task>> {
    tx(con, || {
        let mut out = vec![];
        for t in tasks {
            let project = ensure_project(con, t.project_id)?;
            con.execute(
                "INSERT OR REPLACE INTO tasks (id, title, notes, priority, done, due, tags, position, created_at, completed_at, project_id, subtasks)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
                params![
                    t.id,
                    clean_title(&t.title)?,
                    t.notes,
                    t.priority.clamp(0, 3),
                    t.done as i64,
                    clean_due(t.due)?,
                    clean_tags(&t.tags),
                    t.position,
                    t.created_at,
                    t.completed_at,
                    project,
                    clean_subs(&t.subtasks)
                ],
            )
            .map_err(err)?;
            audit(con, "restored", Some(t.id), &t.title)?;
            out.push(get_task(con, t.id)?);
        }
        Ok(out)
    })
}

pub fn reorder_tasks(con: &Connection, ids: &[i64]) -> Res<()> {
    tx(con, || {
        let mut st = con.prepare("UPDATE tasks SET position=?1 WHERE id=?2").map_err(err)?;
        for (i, id) in ids.iter().enumerate() {
            st.execute(params![i as f64, id]).map_err(err)?;
        }
        Ok(())
    })
}

/// Удаляет выполненные задачи (во всём списке или в одном проекте) и возвращает их для отмены.
pub fn clear_completed(con: &Connection, project: Option<i64>) -> Res<Vec<Task>> {
    let removed: Vec<Task> = list_tasks(con)?
        .into_iter()
        .filter(|t| t.done && (project.is_none() || t.project_id == project))
        .collect();
    tx(con, || {
        for t in &removed {
            con.execute("DELETE FROM tasks WHERE id=?1", [t.id]).map_err(err)?;
        }
        audit(con, "cleared", None, &format!("Удалено выполненных: {}", removed.len()))?;
        Ok(removed)
    })
}

// ---------- проекты ----------

pub fn list_projects(con: &Connection) -> Res<Vec<Project>> {
    let mut st = con.prepare("SELECT * FROM projects ORDER BY position, id").map_err(err)?;
    let rows = st.query_map([], project_row).map_err(err)?;
    rows.collect::<Result<_, _>>().map_err(err)
}

fn unique_violation(e: rusqlite::Error) -> String {
    match e {
        rusqlite::Error::SqliteFailure(f, _) if f.code == rusqlite::ErrorCode::ConstraintViolation => {
            "Проект с таким названием уже существует".into()
        }
        e => e.to_string(),
    }
}

pub fn create_project(con: &Connection, name: &str, color: Option<String>) -> Res<Project> {
    let name = clean_name(name)?;
    let count: i64 = con.query_row("SELECT COUNT(*) FROM projects", [], |r| r.get(0)).map_err(err)?;
    let color = color.map(|c| clean_color(&c)).unwrap_or_else(|| PALETTE[count as usize % PALETTE.len()].into());
    con.execute(
        "INSERT INTO projects (name, color, position) VALUES (?1, ?2, (SELECT COALESCE(MAX(position),0)+1 FROM projects))",
        params![name, color],
    )
    .map_err(unique_violation)?;
    let id = con.last_insert_rowid();
    audit(con, "project_created", None, &name)?;
    con.query_row("SELECT * FROM projects WHERE id=?1", [id], project_row).map_err(err)
}

pub fn update_project(con: &Connection, id: i64, p: ProjectPatch) -> Res<Project> {
    if let Some(n) = p.name {
        con.execute("UPDATE projects SET name=?1 WHERE id=?2", params![clean_name(&n)?, id]).map_err(unique_violation)?;
    }
    if let Some(c) = p.color {
        con.execute("UPDATE projects SET color=?1 WHERE id=?2", params![clean_color(&c), id]).map_err(err)?;
    }
    con.query_row("SELECT * FROM projects WHERE id=?1", [id], project_row)
        .optional()
        .map_err(err)?
        .ok_or_else(|| "Проект не найден".into())
}

/// Удаляет проект; задачи не теряются, а переходят во «Входящие».
pub fn delete_project(con: &Connection, id: i64) -> Res<()> {
    tx(con, || {
        let name: Option<String> =
            con.query_row("SELECT name FROM projects WHERE id=?1", [id], |r| r.get(0)).optional().map_err(err)?;
        con.execute("UPDATE tasks SET project_id=NULL WHERE project_id=?1", [id]).map_err(err)?;
        con.execute("DELETE FROM projects WHERE id=?1", [id]).map_err(err)?;
        if let Some(n) = name {
            audit(con, "project_deleted", None, &n)?;
        }
        Ok(())
    })
}

pub fn reorder_projects(con: &Connection, ids: &[i64]) -> Res<()> {
    tx(con, || {
        for (i, id) in ids.iter().enumerate() {
            con.execute("UPDATE projects SET position=?1 WHERE id=?2", params![i as f64, id]).map_err(err)?;
        }
        Ok(())
    })
}

// ---------- журнал ----------

pub fn activity(con: &Connection, limit: i64) -> Res<Vec<Activity>> {
    let mut st = con.prepare("SELECT * FROM activity ORDER BY id DESC LIMIT ?1").map_err(err)?;
    let rows = st
        .query_map([limit.clamp(1, 1000)], |r| {
            Ok(Activity {
                id: r.get("id")?,
                ts: r.get("ts")?,
                task_id: r.get("task_id")?,
                action: r.get("action")?,
                detail: r.get("detail")?,
            })
        })
        .map_err(err)?;
    rows.collect::<Result<_, _>>().map_err(err)
}

// ---------- экспорт / импорт ----------

pub fn export_json(con: &Connection) -> Res<String> {
    let data = serde_json::json!({
        "app": "FlowDo",
        "version": env!("CARGO_PKG_VERSION"),
        "exported_at": now(),
        "projects": list_projects(con)?,
        "tasks": list_tasks(con)?,
    });
    serde_json::to_string_pretty(&data).map_err(err)
}

fn csv_cell(s: &str) -> String {
    if s.contains([';', '"', '\n', '\r']) {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

/// CSV с BOM и разделителем «;» — открывается в Excel без настройки.
pub fn export_csv(con: &Connection) -> Res<String> {
    const PRIO: [&str; 4] = ["Низкий", "Обычный", "Высокий", "Срочный"];
    let projects: HashMap<i64, String> = list_projects(con)?.into_iter().map(|p| (p.id, p.name)).collect();
    let mut out = String::from("\u{feff}ID;Проект;Задача;Заметки;Приоритет;Статус;Срок;Теги;Подзадачи;Создана;Выполнена\r\n");
    for t in list_tasks(con)? {
        let subs = t.subtasks.iter().map(|s| format!("[{}] {}", if s.d { "x" } else { " " }, s.t)).collect::<Vec<_>>().join("; ");
        let row = [
            t.id.to_string(),
            t.project_id.and_then(|p| projects.get(&p).cloned()).unwrap_or_default(),
            t.title,
            t.notes,
            PRIO[t.priority.clamp(0, 3) as usize].into(),
            if t.done { "Выполнена" } else { "В работе" }.into(),
            t.due.unwrap_or_default(),
            t.tags.join(", "),
            subs,
            t.created_at,
            t.completed_at.unwrap_or_default(),
        ];
        out += &row.iter().map(|c| csv_cell(c)).collect::<Vec<_>>().join(";");
        out += "\r\n";
    }
    Ok(out)
}

/// Импорт JSON (формат экспорта FlowDo 2.x и 3.x). Проекты сопоставляются по названию.
pub fn import_json(con: &Connection, raw: &str) -> Res<usize> {
    let data: Value = serde_json::from_str(raw).map_err(|_| "Файл не похож на экспорт FlowDo".to_string())?;
    let empty = vec![];
    let projects = data.get("projects").and_then(Value::as_array).unwrap_or(&empty);
    let tasks = data.get("tasks").and_then(Value::as_array).ok_or("В файле нет задач")?;

    tx(con, || {
        let mut map: HashMap<i64, i64> = HashMap::new();
        for p in projects {
            let Some(name) = p.get("name").and_then(Value::as_str).map(str::trim).filter(|n| !n.is_empty()) else { continue };
            let name: String = name.chars().take(40).collect();
            let existing: Option<i64> =
                con.query_row("SELECT id FROM projects WHERE name=?1", [&name], |r| r.get(0)).optional().map_err(err)?;
            let id = match existing {
                Some(id) => id,
                None => create_project(con, &name, p.get("color").and_then(Value::as_str).map(String::from))?.id,
            };
            if let Some(old) = p.get("id").and_then(Value::as_i64) {
                map.insert(old, id);
            }
        }
        let mut n = 0;
        for t in tasks.iter().rev() {
            let Some(title) = t.get("title").and_then(Value::as_str).filter(|s| !s.trim().is_empty()) else { continue };
            let tags = match t.get("tags") {
                Some(Value::Array(a)) => a.iter().filter_map(Value::as_str).map(String::from).collect(),
                Some(Value::String(s)) => s.split(',').map(String::from).collect(),
                _ => vec![],
            };
            let input = TaskInput {
                title: title.into(),
                notes: t.get("notes").and_then(Value::as_str).unwrap_or("").into(),
                priority: t.get("priority").and_then(Value::as_i64),
                due: t.get("due").and_then(Value::as_str).map(String::from).filter(|d| clean_due(Some(d.clone())).is_ok()),
                tags,
                done: t.get("done").and_then(Value::as_bool).unwrap_or(false),
                project_id: t.get("project_id").and_then(Value::as_i64).and_then(|p| map.get(&p).copied()),
                subtasks: t.get("subtasks").and_then(|s| serde_json::from_value(s.clone()).ok()).unwrap_or_default(),
            };
            create_task(con, input)?;
            n += 1;
        }
        audit(con, "imported", None, &format!("Задач: {n}"))?;
        Ok(n)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        migrate(&c).unwrap();
        c
    }

    fn input(title: &str) -> TaskInput {
        TaskInput { title: title.into(), ..Default::default() }
    }

    #[test]
    fn full_flow() {
        let c = mem();
        let p = create_project(&c, "Работа", None).unwrap();
        assert!(create_project(&c, "Работа", None).unwrap_err().contains("существует"));

        let t = create_task(&c, TaskInput { project_id: Some(p.id), priority: Some(9), tags: vec!["#Дом".into(), "дом".into()], ..input(" Отчёт ") }).unwrap();
        assert_eq!((t.title.as_str(), t.priority, t.tags.clone()), ("Отчёт", 3, vec!["дом".to_string()]));

        let second = create_task(&c, input("Вторая")).unwrap();
        assert!(second.position < t.position, "новые задачи — сверху");

        let done = update_task(&c, t.id, TaskPatch { done: Some(true), ..Default::default() }).unwrap();
        assert!(done.done && done.completed_at.is_some());

        let cleared = update_task(&c, t.id, serde_json::from_str(r#"{"due": "2030-01-02"}"#).unwrap()).unwrap();
        assert_eq!(cleared.due.as_deref(), Some("2030-01-02"));
        let cleared = update_task(&c, t.id, serde_json::from_str(r#"{"due": null, "project_id": null}"#).unwrap()).unwrap();
        assert_eq!((cleared.due, cleared.project_id), (None, None));
        assert!(update_task(&c, t.id, serde_json::from_str(r#"{"due": "31.12"}"#).unwrap()).is_err());

        let removed = clear_completed(&c, None).unwrap();
        assert_eq!(removed.len(), 1);
        assert_eq!(list_tasks(&c).unwrap().len(), 1);
        restore_tasks(&c, removed).unwrap();
        assert_eq!(get_task(&c, t.id).unwrap().title, "Отчёт");

        let dump = export_json(&c).unwrap();
        assert!(export_csv(&c).unwrap().contains("Отчёт"));
        assert_eq!(import_json(&c, &dump).unwrap(), 2);
        assert_eq!(list_projects(&c).unwrap().len(), 1, "проекты при импорте не дублируются");

        delete_project(&c, p.id).unwrap();
        assert!(list_tasks(&c).unwrap().iter().all(|t| t.project_id.is_none()));

        let acts: Vec<String> = activity(&c, 100).unwrap().into_iter().map(|a| a.action).collect();
        for a in ["created", "completed", "cleared", "restored", "imported"] {
            assert!(acts.contains(&a.to_string()), "нет события {a}");
        }
    }

    #[test]
    fn upgrades_python_database() {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(MIGRATIONS[0]).unwrap();
        c.execute_batch(MIGRATIONS[1]).unwrap();
        c.execute_batch("PRAGMA user_version=2; INSERT INTO projects (name) VALUES ('Дом');
            INSERT INTO tasks (title, created_at, project_id, tags) VALUES ('Старая', '2025-01-01T00:00:00', 1, 'a,b');")
            .unwrap();
        migrate(&c).unwrap();
        let t = &list_tasks(&c).unwrap()[0];
        assert_eq!((t.title.as_str(), t.project_id, t.tags.len()), ("Старая", Some(1), 2));
        assert_eq!(list_projects(&c).unwrap()[0].color, PALETTE[0]);
    }

    #[test]
    fn reorder_and_delete() {
        let c = mem();
        let a = create_task(&c, input("a")).unwrap();
        let b = create_task(&c, input("b")).unwrap();
        reorder_tasks(&c, &[a.id, b.id]).unwrap();
        assert_eq!(list_tasks(&c).unwrap()[0].id, a.id);
        delete_task(&c, a.id).unwrap();
        assert!(get_task(&c, a.id).is_err());
        assert!(create_task(&c, input("   ")).is_err());
    }
}
