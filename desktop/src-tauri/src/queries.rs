//! Screen data from the local store — same shapes as the web app's loaders (src/lib/queries.ts),
//! with camelCase keys and timestamps as ISO strings.

use rusqlite::{Connection, OptionalExtension, Row as SqlRow};
use serde_json::{json, Map, Value};

use crate::error::Result;
use crate::local::{self, Row};
use crate::schema::PROBLEMS;

fn camel(s: &str) -> String {
    let mut out = String::new();
    let mut up = false;
    for c in s.chars() {
        if c == '_' {
            up = true;
        } else if up {
            out.extend(c.to_uppercase());
            up = false;
        } else {
            out.push(c);
        }
    }
    out
}

fn camel_row(r: Row) -> Value {
    Value::Object(r.into_iter().map(|(k, v)| (camel(&k), v)).collect::<Map<_, _>>())
}

/// Collects `select` results into JSON objects, using the given keys.
fn all(conn: &Connection, sql: &str, params: impl rusqlite::Params, keys: &[&str]) -> Result<Vec<Value>> {
    let mut st = conn.prepare(sql)?;
    let rows = st.query_map(params, |r| obj(r, keys))?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

fn obj(r: &SqlRow, keys: &[&str]) -> rusqlite::Result<Value> {
    let mut m = Map::new();
    for (i, k) in keys.iter().enumerate() {
        // Keys ending in '?' are booleans stored as 0/1.
        let (k, is_bool) = match k.strip_suffix('?') {
            Some(k) => (k, true),
            None => (*k, false),
        };
        let v: rusqlite::types::Value = r.get(i)?;
        let v = match v {
            rusqlite::types::Value::Integer(n) if is_bool => json!(n != 0),
            other => local::from_sql(crate::schema::Kind::Text, other),
        };
        m.insert(k.to_string(), v);
    }
    Ok(Value::Object(m))
}

const TOPIC_STATS: &str = "
  select t.id, t.name, t.slug, t.description,
    count(p.id),
    count(case when p.status = 'Solved' then 1 end),
    count(case when p.difficulty = 'Easy' then 1 end),
    count(case when p.difficulty = 'Medium' then 1 end),
    count(case when p.difficulty = 'Hard' then 1 end),
    (select count(*) from patterns pt where pt.topic_id = t.id)
  from topics t left join problems p on p.topic_id = t.id
  group by t.id
  order by t.sort_order, t.id";
const TOPIC_STAT_KEYS: &[&str] = &["id", "name", "slug", "description", "total", "solved", "easy", "medium", "hard", "patterns"];

const CARD: &str = "select p.id, p.title, p.difficulty, p.status, t.name, t.slug, pt.name, p.last_viewed_at
  from problems p join topics t on t.id = p.topic_id left join patterns pt on pt.id = p.pattern_id";
const CARD_KEYS: &[&str] = &["id", "title", "difficulty", "status", "topicName", "topicSlug", "patternName", "lastViewedAt"];

pub fn topics(conn: &Connection) -> Result<Vec<Value>> {
    all(conn, TOPIC_STATS, [], TOPIC_STAT_KEYS)
}

/// Dashboard. `solvedAt` is every solved timestamp; the page buckets them into days in the
/// app timezone with the web app's own date helpers.
pub fn dashboard(conn: &Connection) -> Result<Value> {
    let diff_rows = all(
        conn,
        "select difficulty, count(*), count(case when status = 'Solved' then 1 end), count(case when status = 'Attempted' then 1 end)
         from problems group by difficulty",
        [],
        &["difficulty", "total", "solved", "attempted"],
    )?;
    let difficulty: Vec<Value> = ["Easy", "Medium", "Hard"]
        .iter()
        .map(|d| {
            let r = diff_rows.iter().find(|r| r["difficulty"] == *d);
            let n = |k: &str| r.map(|r| r[k].clone()).unwrap_or(json!(0));
            json!({ "difficulty": d, "total": n("total"), "solved": n("solved"), "attempted": n("attempted") })
        })
        .collect();

    let solved_at: Vec<String> = {
        let mut st = conn.prepare("select solved_at from problems where solved_at is not null")?;
        let v = st.query_map([], |r| r.get(0))?.collect::<rusqlite::Result<_>>()?;
        v
    };

    Ok(json!({
        "topics": topics(conn)?,
        "difficulty": difficulty,
        "solvedAt": solved_at,
        "inProgress": all(conn, &format!("{CARD} where p.status = 'Attempted' order by p.updated_at desc limit 4"), [], CARD_KEYS)?,
        "nextTodo": all(
            conn,
            &format!("{CARD} where p.status = 'Todo' order by t.sort_order, t.id, pt.sort_order is null, pt.sort_order, p.sort_order, p.id limit 1"),
            [],
            CARD_KEYS,
        )?.into_iter().next(),
        "starred": all(conn, &format!("{CARD} where p.starred = 1 order by p.updated_at desc limit 5"), [], CARD_KEYS)?,
        "recent": all(conn, &format!("{CARD} where p.last_viewed_at is not null order by p.last_viewed_at desc limit 6"), [], CARD_KEYS)?,
    }))
}

/// Every topic with its patterns (new-problem dialog pickers).
pub fn topic_choices(conn: &Connection) -> Result<Vec<Value>> {
    let ts = all(conn, "select id, name, slug from topics order by sort_order, id", [], &["id", "name", "slug"])?;
    let ps = all(conn, "select id, name, topic_id from patterns order by sort_order, id", [], &["id", "name", "topicId"])?;
    Ok(ts
        .into_iter()
        .map(|mut t| {
            let pats: Vec<Value> =
                ps.iter().filter(|p| p["topicId"] == t["id"]).map(|p| json!({ "id": p["id"], "name": p["name"] })).collect();
            t["patterns"] = json!(pats);
            t
        })
        .collect())
}

/// Untouched legacy template (headings only) counts as empty — same rule as the web board.
pub fn has_real_notes(html: &str) -> bool {
    let mut text = String::new();
    let mut in_tag = false;
    for c in html.chars() {
        match c {
            '<' => in_tag = true,
            '>' if in_tag => in_tag = false,
            _ if !in_tag => text.push(c),
            _ => {}
        }
    }
    let t: String = text.replace("&nbsp;", "").chars().filter(|c| !c.is_whitespace()).collect();
    !t.is_empty() && t != "IntuitionApproachEdgecasesMistakes"
}

/// Topic page: topic + patterns + board.
pub fn topic_page(conn: &Connection, slug: &str) -> Result<Value> {
    let topic = all(
        conn,
        "select id, name, slug, description, sort_order, created_at from topics where slug = ?1",
        [slug],
        &["id", "name", "slug", "description", "sortOrder", "createdAt"],
    )?
    .into_iter()
    .next();
    let Some(topic) = topic else { return Ok(json!({ "topic": null, "patterns": [], "problems": [] })) };
    let tid = topic["id"].as_i64().unwrap_or_default();

    let patterns = all(conn, "select id, name from patterns where topic_id = ?1 order by sort_order, id", [tid], &["id", "name"])?;

    let mut st = conn.prepare(
        "select p.id, p.title, p.url, p.lc_number, p.difficulty, p.status, p.starred, p.pattern_id, p.tags, p.notes,
           exists (select 1 from snippets s where s.problem_id = p.id and length(trim(s.code)) > 0),
           length(trim(p.description)) > 0
         from problems p where p.topic_id = ?1 order by p.sort_order, p.id",
    )?;
    let problems = st
        .query_map([tid], |r| {
            let notes: String = r.get(9)?;
            let tags: String = r.get(8)?;
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "title": r.get::<_, String>(1)?,
                "url": r.get::<_, String>(2)?,
                "lcNumber": r.get::<_, Option<i64>>(3)?,
                "difficulty": r.get::<_, String>(4)?,
                "status": r.get::<_, String>(5)?,
                "starred": r.get::<_, bool>(6)?,
                "patternId": r.get::<_, Option<i64>>(7)?,
                "tags": serde_json::from_str::<Value>(&tags).unwrap_or(json!([])),
                "hasNotes": has_real_notes(&notes),
                "hasCode": r.get::<_, bool>(10)?,
                "hasDescription": r.get::<_, bool>(11)?,
            }))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(json!({ "topic": topic, "patterns": patterns, "problems": problems }))
}

