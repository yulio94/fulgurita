use rusqlite::{params, Connection};
use std::fs;
use std::path::Path;

/// Creates (or opens) the SQLite database at `{project_path}/.fulgurita/fulgurita.db`,
/// runs the schema migrations, and seeds initial metadata.
///
/// Returns the open `Connection` so callers can reuse it for queries.
pub fn initialize_db(project_path: &Path) -> Result<Connection, String> {
    let fulgurita_dir = project_path.join(".fulgurita");
    fs::create_dir_all(&fulgurita_dir)
        .map_err(|e| format!("Failed to create .fulgurita directory: {e}"))?;

    let db_path = fulgurita_dir.join("fulgurita.db");
    let conn =
        Connection::open(&db_path).map_err(|e| format!("Failed to open database: {e}"))?;

    // Drop legacy table from pre-release versions
    conn.execute_batch("DROP TABLE IF EXISTS chapter_stats;")
        .map_err(|e| format!("Failed to drop legacy tables: {e}"))?;

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS writing_sessions (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at       TEXT    NOT NULL,
            ended_at         TEXT,
            duration_seconds INTEGER DEFAULT 0,
            words_written    INTEGER DEFAULT 0,
            chapter_id       TEXT
        );

        CREATE TABLE IF NOT EXISTS word_counts (
            chapter_id TEXT    PRIMARY KEY,
            filename   TEXT    NOT NULL,
            word_count INTEGER DEFAULT 0,
            updated_at TEXT    NOT NULL
        );

        CREATE TABLE IF NOT EXISTS project_meta (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        ",
    )
    .map_err(|e| format!("Failed to create tables: {e}"))?;

    // Seed metadata on first run
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM project_meta", [], |row| row.get(0))
        .map_err(|e| format!("Failed to query project_meta: {e}"))?;

    if count == 0 {
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO project_meta (key, value) VALUES (?1, ?2)",
            params!["db_version", "1"],
        )
        .map_err(|e| format!("Failed to seed db_version: {e}"))?;
        conn.execute(
            "INSERT INTO project_meta (key, value) VALUES (?1, ?2)",
            params!["created_at", &now],
        )
        .map_err(|e| format!("Failed to seed created_at: {e}"))?;
    }

    Ok(conn)
}
