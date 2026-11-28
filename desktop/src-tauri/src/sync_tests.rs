//! Sync against a real Postgres, inside a throwaway schema that is dropped afterwards.
//!
//!   SYNC_TEST_DATABASE_URL=postgresql://... cargo test sync -- --ignored --nocapture
//!
//! Use a local/dev database (e.g. `docker run -e POSTGRES_PASSWORD=pg -p 5432:5432 postgres:17`),
//! or a Neon branch — never point it at data you care about without reason; it only touches its
//! own schema, but still.

use std::sync::Mutex;

use rusqlite::Connection;
use serde_json::{json, Map};
use tokio_postgres::Client;

use super::*;
use crate::actions::{self, NewProblemInput, SnippetInput, TabRef, TabSync};

const SERVER_DDL: &str = r#"
create type difficulty as enum ('Easy', 'Medium', 'Hard');
create type status as enum ('Todo', 'Attempted', 'Solved');
create table topics (
  id serial primary key, name text not null, slug text not null unique,
  description text not null default '', sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create table patterns (
  id serial primary key, topic_id integer not null references topics(id) on delete cascade,
  name text not null, sort_order integer not null default 0, created_at timestamptz not null default now()
);
create table problems (
  id serial primary key,
  topic_id integer not null references topics(id) on delete cascade,
  pattern_id integer references patterns(id) on delete set null,
  starred boolean not null default false, title text not null, url text not null default '',
  lc_number integer, difficulty difficulty not null default 'Medium', status status not null default 'Todo',
  tags text[] not null default '{}', notes text not null default '', description text not null default '',
  time_taken_min integer, sort_order integer not null default 0,
  solved_at timestamptz, last_viewed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table snippets (
  id serial primary key, problem_id integer not null references problems(id) on delete cascade,
  name text not null, language text not null default 'python', code text not null default '',
  time_complexity text not null default '', space_complexity text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into topics (name, slug) values ('Arrays', 'arrays');
insert into problems (topic_id, title, difficulty) values (1, 'Two Sum', 'Easy');
"#;

async fn server() -> Option<(Client, String)> {
    let url = std::env::var("SYNC_TEST_DATABASE_URL").ok()?;
    let client = crate::remote::connect(&url).await.expect("connect");
    // Leftovers from a run that panicked midway.
    for r in client.query("select nspname from pg_namespace where nspname like 'desktop_test_%'", &[]).await.unwrap() {
        let old: String = r.get(0);
        client.batch_execute(&format!("drop schema {old} cascade")).await.unwrap();
    }
    let schema = format!("desktop_test_{}", chrono::Utc::now().timestamp_millis());
    client.batch_execute(&format!("create schema {schema}; set search_path to {schema};")).await.unwrap();
    client.batch_execute(SERVER_DDL).await.unwrap();
    Some((client, schema))
}

fn local_db() -> Mutex<Connection> {
    let c = Connection::open_in_memory().unwrap();
    local::init(&c).unwrap();
    Mutex::new(c)
}

async fn one<T: for<'a> tokio_postgres::types::FromSql<'a>>(c: &Client, sql: &str) -> T {
    c.query_one(sql, &[]).await.unwrap().get(0)
}

fn local_one<T: rusqlite::types::FromSql>(db: &Mutex<Connection>, sql: &str) -> T {
    db.lock().unwrap().query_row(sql, [], |r| r.get(0)).unwrap()
}

fn patch(v: serde_json::Value) -> Map<String, serde_json::Value> {
    v.as_object().unwrap().clone()
}

fn no_tabs() -> TabSync {
    TabSync { order: vec![], changed: vec![] }
}

#[tokio::test]
#[ignore]
async fn sync_scenarios() {
    let Some((mut pg, schema)) = server().await else {
        eprintln!("SYNC_TEST_DATABASE_URL not set; skipping");
        return;
    };
    let db = local_db();
    scenarios(&mut pg, &db).await;
    // (If a scenario panics, the schema is left behind and dropped by the next run.)
    pg.batch_execute(&format!("drop schema {schema} cascade")).await.unwrap();
}

async fn scenarios(pg: &mut Client, db: &Mutex<Connection>) {
    // 1. First pull brings the server rows down.
    run(db, pg).await.unwrap();
    assert_eq!(local_one::<String>(db, "select title from problems where id = 1"), "Two Sum");
    let two_sum = 1i64;

    // 2. Rows created offline reach the server with their foreign keys translated.
    let (topic_local, problem_local) = {
        let mut c = db.lock().unwrap();
        actions::create_topic(&mut c, "Graphs", "").unwrap();
        let t: i64 = c.query_row("select id from topics where slug = 'graphs'", [], |r| r.get(0)).unwrap();
        let p = actions::create_problem(
            &mut c,
            NewProblemInput {
                topic_id: t,
                title: "Clone Graph".into(),
                url: String::new(),
                difficulty: "Medium".into(),
                lc_number: Some(133),
                pattern_id: None,
                new_pattern_name: Some("BFS".into()),
            },
        )
        .unwrap();
        actions::update_problem(
            &mut c,
            p,
            patch(json!({ "tags": ["bfs"] })),
            TabSync {
                order: vec![TabRef { key: "k".into(), id: None }],
                changed: vec![SnippetInput {
                    key: "k".into(),
                    id: None,
                    name: "Solution".into(),
                    code: "class S {}".into(),
                    time_complexity: "O(V+E)".into(),
                    space_complexity: "O(V)".into(),
                }],
            },
        )
        .unwrap();
        (t, p)
    };
    assert!(topic_local < 0 && problem_local < 0);
    let r = run(db, pg).await.unwrap();
    assert_eq!(r.dropped, 0, "{r:?}");
    assert!(r.tags.contains(&"stats".to_string()));
    let (pid, pattern_ok, tags): (i32, bool, Vec<String>) = {
        let row = pg
            .query_one(
                "select p.id, p.pattern_id = (select id from patterns where name = 'BFS'), p.tags
                 from problems p join topics t on t.id = p.topic_id where t.slug = 'graphs'",
                &[],
            )
            .await
            .unwrap();
        (row.get(0), row.get(1), row.get(2))
    };
    assert!(pattern_ok);
    assert_eq!(tags, vec!["bfs"]);
    assert_eq!(one::<String>(pg, &format!("select code from snippets where problem_id = {pid}")).await, "class S {}");
    assert_eq!(local_one::<i64>(db, "select count(*) from outbox"), 0);
    assert_eq!(local_one::<i64>(db, "select min(id) from problems"), 1, "local copy now uses server ids");
    assert_eq!(local::resolve(&db.lock().unwrap(), "problems", problem_local).unwrap(), pid as i64);

    // 3. Different fields edited on each side: both survive.
    pg.execute("update problems set notes = '<p>web</p>', updated_at = now() where id = 1", &[]).await.unwrap();
    actions::set_status(&mut db.lock().unwrap(), two_sum, "Solved").unwrap();
    run(db, pg).await.unwrap();
    assert_eq!(one::<String>(pg, "select status::text from problems where id = 1").await, "Solved");
    assert_eq!(one::<String>(pg, "select notes from problems where id = 1").await, "<p>web</p>");
    assert_eq!(local_one::<String>(db, "select notes from problems where id = 1"), "<p>web</p>");
    assert!(one::<Option<String>>(pg, "select solved_at::text from problems where id = 1").await.is_some());

    // 4. Same field on both sides, web edited later: web wins, desktop text kept as a conflict copy.
    actions::update_problem(&mut db.lock().unwrap(), two_sum, patch(json!({ "notes": "<p>desk</p>" })), no_tabs()).unwrap();
    pg.execute("update problems set notes = '<p>web2</p>', updated_at = now() + interval '1 hour' where id = 1", &[]).await.unwrap();
    let r = run(db, pg).await.unwrap();
    assert_eq!(r.conflicts, 1);
    assert_eq!(one::<String>(pg, "select notes from problems where id = 1").await, "<p>web2</p>");
    assert_eq!(local_one::<String>(db, "select lost_value || '|' || lost_side from conflicts order by id desc limit 1"), "<p>desk</p>|desktop");

    // 5. Same field, desktop edited later: desktop wins, web text kept.
    pg.execute("update problems set notes = '<p>web3</p>', updated_at = now() - interval '2 hours' where id = 1", &[]).await.unwrap();
    // (desktop still believes the notes are web2 — it hasn't pulled since)
    actions::update_problem(&mut db.lock().unwrap(), two_sum, patch(json!({ "notes": "<p>desk2</p>" })), no_tabs()).unwrap();
    let r = run(db, pg).await.unwrap();
    assert_eq!(r.conflicts, 1);
    assert_eq!(one::<String>(pg, "select notes from problems where id = 1").await, "<p>desk2</p>");
    assert_eq!(local_one::<String>(db, "select lost_value || '|' || lost_side from conflicts order by id desc limit 1"), "<p>web3</p>|web");

    // 6. Edited on desktop, deleted on the web: deleted wins, the edit is dropped quietly.
    actions::set_starred(&mut db.lock().unwrap(), two_sum, true).unwrap();
    pg.execute("delete from problems where id = 1", &[]).await.unwrap();
    let r = run(db, pg).await.unwrap();
    assert_eq!(r.dropped, 1);
    assert_eq!(local_one::<i64>(db, "select count(*) from problems where id = 1"), 0);

    // 7. Deleted on desktop: gone on the server, children cascade.
    let graphs: i64 = local_one(db, "select id from topics where slug = 'graphs'");
    actions::delete_topic(&mut db.lock().unwrap(), graphs).unwrap();
    run(db, pg).await.unwrap();
    assert_eq!(one::<i64>(pg, "select count(*) from topics where slug = 'graphs'").await, 0);
    assert_eq!(one::<i64>(pg, "select count(*) from snippets").await, 0);

    // 8. A change made while offline survives a failed push and goes out next time.
    actions::create_topic(&mut db.lock().unwrap(), "Heaps", "").unwrap();
    let mut broken = crate::remote::connect(&std::env::var("SYNC_TEST_DATABASE_URL").unwrap()).await.unwrap();
    // A schema that doesn't exist → no tables → the round fails without dropping the op.
    // (Never the default search_path: on a real database that's the live data.)
    broken.batch_execute("set search_path to desktop_test_does_not_exist").await.unwrap();
    assert!(run(db, &mut broken).await.is_err());
    assert_eq!(local_one::<i64>(db, "select count(*) from outbox"), 1);
    run(db, pg).await.unwrap();
    assert_eq!(one::<i64>(pg, "select count(*) from topics where slug = 'heaps'").await, 1);
}
