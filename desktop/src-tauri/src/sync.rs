//! Sync between the local store and the shared Postgres database.
//!
//! One round = push, then pull:
//! - **Push** sends the outbox, oldest first, inside one server transaction (all or nothing,
//!   so a dropped connection never leaves half a sync behind). Each field change carries the
//!   value it replaced; the server value decides what happens:
//!     server == old  → nobody else touched it: apply.
//!     server == new  → already there: skip.
//!     otherwise      → edited on both sides: the later edit wins (row `updated_at` vs the
//!                      local edit time; tables without `updated_at` → desktop wins). For
//!                      notes, the losing text is kept in the local `conflicts` table.
//!   Rows created offline are inserted and their server ids recorded (`id_map`); later ops
//!   and foreign keys are translated on the way. An op the server rejects for integrity
//!   reasons (e.g. its row or parent was deleted on the web) is dropped.
//! - **Pull** downloads all four tables in one consistent snapshot, replaces the local copy,
//!   and re-applies any local changes made while the round was running.

use std::collections::{HashMap, HashSet};
use std::sync::atomic::Ordering;
use std::sync::Mutex;

use rusqlite::{params, Connection};
use serde::Serialize;
use serde_json::{json, Map, Value};
use tokio_postgres::types::ToSql;
use tokio_postgres::{Client, GenericClient, Transaction};

use crate::error::{msg, Error, Result};
use crate::local::{self, PUSHING_UPTO};
use crate::schema::{self, Col, Kind, Table};

/// Text fields whose losing version is kept when both sides edited them.
const KEEP_LOSER: &[(&str, &str)] = &[("problems", "notes")];

#[derive(Debug, Default, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub pushed: usize,
    pub dropped: usize,
    pub conflicts: usize,
    /// Cache tags the web app should expire.
    #[serde(skip)]
    pub tags: Vec<String>,
}

struct Op {
    id: i64,
    table: &'static Table,
    row_id: i64,
    kind: String,
    data: Map<String, Value>,
    ts: String,
}

struct Lost {
    problem_id: i64,
    field: String,
    value: String,
    side: &'static str,
}

/// One full round. `db` is locked only briefly; network work happens without the lock.
pub async fn run(db: &Mutex<Connection>, client: &mut Client) -> Result<Report> {
    let report = push(db, client).await?;
    pull(db, client).await?;
    Ok(report)
}

fn lock(db: &Mutex<Connection>) -> Result<std::sync::MutexGuard<'_, Connection>> {
    db.lock().map_err(|_| msg("local database lock poisoned"))
}

// ── Push ─────────────────────────────────────────────────────────────────────────

fn load_ops(conn: &Connection) -> Result<(Vec<Op>, HashMap<(String, i64), i64>)> {
    let mut st = conn.prepare("select id, tbl, row_id, kind, data, ts from outbox order by id")?;
    let rows = st.query_map([], |r| {
        Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?, r.get::<_, String>(3)?, r.get::<_, String>(4)?, r.get::<_, String>(5)?))
    })?;
    let mut ops = Vec::new();
    for r in rows {
        let (id, tbl, row_id, kind, data, ts) = r?;
        ops.push(Op { id, table: local::table(&tbl)?, row_id, kind, data: serde_json::from_str(&data).unwrap_or_default(), ts });
    }
    let mut st = conn.prepare("select tbl, local_id, server_id from id_map")?;
    let map = st
        .query_map([], |r| Ok(((r.get::<_, String>(0)?, r.get::<_, i64>(1)?), r.get::<_, i64>(2)?)))?
        .collect::<rusqlite::Result<HashMap<_, _>>>()?;
    Ok((ops, map))
}

