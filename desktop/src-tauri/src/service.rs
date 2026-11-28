//! Background sync loop: runs a round shortly after each local change, every minute while
//! online, and every 15 s while offline (so it catches the connection coming back).
//! Reports its state to the window via the `sync-status` event.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::sync::Notify;

use crate::error::Error;
use crate::{config, local, remote, sync};

const ONLINE_EVERY: Duration = Duration::from_secs(60);
const OFFLINE_EVERY: Duration = Duration::from_secs(15);
/// Wait this long after a change before syncing, so a burst of edits goes out as one round.
const DEBOUNCE: Duration = Duration::from_millis(1500);

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum State {
    Setup,
    Syncing,
    Synced,
    Offline,
    Error,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub state: State,
    pub pending: i64,
    pub conflicts: i64,
    pub last_sync: Option<String>,
    pub message: Option<String>,
    /// False until the first full download has finished.
    pub has_snapshot: bool,
}

pub struct Service {
    pub poke: Arc<Notify>,
    status: Mutex<Status>,
}

impl Service {
    pub fn new(poke: Arc<Notify>) -> Self {
        Service {
            poke,
            status: Mutex::new(Status { state: State::Syncing, pending: 0, conflicts: 0, last_sync: None, message: None, has_snapshot: false }),
        }
    }

    pub fn status(&self, conn: &Connection) -> Status {
        let mut s = self.status.lock().unwrap().clone();
        refresh_counts(&mut s, conn);
        s
    }

    fn set(&self, app: &AppHandle, conn: &Mutex<Connection>, state: State, message: Option<String>) -> Status {
        let mut s = self.status.lock().unwrap();
        s.state = state;
        s.message = message;
        if let Ok(c) = conn.lock() {
            refresh_counts(&mut s, &c);
        }
        let out = s.clone();
        drop(s);
        let _ = app.emit("sync-status", &out);
        out
    }
}

fn refresh_counts(s: &mut Status, conn: &Connection) {
    s.pending = local::pending_count(conn).unwrap_or(0);
    s.conflicts = conn.query_row("select count(*) from conflicts", [], |r| r.get(0)).unwrap_or(0);
    s.has_snapshot = local::has_snapshot(conn).unwrap_or(false);
    s.last_sync = conn.query_row("select value from meta where key = 'last_pull'", [], |r| r.get(0)).ok();
}

/// A connection problem (try again later) vs. a real error worth showing.
fn is_offline(e: &Error) -> bool {
    match e {
        Error::Postgres(pg) => pg.code().is_none(),
        Error::Tls(_) | Error::Io(_) => true,
        Error::Msg(m) => m.contains("timed out"),
        _ => false,
    }
}

pub fn start(app: AppHandle, db: Arc<Mutex<Connection>>, svc: Arc<Service>) {
    tauri::async_runtime::spawn(async move {
        let mut wait = Duration::ZERO; // first round right away
        loop {
            tokio::select! {
                _ = tokio::time::sleep(wait) => {}
                _ = svc.poke.notified() => tokio::time::sleep(DEBOUNCE).await,
            }

            let url = match config::db_url() {
                Ok(Some(u)) => u,
                _ => {
                    svc.set(&app, &db, State::Setup, None);
                    wait = OFFLINE_EVERY;
                    continue;
                }
            };

            svc.set(&app, &db, State::Syncing, None);
            let result = async {
                let mut client = remote::connect(&url).await?;
                sync::run(&db, &mut client).await
            }
            .await;

            match result {
                Ok(report) => {
                    let msg = (report.dropped > 0).then(|| format!("{} change(s) no longer applied and were skipped", report.dropped));
                    svc.set(&app, &db, State::Synced, msg);
                    let _ = app.emit("data-synced", ());
                    if !report.tags.is_empty() {
                        tauri::async_runtime::spawn(revalidate(report.tags));
                    }
                    wait = ONLINE_EVERY;
                }
                Err(e) if is_offline(&e) => {
                    svc.set(&app, &db, State::Offline, None);
                    wait = OFFLINE_EVERY;
                }
                Err(e) => {
                    eprintln!("sync failed: {e}");
                    svc.set(&app, &db, State::Error, Some(e.to_string()));
                    wait = OFFLINE_EVERY;
                }
            }
        }
    });
}

/// Asks the website to expire the pages showing the synced rows. Optional and best-effort:
/// without it the site still shows the changes once those pages are next rebuilt.
async fn revalidate(tags: Vec<String>) {
    let (Ok(Some(site)), Ok(Some(secret))) = (config::site_url(), config::revalidate_secret()) else { return };
    let endpoint = format!("{}/api/revalidate", site.trim_end_matches('/'));
    let client = match reqwest::Client::builder().timeout(Duration::from_secs(10)).build() {
        Ok(c) => c,
        Err(_) => return,
    };
    for chunk in tags.chunks(400) {
        let res = client.post(&endpoint).bearer_auth(&secret).json(&serde_json::json!({ "tags": chunk })).send().await;
        match res {
            Ok(r) if r.status().is_success() => {}
            Ok(r) => eprintln!("revalidate: {} responded {}", endpoint, r.status()),
            Err(e) => eprintln!("revalidate: {e}"),
        }
    }
}
