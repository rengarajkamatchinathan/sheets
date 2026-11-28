mod actions;
mod config;
mod error;
mod leetcode;
mod local;
mod queries;
mod remote;
mod schema;

use std::collections::HashMap;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::sync::{Mutex, MutexGuard};

use error::{msg, Result};
use rusqlite::Connection;
use serde::Serialize;
use serde_json::{json, Map, Value};
use tauri::{Manager, State};

/// The local store. One connection; every command holds it only for a few milliseconds.
pub struct Db(Mutex<Connection>);

impl Db {
    fn lock(&self) -> Result<MutexGuard<'_, Connection>> {
        self.0.lock().map_err(|_| msg("local database lock poisoned"))
    }
}

// ── Setup ────────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConfigInfo {
    has_db_url: bool,
}

#[tauri::command]
fn get_config() -> Result<ConfigInfo> {
    Ok(ConfigInfo { has_db_url: config::db_url()?.is_some() })
}

fn url_fingerprint(url: &str) -> String {
    let mut h = DefaultHasher::new();
    url.hash(&mut h);
    format!("{:x}", h.finish())
}

/// Verifies the connection string, saves it, and — if it points at a different database
/// than the local copy came from — clears the local copy.
#[tauri::command]
async fn set_db_url(db: State<'_, Db>, url: String) -> Result<()> {
    remote::verify(&url).await?;
    {
        let conn = db.lock()?;
        let fp = url_fingerprint(&url);
        let prev: Option<String> =
            rusqlite::OptionalExtension::optional(conn.query_row("select value from meta where key = 'db_fingerprint'", [], |r| r.get(0)))?;
        if prev.as_deref() != Some(fp.as_str()) {
            conn.execute_batch(
                "delete from snippets; delete from problems; delete from patterns; delete from topics;
                 delete from outbox; delete from id_map; delete from conflicts; delete from meta;",
            )?;
            conn.execute("insert into meta (key, value) values ('db_fingerprint', ?1)", [fp])?;
        }
    }
    config::set_db_url(&url)
}

#[tauri::command]
fn clear_db_url(db: State<'_, Db>) -> Result<()> {
    let pending = local::pending_count(&*db.lock()?)?;
    if pending > 0 {
        return Err(msg(format!("{pending} local change(s) haven't been synced yet — sync before disconnecting")));
    }
    config::clear_db_url()
}

// ── Reads ────────────────────────────────────────────────────────────────────────

#[tauri::command]
async fn q_dashboard(db: State<'_, Db>) -> Result<Value> {
    queries::dashboard(&*db.lock()?)
}

#[tauri::command]
async fn q_topics(db: State<'_, Db>) -> Result<Vec<Value>> {
    queries::topics(&*db.lock()?)
}

#[tauri::command]
async fn q_topic_choices(db: State<'_, Db>) -> Result<Vec<Value>> {
    queries::topic_choices(&*db.lock()?)
}

#[tauri::command]
async fn q_topic_page(db: State<'_, Db>, slug: String) -> Result<Value> {
    queries::topic_page(&*db.lock()?, &slug)
}

#[tauri::command]
async fn q_problem_page(db: State<'_, Db>, id: i64) -> Result<Value> {
    queries::problem_page(&*db.lock()?, id)
}

#[tauri::command]
async fn q_search(db: State<'_, Db>, q: String) -> Result<Vec<Value>> {
    queries::search(&*db.lock()?, &q)
}

// ── Writes ───────────────────────────────────────────────────────────────────────

#[tauri::command]
async fn a_create_topic(db: State<'_, Db>, name: String, description: String) -> Result<Option<String>> {
    actions::create_topic(&mut *db.lock()?, &name, &description)
}

#[tauri::command]
async fn a_update_topic(db: State<'_, Db>, id: i64, name: String, description: String) -> Result<()> {
    actions::update_topic(&mut *db.lock()?, id, &name, &description)
}

#[tauri::command]
async fn a_delete_topic(db: State<'_, Db>, id: i64) -> Result<()> {
    actions::delete_topic(&mut *db.lock()?, id)
}

#[tauri::command]
async fn a_create_pattern(db: State<'_, Db>, topic_id: i64, name: String) -> Result<()> {
    actions::create_pattern(&mut *db.lock()?, topic_id, &name)
}