async fn push(db: &Mutex<Connection>, client: &mut Client) -> Result<Report> {
    let mut report = Report::default();
    let (ops, mut ids) = {
        let conn = lock(db)?;
        let (ops, ids) = load_ops(&conn)?;
        // Freeze these ops: edits from now on start new ones instead of merging into them.
        PUSHING_UPTO.store(ops.last().map_or(0, |o| o.id), Ordering::SeqCst);
        (ops, ids)
    };
    if ops.is_empty() {
        PUSHING_UPTO.store(0, Ordering::SeqCst);
        return Ok(report);
    }

    let result = push_ops(client, &ops, &mut ids, &mut report).await;
    let outcome = match result {
        Ok((new_ids, lost)) => {
            let conn = lock(db)?;
            let tx = conn.unchecked_transaction()?;
            tx.execute("delete from outbox where id <= ?1", [ops.last().unwrap().id])?;
            for ((tbl, local_id), server_id) in &new_ids {
                tx.execute("insert or replace into id_map (tbl, local_id, server_id) values (?1, ?2, ?3)", params![tbl, local_id, server_id])?;
            }
            for l in &lost {
                tx.execute(
                    "insert into conflicts (problem_id, field, lost_value, lost_side, created_at) values (?1, ?2, ?3, ?4, ?5)",
                    params![l.problem_id, l.field, l.value, l.side, local::now()],
                )?;
            }
            tx.commit()?;
            Ok(report)
        }
        Err(e) => Err(e),
    };
    PUSHING_UPTO.store(0, Ordering::SeqCst);
    outcome
}

/// Errors that mean "the server won't take this op" (vs. a connection problem, which aborts).
fn rejected(e: &Error) -> bool {
    match e {
        Error::Postgres(pg) => pg.code().is_some_and(|c| {
            let c = c.code();
            c.starts_with("23") || c.starts_with("22")
        }),
        Error::Msg(_) => true,
        _ => false,
    }
}

fn is_unique_violation(e: &Error) -> bool {
    matches!(e, Error::Postgres(pg) if pg.code().is_some_and(|c| c.code() == "23505"))
}

type IdMap = HashMap<(String, i64), i64>;

/// Local id → server id (positive ids are already server ids). None = never reached the server.
fn server_id(ids: &IdMap, table: &str, id: i64) -> Option<i64> {
    if id >= 0 {
        Some(id)
    } else {
        ids.get(&(table.to_string(), id)).copied()
    }
}

/// Translates a foreign-key value. Err = it points at a row that never reached the server.
fn translate_fk(ids: &IdMap, col: &Col, v: &Value) -> std::result::Result<Value, ()> {
    match (col.refs, v.as_i64()) {
        (Some(t), Some(id)) => server_id(ids, t, id).map(|s| json!(s)).ok_or(()),
        _ => Ok(v.clone()),
    }
}

async fn push_ops(client: &mut Client, ops: &[Op], ids: &mut IdMap, report: &mut Report) -> Result<(IdMap, Vec<Lost>)> {
    let mut new_ids = IdMap::new();
    let mut lost = Vec::new();
    let mut touched: HashSet<i64> = HashSet::new();
    let mut tx = client.transaction().await?;

    for op in ops {
        let mut sp = tx.savepoint("op").await?;
        let res = push_one(&mut sp, op, ids, &mut lost, &mut report.conflicts).await;
        match res {
            Ok(Some(row_id)) => {
                sp.commit().await?;
                report.pushed += 1;
                if op.kind == "insert" {
                    ids.insert((op.table.name.to_string(), op.row_id), row_id);
                    new_ids.insert((op.table.name.to_string(), op.row_id), row_id);
                }
                if let Some(p) = problem_of(&tx, op, row_id, ids).await? {
                    touched.insert(p);
                }
            }
            Ok(None) => {
                sp.rollback().await?;
                report.dropped += 1;
            }
            Err(e) if rejected(&e) => {
                eprintln!("sync: dropping {} {} {}: {e}", op.kind, op.table.name, op.row_id);
                sp.rollback().await?;
                report.dropped += 1;
            }
            Err(e) => return Err(e),
        }
    }

    if report.pushed > 0 {
        report.tags = tags_for(&tx, &touched).await?;
    }
    tx.commit().await?;
    Ok((new_ids, lost))
}

