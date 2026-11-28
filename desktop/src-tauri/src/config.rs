//! The database URL lives in the OS keychain (Windows Credential Manager, macOS Keychain,
//! Linux Secret Service), never in a file.

use crate::error::Result;

const SERVICE: &str = "dsa-log-desktop";
const DB_URL: &str = "database-url";

fn entry() -> Result<keyring::Entry> {
    Ok(keyring::Entry::new(SERVICE, DB_URL)?)
}

pub fn db_url() -> Result<Option<String>> {
    match entry()?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn set_db_url(url: &str) -> Result<()> {
    Ok(entry()?.set_password(url)?)
}

pub fn clear_db_url() -> Result<()> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.into()),
    }
}
