use anyhow::{anyhow, Result};
use chrono::{DateTime, Local, Utc};
use log::{debug, error, info, warn};
use rusqlite::{params, Connection, OptionalExtension};
use rusqlite_migration::{MigrationDefinitionError, Migrations, M};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri_specta::Event;

use crate::frontmost_app::FrontmostApp;
use crate::language_detection::{LanguageDecision, LanguageSource};
use crate::settings::{AudioRetentionPeriod, RecordingRetentionPeriod};

/// Database migrations for transcription history.
/// Each migration is applied in order. The library tracks which migrations
/// have been applied using SQLite's user_version pragma.
///
/// Note: For users upgrading from tauri-plugin-sql, migrate_from_tauri_plugin_sql()
/// converts the old _sqlx_migrations table tracking to the user_version pragma,
/// ensuring migrations don't re-run on existing databases.
static MIGRATIONS: &[M] = &[
    M::up(
        "CREATE TABLE IF NOT EXISTS transcription_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_name TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            saved BOOLEAN NOT NULL DEFAULT 0,
            title TEXT NOT NULL,
            transcription_text TEXT NOT NULL
        );",
    ),
    M::up("ALTER TABLE transcription_history ADD COLUMN post_processed_text TEXT;"),
    M::up("ALTER TABLE transcription_history ADD COLUMN post_process_prompt TEXT;"),
    M::up("ALTER TABLE transcription_history ADD COLUMN post_process_requested BOOLEAN NOT NULL DEFAULT 0;"),
];

/// Nullable columns added outside [`MIGRATIONS`]; see
/// [`HistoryManager::apply_migrations`].
const ADDED_COLUMNS: &[(&str, &str)] = &[
    ("source_name", "TEXT"),
    ("language", "TEXT"),
    ("language_source", "TEXT"),
    ("app_bundle_id", "TEXT"),
    ("app_name", "TEXT"),
    ("audio_duration_ms", "INTEGER"),
    ("word_count", "INTEGER"),
    ("model_id", "TEXT"),
    ("latency_ms", "INTEGER"),
];

/// Every column a [`HistoryEntry`] is read from.
const ENTRY_COLUMNS: &str = "id, file_name, timestamp, saved, title, transcription_text, \
    post_processed_text, post_process_prompt, post_process_requested, source_name, language, \
    language_source, app_bundle_id, app_name, audio_duration_ms, word_count, model_id, latency_ms";

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct PaginatedHistory {
    pub entries: Vec<HistoryEntry>,
    pub has_more: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, Type, tauri_specta::Event)]
#[serde(tag = "action")]
pub enum HistoryUpdatePayload {
    #[serde(rename = "added")]
    Added { entry: HistoryEntry },
    #[serde(rename = "updated")]
    Updated { entry: HistoryEntry },
    #[serde(rename = "deleted")]
    Deleted { id: i64 },
    #[serde(rename = "toggled")]
    Toggled { id: i64 },
}

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct HistoryEntry {
    pub id: i64,
    pub file_name: String,
    pub timestamp: i64,
    pub saved: bool,
    pub title: String,
    pub transcription_text: String,
    pub post_processed_text: Option<String>,
    pub post_process_prompt: Option<String>,
    pub post_process_requested: bool,
    /// The name of the file this entry was transcribed from; `None` for a
    /// dictation.
    pub source_name: Option<String>,
    /// The language it was transcribed in, when known.
    pub language: Option<String>,
    /// How that language was chosen; `None` before it was recorded.
    pub language_source: Option<LanguageSource>,
    /// The application that had focus when the dictation started.
    pub app_bundle_id: Option<String>,
    pub app_name: Option<String>,
    /// How much audio was transcribed, silence removed when VAD is on.
    pub audio_duration_ms: Option<i64>,
    /// Words in `transcription_text`; `None` when nothing was transcribed.
    pub word_count: Option<i64>,
    /// The model that produced `transcription_text`.
    pub model_id: Option<String>,
    /// From the end of the recording to the text being pasted.
    pub latency_ms: Option<i64>,
    /// Whether the recording is still on disk. It goes when the retention
    /// period ends or when the user deletes it; the text stays.
    pub has_audio: bool,
}

/// What is known about a dictation besides its text.
#[derive(Clone, Debug, Default)]
pub struct DictationMetadata {
    pub language: Option<LanguageDecision>,
    pub app: Option<FrontmostApp>,
    pub audio_duration_ms: Option<i64>,
    pub model_id: Option<String>,
}

/// The number of words in `text`, or `None` when it has none.
pub(super) fn count_words(text: &str) -> Option<i64> {
    match text.split_whitespace().count() {
        0 => None,
        count => i64::try_from(count).ok(),
    }
}