/// Applies one op. Ok(Some(server row id)) if applied, Ok(None) if it no longer applies.
async fn push_one(tx: &mut Transaction<'_>, op: &Op, ids: &IdMap, lost: &mut Vec<Lost>, conflicts: &mut usize) -> Result<Option<i64>> {
    let t = op.table;
    match op.kind.as_str() {
        "insert" => {
            let mut fields = Map::new();
            for (k, v) in &op.data {
                let Some(col) = t.col(k) else { continue };
                match translate_fk(ids, col, v) {
                    Ok(v) => fields.insert(k.clone(), v),
                    Err(()) => return Ok(None), // parent never made it to the server
                };
            }
            let sp = tx.savepoint("ins").await?;
            match insert_row(&sp, t, &fields).await {
                Ok(id) => {
                    sp.commit().await?;
                    Ok(Some(id))
                }
                // Slug taken by a topic created on the web meanwhile: pick another.
                Err(e) if t.name == "topics" && is_unique_violation(&e) => {
                    sp.rollback().await?;
                    let slug = fields.get("slug").and_then(Value::as_str).unwrap_or("topic").to_string();
                    fields.insert("slug".into(), json!(format!("{slug}-{}", chrono::Utc::now().timestamp_millis())));
                    Ok(Some(insert_row(tx, t, &fields).await?))
                }
                Err(e) => Err(e),
            }
        }
        "update" => {
            let Some(id) = server_id(ids, t.name, op.row_id) else { return Ok(None) };
            update_row(tx, t, id, op, ids, lost, conflicts).await
        }
        "delete" => {
            let Some(id) = server_id(ids, t.name, op.row_id) else { return Ok(None) };
            tx.execute(&format!("delete from {} where id = $1", t.name), &[&(id as i32)]).await?;
            Ok(Some(id))
        }
        k => Err(msg(format!("unknown op kind {k}"))),
    }
}

async fn insert_row<C: GenericClient>(c: &C, t: &Table, fields: &Map<String, Value>) -> Result<i64> {
    let mut names = Vec::new();
    let mut marks = Vec::new();
    let mut vals: Vec<Box<dyn ToSql + Sync + Send>> = Vec::new();
    for col in t.cols {
        if let Some(v) = fields.get(col.name) {
            names.push(col.name);
            vals.push(pg_value(col.kind, v)?);
            marks.push(placeholder(col.kind, vals.len()));
        }
    }
    let sql = format!("insert into {} ({}) values ({}) returning id::int8", t.name, names.join(", "), marks.join(", "));
    let row = c.query_one(&sql, &refs(&vals)).await?;
    Ok(row.get(0))
}

#[allow(clippy::too_many_arguments)]
async fn update_row(
    tx: &Transaction<'_>,
    t: &'static Table,
    id: i64,
    op: &Op,
    ids: &IdMap,
    lost: &mut Vec<Lost>,
    conflicts: &mut usize,
) -> Result<Option<i64>> {
    let version_col = t.updated_at;
    // Compare every changed field except the row version itself.
    let fields: Vec<&'static Col> = op.data.keys().filter_map(|k| t.col(k)).filter(|c| Some(c.name) != version_col).collect();

    let mut read_cols: Vec<&Col> = fields.clone();
    let version = version_col.and_then(|v| t.col(v));
    if let Some(v) = version {
        read_cols.push(v);
    }
    let select = if read_cols.is_empty() { "1".to_string() } else { read_cols.iter().map(|c| select_expr(c)).collect::<Vec<_>>().join(", ") };
    let Some(server) = tx.query_opt(&format!("select {select} from {} where id = $1 for update", t.name), &[&(id as i32)]).await? else {
        return Ok(None); // deleted on the web: deleted wins
    };
    let server_version = version.map(|_| server_value(&server, read_cols.len() - 1, Kind::Ts));
    let server_newer = matches!(&server_version, Some(Value::String(sv)) if sv.as_str() > op.ts.as_str());

    let mut apply = Map::new();
    for (i, col) in fields.iter().enumerate() {
        let change = &op.data[col.name];
        let (Ok(old), Ok(new)) = (translate_fk(ids, col, &change["old"]), translate_fk(ids, col, &change["new"])) else {
            continue; // points at a row that never reached the server
        };
        let current = server_value(&server, i, col.kind);
        if current == old {
            apply.insert(col.name.to_string(), new);
        } else if current == new {
            // already there
        } else {
            *conflicts += 1;
            let keep = KEEP_LOSER.contains(&(t.name, col.name));
            if server_newer {
                if keep {
                    lost.push(Lost { problem_id: id, field: col.name.into(), value: text(&new), side: "desktop" });
                }
            } else {
                if keep {
                    lost.push(Lost { problem_id: id, field: col.name.into(), value: text(&current), side: "web" });
                }
                apply.insert(col.name.to_string(), new);
            }
        }
    }

    if apply.is_empty() {
        return Ok(Some(id));
    }
    let mut sets = Vec::new();
    let mut vals: Vec<Box<dyn ToSql + Sync + Send>> = Vec::new();
    for (k, v) in &apply {
        let col = t.col(k).unwrap();
        vals.push(pg_value(col.kind, v)?);
        sets.push(format!("{k} = {}", placeholder(col.kind, vals.len())));
    }
    // Row version: the later of the server's and this edit's.
    if let Some(vc) = version_col {
        let edited = op.data.get(vc).and_then(|c| c["new"].as_str()).unwrap_or(&op.ts).to_string();
        vals.push(Box::new(edited));
        sets.push(format!("{vc} = greatest({vc}, ${}::text::timestamptz)", vals.len()));
    }
    vals.push(Box::new(id as i32));
    let sql = format!("update {} set {} where id = ${}", t.name, sets.join(", "), vals.len());
    tx.execute(&sql, &refs(&vals)).await?;
    Ok(Some(id))
}

