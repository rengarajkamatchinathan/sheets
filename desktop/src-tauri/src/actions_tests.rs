use super::*;

fn db() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    local::init(&conn).unwrap();
    conn
}

fn outbox(conn: &Connection) -> Vec<(String, i64, String, Value)> {
    let mut st = conn.prepare("select tbl, row_id, kind, data from outbox order by id").unwrap();
    st.query_map([], |r| {
        let d: String = r.get(3)?;
        Ok((r.get(0)?, r.get(1)?, r.get(2)?, serde_json::from_str(&d).unwrap()))
    })
    .unwrap()
    .map(|r| r.unwrap())
    .collect()
}

fn no_tabs() -> TabSync {
    TabSync { order: vec![], changed: vec![] }
}

fn new_problem(conn: &mut Connection, topic: i64, title: &str) -> i64 {
    create_problem(
        conn,
        NewProblemInput {
            topic_id: topic,
            title: title.into(),
            url: String::new(),
            difficulty: "Easy".into(),
            lc_number: None,
            pattern_id: None,
            new_pattern_name: None,
        },
    )
    .unwrap()
}

fn topic_id(conn: &Connection, slug: &str) -> i64 {
    conn.query_row("select id from topics where slug = ?1", [slug], |r| r.get(0)).unwrap()
}

