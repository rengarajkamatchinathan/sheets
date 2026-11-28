//! Local versions of the web app's server actions (src/app/actions.ts) — same rules,
//! applied to the local store and queued for sync.
//!
//! Rich text (notes, descriptions) arrives already sanitized: the desktop frontend runs the
//! web app's own sanitize.ts before calling these.

use std::collections::{HashMap, HashSet};

use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

use crate::error::{msg, Result};
use crate::local::{self, now, Row};
use crate::schema::{PATTERNS, PROBLEMS, SNIPPETS, TOPICS};

const DIFFS: [&str; 3] = ["Easy", "Medium", "Hard"];
const STATUSES: [&str; 3] = ["Todo", "Attempted", "Solved"];

fn row(v: Value) -> Row {
    match v {
        Value::Object(m) => m,
        _ => Map::new(),
    }
}

fn next_sort(tx: &Transaction, table: &str, scope: Option<(&str, i64)>) -> Result<i64> {
    let sql = match scope {
        Some((col, _)) => format!("select coalesce(max(sort_order), -1) + 1 from {table} where {col} = ?1"),
        None => format!("select coalesce(max(sort_order), -1) + 1 from {table}"),
    };
    Ok(match scope {
        Some((_, v)) => tx.query_row(&sql, [v], |r| r.get(0))?,
        None => tx.query_row(&sql, [], |r| r.get(0))?,
    })
}

fn topic_of_problem(tx: &Transaction, id: i64) -> Result<Option<i64>> {
    Ok(tx.query_row("select topic_id from problems where id = ?1", [id], |r| r.get(0)).optional()?)
}

/// A pattern id is only accepted if it belongs to the topic; otherwise → Unsorted (null).
fn pattern_guard(tx: &Transaction, pattern_id: Option<i64>, topic_id: i64) -> Result<Option<i64>> {
    let Some(pid) = pattern_id else { return Ok(None) };
    let pid = local::resolve(tx, "patterns", pid)?;
    Ok(tx
        .query_row("select id from patterns where id = ?1 and topic_id = ?2", [pid, topic_id], |r| r.get(0))
        .optional()?)
}

/// solved_at: stamped the first time a problem becomes Solved, cleared otherwise.
fn solved_at_for(tx: &Transaction, id: i64, status: &str) -> Result<Value> {
    if status != "Solved" {
        return Ok(Value::Null);
    }
    let cur: Option<String> = tx.query_row("select solved_at from problems where id = ?1", [id], |r| r.get(0)).optional()?.flatten();
    Ok(json!(cur.unwrap_or_else(now)))
}

pub fn slugify(s: &str) -> String {
    let kept: String = s
        .to_lowercase()
        .chars()
        .filter(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c.is_whitespace() || *c == '-')
        .collect();
    let mut out = String::new();
    let mut gap = false;
    for c in kept.trim().chars() {
        if c.is_whitespace() || c == '-' {
            gap = true;
        } else {
            if gap && !out.is_empty() {
                out.push('-');
            }
            gap = false;
            out.push(c);
        }
    }
    out
}

fn base36(mut n: u128) -> String {
    const D: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    let mut s = Vec::new();
    loop {
        s.push(D[(n % 36) as usize]);
        n /= 36;
        if n == 0 {
            break;
        }
    }
    s.reverse();
    String::from_utf8(s).unwrap()
}

// ── Topics ──────────────────────────────────────────────────────────────────────

/// Returns the new topic's slug (the web app redirects to it).
pub fn create_topic(conn: &mut Connection, name: &str, description: &str) -> Result<Option<String>> {
    let name = name.trim();
    if name.is_empty() {
        return Ok(None);
    }
    let tx = conn.transaction()?;
    let mut slug = slugify(name);
    if slug.is_empty() {
        slug = "topic".into();
    }
    let clash: bool = tx.query_row("select exists(select 1 from topics where slug = ?1)", [&slug], |r| r.get(0))?;
    if clash {
        slug = format!("{slug}-{}", base36(chrono::Utc::now().timestamp_millis() as u128));
    }
    let sort = next_sort(&tx, "topics", None)?;
    local::insert(
        &tx,
        &TOPICS,
        row(json!({ "name": name, "slug": slug, "description": description.trim(), "sort_order": sort, "created_at": now() })),
    )?;
    tx.commit()?;
    Ok(Some(slug))
}