fn text(v: &Value) -> String {
    v.as_str().map(str::to_string).unwrap_or_else(|| v.to_string())
}

/// Web cache tags affected by the pushed rows (see src/lib/tags.ts). Topic pages are cheap
/// to rebuild and a deleted row can't be traced back to its topic, so every topic is expired.
async fn tags_for(tx: &Transaction<'_>, problems: &HashSet<i64>) -> Result<Vec<String>> {
    let mut tags = vec!["stats".to_string(), "views".to_string()];
    for r in tx.query("select id::int8 from topics", &[]).await? {
        tags.push(format!("topic:{}", r.get::<_, i64>(0)));
    }
    tags.extend(problems.iter().map(|p| format!("problem:{p}")));
    Ok(tags)
}

/// The problem whose page an op affects (for cache tags).
async fn problem_of(tx: &Transaction<'_>, op: &Op, row_id: i64, ids: &IdMap) -> Result<Option<i64>> {
    Ok(match op.table.name {
        "problems" => Some(row_id),
        "snippets" => match op.data.get("problem_id").and_then(Value::as_i64) {
            Some(p) => server_id(ids, "problems", p),
            None => tx
                .query_opt("select problem_id::int8 from snippets where id = $1", &[&(row_id as i32)])
                .await?
                .map(|r| r.get(0)),
        },
        _ => None,
    })
}

// ── Pull ─────────────────────────────────────────────────────────────────────────

