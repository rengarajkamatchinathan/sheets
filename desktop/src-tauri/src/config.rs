//! Secrets and settings live in the OS keychain (Windows Credential Manager, macOS Keychain,
//! Linux Secret Service), never in a file.

use crate::error::Result;

const SERVICE: &str = "dsa-log-desktop";
const DB_URL: &str = "database-url";
const SITE_URL: &str = "site-url";
const REVALIDATE_SECRET: &str = "revalidate-secret";

fn get(key: &str) -> Result<Option<String>> {
    match keyring::Entry::new(SERVICE, key)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

fn set(key: &str, value: &str) -> Result<()> {
    Ok(keyring::Entry::new(SERVICE, key)?.set_password(value)?)
}

fn clear(key: &str) -> Result<()> {
    match keyring::Entry::new(SERVICE, key)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.into()),
    }
}

/// Empty value = remove it.
fn set_or_clear(key: &str, value: &str) -> Result<()> {
    if value.trim().is_empty() {
        clear(key)
    } else {
        set(key, value.trim())
    }
}

pub fn db_url() -> Result<Option<String>> {
    get(DB_URL)
}

pub fn set_db_url(url: &str) -> Result<()> {
    set(DB_URL, url)
}

pub fn clear_db_url() -> Result<()> {
    clear(DB_URL)
}

/// The deployed web app, e.g. https://dsa-log.vercel.app (for cache revalidation).
pub fn site_url() -> Result<Option<String>> {
    get(SITE_URL)
}

pub fn revalidate_secret() -> Result<Option<String>> {
    get(REVALIDATE_SECRET)
}

pub fn set_site(site_url: &str, secret: Option<&str>) -> Result<()> {
    set_or_clear(SITE_URL, site_url)?;
    if let Some(s) = secret {
        set_or_clear(REVALIDATE_SECRET, s)?;
    }
    Ok(())
}
