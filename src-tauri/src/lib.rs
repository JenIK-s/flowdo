mod db;

use std::sync::Mutex;

use db::{Activity, Project, ProjectPatch, Res, Task, TaskInput, TaskPatch};
use rusqlite::Connection;
use serde::Serialize;
use tauri::{Manager, State};

struct Db(Mutex<Connection>);

impl Db {
    fn with<T>(&self, f: impl FnOnce(&Connection) -> Res<T>) -> Res<T> {
        let con = self.0.lock().map_err(|_| "База данных занята".to_string())?;
        f(&con)
    }
}

#[derive(Serialize)]
struct Snapshot {
    tasks: Vec<Task>,
    projects: Vec<Project>,
    version: &'static str,
}

#[tauri::command]
fn bootstrap(db: State<Db>) -> Res<Snapshot> {
    db.with(|c| Ok(Snapshot { tasks: db::list_tasks(c)?, projects: db::list_projects(c)?, version: env!("CARGO_PKG_VERSION") }))
}

#[tauri::command]
fn create_task(db: State<Db>, input: TaskInput) -> Res<Task> {
    db.with(|c| db::create_task(c, input))
}

#[tauri::command]
fn update_task(db: State<Db>, id: i64, patch: TaskPatch) -> Res<Task> {
    db.with(|c| db::update_task(c, id, patch))
}

#[tauri::command]
fn delete_task(db: State<Db>, id: i64) -> Res<Task> {
    db.with(|c| db::delete_task(c, id))
}

#[tauri::command]
fn restore_tasks(db: State<Db>, tasks: Vec<Task>) -> Res<Vec<Task>> {
    db.with(|c| db::restore_tasks(c, tasks))
}

#[tauri::command]
fn reorder_tasks(db: State<Db>, ids: Vec<i64>) -> Res<()> {
    db.with(|c| db::reorder_tasks(c, &ids))
}

#[tauri::command]
fn clear_completed(db: State<Db>, project: Option<i64>) -> Res<Vec<Task>> {
    db.with(|c| db::clear_completed(c, project))
}

#[tauri::command]
fn create_project(db: State<Db>, name: String, color: Option<String>) -> Res<Project> {
    db.with(|c| db::create_project(c, &name, color))
}

#[tauri::command]
fn update_project(db: State<Db>, id: i64, patch: ProjectPatch) -> Res<Project> {
    db.with(|c| db::update_project(c, id, patch))
}

#[tauri::command]
fn delete_project(db: State<Db>, id: i64) -> Res<()> {
    db.with(|c| db::delete_project(c, id))
}

#[tauri::command]
fn reorder_projects(db: State<Db>, ids: Vec<i64>) -> Res<()> {
    db.with(|c| db::reorder_projects(c, &ids))
}

#[tauri::command]
fn activity(db: State<Db>, limit: i64) -> Res<Vec<Activity>> {
    db.with(|c| db::activity(c, limit))
}

/// Путь выбирает пользователь в системном диалоге сохранения.
#[tauri::command]
fn export_file(db: State<Db>, path: String, format: String) -> Res<()> {
    let data = db.with(|c| if format == "csv" { db::export_csv(c) } else { db::export_json(c) })?;
    std::fs::write(path, data).map_err(|e| format!("Не удалось сохранить файл: {e}"))
}

#[tauri::command]
fn import_file(db: State<Db>, path: String) -> Res<usize> {
    let raw = std::fs::read_to_string(path).map_err(|e| format!("Не удалось прочитать файл: {e}"))?;
    db.with(|c| db::import_json(c, raw.trim_start_matches('\u{feff}')))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // повторный запуск exe не открывает второе окно, а поднимает существующее
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            // база Python-версии 2.x (%APPDATA%\FlowDo\flowdo.db) переносится автоматически
            let legacy = app.path().data_dir().ok().map(|d| d.join("FlowDo").join("flowdo.db"));
            let con = db::open(&dir, legacy.as_deref())?;
            app.manage(Db(Mutex::new(con)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bootstrap,
            create_task,
            update_task,
            delete_task,
            restore_tasks,
            reorder_tasks,
            clear_completed,
            create_project,
            update_project,
            delete_project,
            reorder_projects,
            activity,
            export_file,
            import_file
        ])
        .run(tauri::generate_context!())
        .expect("не удалось запустить FlowDo");
}