async fn pull(db: &Mutex<Connection>, client: &mut Client) -> Result<()> {
    let tx = client.build_transaction().isolation_level(tokio_postgres::IsolationLevel::RepeatableRead).read_only(true).start().await?;
    let mut tables: Vec<(&'static Table, Vec<Map<String, Value>>)> = Vec::new();
    for t in schema::ALL {
        let mut cols: Vec<String> = vec!["id::int8".into()];
        cols.extend(t.cols.iter().map(select_expr));
        let rows = tx.query(&format!("select {} from {} order by id", cols.join(", "), t.name), &[]).await?;
        let rows = rows
            .iter()
            .map(|r| {
                let mut m = Map::new();
                m.insert("id".into(), json!(r.get::<_, i64>(0)));
                for (i, c) in t.cols.iter().enumerate() {
                    m.insert(c.name.into(), server_value(r, i + 1, c.kind));
                }
                m
            })
            .collect();
        tables.push((t, rows));
    }
    tx.commit().await?;

    let conn = lock(db)?;
    let tx = conn.unchecked_transaction()?;
    for t in schema::ALL.iter().rev() {
        tx.execute(&format!("delete from {}", t.name), [])?;
    }
    for (t, rows) in &tables {
        for r in rows {
            local::apply_insert(&tx, t, r["id"].as_i64().unwrap_or_default(), r)?;
        }
    }
    // Local changes made while this round ran (or that couldn't be pushed): put them back on top.
    replay(&tx)?;
    tx.execute(
        "insert into meta (key, value) values ('last_pull', ?1) on conflict(key) do update set value = excluded.value",
        [local::now()],
    )?;
    tx.commit()?;
    Ok(())
}

/// Re-applies the outbox to the freshly pulled data (ids translated via id_map).
fn replay(conn: &Connection) -> Result<()> {
    let (ops, ids) = load_ops(conn)?;
    for op in ops {
        let t = op.table;
        let row_id = local::resolve(conn, t.name, op.row_id)?;
        let fix = |col: &Col, v: &Value| -> Value {
            match (col.refs, v.as_i64()) {
                (Some(rt), Some(id)) if id < 0 => json!(ids.get(&(rt.to_string(), id)).copied().unwrap_or(id)),
                _ => v.clone(),
            }
        };
        let res = match op.kind.as_str() {
            "insert" => {
                let fields: Map<String, Value> =
                    op.data.iter().filter_map(|(k, v)| t.col(k).map(|c| (k.clone(), fix(c, v)))).collect();
                local::apply_insert(conn, t, row_id, &fields).map(|_| ())
            }
            "update" => {
                let fields: Map<String, Value> =
                    op.data.iter().filter_map(|(k, d)| t.col(k).map(|c| (k.clone(), fix(c, &d["new"])))).collect();
                local::apply_update(conn, t, row_id, &fields).map(|_| ())
            }
            "delete" => local::apply_delete(conn, t, row_id).map(|_| ()),
            _ => Ok(()),
        };
        if let Err(e) = res {
            // e.g. its row was deleted on the web; the next push will drop the op.
            eprintln!("sync: could not re-apply {} {} {}: {e}", op.kind, t.name, op.row_id);
        }
    }
    Ok(())
}

// ── Postgres value mapping ─────────────────────────────────────────────────────────

/// How a column is selected so it reads back in the local representation.
fn select_expr(c: &Col) -> String {
    let n = c.name;
    match c.kind {
        Kind::Ts => format!(r#"to_char({n} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')"#),
        Kind::Enum(_) => format!("{n}::text"),
        Kind::Int => format!("{n}::int8"),
        _ => n.to_string(),
    }
}

fn server_value(row: &tokio_postgres::Row, i: usize, kind: Kind) -> Value {
    match kind {
        Kind::Int => json!(row.get::<_, Option<i64>>(i)),
        Kind::Bool => json!(row.get::<_, Option<bool>>(i)),
        Kind::TextArray => json!(row.get::<_, Option<Vec<String>>>(i).unwrap_or_default()),
        Kind::Text | Kind::Ts | Kind::Enum(_) => json!(row.get::<_, Option<String>>(i)),
    }
}

fn placeholder(kind: Kind, n: usize) -> String {
    match kind {
        Kind::Int => format!("${n}::int8"),
        Kind::Bool => format!("${n}::bool"),
        Kind::Text => format!("${n}::text"),
        Kind::Ts => format!("${n}::text::timestamptz"),
        Kind::TextArray => format!("${n}::text[]"),
        Kind::Enum(e) => format!("${n}::text::\"{e}\""),
    }
}

fn pg_value(kind: Kind, v: &Value) -> Result<Box<dyn ToSql + Sync + Send>> {
    Ok(match kind {
        Kind::Int => Box::new(v.as_i64()),
        Kind::Bool => Box::new(v.as_bool()),
        Kind::Text | Kind::Ts | Kind::Enum(_) => Box::new(v.as_str().map(str::to_string)),
        Kind::TextArray => Box::new(
            v.as_array().ok_or_else(|| msg("expected a list"))?.iter().filter_map(|x| x.as_str().map(str::to_string)).collect::<Vec<_>>(),
        ),
    })
}

fn refs(vals: &[Box<dyn ToSql + Sync + Send>]) -> Vec<&(dyn ToSql + Sync)> {
    vals.iter().map(|b| b.as_ref() as &(dyn ToSql + Sync)).collect()
}

#[cfg(test)]
#[path = "sync_tests.rs"]
mod tests;