#[tauri::command]
async fn a_rename_pattern(db: State<'_, Db>, id: i64, name: String) -> Result<()> {
    actions::rename_pattern(&mut *db.lock()?, id, &name)
}

#[tauri::command]
async fn a_delete_pattern(db: State<'_, Db>, id: i64) -> Result<()> {
    actions::delete_pattern(&mut *db.lock()?, id)
}

#[tauri::command]
async fn a_shift_pattern(db: State<'_, Db>, id: i64, dir: i64) -> Result<()> {
    actions::shift_pattern(&mut *db.lock()?, id, dir)
}

/// New-problem dialog: LeetCode number/title/difficulty, and whether it's already in the sheet.
#[tauri::command]
async fn a_lookup_problem_link(db: State<'_, Db>, url: String) -> Result<Value> {
    let Some(slug) = leetcode::slug(&url) else { return Ok(json!({ "ok": false, "reason": "not-leetcode" })) };
    let existing = actions::find_by_leetcode_slug(&*db.lock()?, &slug)?;
    Ok(match leetcode::meta(&slug).await {
        Err(reason) => json!({ "ok": false, "reason": reason }),
        Ok(m) => json!({
            "ok": true, "title": m.title, "difficulty": m.difficulty, "number": m.number, "premium": m.premium, "existing": existing,
        }),
    })
}

#[tauri::command]
async fn a_create_problem(db: State<'_, Db>, input: actions::NewProblemInput) -> Result<Value> {
    Ok(json!({ "id": actions::create_problem(&mut *db.lock()?, input)? }))
}

#[tauri::command]
async fn a_update_problem(db: State<'_, Db>, id: i64, patch: Map<String, Value>, tabs: actions::TabSync) -> Result<Value> {
    let ids: HashMap<String, i64> = actions::update_problem(&mut *db.lock()?, id, patch, tabs)?;
    Ok(json!({ "ids": ids }))
}

#[tauri::command]
async fn a_set_status(db: State<'_, Db>, id: i64, status: String) -> Result<()> {
    actions::set_status(&mut *db.lock()?, id, &status)
}

#[tauri::command]
async fn a_set_starred(db: State<'_, Db>, id: i64, starred: bool) -> Result<()> {
    actions::set_starred(&mut *db.lock()?, id, starred)
}

#[tauri::command]
async fn a_description_source(db: State<'_, Db>, id: i64) -> Result<Option<actions::DescriptionSource>> {
    actions::description_source(&*db.lock()?, id)
}

#[tauri::command]
async fn a_leetcode_content(url: String) -> Result<Value> {
    Ok(leetcode::content(&url).await.to_json())
}

#[tauri::command]
async fn a_set_description(db: State<'_, Db>, id: i64, html: String) -> Result<()> {
    actions::set_description(&mut *db.lock()?, id, &html)
}

#[tauri::command]
async fn a_mark_viewed(db: State<'_, Db>, id: i64) -> Result<()> {
    actions::mark_viewed(&mut *db.lock()?, id)
}

#[tauri::command]
async fn a_move_problem(db: State<'_, Db>, id: i64, pattern_id: Option<i64>, before_id: Option<i64>) -> Result<()> {
    actions::move_problem(&mut *db.lock()?, id, pattern_id, before_id)
}

#[tauri::command]
async fn a_delete_problem(db: State<'_, Db>, id: i64) -> Result<()> {
    actions::delete_problem(&mut *db.lock()?, id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = local::open(&dir.join("dsa-log.db"))?;
            app.manage(Db(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            set_db_url,
            clear_db_url,
            q_dashboard,
            q_topics,
            q_topic_choices,
            q_topic_page,
            q_problem_page,
            q_search,
            a_create_topic,
            a_update_topic,
            a_delete_topic,
            a_create_pattern,
            a_rename_pattern,
            a_delete_pattern,
            a_shift_pattern,
            a_lookup_problem_link,
            a_create_problem,
            a_update_problem,
            a_set_status,
            a_set_starred,
            a_description_source,
            a_leetcode_content,
            a_set_description,
            a_mark_viewed,
            a_move_problem,
            a_delete_problem,
        ])
        .run(tauri::generate_context!())
        .expect("error while running the app");
}