/// The oldest timestamp `period` keeps, or `None` when it is not a duration.
fn retention_cutoff(period: RecordingRetentionPeriod, now: i64) -> Option<i64> {
    const DAY: i64 = 24 * 60 * 60;
    match period {
        RecordingRetentionPeriod::Days3 => Some(now - 3 * DAY),
        RecordingRetentionPeriod::Weeks2 => Some(now - 14 * DAY),
        // A month is counted as 30 days.
        RecordingRetentionPeriod::Months3 => Some(now - 90 * DAY),
        RecordingRetentionPeriod::Never | RecordingRetentionPeriod::PreserveLimit => None,
    }
}

pub struct HistoryManager {
    app_handle: AppHandle,
    recordings_dir: PathBuf,
    db_path: PathBuf,
}

/// A transcription's language as its two columns.
fn split_language(language: Option<LanguageDecision>) -> (Option<String>, Option<LanguageSource>) {
    match language {
        Some(decision) => (decision.language, Some(decision.source)),
        None => (None, None),
    }
}

impl HistoryManager {
    pub fn new(app_handle: &AppHandle) -> Result<Self> {
        // Create recordings directory in app data dir
        let app_data_dir = crate::portable::app_data_dir(app_handle)?;
        let recordings_dir = app_data_dir.join("recordings");
        let db_path = app_data_dir.join("history.db");

        // Ensure recordings directory exists
        if !recordings_dir.exists() {
            fs::create_dir_all(&recordings_dir)?;
            debug!("Created recordings directory: {:?}", recordings_dir);
        }

        let manager = Self {
            app_handle: app_handle.clone(),
            recordings_dir,
            db_path,
        };

        // Initialize database and run migrations synchronously
        manager.init_database()?;
        manager.backfill_metadata();
        manager.record_badges();

        Ok(manager)
    }

    fn init_database(&self) -> Result<()> {
        info!("Initializing database at {:?}", self.db_path);

        let mut conn = Connection::open(&self.db_path)?;

        // Handle migration from tauri-plugin-sql to rusqlite_migration
        // tauri-plugin-sql used _sqlx_migrations table, rusqlite_migration uses user_version pragma
        self.migrate_from_tauri_plugin_sql(&conn)?;

        // Validate migrations in debug builds
        #[cfg(debug_assertions)]
        Migrations::new(MIGRATIONS.to_vec())
            .validate()
            .expect("Invalid migrations");

        // Get current version before migration
        let version_before: i32 =
            conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
        debug!("Database version before migration: {}", version_before);

        Self::apply_migrations(&mut conn)?;

        // Get version after migration
        let version_after: i32 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;

        if version_after > version_before {
            info!(
                "Database migrated from version {} to {}",
                version_before, version_after
            );
        } else {
            debug!("Database already at latest version {}", version_after);
        }

        Ok(())
    }

    /// Bring the schema up to date. A newer Handy's database opens as is:
    /// migrations only add columns, and every query names its columns.
    fn apply_migrations(conn: &mut Connection) -> Result<()> {
        match Migrations::new(MIGRATIONS.to_vec()).to_latest(conn) {
            Err(rusqlite_migration::Error::MigrationDefinition(
                MigrationDefinitionError::DatabaseTooFarAhead,
            )) => {
                warn!("history.db is from a newer version of Handy; opening it without migrating")
            }
            other => other?,
        }

        // Not a migration: a higher user_version makes released builds refuse
        // the database, while an extra nullable column is invisible to them.
        Self::add_missing_columns(conn)
    }

    fn add_missing_columns(conn: &Connection) -> Result<()> {
        for (column, sql_type) in ADDED_COLUMNS {
            if !Self::has_column(conn, column)? {
                conn.execute(
                    &format!("ALTER TABLE transcription_history ADD COLUMN {column} {sql_type}"),
                    [],
                )?;
                info!("Added the {column} column to transcription history");
            }
        }

        Ok(())
    }

    fn has_column(conn: &Connection, name: &str) -> Result<bool> {
        Ok(conn.query_row(
            "SELECT COUNT(*) > 0 FROM pragma_table_info('transcription_history') WHERE name = ?1",
            [name],
            |row| row.get(0),
        )?)
    }

    /// Migrate from tauri-plugin-sql's migration tracking to rusqlite_migration's.
    /// tauri-plugin-sql used a _sqlx_migrations table, while rusqlite_migration uses
    /// SQLite's user_version pragma. This function checks if the old system was in use
    /// and sets the user_version accordingly so migrations don't re-run.
    fn migrate_from_tauri_plugin_sql(&self, conn: &Connection) -> Result<()> {
        // Check if the old _sqlx_migrations table exists
        let has_sqlx_migrations: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='_sqlx_migrations'",
                [],
                |row| row.get(0),
            )
            .unwrap_or(false);