/// Rows as if they came from the server: positive ids, nothing in the outbox.
fn seed_server_rows(conn: &Connection) {
    conn.execute_batch(
        "insert into topics values (1, 'T', 't', '', 0, '2026-01-01T00:00:00.000Z');
         insert into problems (id, topic_id, title, created_at, updated_at)
           values (10, 1, 'P', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');",
    )
    .unwrap();
}

#[test]
fn slugify_matches_web() {
    assert_eq!(slugify("Two Pointers"), "two-pointers");
    assert_eq!(slugify("  Graphs -- Advanced! "), "graphs-advanced");
    assert_eq!(slugify("1-D DP"), "1-d-dp");
    assert_eq!(slugify("!!!"), "");
}

#[test]
fn local_ids_are_negative_and_unique() {
    let mut c = db();
    create_topic(&mut c, "Arrays", "").unwrap();
    let t = topic_id(&c, "arrays");
    let p1 = new_problem(&mut c, t, "A");
    let p2 = new_problem(&mut c, t, "B");
    assert!(t < 0 && p1 < 0 && p2 < 0);
    assert!(t != p1 && p1 != p2);
    // Same name again gets a different slug.
    assert_ne!(create_topic(&mut c, "Arrays", "").unwrap().unwrap(), "arrays");
}

#[test]
fn edits_to_an_unsynced_row_fold_into_its_insert() {
    let mut c = db();
    create_topic(&mut c, "Arrays", "").unwrap();
    let t = topic_id(&c, "arrays");
    let p = new_problem(&mut c, t, "A");
    set_status(&mut c, p, "Solved").unwrap();
    let ops = outbox(&c);
    assert_eq!(ops.len(), 2, "topic insert + problem insert only: {ops:?}");
    assert_eq!(ops[1].3["status"], "Solved");
    assert!(ops[1].3["solved_at"].is_string());
}

#[test]
fn updates_merge_and_cancel_out() {
    let mut c = db();
    seed_server_rows(&c);
    let notes = |s: &str| row(json!({ "notes": s }));

    update_problem(&mut c, 10, notes("a"), no_tabs()).unwrap();
    update_problem(&mut c, 10, notes("ab"), no_tabs()).unwrap();
    update_problem(&mut c, 10, notes("abc"), no_tabs()).unwrap();
    let ops = outbox(&c);
    assert_eq!(ops.len(), 1, "{ops:?}");
    assert_eq!(ops[0].3["notes"], json!({ "old": "", "new": "abc" }));

    // Starring then un-starring leaves no starred change behind.
    set_starred(&mut c, 10, true).unwrap();
    set_starred(&mut c, 10, false).unwrap();
    let ops = outbox(&c);
    assert_eq!(ops.len(), 1);
    assert!(ops[0].3.get("starred").is_none(), "{ops:?}");

    // Once an op is being pushed, new edits start a fresh op.
    let first: i64 = c.query_row("select max(id) from outbox", [], |r| r.get(0)).unwrap();
    local::PUSHING_UPTO.store(first, std::sync::atomic::Ordering::SeqCst);
    update_problem(&mut c, 10, notes("abcd"), no_tabs()).unwrap();
    local::PUSHING_UPTO.store(0, std::sync::atomic::Ordering::SeqCst);
    let ops = outbox(&c);
    assert_eq!(ops.len(), 2);
    assert_eq!(ops[1].3["notes"], json!({ "old": "abc", "new": "abcd" }));
}

#[test]
fn solved_at_is_kept_once_set_and_cleared_otherwise() {
    let mut c = db();
    create_topic(&mut c, "T", "").unwrap();
    let t = topic_id(&c, "t");
    let p = new_problem(&mut c, t, "P");
    set_status(&mut c, p, "Solved").unwrap();
    let first: String = c.query_row("select solved_at from problems where id = ?1", [p], |r| r.get(0)).unwrap();
    set_status(&mut c, p, "Solved").unwrap();
    let again: String = c.query_row("select solved_at from problems where id = ?1", [p], |r| r.get(0)).unwrap();
    assert_eq!(first, again);
    set_status(&mut c, p, "Todo").unwrap();
    let cleared: Option<String> = c.query_row("select solved_at from problems where id = ?1", [p], |r| r.get(0)).unwrap();
    assert_eq!(cleared, None);
}

#[test]
fn update_problem_validates_and_normalizes() {
    let mut c = db();
    seed_server_rows(&c);
    assert!(update_problem(&mut c, 10, row(json!({ "status": "Done" })), no_tabs()).is_err());
    assert!(update_problem(&mut c, 99, row(json!({ "title": "x" })), no_tabs()).is_err());
    update_problem(&mut c, 10, row(json!({ "title": "   ", "tags": [" heap ", "heap", "", "bfs"], "lcNumber": null })), no_tabs()).unwrap();
    let (title, tags): (String, String) = c.query_row("select title, tags from problems where id = 10", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
    assert_eq!(title, "Untitled");
    assert_eq!(tags, r#"["heap","bfs"]"#);
}

#[test]
fn tab_sync_inserts_updates_deletes_and_orders() {
    let mut c = db();
    create_topic(&mut c, "T", "").unwrap();
    let t = topic_id(&c, "t");
    let p = new_problem(&mut c, t, "P");
    let tab = |key: &str, id: Option<i64>, code: &str| SnippetInput {
        key: key.into(),
        id,
        name: key.into(),
        code: code.into(),
        time_complexity: " O(n) ".into(),
        space_complexity: String::new(),
    };
    let r = |key: &str, id: Option<i64>| TabRef { key: key.into(), id };

    let ids = update_problem(
        &mut c,
        p,
        Map::new(),
        TabSync { order: vec![r("a", None), r("b", None)], changed: vec![tab("a", None, "x"), tab("b", None, "y")] },
    )
    .unwrap();
    let (a, b) = (ids["a"], ids["b"]);

    // Reorder (b first) and edit a.
    update_problem(
        &mut c,
        p,
        Map::new(),
        TabSync { order: vec![r("b", Some(b)), r("a", Some(a))], changed: vec![tab("b", Some(b), "y"), tab("a", Some(a), "x2")] },
    )
    .unwrap();
    let rows: Vec<(i64, String, String)> = c
        .prepare("select id, code, time_complexity from snippets where problem_id = ?1 order by sort_order")
        .unwrap()
        .query_map([p], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .unwrap()
        .map(|r| r.unwrap())
        .collect();
    assert_eq!(rows, vec![(b, "y".into(), "O(n)".into()), (a, "x2".into(), "O(n)".into())]);

    // Tabs not listed are deleted.
    update_problem(&mut c, p, Map::new(), TabSync { order: vec![r("a", Some(a))], changed: vec![] }).unwrap();
    let n: i64 = c.query_row("select count(*) from snippets", [], |r| r.get(0)).unwrap();
    assert_eq!(n, 1);
}

#[test]
fn move_problem_renumbers_target_group() {
    let mut c = db();
    create_topic(&mut c, "T", "").unwrap();
    let t = topic_id(&c, "t");
    create_pattern(&mut c, t, "Window").unwrap();
    let pat: i64 = c.query_row("select id from patterns", [], |r| r.get(0)).unwrap();
    let a = new_problem(&mut c, t, "A");
    let b = new_problem(&mut c, t, "B");
    let x = new_problem(&mut c, t, "X");
    move_problem(&mut c, a, Some(pat), None).unwrap();
    move_problem(&mut c, b, Some(pat), None).unwrap();
    move_problem(&mut c, x, Some(pat), Some(a)).unwrap();
    let order: Vec<i64> = c
        .prepare("select id from problems where pattern_id = ?1 order by sort_order")
        .unwrap()
        .query_map([pat], |r| r.get(0))
        .unwrap()
        .map(|r| r.unwrap())
        .collect();
    assert_eq!(order, vec![x, a, b]);

    // A pattern from another topic is rejected.
    create_topic(&mut c, "Other", "").unwrap();
    let other = topic_id(&c, "other");
    create_pattern(&mut c, other, "Elsewhere").unwrap();
    let foreign: i64 = c.query_row("select id from patterns where topic_id = ?1", [other], |r| r.get(0)).unwrap();
    assert!(move_problem(&mut c, a, Some(foreign), None).is_err());
}

#[test]
fn shift_pattern_swaps_neighbours() {
    let mut c = db();
    create_topic(&mut c, "T", "").unwrap();
    let t = topic_id(&c, "t");
    for n in ["A", "B", "C"] {
        create_pattern(&mut c, t, n).unwrap();
    }
    let c_id: i64 = c.query_row("select id from patterns where name = 'C'", [], |r| r.get(0)).unwrap();
    shift_pattern(&mut c, c_id, -1).unwrap();
    shift_pattern(&mut c, c_id, -1).unwrap();
    shift_pattern(&mut c, c_id, -1).unwrap(); // already first: no-op
    let names: Vec<String> = c
        .prepare("select name from patterns order by sort_order")
        .unwrap()
        .query_map([], |r| r.get(0))
        .unwrap()
        .map(|r| r.unwrap())
        .collect();
    assert_eq!(names, ["C", "A", "B"]);
}

#[test]
fn deleting_pattern_unsorts_and_topic_cascades() {
    let mut c = db();
    create_topic(&mut c, "T", "").unwrap();
    let t = topic_id(&c, "t");
    create_pattern(&mut c, t, "W").unwrap();
    let pat: i64 = c.query_row("select id from patterns", [], |r| r.get(0)).unwrap();
    let p = new_problem(&mut c, t, "A");
    move_problem(&mut c, p, Some(pat), None).unwrap();
    delete_pattern(&mut c, pat).unwrap();
    let pid: Option<i64> = c.query_row("select pattern_id from problems where id = ?1", [p], |r| r.get(0)).unwrap();
    assert_eq!(pid, None);
    delete_topic(&mut c, t).unwrap();
    let n: i64 = c.query_row("select count(*) from problems", [], |r| r.get(0)).unwrap();
    assert_eq!(n, 0);
}

#[test]
fn resolves_ids_mapped_after_sync() {
    let mut c = db();
    seed_server_rows(&c);
    c.execute("insert into id_map values ('problems', -3, 10)", []).unwrap();
    set_starred(&mut c, -3, true).unwrap();
    let s: bool = c.query_row("select starred from problems where id = 10", [], |r| r.get(0)).unwrap();
    assert!(s);
}

#[test]
fn queries_return_web_shapes() {
    let mut c = db();
    seed_server_rows(&c);
    set_status(&mut c, 10, "Solved").unwrap();
    mark_viewed(&mut c, 10).unwrap();
    let d = crate::queries::dashboard(&c).unwrap();
    assert_eq!(d["difficulty"][1]["solved"], 1); // seeded problem defaults to Medium
    assert_eq!(d["solvedAt"].as_array().unwrap().len(), 1);
    assert_eq!(d["recent"][0]["topicSlug"], "t");
    assert!(d["nextTodo"].is_null());

    let page = crate::queries::topic_page(&c, "t").unwrap();
    assert_eq!(page["problems"][0]["hasNotes"], false);
    assert_eq!(page["problems"][0]["starred"], false);

    let p = crate::queries::problem_page(&c, 10).unwrap();
    assert_eq!(p["problem"]["topicId"], 1);
    assert_eq!(p["problem"]["status"], "Solved");
    assert!(p["problem"]["solvedAt"].is_string());

    assert_eq!(crate::queries::search(&c, "p").unwrap().len(), 1);
    assert_eq!(crate::queries::search(&c, "%").unwrap().len(), 0);
}

#[test]
fn has_notes_rule() {
    use crate::queries::has_real_notes;
    assert!(!has_real_notes(""));
    assert!(!has_real_notes("<p>&nbsp;</p>"));
    assert!(!has_real_notes("<h2>Intuition</h2><h2>Approach</h2><h2>Edge cases</h2><h2>Mistakes</h2>"));
    assert!(has_real_notes("<p>use a heap</p>"));
}