pub fn update_topic(conn: &mut Connection, id: i64, name: &str, description: &str) -> Result<()> {
    let name = name.trim();
    if name.is_empty() {
        return Ok(());
    }
    let tx = conn.transaction()?;
    let id = local::resolve(&tx, "topics", id)?;
    local::update(&tx, &TOPICS, id, row(json!({ "name": name, "description": description.trim() })))?;
    tx.commit()?;
    Ok(())
}

pub fn delete_topic(conn: &mut Connection, id: i64) -> Result<()> {
    let tx = conn.transaction()?;
    let id = local::resolve(&tx, "topics", id)?;
    local::delete(&tx, &TOPICS, id)?;
    tx.commit()?;
    Ok(())
}

// ── Patterns ────────────────────────────────────────────────────────────────────

pub fn create_pattern(conn: &mut Connection, topic_id: i64, name: &str) -> Result<()> {
    let name = name.trim();
    if name.is_empty() {
        return Ok(());
    }
    let tx = conn.transaction()?;
    let topic_id = local::resolve(&tx, "topics", topic_id)?;
    insert_pattern(&tx, topic_id, name)?;
    tx.commit()?;
    Ok(())
}

fn insert_pattern(tx: &Transaction, topic_id: i64, name: &str) -> Result<i64> {
    let sort = next_sort(tx, "patterns", Some(("topic_id", topic_id)))?;
    local::insert(tx, &PATTERNS, row(json!({ "topic_id": topic_id, "name": name, "sort_order": sort, "created_at": now() })))
}

pub fn rename_pattern(conn: &mut Connection, id: i64, name: &str) -> Result<()> {
    let name = name.trim();
    if name.is_empty() {
        return Ok(());
    }
    let tx = conn.transaction()?;
    let id = local::resolve(&tx, "patterns", id)?;
    local::update(&tx, &PATTERNS, id, row(json!({ "name": name })))?;
    tx.commit()?;
    Ok(())
}

/// Its problems move to Unsorted (FK is ON DELETE SET NULL, locally and on the server).
pub fn delete_pattern(conn: &mut Connection, id: i64) -> Result<()> {
    let tx = conn.transaction()?;
    let id = local::resolve(&tx, "patterns", id)?;
    local::delete(&tx, &PATTERNS, id)?;
    tx.commit()?;
    Ok(())
}

/// Swap a pattern with its neighbour above (-1) or below (+1).
pub fn shift_pattern(conn: &mut Connection, id: i64, dir: i64) -> Result<()> {
    let tx = conn.transaction()?;
    let id = local::resolve(&tx, "patterns", id)?;
    let mut list: Vec<i64> = {
        let mut st = tx.prepare(
            "select id from patterns where topic_id = (select topic_id from patterns where id = ?1) order by sort_order, id",
        )?;
        let ids = st.query_map([id], |r| r.get(0))?.collect::<rusqlite::Result<_>>()?;
        ids
    };
    let Some(i) = list.iter().position(|&x| x == id) else { return Ok(()) };
    let j = i as i64 + dir;
    if j < 0 || j >= list.len() as i64 {
        return Ok(());
    }
    list.swap(i, j as usize);
    for (k, pid) in list.iter().enumerate() {
        local::update(&tx, &PATTERNS, *pid, row(json!({ "sort_order": k })))?;
    }
    tx.commit()?;
    Ok(())
}

// ── Problems ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Existing {
    pub id: i64,
    pub title: String,
    pub topic_name: String,
}

