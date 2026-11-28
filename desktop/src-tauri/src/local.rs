//! Local SQLite store: the copy of the server data the app reads and writes, plus the outbox
//! of changes waiting to be pushed.
//!
//! Every write goes through `insert` / `update` / `delete` here, which apply the change and
//! record it in the outbox in the same transaction.

use std::path::Path;
use std::sync::atomic::{AtomicI64, Ordering};

use rusqlite::types::Value as Sql;
use rusqlite::{params, params_from_iter, Connection, OptionalExtension, Transaction};
use serde_json::{json, Map, Value};

use crate::error::{msg, Result};
use crate::schema::{self, Kind, Table, LOCAL_DDL};

pub type Row = Map<String, Value>;

/// Outbox ops with id ≤ this are being pushed right now and must not be merged into.
pub static PUSHING_UPTO: AtomicI64 = AtomicI64::new(0);

pub fn open(path: &Path) -> Result<Connection> {
    let conn = Connection::open(path)?;
    init(&conn)?;
    Ok(conn)
}

pub fn init(conn: &Connection) -> Result<()> {
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", true)?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.execute_batch(LOCAL_DDL)?;
    Ok(())
}

/// Current time, in the one timestamp format used everywhere locally (sorts as text).
pub fn now() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

// ── JSON ⇄ SQLite values ─────────────────────────────────────────────────────

pub fn to_sql(kind: Kind, v: &Value) -> Result<Sql> {
    Ok(match (kind, v) {
        (_, Value::Null) => Sql::Null,
        (Kind::Int, Value::Number(n)) => Sql::Integer(n.as_i64().ok_or_else(|| msg(format!("not an integer: {n}")))?),
        (Kind::Bool, Value::Bool(b)) => Sql::Integer(*b as i64),
        (Kind::Text | Kind::Ts | Kind::Enum(_), Value::String(s)) => Sql::Text(s.clone()),
        (Kind::TextArray, Value::Array(_)) => Sql::Text(v.to_string()),
        _ => return Err(msg(format!("bad value {v} for a {kind:?} column"))),
    })
}

pub fn from_sql(kind: Kind, v: Sql) -> Value {
    match (kind, v) {
        (_, Sql::Null) => Value::Null,
        (Kind::Bool, Sql::Integer(i)) => Value::Bool(i != 0),
        (Kind::Int, Sql::Integer(i)) => json!(i),
        (Kind::TextArray, Sql::Text(s)) => serde_json::from_str(&s).unwrap_or_else(|_| json!([])),
        (_, Sql::Text(s)) => Value::String(s),
        (_, Sql::Integer(i)) => json!(i),
        (_, Sql::Real(f)) => json!(f),
        (_, Sql::Blob(_)) => Value::Null,
    }
}

