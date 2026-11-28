//! Connection to the shared Neon Postgres database (the same one the web app uses).

use std::time::Duration;

use postgres_native_tls::MakeTlsConnector;
use tokio_postgres::Client;

use crate::error::{msg, Result};

/// Opens a TLS connection. The connection task runs in the background until the client is dropped.
pub async fn connect(url: &str) -> Result<Client> {
    let config: tokio_postgres::Config = url.parse().map_err(|e| msg(format!("invalid connection string: {e}")))?;
    let tls = MakeTlsConnector::new(native_tls::TlsConnector::new()?);

    let (client, connection) = tokio::time::timeout(Duration::from_secs(15), config.connect(tls))
        .await
        .map_err(|_| msg("timed out connecting to the database"))??;

    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("postgres connection closed: {e}");
        }
    });
    Ok(client)
}

/// Checks the URL points at a database that has the web app's tables.
pub async fn verify(url: &str) -> Result<()> {
    let client = connect(url).await?;
    let row = client
        .query_one(
            "select count(*) from information_schema.tables
             where table_schema = 'public' and table_name in ('topics', 'patterns', 'problems', 'snippets')",
            &[],
        )
        .await?;
    let found: i64 = row.get(0);
    if found < 4 {
        return Err(msg("connected, but this database doesn't have the DSA Log tables (topics, patterns, problems, snippets)"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    /// Live check against the real database: `DATABASE_URL=... cargo test -- --ignored`
    #[tokio::test]
    #[ignore]
    async fn verify_live() {
        let url = std::env::var("DATABASE_URL").expect("DATABASE_URL not set");
        super::verify(&url).await.unwrap();
    }
}