/// A problem already in the sheet with the same LeetCode slug.
pub fn find_by_leetcode_slug(conn: &Connection, slug: &str) -> Result<Option<Existing>> {
    let mut st = conn.prepare("select p.id, p.title, t.name, p.url from problems p join topics t on t.id = p.topic_id where p.url like '%' || ?1 || '%'")?;
    let rows = st.query_map([format!("/problems/{slug}")], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?)))?;
    for r in rows {
        let (id, title, topic_name, url) = r?;
        if crate::leetcode::slug(&url).as_deref() == Some(slug) {
            return Ok(Some(Existing { id, title, topic_name }));
        }
    }
    Ok(None)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewProblemInput {
    pub topic_id: i64,
    pub title: String,
    pub url: String,
    pub difficulty: String,
    pub lc_number: Option<i64>,
    pub pattern_id: Option<i64>,
    pub new_pattern_name: Option<String>,
}

pub fn create_problem(conn: &mut Connection, input: NewProblemInput) -> Result<i64> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err(msg("Topic and title are required"));
    }
    let tx = conn.transaction()?;
    let topic_id = local::resolve(&tx, "topics", input.topic_id)?;
    let exists: bool = tx.query_row("select exists(select 1 from topics where id = ?1)", [topic_id], |r| r.get(0))?;
    if !exists {
        return Err(msg("Topic and title are required"));
    }
    let difficulty = if DIFFS.contains(&input.difficulty.as_str()) { input.difficulty.as_str() } else { "Medium" };

    let mut pattern_id = input.pattern_id;
    if let Some(name) = input.new_pattern_name.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        pattern_id = Some(insert_pattern(&tx, topic_id, name)?);
    }
    let pattern_id = pattern_guard(&tx, pattern_id, topic_id)?;
    let sort = next_sort(&tx, "problems", Some(("topic_id", topic_id)))?;
    let ts = now();
    let id = local::insert(
        &tx,
        &PROBLEMS,
        row(json!({
            "topic_id": topic_id,
            "pattern_id": pattern_id,
            "starred": false,
            "title": title.chars().take(200).collect::<String>(),
            "url": input.url.trim(),
            "lc_number": input.lc_number,
            "difficulty": difficulty,
            "status": "Todo",
            "tags": [],
            "notes": "",
            "description": "",
            "sort_order": sort,
            "created_at": ts,
            "updated_at": ts,
        })),
    )?;
    tx.commit()?;
    Ok(id)
}

#[derive(Debug, Deserialize)]
pub struct TabRef {
    pub key: String,
    pub id: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnippetInput {
    pub key: String,
    pub id: Option<i64>,
    pub name: String,
    pub code: String,
    pub time_complexity: String,
    pub space_complexity: String,
}

#[derive(Debug, Deserialize)]
pub struct TabSync {
    pub order: Vec<TabRef>,
    pub changed: Vec<SnippetInput>,
}

fn str_field<'a>(patch: &'a Map<String, Value>, k: &str) -> Result<Option<&'a str>> {
    match patch.get(k) {
        None => Ok(None),
        Some(Value::String(s)) => Ok(Some(s)),
        Some(v) => Err(msg(format!("{k}: expected text, got {v}"))),
    }
}

fn int_or_null(patch: &Map<String, Value>, k: &str) -> Result<Option<Value>> {
    match patch.get(k) {
        None => Ok(None),
        Some(Value::Null) => Ok(Some(Value::Null)),
        Some(Value::Number(n)) if n.is_i64() => Ok(Some(json!(n.as_i64()))),
        Some(v) => Err(msg(format!("{k}: expected an integer, got {v}"))),
    }
}

