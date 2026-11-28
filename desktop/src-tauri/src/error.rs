use serde::{Serialize, Serializer};

/// Errors returned to the frontend; serialized as a plain message string.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{0}")]
    Msg(String),
    #[error("keychain: {0}")]
    Keyring(#[from] keyring::Error),
    #[error("database: {0}")]
    Postgres(#[from] tokio_postgres::Error),
    #[error("tls: {0}")]
    Tls(#[from] native_tls::Error),
}

impl Serialize for Error {
    fn serialize<S: Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, Error>;

pub fn msg(m: impl Into<String>) -> Error {
    Error::Msg(m.into())
}