fn kind_of(t: &Table, col: &str) -> Result<Kind> {
    if col == "id" {
        return Ok(Kind::Int);
    }
    t.col(col).map(|c| c.kind).ok_or_else(|| msg(format!("unknown column {}.{col}", t.name)))
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/// Selected columns of one row, or None if it doesn't exist.
pub fn get(conn: &Connection, t: &Table, id: i64, cols: &[&str]) -> Result<Option<Row>> {
    let sql = format!("select {} from {} where id = ?1", cols.join(", "), t.name);
    let row = conn
        .query_row(&sql, [id], |r| {
            let mut out = Row::new();
            for (i, c) in cols.iter().enumerate() {
                let v: Sql = r.get(i)?;
                out.insert((*c).to_string(), from_sql(kind_of(t, c).unwrap_or(Kind::Text), v));
            }
            Ok(out)
        })
        .optional()?;
    Ok(row)
}

/// Every column of one row (including id).
pub fn get_all(conn: &Connection, t: &Table, id: i64) -> Result<Option<Row>> {
    let mut cols: Vec<&str> = vec!["id"];
    cols.extend(t.cols.iter().map(|c| c.name));
    get(conn, t, id, &cols)
}

/// Maps an id that may be a pre-sync local (negative) id to the row's current id.
pub fn resolve(conn: &Connection, table: &str, id: i64) -> Result<i64> {
    if id >= 0 {
        return Ok(id);
    }
    let mapped: Option<i64> = conn
        .query_row("select server_id from id_map where tbl = ?1 and local_id = ?2", params![table, id], |r| r.get(0))
        .optional()?;
    Ok(mapped.unwrap_or(id))
}

// ── Raw apply (no outbox) — shared by local writes and sync replay ───────────────

pub fn apply_insert(conn: &Connection, t: &Table, id: i64, fields: &Row) -> Result<()> {
    let mut names = vec!["id"];
    let mut vals = vec![Sql::Integer(id)];
    for c in t.cols {
        match fields.get(c.name) {
            Some(v) => {
                names.push(c.name);
                vals.push(to_sql(c.kind, v)?);
            }
            None if c.nullable => {}
            None => return Err(msg(format!("{}.{} is required", t.name, c.name))),
        }
    }
    let marks: Vec<String> = (1..=vals.len()).map(|i| format!("?{i}")).collect();
    let sql = format!("insert into {} ({}) values ({})", t.name, names.join(", "), marks.join(", "));
    conn.execute(&sql, params_from_iter(vals))?;
    Ok(())
}

/// Returns false if the row doesn't exist.
pub fn apply_update(conn: &Connection, t: &Table, id: i64, fields: &Row) -> Result<bool> {
    if fields.is_empty() {
        return Ok(conn.query_row(&format!("select exists(select 1 from {} where id = ?1)", t.name), [id], |r| r.get(0))?);
    }
    let mut sets = Vec::new();
    let mut vals = Vec::new();
    for (i, (k, v)) in fields.iter().enumerate() {
        sets.push(format!("{k} = ?{}", i + 1));
        vals.push(to_sql(kind_of(t, k)?, v)?);
    }
    vals.push(Sql::Integer(id));
    let sql = format!("update {} set {} where id = ?{}", t.name, sets.join(", "), vals.len());
    Ok(conn.execute(&sql, params_from_iter(vals))? > 0)
}

pub fn apply_delete(conn: &Connection, t: &Table, id: i64) -> Result<bool> {
    Ok(conn.execute(&format!("delete from {} where id = ?1", t.name), [id])? > 0)
}

// ── Writes (apply + outbox) ──────────────────────────────────────────────────────

fn next_local_id(tx: &Transaction) -> Result<i64> {
    let cur: Option<String> = tx.query_row("select value from meta where key = 'next_local_id'", [], |r| r.get(0)).optional()?;
    let id = cur.and_then(|s| s.parse::<i64>().ok()).unwrap_or(-1);
    tx.execute(
        "insert into meta (key, value) values ('next_local_id', ?1) on conflict(key) do update set value = excluded.value",
        [(id - 1).to_string()],
    )?;
    Ok(id)
}

fn push_op(tx: &Transaction, t: &Table, row_id: i64, kind: &str, data: &Value) -> Result<()> {
    tx.execute(
        "insert into outbox (tbl, row_id, kind, data, ts) values (?1, ?2, ?3, ?4, ?5)",
        params![t.name, row_id, kind, data.to_string(), now()],
    )?;
    Ok(())
}

/// Inserts a new row with a fresh local (negative) id and queues it.
pub fn insert(tx: &Transaction, t: &Table, fields: Row) -> Result<i64> {
    let id = next_local_id(tx)?;
    apply_insert(tx, t, id, &fields)?;
    push_op(tx, t, id, "insert", &Value::Object(fields))?;
    Ok(id)
}

/// Updates the given fields and queues only the ones that actually changed.
/// Returns false if the row doesn't exist.
pub fn update(tx: &Transaction, t: &Table, id: i64, fields: Row) -> Result<bool> {
    let names: Vec<&str> = fields.keys().map(String::as_str).collect();
    let Some(current) = get(tx, t, id, &names)? else { return Ok(false) };

    let mut diff = Map::new();
    let mut changed = Row::new();
    for (k, new) in fields {
        let old = current.get(&k).cloned().unwrap_or(Value::Null);
        if old != new {
            diff.insert(k.clone(), json!({ "old": old, "new": new }));
            changed.insert(k, new);
        }
    }
    if changed.is_empty() {
        return Ok(true);
    }
    apply_update(tx, t, id, &changed)?;
    record_update(tx, t, id, diff, changed)?;
    Ok(true)
}

/// Queues an update, merging it into this row's latest pending op when possible, so an
/// autosaving editor doesn't pile up hundreds of ops.
fn record_update(tx: &Transaction, t: &Table, id: i64, diff: Map<String, Value>, changed: Row) -> Result<()> {
    let last: Option<(i64, String, String)> = tx
        .query_row(
            "select id, kind, data from outbox where tbl = ?1 and row_id = ?2 order by id desc limit 1",
            params![t.name, id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()?;
    let pushing = PUSHING_UPTO.load(Ordering::SeqCst);

    if let Some((op_id, kind, data)) = last.filter(|(op_id, _, _)| *op_id > pushing) {
        let mut data: Map<String, Value> = serde_json::from_str(&data).unwrap_or_default();
        match kind.as_str() {
            // Not on the server yet: fold the change into the insert itself.
            "insert" => {
                for (k, v) in changed {
                    data.insert(k, v);
                }
            }
            "update" => {
                for (k, d) in diff {
                    let merged_old = data.get(&k).and_then(|e| e.get("old").cloned()).unwrap_or_else(|| d["old"].clone());
                    if merged_old == d["new"] {
                        data.remove(&k); // changed back: nothing to push for this field
                    } else {
                        data.insert(k, json!({ "old": merged_old, "new": d["new"] }));
                    }
                }
                if data.is_empty() {
                    tx.execute("delete from outbox where id = ?1", [op_id])?;
                    return Ok(());
                }
            }
            _ => return push_op(tx, t, id, "update", &Value::Object(diff)),
        }
        tx.execute("update outbox set data = ?1, ts = ?2 where id = ?3", params![Value::Object(data).to_string(), now(), op_id])?;
        return Ok(());
    }
    push_op(tx, t, id, "update", &Value::Object(diff))
}

/// Deletes the row (children cascade locally, as on the server) and queues it.
pub fn delete(tx: &Transaction, t: &Table, id: i64) -> Result<bool> {
    if !apply_delete(tx, t, id)? {
        return Ok(false);
    }
    push_op(tx, t, id, "delete", &json!({}))?;
    Ok(true)
}

pub fn pending_count(conn: &Connection) -> Result<i64> {
    Ok(conn.query_row("select count(*) from outbox", [], |r| r.get(0))?)
}

/// True once the first full download has happened.
pub fn has_snapshot(conn: &Connection) -> Result<bool> {
    Ok(conn.query_row("select exists(select 1 from meta where key = 'last_pull')", [], |r| r.get(0))?)
}

pub fn table(name: &str) -> Result<&'static Table> {
    schema::table(name).ok_or_else(|| msg(format!("unknown table {name}")))
}
