mod actions;
mod config;
mod error;
mod leetcode;
mod local;
mod queries;
mod remote;
mod schema;
mod service;
mod sync;

use std::collections::HashMap;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::sync::{Arc, Mutex, MutexGuard};

use error::{msg, Result};
use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;
use serde_json::{json, Map, Value};
use service::Service;
use tauri::{Manager, State};
use tokio::sync::Notify;

/// The local store. One connection; every command holds it only for a few milliseconds.
pub struct Db {
    conn: Arc<Mutex<Connection>>,
    poke: Arc<Notify>,
}

impl Db {
    fn lock(&self) -> Result<MutexGuard<'_, Connection>> {
        self.conn.lock().map_err(|_| msg("local database lock poisoned"))
    }

    /// Runs a local write, then nudges the sync loop to push it soon.
    fn write<T>(&self, f: impl FnOnce(&mut Connection) -> Result<T>) -> Result<T> {
        let out = f(&mut *self.lock()?)?;
        self.poke.notify_one();
        Ok(out)
    }
}

// ── Setup & settings ─────────────────────────────────────────────────────────────

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
/// than the local copy came from — clears the local copy. Then starts the first download.
#[tauri::command]
async fn set_db_url(db: State<'_, Db>, url: String) -> Result<()> {
    remote::verify(&url).await?;
    {
        let conn = db.lock()?;
        let fp = url_fingerprint(&url);
        let prev: Option<String> = conn.query_row("select value from meta where key = 'db_fingerprint'", [], |r| r.get(0)).optional()?;
        if prev.as_deref() != Some(fp.as_str()) {
            conn.execute_batch(
                "delete from snippets; delete from problems; delete from patterns; delete from topics;
                 delete from outbox; delete from id_map; delete from conflicts; delete from meta;",
            )?;
            conn.execute("insert into meta (key, value) values ('db_fingerprint', ?1)", [fp])?;
        }
    }
    config::set_db_url(&url)?;
    db.poke.notify_one();
    Ok(())
}

#[tauri::command]
fn clear_db_url(db: State<'_, Db>) -> Result<()> {
    let pending = local::pending_count(&*db.lock()?)?;
    if pending > 0 {
        return Err(msg(format!("{pending} local change(s) haven't been synced yet — sync before disconnecting")));
    }
    config::clear_db_url()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Settings {
    site_url: String,
    has_secret: bool,
}

#[tauri::command]
fn get_settings() -> Result<Settings> {
    Ok(Settings { site_url: config::site_url()?.unwrap_or_default(), has_secret: config::revalidate_secret()?.is_some() })
}

/// `secret`: None = keep the saved one, "" = remove it.
#[tauri::command]
fn set_settings(site_url: String, secret: Option<String>) -> Result<()> {
    let site = site_url.trim();
    if !site.is_empty() && !site.starts_with("https://") && !site.starts_with("http://localhost") {
        return Err(msg("The site URL should start with https://"));
    }
    config::set_site(site, secret.as_deref())
}

// ── Sync ─────────────────────────────────────────────────────────────────────────

#[tauri::command]
fn sync_status(db: State<'_, Db>, svc: State<'_, Arc<Service>>) -> Result<service::Status> {
    Ok(svc.status(&*db.lock()?))
}

#[tauri::command]
fn sync_now(db: State<'_, Db>) {
    db.poke.notify_one();
}

/// Notes versions that lost a both-sides edit, newest first.
#[tauri::command]
async fn q_conflicts(db: State<'_, Db>, problem_id: i64) -> Result<Vec<Value>> {
    let conn = db.lock()?;
    let id = local::resolve(&conn, "problems", problem_id)?;
    let mut st = conn.prepare("select id, field, lost_value, lost_side, created_at from conflicts where problem_id = ?1 order by id desc")?;
    let rows = st
        .query_map([id], |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "field": r.get::<_, String>(1)?,
                "value": r.get::<_, String>(2)?,
                "side": r.get::<_, String>(3)?,
                "createdAt": r.get::<_, String>(4)?,
            }))
        })?
        .collect::<rusqlite::Result<_>>()?;
    Ok(rows)
}

#[tauri::command]
async fn a_dismiss_conflict(db: State<'_, Db>, id: i64) -> Result<()> {
    db.lock()?.execute("delete from conflicts where id = ?1", [id])?;
    Ok(())
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
    db.write(|c| actions::create_topic(c, &name, &description))
}

#[tauri::command]
async fn a_update_topic(db: State<'_, Db>, id: i64, name: String, description: String) -> Result<()> {
    db.write(|c| actions::update_topic(c, id, &name, &description))
}

#[tauri::command]
async fn a_delete_topic(db: State<'_, Db>, id: i64) -> Result<()> {
    db.write(|c| actions::delete_topic(c, id))
}

#[tauri::command]
async fn a_create_pattern(db: State<'_, Db>, topic_id: i64, name: String) -> Result<()> {
    db.write(|c| actions::create_pattern(c, topic_id, &name))
}

#[tauri::command]
async fn a_rename_pattern(db: State<'_, Db>, id: i64, name: String) -> Result<()> {
    db.write(|c| actions::rename_pattern(c, id, &name))
}

#[tauri::command]
async fn a_delete_pattern(db: State<'_, Db>, id: i64) -> Result<()> {
    db.write(|c| actions::delete_pattern(c, id))
}

#[tauri::command]
async fn a_shift_pattern(db: State<'_, Db>, id: i64, dir: i64) -> Result<()> {
    db.write(|c| actions::shift_pattern(c, id, dir))
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
    Ok(json!({ "id": db.write(|c| actions::create_problem(c, input))? }))
}

#[tauri::command]
async fn a_update_problem(db: State<'_, Db>, id: i64, patch: Map<String, Value>, tabs: actions::TabSync) -> Result<Value> {
    let ids: HashMap<String, i64> = db.write(|c| actions::update_problem(c, id, patch, tabs))?;
    Ok(json!({ "ids": ids }))
}

#[tauri::command]
async fn a_set_status(db: State<'_, Db>, id: i64, status: String) -> Result<()> {
    db.write(|c| actions::set_status(c, id, &status))
}

#[tauri::command]
async fn a_set_starred(db: State<'_, Db>, id: i64, starred: bool) -> Result<()> {
    db.write(|c| actions::set_starred(c, id, starred))
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
    db.write(|c| actions::set_description(c, id, &html))
}

#[tauri::command]
async fn a_mark_viewed(db: State<'_, Db>, id: i64) -> Result<()> {
    db.write(|c| actions::mark_viewed(c, id))
}

#[tauri::command]
async fn a_move_problem(db: State<'_, Db>, id: i64, pattern_id: Option<i64>, before_id: Option<i64>) -> Result<()> {
    db.write(|c| actions::move_problem(c, id, pattern_id, before_id))
}

#[tauri::command]
async fn a_delete_problem(db: State<'_, Db>, id: i64) -> Result<()> {
    db.write(|c| actions::delete_problem(c, id))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = Arc::new(Mutex::new(local::open(&dir.join("dsa-log.db"))?));
            let poke = Arc::new(Notify::new());
            let svc = Arc::new(Service::new(poke.clone()));
            service::start(app.handle().clone(), conn.clone(), svc.clone());
            app.manage(Db { conn, poke });
            app.manage(svc);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            set_db_url,
            clear_db_url,
            get_settings,
            set_settings,
            sync_status,
            sync_now,
            q_conflicts,
            a_dismiss_conflict,
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
