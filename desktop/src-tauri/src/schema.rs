//! The four tables, described once. Drives the local SQLite schema, the outbox,
//! and (in sync) the Postgres statements — so a column added on the web only needs adding here.
//!
//! Must match `src/db/schema.ts` in the web app (which owns the real schema via drizzle-kit).

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Int,
    Text,
    Bool,
    /// RFC 3339 UTC text locally (`2026-01-31T09:15:00.000Z`), timestamptz on the server.
    Ts,
    /// JSON array text locally, text[] on the server.
    TextArray,
    /// Text locally, a Postgres enum on the server (the name of the enum type).
    Enum(&'static str),
}

#[derive(Debug, Clone, Copy)]
pub struct Col {
    pub name: &'static str,
    pub kind: Kind,
    pub nullable: bool,
    /// Foreign key: the table this id points at (ids need translating local → server).
    pub refs: Option<&'static str>,
}

const fn col(name: &'static str, kind: Kind) -> Col {
    Col { name, kind, nullable: false, refs: None }
}
const fn opt(name: &'static str, kind: Kind) -> Col {
    Col { name, kind, nullable: true, refs: None }
}
const fn fk(name: &'static str, table: &'static str, nullable: bool) -> Col {
    Col { name, kind: Kind::Int, nullable, refs: Some(table) }
}

#[derive(Debug)]
pub struct Table {
    pub name: &'static str,
    /// Every column except `id`.
    pub cols: &'static [Col],
    /// Server-side row version used to decide "latest wins" (None = no such column).
    pub updated_at: Option<&'static str>,
}

impl Table {
    pub fn col(&self, name: &str) -> Option<&'static Col> {
        self.cols.iter().find(|c| c.name == name)
    }
}

pub const TOPICS: Table = Table {
    name: "topics",
    cols: &[
        col("name", Kind::Text),
        col("slug", Kind::Text),
        col("description", Kind::Text),
        col("sort_order", Kind::Int),
        col("created_at", Kind::Ts),
    ],
    updated_at: None,
};

pub const PATTERNS: Table = Table {
    name: "patterns",
    cols: &[
        fk("topic_id", "topics", false),
        col("name", Kind::Text),
        col("sort_order", Kind::Int),
        col("created_at", Kind::Ts),
    ],
    updated_at: None,
};

pub const PROBLEMS: Table = Table {
    name: "problems",
    cols: &[
        fk("topic_id", "topics", false),
        fk("pattern_id", "patterns", true),
        col("starred", Kind::Bool),
        col("title", Kind::Text),
        col("url", Kind::Text),
        opt("lc_number", Kind::Int),
        col("difficulty", Kind::Enum("difficulty")),
        col("status", Kind::Enum("status")),
        col("tags", Kind::TextArray),
        col("notes", Kind::Text),
        col("description", Kind::Text),
        opt("time_taken_min", Kind::Int),
        col("sort_order", Kind::Int),
        opt("solved_at", Kind::Ts),
        opt("last_viewed_at", Kind::Ts),
        col("created_at", Kind::Ts),
        col("updated_at", Kind::Ts),
    ],
    updated_at: Some("updated_at"),
};

pub const SNIPPETS: Table = Table {
    name: "snippets",
    cols: &[
        fk("problem_id", "problems", false),
        col("name", Kind::Text),
        col("language", Kind::Text),
        col("code", Kind::Text),
        col("time_complexity", Kind::Text),
        col("space_complexity", Kind::Text),
        col("sort_order", Kind::Int),
        col("created_at", Kind::Ts),
        col("updated_at", Kind::Ts),
    ],
    updated_at: Some("updated_at"),
};

/// Parent tables first (insert order); reverse for deletes.
pub const ALL: [&Table; 4] = [&TOPICS, &PATTERNS, &PROBLEMS, &SNIPPETS];

pub fn table(name: &str) -> Option<&'static Table> {
    ALL.into_iter().find(|t| t.name == name)
}

/// Local SQLite schema. Same table/column names as the server.
pub const LOCAL_DDL: &str = r#"
create table if not exists topics (
  id integer primary key,
  name text not null,
  slug text not null,
  description text not null default '',
  sort_order integer not null default 0,
  created_at text not null
);

create table if not exists patterns (
  id integer primary key,
  topic_id integer not null references topics(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at text not null
);
create index if not exists patterns_topic_idx on patterns(topic_id);

create table if not exists problems (
  id integer primary key,
  topic_id integer not null references topics(id) on delete cascade,
  pattern_id integer references patterns(id) on delete set null,
  starred integer not null default 0,
  title text not null,
  url text not null default '',
  lc_number integer,
  difficulty text not null default 'Medium',
  status text not null default 'Todo',
  tags text not null default '[]',
  notes text not null default '',
  description text not null default '',
  time_taken_min integer,
  sort_order integer not null default 0,
  solved_at text,
  last_viewed_at text,
  created_at text not null,
  updated_at text not null
);
create index if not exists problems_topic_idx on problems(topic_id);
create index if not exists problems_pattern_idx on problems(pattern_id);

create table if not exists snippets (
  id integer primary key,
  problem_id integer not null references problems(id) on delete cascade,
  name text not null,
  language text not null default 'python',
  code text not null default '',
  time_complexity text not null default '',
  space_complexity text not null default '',
  sort_order integer not null default 0,
  created_at text not null,
  updated_at text not null
);
create index if not exists snippets_problem_idx on snippets(problem_id);

-- Local changes not yet on the server, oldest first.
--   insert: data = { col: value, ... }        (row_id is a negative local id)
--   update: data = { col: { "old": v, "new": v }, ... }
--   delete: data = {}
create table if not exists outbox (
  id integer primary key autoincrement,
  tbl text not null,
  row_id integer not null,
  kind text not null check (kind in ('insert', 'update', 'delete')),
  data text not null,
  ts text not null
);
create index if not exists outbox_row_idx on outbox(tbl, row_id);

-- Rows created offline get negative ids; once pushed, the server id is recorded here so
-- anything still holding the local id (a URL, an open editor) keeps working.
create table if not exists id_map (
  tbl text not null,
  local_id integer not null,
  server_id integer not null,
  primary key (tbl, local_id)
);

-- When notes were edited both here and on the web, the version that lost is kept here.
create table if not exists conflicts (
  id integer primary key autoincrement,
  problem_id integer not null,
  field text not null,
  lost_value text not null,
  lost_side text not null check (lost_side in ('desktop', 'web')),
  created_at text not null
);

create table if not exists meta (
  key text primary key,
  value text not null
);
"#;