/// Autosave: writes only what changed (problem fields + code tabs). Returns the id of every tab key.
pub fn update_problem(conn: &mut Connection, id: i64, patch: Map<String, Value>, tabs: TabSync) -> Result<HashMap<String, i64>> {
    let tx = conn.transaction()?;
    let id = local::resolve(&tx, "problems", id)?;
    let Some(topic_id) = topic_of_problem(&tx, id)? else { return Err(msg("Not found")) };
    let ts = now();

    let mut set = Row::new();
    if let Some(v) = str_field(&patch, "title")? {
        let t = v.trim();
        set.insert("title".into(), json!(if t.is_empty() { "Untitled" } else { t }));
    }
    if let Some(v) = str_field(&patch, "url")? {
        set.insert("url".into(), json!(v.trim()));
    }
    if let Some(v) = int_or_null(&patch, "lcNumber")? {
        set.insert("lc_number".into(), v);
    }
    if let Some(v) = str_field(&patch, "difficulty")? {
        if !DIFFS.contains(&v) {
            return Err(msg("Bad difficulty"));
        }
        set.insert("difficulty".into(), json!(v));
    }
    if let Some(v) = patch.get("starred") {
        set.insert("starred".into(), json!(v.as_bool().ok_or_else(|| msg("starred: expected a boolean"))?));
    }
    if let Some(v) = patch.get("tags") {
        let arr = v.as_array().ok_or_else(|| msg("tags: expected a list"))?;
        let mut seen = HashSet::new();
        let tags: Vec<String> = arr
            .iter()
            .filter_map(|t| t.as_str())
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty() && seen.insert(t.clone()))
            .collect();
        set.insert("tags".into(), json!(tags));
    }
    if let Some(v) = str_field(&patch, "notes")? {
        set.insert("notes".into(), json!(v));
    }
    if let Some(v) = str_field(&patch, "description")? {
        set.insert("description".into(), json!(v));
    }
    if let Some(v) = int_or_null(&patch, "timeTakenMin")? {
        set.insert("time_taken_min".into(), v);
    }
    if patch.contains_key("patternId") {
        let pid = int_or_null(&patch, "patternId")?.and_then(|v| v.as_i64());
        set.insert("pattern_id".into(), json!(pattern_guard(&tx, pid, topic_id)?));
    }
    if let Some(v) = str_field(&patch, "status")? {
        if !STATUSES.contains(&v) {
            return Err(msg("Bad status"));
        }
        set.insert("solved_at".into(), solved_at_for(&tx, id, v)?);
        set.insert("status".into(), json!(v));
    }
    if !set.is_empty() {
        set.insert("updated_at".into(), json!(ts));
        local::update(&tx, &PROBLEMS, id, set)?;
    }

    // ── Code tabs ──
    let order: Vec<(String, Option<i64>)> = tabs
        .order
        .iter()
        .map(|t| Ok((t.key.clone(), t.id.map(|x| local::resolve(&tx, "snippets", x)).transpose()?)))
        .collect::<Result<_>>()?;
    let kept: HashSet<i64> = order.iter().filter_map(|(_, id)| *id).collect();
    let position: HashMap<&str, usize> = order.iter().enumerate().map(|(i, (k, _))| (k.as_str(), i)).collect();

    let existing: Vec<i64> = {
        let mut st = tx.prepare("select id from snippets where problem_id = ?1")?;
        let ids = st.query_map([id], |r| r.get(0))?.collect::<rusqlite::Result<_>>()?;
        ids
    };
    for sid in existing.iter().filter(|s| !kept.contains(s)) {
        local::delete(&tx, &SNIPPETS, *sid)?;
    }

    let mut ids: HashMap<String, i64> = order.iter().filter_map(|(k, id)| id.map(|i| (k.clone(), i))).collect();
    for t in &tabs.changed {
        let Some(&pos) = position.get(t.key.as_str()) else { continue };
        let name: String = t.name.trim().chars().take(60).collect();
        let fields = json!({
            "name": if name.is_empty() { "Untitled".to_string() } else { name },
            "language": "java", // all snippets are Java
            "code": t.code,
            "time_complexity": t.time_complexity.trim(),
            "space_complexity": t.space_complexity.trim(),
            "sort_order": pos,
            "updated_at": ts,
        });
        match t.id.map(|x| local::resolve(&tx, "snippets", x)).transpose()? {
            Some(sid) if kept.contains(&sid) && existing.contains(&sid) => {
                local::update(&tx, &SNIPPETS, sid, row(fields))?;
            }
            Some(_) => {} // deleted elsewhere meanwhile
            None => {
                let mut f = row(fields);
                f.insert("problem_id".into(), json!(id));
                f.insert("created_at".into(), json!(ts));
                let sid = local::insert(&tx, &SNIPPETS, f)?;
                ids.insert(t.key.clone(), sid);
            }
        }
    }
    tx.commit()?;
    Ok(ids)
}

