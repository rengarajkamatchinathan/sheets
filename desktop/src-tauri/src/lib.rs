mod config;
mod error;
mod remote;

use error::Result;
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConfigInfo {
    has_db_url: bool,
}

#[tauri::command]
fn get_config() -> Result<ConfigInfo> {
    Ok(ConfigInfo { has_db_url: config::db_url()?.is_some() })
}

/// Verifies the connection string against the database before saving it.
#[tauri::command]
async fn set_db_url(url: String) -> Result<()> {
    remote::verify(&url).await?;
    config::set_db_url(&url)
}

#[tauri::command]
fn clear_db_url() -> Result<()> {
    config::clear_db_url()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_config, set_db_url, clear_db_url])
        .run(tauri::generate_context!())
        .expect("error while running the app");
}