/// Problem page: problem + topic + pattern name + the topic's patterns + code tabs.
/// Notes/description are sanitized by the page (web sanitize.ts) before display.
pub fn problem_page(conn: &Connection, id: i64) -> Result<Value> {
    let id = local::resolve(conn, "problems", id)?;
    let Some(problem) = local::get_all(conn, &PROBLEMS, id)? else { return Ok(Value::Null) };
    let topic_id = problem["topic_id"].as_i64().unwrap_or_default();
    let pattern_id = problem["pattern_id"].as_i64();

    let topic = all(conn, "select id, name, slug from topics where id = ?1", [topic_id], &["id", "name", "slug"])?.into_iter().next();
    let pattern_name: Option<String> = match pattern_id {
        Some(p) => conn.query_row("select name from patterns where id = ?1", [p], |r| r.get(0)).optional()?,
        None => None,
    };
    let patterns = all(conn, "select id, name from patterns where topic_id = ?1 order by sort_order, id", [topic_id], &["id", "name"])?;
    let snippets = all(
        conn,
        "select id, name, language, code, time_complexity, space_complexity from snippets where problem_id = ?1 order by sort_order, id",
        [id],
        &["id", "name", "language", "code", "timeComplexity", "spaceComplexity"],
    )?;

    Ok(json!({
        "problem": camel_row(problem),
        "topic": topic,
        "patternName": pattern_name,
        "patterns": patterns,
        "snippets": snippets,
    }))
}

/// Topics page search: title or tag contains `q` (case-insensitive).
pub fn search(conn: &Connection, q: &str) -> Result<Vec<Value>> {
    let like = format!("%{}%", q.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_"));
    let mut st = conn.prepare(
        "select p.id, p.title, p.difficulty, p.status, p.tags, t.name
         from problems p join topics t on t.id = p.topic_id
         where p.title like ?1 escape '\\' or exists (select 1 from json_each(p.tags) where value like ?1 escape '\\')
         order by p.title limit 30",
    )?;
    let rows = st
        .query_map([like], |r| {
            let tags: String = r.get(4)?;
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "title": r.get::<_, String>(1)?,
                "difficulty": r.get::<_, String>(2)?,
                "status": r.get::<_, String>(3)?,
                "tags": serde_json::from_str::<Value>(&tags).unwrap_or(json!([])),
                "topicName": r.get::<_, String>(5)?,
            }))
        })?
        .collect::<rusqlite::Result<_>>()?;
    Ok(rows)
}