pub fn set_status(conn: &mut Connection, id: i64, status: &str) -> Result<()> {
    if !STATUSES.contains(&status) {
        return Ok(());
    }
    let tx = conn.transaction()?;
    let id = local::resolve(&tx, "problems", id)?;
    let solved_at = solved_at_for(&tx, id, status)?;
    local::update(&tx, &PROBLEMS, id, row(json!({ "status": status, "solved_at": solved_at, "updated_at": now() })))?;
    tx.commit()?;
    Ok(())
}

pub fn set_starred(conn: &mut Connection, id: i64, starred: bool) -> Result<()> {
    let tx = conn.transaction()?;
    let id = local::resolve(&tx, "problems", id)?;
    local::update(&tx, &PROBLEMS, id, row(json!({ "starred": starred, "updated_at": now() })))?;
    tx.commit()?;
    Ok(())
}

#[derive(Debug, Serialize)]
pub struct DescriptionSource {
    pub url: String,
    pub description: String,
}

pub fn description_source(conn: &Connection, id: i64) -> Result<Option<DescriptionSource>> {
    let id = local::resolve(conn, "problems", id)?;
    Ok(conn
        .query_row("select url, description from problems where id = ?1", [id], |r| {
            Ok(DescriptionSource { url: r.get(0)?, description: r.get(1)? })
        })
        .optional()?)
}

/// Saves a (sanitized) statement fetched from LeetCode.
pub fn set_description(conn: &mut Connection, id: i64, html: &str) -> Result<()> {
    let tx = conn.transaction()?;
    let id = local::resolve(&tx, "problems", id)?;
    local::update(&tx, &PROBLEMS, id, row(json!({ "description": html, "updated_at": now() })))?;
    tx.commit()?;
    Ok(())
}

/// For the dashboard's "Recent" list.
pub fn mark_viewed(conn: &mut Connection, id: i64) -> Result<()> {
    let tx = conn.transaction()?;
    let id = local::resolve(&tx, "problems", id)?;
    local::update(&tx, &PROBLEMS, id, row(json!({ "last_viewed_at": now() })))?;
    tx.commit()?;
    Ok(())
}

/// Moves a problem into `pattern_id` (None = Unsorted) of its own topic, before `before_id`
/// or at the end, renumbering the target group.
pub fn move_problem(conn: &mut Connection, id: i64, pattern_id: Option<i64>, before_id: Option<i64>) -> Result<()> {
    let tx = conn.transaction()?;
    let id = local::resolve(&tx, "problems", id)?;
    let Some(topic_id) = topic_of_problem(&tx, id)? else { return Ok(()) };
    let pattern_id = pattern_id.map(|p| local::resolve(&tx, "patterns", p)).transpose()?;
    if pattern_id.is_some() && pattern_guard(&tx, pattern_id, topic_id)?.is_none() {
        return Err(msg("Pattern not in this topic"));
    }
    let before_id = before_id.map(|b| local::resolve(&tx, "problems", b)).transpose()?;

    let mut ids: Vec<i64> = {
        let mut st = tx.prepare(
            "select id from problems where topic_id = ?1 and (pattern_id is ?2) and id != ?3 order by sort_order, id",
        )?;
        let v = st.query_map(params![topic_id, pattern_id, id], |r| r.get(0))?.collect::<rusqlite::Result<_>>()?;
        v
    };
    let at = before_id.and_then(|b| ids.iter().position(|&x| x == b)).unwrap_or(ids.len());
    ids.insert(at, id);

    for (k, pid) in ids.iter().enumerate() {
        let fields = if *pid == id { json!({ "pattern_id": pattern_id, "sort_order": k }) } else { json!({ "sort_order": k }) };
        local::update(&tx, &PROBLEMS, *pid, row(fields))?;
    }
    tx.commit()?;
    Ok(())
}

pub fn delete_problem(conn: &mut Connection, id: i64) -> Result<()> {
    let tx = conn.transaction()?;
    let id = local::resolve(&tx, "problems", id)?;
    local::delete(&tx, &PROBLEMS, id)?;
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
#[path = "actions_tests.rs"]
mod tests;