        if !has_sqlx_migrations {
            return Ok(());
        }

        // Check current user_version
        let current_version: i32 =
            conn.pragma_query_value(None, "user_version", |row| row.get(0))?;

        if current_version > 0 {
            // Already migrated to rusqlite_migration system
            return Ok(());
        }

        // Get the highest version from the old migrations table
        let old_version: i32 = conn
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM _sqlx_migrations WHERE success = 1",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        if old_version > 0 {
            info!(
                "Migrating from tauri-plugin-sql (version {}) to rusqlite_migration",
                old_version
            );

            // Set user_version to match the old migration state
            conn.pragma_update(None, "user_version", old_version)?;

            // Optionally drop the old migrations table (keeping it doesn't hurt)
            // conn.execute("DROP TABLE IF EXISTS _sqlx_migrations", [])?;

            info!(
                "Migration tracking converted: user_version set to {}",
                old_version
            );
        }

        Ok(())
    }

    pub(super) fn get_connection(&self) -> Result<Connection> {
        Ok(Connection::open(&self.db_path)?)
    }

    fn map_history_entry(row: &rusqlite::Row<'_>) -> rusqlite::Result<HistoryEntry> {
        Ok(HistoryEntry {
            id: row.get("id")?,
            file_name: row.get("file_name")?,
            timestamp: row.get("timestamp")?,
            saved: row.get("saved")?,
            title: row.get("title")?,
            transcription_text: row.get("transcription_text")?,
            post_processed_text: row.get("post_processed_text")?,
            post_process_prompt: row.get("post_process_prompt")?,
            post_process_requested: row.get("post_process_requested")?,
            source_name: row.get("source_name")?,
            language: row.get("language")?,
            language_source: row
                .get::<_, Option<String>>("language_source")?
                .as_deref()
                .and_then(LanguageSource::parse),
            app_bundle_id: row.get("app_bundle_id")?,
            app_name: row.get("app_name")?,
            audio_duration_ms: row.get("audio_duration_ms")?,
            word_count: row.get("word_count")?,
            model_id: row.get("model_id")?,
            latency_ms: row.get("latency_ms")?,
            // Rows know nothing of the disk: `with_audio` fills this in.
            has_audio: false,
        })
    }

    pub fn recordings_dir(&self) -> &std::path::Path {
        &self.recordings_dir
    }

    /// Save a new history entry to the database.
    /// The WAV file should already have been written to the recordings directory.
    pub fn save_entry(
        &self,
        file_name: String,
        transcription_text: String,
        post_process_requested: bool,
        post_processed_text: Option<String>,
        post_process_prompt: Option<String>,
        metadata: DictationMetadata,
    ) -> Result<HistoryEntry> {
        let (language, language_source) = split_language(metadata.language);
        let app = metadata.app.unwrap_or_default();
        let word_count = count_words(&transcription_text);
        let entry = self.insert_entry(HistoryEntry {
            id: 0,
            file_name,
            timestamp: Utc::now().timestamp(),
            saved: false,
            title: String::new(),
            transcription_text,
            post_processed_text,
            post_process_prompt,
            post_process_requested,
            source_name: None,
            language,
            language_source,
            app_bundle_id: app.bundle_id,
            app_name: app.name,
            audio_duration_ms: metadata.audio_duration_ms,
            word_count,
            model_id: metadata.model_id,
            latency_ms: None,
            has_audio: true,
        })?;

        self.cleanup_old_entries()?;

        Ok(entry)
    }

    /// Save the entry for a file whose audio is already at `file_name`.
    /// Retention never removes it (only deleting it does); never
    /// post-processed.
    pub fn save_file_entry(&self, file_name: String, source_name: String) -> Result<HistoryEntry> {
        self.insert_entry(HistoryEntry {
            id: 0,
            file_name,
            timestamp: Utc::now().timestamp(),
            saved: false,
            title: String::new(),
            transcription_text: String::new(),
            post_processed_text: None,
            post_process_prompt: None,
            post_process_requested: false,
            source_name: Some(source_name),
            language: None,
            language_source: None,
            app_bundle_id: None,
            app_name: None,
            audio_duration_ms: None,
            word_count: None,
            model_id: None,
            latency_ms: None,
            has_audio: true,
        })
    }

    /// Insert `entry`, filling in its id and title, and announce it.
    fn insert_entry(&self, mut entry: HistoryEntry) -> Result<HistoryEntry> {
        entry.title = self.format_timestamp_title(entry.timestamp);

        let conn = self.get_connection()?;
        conn.execute(
            "INSERT INTO transcription_history (
                file_name,
                timestamp,
                saved,
                title,
                transcription_text,
                post_processed_text,
                post_process_prompt,
                post_process_requested,
                source_name,
                language,
                language_source,
                app_bundle_id,
                app_name,
                audio_duration_ms,
                word_count,
                model_id,
                latency_ms
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
            params![
                &entry.file_name,
                entry.timestamp,
                entry.saved,
                &entry.title,
                &entry.transcription_text,
                &entry.post_processed_text,
                &entry.post_process_prompt,
                entry.post_process_requested,
                &entry.source_name,
                &entry.language,
                entry.language_source.map(LanguageSource::as_str),
                &entry.app_bundle_id,
                &entry.app_name,
                entry.audio_duration_ms,
                entry.word_count,
                &entry.model_id,
                entry.latency_ms,
            ],
        )?;
        entry.id = conn.last_insert_rowid();

        debug!("Saved history entry with id {}", entry.id);

        // Emit typed event for real-time frontend updates
        if let Err(e) = (HistoryUpdatePayload::Added {
            entry: entry.clone(),
        })
        .emit(&self.app_handle)
        {
            error!("Failed to emit history-updated event: {}", e);
        }

        Ok(entry)
    }

    /// Update an existing history entry with new transcription results (used by retry).
    pub fn update_transcription(
        &self,
        id: i64,
        transcription_text: String,
        post_processed_text: Option<String>,
        post_process_prompt: Option<String>,
        language: Option<LanguageDecision>,
        model_id: Option<String>,
    ) -> Result<HistoryEntry> {
        let (language, language_source) = split_language(language);
        let word_count = count_words(&transcription_text);
        let conn = self.get_connection()?;
        let updated = conn.execute(
            "UPDATE transcription_history
             SET transcription_text = ?1,
                 post_processed_text = ?2,
                 post_process_prompt = ?3,
                 language = ?4,
                 language_source = ?5,
                 word_count = ?6,
                 model_id = ?7
             WHERE id = ?8",
            params![
                transcription_text,
                post_processed_text,
                post_process_prompt,
                language,
                language_source.map(LanguageSource::as_str),
                word_count,
                model_id,
                id
            ],
        )?;

        if updated == 0 {
            return Err(anyhow!("History entry {} not found", id));
        }

        let entry = conn.query_row(
            &format!("SELECT {ENTRY_COLUMNS} FROM transcription_history WHERE id = ?1"),
            params![id],
            Self::map_history_entry,
        )?;
        let entry = self.with_audio(entry);

        debug!("Updated transcription for history entry {}", id);

        if let Err(e) = (HistoryUpdatePayload::Updated {
            entry: entry.clone(),
        })
        .emit(&self.app_handle)
        {
            error!("Failed to emit history-updated event: {}", e);
        }

        Ok(entry)
    }

    /// Record how long a dictation took to reach the user, once it is pasted.
    pub fn set_latency(&self, id: i64, latency_ms: i64) -> Result<()> {
        let conn = self.get_connection()?;
        conn.execute(
            "UPDATE transcription_history SET latency_ms = ?1 WHERE id = ?2",
            params![latency_ms, id],
        )?;
        Ok(())
    }

    pub fn cleanup_old_entries(&self) -> Result<()> {
        // Before anything is purged: badges and lifetime totals outlive it.
        self.record_badges();
        self.cleanup_entries()?;
        self.cleanup_old_audio()
    }

    /// Delete the recordings older than the audio retention period, keeping
    /// their text. Saved entries and transcribed files keep their audio.
    fn cleanup_old_audio(&self) -> Result<()> {
        let period = match crate::settings::get_settings(&self.app_handle).audio_retention_period {
            AudioRetentionPeriod::SameAsHistory => return Ok(()),
            AudioRetentionPeriod::Days3 => RecordingRetentionPeriod::Days3,
            AudioRetentionPeriod::Weeks2 => RecordingRetentionPeriod::Weeks2,
            AudioRetentionPeriod::Months3 => RecordingRetentionPeriod::Months3,
        };
        let Some(cutoff) = retention_cutoff(period, Utc::now().timestamp()) else {
            return Ok(());
        };

        let conn = self.get_connection()?;
        let file_names = Self::expired_audio_files(&conn, cutoff)?;
        let mut deleted_count = 0;
        for file_name in file_names {
            let file_path = self.recordings_dir.join(&file_name);
            if !file_path.exists() {
                continue;
            }
            match fs::remove_file(&file_path) {
                Ok(()) => deleted_count += 1,
                Err(e) => error!("Failed to delete WAV file {}: {}", file_name, e),
            }
        }
        if deleted_count > 0 {
            debug!(
                "Deleted {} recordings past the audio retention period",
                deleted_count
            );
        }

        Ok(())
    }

    /// The recordings of unsaved dictations older than `cutoff`.
    fn expired_audio_files(conn: &Connection, cutoff: i64) -> Result<Vec<String>> {
        let mut stmt = conn.prepare(
            "SELECT file_name FROM transcription_history WHERE saved = 0 AND source_name IS NULL AND timestamp < ?1",
        )?;
        let rows = stmt.query_map(params![cutoff], |row| row.get::<_, String>(0))?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    fn cleanup_entries(&self) -> Result<()> {
        let retention_period = crate::settings::get_recording_retention_period(&self.app_handle);

        match retention_period {
            crate::settings::RecordingRetentionPeriod::Never => {
                // Don't delete anything
                Ok(())
            }
            crate::settings::RecordingRetentionPeriod::PreserveLimit => {
                // Use the old count-based logic with history_limit
                let limit = crate::settings::get_history_limit(&self.app_handle);
                self.cleanup_by_count(limit)
            }
            _ => {
                // Use time-based logic
                self.cleanup_by_time(retention_period)
            }
        }
    }

    fn delete_entries_and_files(&self, entries: &[(i64, String)]) -> Result<usize> {
        if entries.is_empty() {
            return Ok(0);
        }

        let conn = self.get_connection()?;
        let mut deleted_count = 0;

        for (id, file_name) in entries {
            // Delete database entry
            conn.execute(
                "DELETE FROM transcription_history WHERE id = ?1",
                params![id],
            )?;

            // Delete WAV file
            let file_path = self.recordings_dir.join(file_name);
            if file_path.exists() {
                if let Err(e) = fs::remove_file(&file_path) {
                    error!("Failed to delete WAV file {}: {}", file_name, e);
                } else {
                    debug!("Deleted old WAV file: {}", file_name);
                    deleted_count += 1;
                }
            }
        }

        Ok(deleted_count)
    }

    fn cleanup_by_count(&self, limit: usize) -> Result<()> {
        let conn = self.get_connection()?;

        // Unsaved dictations, newest first. Transcribed files are only ever
        // deleted explicitly, and don't count toward the limit.
        let mut stmt = conn.prepare(
            "SELECT id, file_name FROM transcription_history WHERE saved = 0 AND source_name IS NULL ORDER BY timestamp DESC"
        )?;

        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, i64>("id")?, row.get::<_, String>("file_name")?))
        })?;

        let mut entries: Vec<(i64, String)> = Vec::new();
        for row in rows {
            entries.push(row?);
        }

        if entries.len() > limit {
            let entries_to_delete = &entries[limit..];
            let deleted_count = self.delete_entries_and_files(entries_to_delete)?;

            if deleted_count > 0 {
                debug!("Cleaned up {} old history entries by count", deleted_count);
            }
        }

        Ok(())
    }

    fn cleanup_by_time(
        &self,
        retention_period: crate::settings::RecordingRetentionPeriod,
    ) -> Result<()> {
        let conn = self.get_connection()?;

        let Some(cutoff_timestamp) = retention_cutoff(retention_period, Utc::now().timestamp())
        else {
            return Ok(());
        };

        // Unsaved dictations older than the cutoff; transcribed files are only
        // ever deleted explicitly.
        let mut stmt = conn.prepare(
            "SELECT id, file_name FROM transcription_history WHERE saved = 0 AND source_name IS NULL AND timestamp < ?1",
        )?;

        let rows = stmt.query_map(params![cutoff_timestamp], |row| {
            Ok((row.get::<_, i64>("id")?, row.get::<_, String>("file_name")?))
        })?;

        let mut entries_to_delete: Vec<(i64, String)> = Vec::new();
        for row in rows {
            entries_to_delete.push(row?);
        }

        let deleted_count = self.delete_entries_and_files(&entries_to_delete)?;

        if deleted_count > 0 {
            debug!(
                "Cleaned up {} old history entries based on retention period",
                deleted_count
            );
        }

        Ok(())
    }

    pub async fn get_history_entries(
        &self,
        cursor: Option<i64>,
        limit: Option<usize>,
    ) -> Result<PaginatedHistory> {
        let conn = self.get_connection()?;
        let limit = limit.map(|l| l.min(100));

        let mut entries: Vec<HistoryEntry> = match (cursor, limit) {
            (Some(cursor_id), Some(lim)) => {
                let fetch_count = (lim + 1) as i64;
                let mut stmt = conn.prepare(&format!(
                    "SELECT {ENTRY_COLUMNS}
                     FROM transcription_history
                     WHERE id < ?1
                     ORDER BY id DESC
                     LIMIT ?2"
                ))?;
                let result = stmt
                    .query_map(params![cursor_id, fetch_count], Self::map_history_entry)?
                    .collect::<std::result::Result<Vec<_>, _>>()?;
                result
            }
            (None, Some(lim)) => {
                let fetch_count = (lim + 1) as i64;
                let mut stmt = conn.prepare(&format!(
                    "SELECT {ENTRY_COLUMNS}
                     FROM transcription_history
                     ORDER BY id DESC
                     LIMIT ?1"
                ))?;
                let result = stmt
                    .query_map(params![fetch_count], Self::map_history_entry)?
                    .collect::<std::result::Result<Vec<_>, _>>()?;
                result
            }
            (_, None) => {
                let mut stmt = conn.prepare(&format!(
                    "SELECT {ENTRY_COLUMNS}
                     FROM transcription_history
                     ORDER BY id DESC"
                ))?;
                let result = stmt
                    .query_map([], Self::map_history_entry)?
                    .collect::<std::result::Result<Vec<_>, _>>()?;
                result
            }
        };

        let has_more = limit.is_some_and(|lim| entries.len() > lim);
        if has_more {
            entries.pop();
        }
        let entries = entries
            .into_iter()
            .map(|entry| self.with_audio(entry))
            .collect();

        Ok(PaginatedHistory { entries, has_more })
    }

    #[cfg(test)]
    fn get_latest_entry_with_conn(conn: &Connection) -> Result<Option<HistoryEntry>> {
        let mut stmt = conn.prepare(&format!(
            "SELECT {ENTRY_COLUMNS}
             FROM transcription_history
             ORDER BY timestamp DESC
             LIMIT 1"
        ))?;

        let entry = stmt.query_row([], Self::map_history_entry).optional()?;
        Ok(entry)
    }

    /// Get the latest dictation with non-empty transcription text. Files are
    /// left out: a long file's transcript is never the "last transcript".
    pub fn get_latest_completed_entry(&self) -> Result<Option<HistoryEntry>> {
        let conn = self.get_connection()?;
        Self::get_latest_completed_entry_with_conn(&conn)
    }

    fn get_latest_completed_entry_with_conn(conn: &Connection) -> Result<Option<HistoryEntry>> {
        let mut stmt = conn.prepare(&format!(
            "SELECT {ENTRY_COLUMNS}
             FROM transcription_history
             WHERE transcription_text != '' AND source_name IS NULL
             ORDER BY timestamp DESC
             LIMIT 1"
        ))?;

        let entry = stmt.query_row([], Self::map_history_entry).optional()?;
        Ok(entry)
    }

    pub async fn toggle_saved_status(&self, id: i64) -> Result<()> {
        let conn = self.get_connection()?;

        // Get current saved status
        let current_saved: bool = conn.query_row(
            "SELECT saved FROM transcription_history WHERE id = ?1",
            params![id],
            |row| row.get("saved"),
        )?;

        let new_saved = !current_saved;

        conn.execute(
            "UPDATE transcription_history SET saved = ?1 WHERE id = ?2",
            params![new_saved, id],
        )?;

        debug!("Toggled saved status for entry {}: {}", id, new_saved);

        // Emit history updated event
        if let Err(e) = (HistoryUpdatePayload::Toggled { id }).emit(&self.app_handle) {
            error!("Failed to emit history-updated event: {}", e);
        }

        Ok(())
    }

    pub fn get_audio_file_path(&self, file_name: &str) -> PathBuf {
        self.recordings_dir.join(file_name)
    }

    pub async fn get_entry_by_id(&self, id: i64) -> Result<Option<HistoryEntry>> {
        let conn = self.get_connection()?;
        let mut stmt = conn.prepare(&format!(
            "SELECT {ENTRY_COLUMNS}
             FROM transcription_history
             WHERE id = ?1"
        ))?;

        let entry = stmt.query_row([id], Self::map_history_entry).optional()?;

        Ok(entry.map(|entry| self.with_audio(entry)))
    }

    /// The entry, knowing whether its recording is still on disk.
    fn with_audio(&self, mut entry: HistoryEntry) -> HistoryEntry {
        entry.has_audio = self.get_audio_file_path(&entry.file_name).is_file();
        entry
    }

    /// Delete an entry's recording and keep its text.
    pub async fn delete_entry_audio(&self, id: i64) -> Result<()> {
        let entry = self
            .get_entry_by_id(id)
            .await?
            .ok_or_else(|| anyhow!("History entry {} not found", id))?;

        let file_path = self.get_audio_file_path(&entry.file_name);
        if file_path.is_file() {
            fs::remove_file(&file_path)?;
            debug!("Deleted the recording of history entry {}", id);
        }

        let entry = self.with_audio(entry);
        if let Err(e) = (HistoryUpdatePayload::Updated { entry }).emit(&self.app_handle) {
            error!("Failed to emit history-updated event: {}", e);
        }
        Ok(())
    }

    pub async fn delete_entry(&self, id: i64) -> Result<()> {
        let conn = self.get_connection()?;

        // Get the entry to find the file name
        if let Some(entry) = self.get_entry_by_id(id).await? {
            // Delete the audio file first
            let file_path = self.get_audio_file_path(&entry.file_name);
            if file_path.exists() {
                if let Err(e) = fs::remove_file(&file_path) {
                    error!("Failed to delete audio file {}: {}", entry.file_name, e);
                    // Continue with database deletion even if file deletion fails
                }
            }
        }

        // Delete from database
        conn.execute(
            "DELETE FROM transcription_history WHERE id = ?1",
            params![id],
        )?;

        debug!("Deleted history entry with id: {}", id);

        // Emit history updated event
        if let Err(e) = (HistoryUpdatePayload::Deleted { id }).emit(&self.app_handle) {
            error!("Failed to emit history-updated event: {}", e);
        }

        Ok(())
    }

    fn format_timestamp_title(&self, timestamp: i64) -> String {
        if let Some(utc_datetime) = DateTime::from_timestamp(timestamp, 0) {
            // Convert UTC to local timezone
            let local_datetime = utc_datetime.with_timezone(&Local);
            local_datetime.format("%B %e, %Y - %l:%M%p").to_string()
        } else {
            format!("Recording {}", timestamp)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::{params, Connection};

    fn setup_conn() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.execute_batch(
            "CREATE TABLE transcription_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_name TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                saved BOOLEAN NOT NULL DEFAULT 0,
                title TEXT NOT NULL,
                transcription_text TEXT NOT NULL,
                post_processed_text TEXT,
                post_process_prompt TEXT,
                post_process_requested BOOLEAN NOT NULL DEFAULT 0,
                source_name TEXT,
                language TEXT,
                language_source TEXT
            );",
        )
        .expect("create transcription_history table");
        HistoryManager::add_missing_columns(&conn).expect("add the newer columns");
        conn
    }

    fn insert_entry(conn: &Connection, timestamp: i64, text: &str, post_processed: Option<&str>) {
        conn.execute(
            "INSERT INTO transcription_history (
                file_name,
                timestamp,
                saved,
                title,
                transcription_text,
                post_processed_text,
                post_process_prompt,
                post_process_requested
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                format!("handy-{}.wav", timestamp),
                timestamp,
                false,
                format!("Recording {}", timestamp),
                text,
                post_processed,
                Option::<String>::None,
                false,
            ],
        )
        .expect("insert history entry");
    }

    fn user_version(conn: &Connection) -> i32 {
        conn.pragma_query_value(None, "user_version", |row| row.get(0))
            .expect("read user_version")
    }

    #[test]
    fn migrating_adds_columns_without_raising_the_version() {
        let mut conn = Connection::open_in_memory().expect("open in-memory db");
        HistoryManager::apply_migrations(&mut conn).expect("migrate");
        for (column, _) in ADDED_COLUMNS {
            assert!(HistoryManager::has_column(&conn, column).expect("read table info"));
        }
        assert_eq!(user_version(&conn), MIGRATIONS.len() as i32);

        // Opening it again changes nothing.
        HistoryManager::apply_migrations(&mut conn).expect("migrate again");
        assert_eq!(user_version(&conn), MIGRATIONS.len() as i32);
    }

    #[test]
    fn a_database_from_a_newer_handy_still_opens() {
        let mut conn = Connection::open_in_memory().expect("open in-memory db");
        HistoryManager::apply_migrations(&mut conn).expect("migrate");
        conn.execute(
            "ALTER TABLE transcription_history ADD COLUMN from_the_future TEXT",
            [],
        )
        .expect("add newer column");
        conn.pragma_update(None, "user_version", MIGRATIONS.len() as i32 + 3)
            .expect("set newer version");

        HistoryManager::apply_migrations(&mut conn).expect("open newer database");
        insert_entry(&conn, 100, "still works", None);
        let entry = HistoryManager::get_latest_entry_with_conn(&conn)
            .expect("fetch latest entry")
            .expect("entry exists");
        assert_eq!(entry.transcription_text, "still works");
    }

    #[test]
    fn reads_the_language_and_ignores_an_unknown_source() {
        let conn = setup_conn();
        let latest = |source: &str| {
            conn.execute(
                "INSERT INTO transcription_history (file_name, timestamp, title, transcription_text, language, language_source)
                 VALUES ('a.wav', (SELECT COUNT(*) FROM transcription_history), 'a', 'hallo', 'de', ?1)",
                [source],
            )
            .expect("insert entry");
            HistoryManager::get_latest_entry_with_conn(&conn)
                .unwrap()
                .unwrap()
        };
        let entry = latest("detected");
        assert_eq!(entry.language.as_deref(), Some("de"));
        assert_eq!(entry.language_source, Some(LanguageSource::Detected));
        assert_eq!(latest("from_the_future").language_source, None);
    }

    #[test]
    fn get_latest_entry_returns_none_when_empty() {
        let conn = setup_conn();
        let entry = HistoryManager::get_latest_entry_with_conn(&conn).expect("fetch latest entry");
        assert!(entry.is_none());
    }

    #[test]
    fn get_latest_entry_returns_newest_entry() {
        let conn = setup_conn();
        insert_entry(&conn, 100, "first", None);
        insert_entry(&conn, 200, "second", Some("processed"));

        let entry = HistoryManager::get_latest_entry_with_conn(&conn)
            .expect("fetch latest entry")
            .expect("entry exists");

        assert_eq!(entry.timestamp, 200);
        assert_eq!(entry.transcription_text, "second");
        assert_eq!(entry.post_processed_text.as_deref(), Some("processed"));
    }

    #[test]
    fn get_latest_completed_entry_skips_empty_entries() {
        let conn = setup_conn();
        insert_entry(&conn, 100, "completed", None);
        insert_entry(&conn, 200, "", None);

        let entry = HistoryManager::get_latest_completed_entry_with_conn(&conn)
            .expect("fetch latest completed entry")
            .expect("completed entry exists");

        assert_eq!(entry.timestamp, 100);
        assert_eq!(entry.transcription_text, "completed");
    }

    #[test]
    fn words_are_counted_and_no_text_has_no_count() {
        assert_eq!(count_words("Bonjour  tout le\nmonde"), Some(4));
        assert_eq!(count_words("   "), None);
    }

    #[test]
    fn only_durations_have_a_retention_cutoff() {
        let day = 24 * 60 * 60;
        assert_eq!(
            retention_cutoff(RecordingRetentionPeriod::Days3, 10 * day),
            Some(7 * day)
        );
        assert_eq!(
            retention_cutoff(RecordingRetentionPeriod::Never, 10 * day),
            None
        );
        assert_eq!(
            retention_cutoff(RecordingRetentionPeriod::PreserveLimit, 10 * day),
            None
        );
    }

    #[test]
    fn expired_audio_spares_saved_entries_and_files() {
        let conn = setup_conn();
        for (file_name, timestamp, saved, source_name) in [
            ("old.wav", 100, false, None),
            ("recent.wav", 900, false, None),
            ("old-saved.wav", 100, true, None),
            ("old-file.wav", 100, false, Some("talk.mp3")),
        ] {
            conn.execute(
                "INSERT INTO transcription_history (file_name, timestamp, saved, title, transcription_text, source_name)
                 VALUES (?1, ?2, ?3, '', 'text', ?4)",
                params![file_name, timestamp, saved, source_name],
            )
            .expect("insert entry");
        }

        let expired = HistoryManager::expired_audio_files(&conn, 500).expect("list expired audio");

        assert_eq!(expired, vec!["old.wav".to_string()]);
    }

    #[test]
    fn metadata_columns_round_trip() {
        let conn = setup_conn();
        conn.execute(
            "INSERT INTO transcription_history (file_name, timestamp, title, transcription_text, app_bundle_id, app_name, audio_duration_ms, word_count, model_id, latency_ms)
             VALUES ('a.wav', 100, '', 'deux mots', 'com.apple.mail', 'Mail', 1500, 2, 'parakeet-ultra', 420)",
            [],
        )
        .expect("insert entry");

        let entry = HistoryManager::get_latest_completed_entry_with_conn(&conn)
            .expect("fetch entry")
            .expect("entry exists");

        assert_eq!(entry.app_bundle_id.as_deref(), Some("com.apple.mail"));
        assert_eq!(entry.app_name.as_deref(), Some("Mail"));
        assert_eq!(entry.audio_duration_ms, Some(1500));
        assert_eq!(entry.word_count, Some(2));
        assert_eq!(entry.model_id.as_deref(), Some("parakeet-ultra"));
        assert_eq!(entry.latency_ms, Some(420));
    }

    #[test]
    fn get_latest_completed_entry_skips_files() {
        let conn = setup_conn();
        insert_entry(&conn, 100, "dictated", None);
        conn.execute(
            "INSERT INTO transcription_history (file_name, timestamp, saved, title, transcription_text, source_name)
             VALUES ('handy-file-1.wav', 200, 1, 'file', 'from a file', 'talk.mp3')",
            [],
        )
        .expect("insert file entry");

        let entry = HistoryManager::get_latest_completed_entry_with_conn(&conn)
            .expect("fetch latest completed entry")
            .expect("completed entry exists");

        assert_eq!(entry.transcription_text, "dictated");
    }
}
