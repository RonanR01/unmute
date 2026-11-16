//! What the dictation history says about how the user dictates: totals,
//! activity per day, and a profile of the words they use.
//!
//! Everything is computed from `transcription_history`; only the voice
//! profile is stored, since it is refreshed on demand.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use anyhow::Result;
use chrono::Utc;
use log::{debug, warn};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use specta::Type;

use super::history::HistoryManager;

/// Dictations only: a transcribed file is not the user speaking to Unmute.
const DICTATIONS: &str = "source_name IS NULL AND transcription_text != ''";

const VOICE_PROFILE_FILE: &str = "voice_profile.json";

/// Recordings are 16 kHz mono 16-bit PCM behind a 44-byte header.
const WAV_HEADER_BYTES: u64 = 44;
const WAV_BYTES_PER_MS: u64 = 32;

const TOP_WORDS: usize = 10;
const TOP_CATCHPHRASES: usize = 5;
/// A phrase said fewer times than this is not a habit.
const MIN_CATCHPHRASE_COUNT: u32 = 3;
const MAX_CATCHPHRASE_WORDS: usize = 4;

/// Totals over every dictation still in the history.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Type)]
pub struct DictationStats {
    pub dictation_count: u32,
    pub word_count: i64,
    pub duration_ms: i64,
    /// `None` until a dictation has both its words and its duration.
    pub words_per_minute: Option<f64>,
}

/// One day of dictation, in the user's time zone.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct DailyActivity {
    /// `YYYY-MM-DD`.
    pub date: String,
    pub dictation_count: u32,
    pub word_count: i64,
    pub duration_ms: i64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct PhraseCount {
    pub text: String,
    pub count: u32,
}

/// How the user speaks, as of `computed_at`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Type)]
pub struct VoiceProfile {
    pub computed_at: i64,
    pub dictation_count: u32,
    pub word_count: i64,
    /// Most used words, leaving out the ones every sentence needs.
    pub top_words: Vec<PhraseCount>,
    /// Most repeated expressions; the first is the catchphrase.
    pub catchphrases: Vec<PhraseCount>,
    pub fillers: Vec<PhraseCount>,
    /// Share of dictations in English, among those whose language is known.
    pub english_share: Option<f64>,
}

impl HistoryManager {
    pub fn dictation_stats(&self) -> Result<DictationStats> {
        dictation_stats(&self.get_connection()?)
    }

    pub fn daily_activity(&self) -> Result<Vec<DailyActivity>> {
        daily_activity(&self.get_connection()?)
    }

    /// The profile from the last refresh, if there was one.
    pub fn voice_profile(&self) -> Option<VoiceProfile> {
        let content = fs::read_to_string(self.voice_profile_path()?).ok()?;
        serde_json::from_str(&content).ok()
    }

    pub fn refresh_voice_profile(&self) -> Result<VoiceProfile> {
        let dictations = load_dictations(&self.get_connection()?)?;
        let profile = build_voice_profile(&dictations, Utc::now().timestamp());
        if let Some(path) = self.voice_profile_path() {
            fs::write(path, serde_json::to_string(&profile)?)?;
        }
        Ok(profile)
    }

    fn voice_profile_path(&self) -> Option<PathBuf> {
        Some(self.recordings_dir().parent()?.join(VOICE_PROFILE_FILE))
    }

    /// Fill in the word count and duration of dictations saved before those
    /// were recorded, e.g. a history copied over from Handy.
    pub(super) fn backfill_metadata(&self) {
        let filled = self
            .get_connection()
            .and_then(|conn| backfill_metadata(&conn, self.recordings_dir()));
        match filled {
            Ok(0) => {}
            Ok(count) => debug!("Filled in the metadata of {count} older dictations"),
            Err(e) => warn!("Could not fill in the metadata of older dictations: {e}"),
        }
    }
}

fn dictation_stats(conn: &Connection) -> Result<DictationStats> {
    let (dictation_count, word_count, duration_ms, paced_words, paced_ms) = conn.query_row(
        &format!(
            "SELECT COUNT(*),
                    COALESCE(SUM(word_count), 0),
                    COALESCE(SUM(audio_duration_ms), 0),
                    COALESCE(SUM(CASE WHEN audio_duration_ms > 0 THEN word_count END), 0),
                    COALESCE(SUM(CASE WHEN word_count IS NOT NULL AND audio_duration_ms > 0
                                      THEN audio_duration_ms END), 0)
             FROM transcription_history WHERE {DICTATIONS}"
        ),
        [],
        |row| {
            Ok((
                row.get::<_, u32>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, i64>(4)?,
            ))
        },
    )?;

    Ok(DictationStats {
        dictation_count,
        word_count,
        duration_ms,
        words_per_minute: (paced_ms > 0).then(|| paced_words as f64 / (paced_ms as f64 / 60_000.0)),
    })
}

fn daily_activity(conn: &Connection) -> Result<Vec<DailyActivity>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT date(timestamp, 'unixepoch', 'localtime') AS day,
                COUNT(*),
                COALESCE(SUM(word_count), 0),
                COALESCE(SUM(audio_duration_ms), 0)
         FROM transcription_history WHERE {DICTATIONS}
         GROUP BY day ORDER BY day"
    ))?;
    let rows = stmt.query_map([], |row| {
        Ok(DailyActivity {
            date: row.get(0)?,
            dictation_count: row.get(1)?,
            word_count: row.get(2)?,
            duration_ms: row.get(3)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// A dictation missing its word count or its duration.
struct PendingBackfill {
    id: i64,
    file_name: String,
    text: String,
    word_count: Option<i64>,
    duration_ms: Option<i64>,
}

fn backfill_metadata(conn: &Connection, recordings_dir: &Path) -> Result<usize> {
    let pending: Vec<PendingBackfill> = {
        let mut stmt = conn.prepare(
            "SELECT id, file_name, transcription_text, word_count, audio_duration_ms
             FROM transcription_history
             WHERE source_name IS NULL
               AND ((word_count IS NULL AND transcription_text != '')
                    OR audio_duration_ms IS NULL)",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(PendingBackfill {
                id: row.get(0)?,
                file_name: row.get(1)?,
                text: row.get(2)?,
                word_count: row.get(3)?,
                duration_ms: row.get(4)?,
            })
        })?;
        rows.collect::<rusqlite::Result<_>>()?
    };

    let mut filled = 0;
    for row in pending {
        let word_count = row
            .word_count
            .or_else(|| super::history::count_words(&row.text));
        let duration_ms = row
            .duration_ms
            .or_else(|| wav_duration_ms(&recordings_dir.join(&row.file_name)));
        if word_count == row.word_count && duration_ms == row.duration_ms {
            continue;
        }
        conn.execute(
            "UPDATE transcription_history SET word_count = ?1, audio_duration_ms = ?2 WHERE id = ?3",
            params![word_count, duration_ms, row.id],
        )?;
        filled += 1;
    }
    Ok(filled)
}

/// How long a recording lasts, from its size; `None` when it is gone.
fn wav_duration_ms(path: &Path) -> Option<i64> {
    let bytes = fs::metadata(path).ok()?.len();
    i64::try_from(bytes.saturating_sub(WAV_HEADER_BYTES) / WAV_BYTES_PER_MS).ok()
}

/// A dictation as the voice profile reads it.
struct Dictation {
    text: String,
    language: Option<String>,
}

fn load_dictations(conn: &Connection) -> Result<Vec<Dictation>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT transcription_text, language FROM transcription_history WHERE {DICTATIONS}"
    ))?;
    let rows = stmt.query_map([], |row| {
        Ok(Dictation {
            text: row.get(0)?,
            language: row.get(1)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

fn build_voice_profile(dictations: &[Dictation], now: i64) -> VoiceProfile {
    let stopwords: HashSet<&str> = STOPWORDS.iter().copied().collect();
    let mut words: HashMap<&str, u32> = HashMap::new();
    let mut phrases: HashMap<Vec<&str>, u32> = HashMap::new();
    let mut fillers: HashMap<&str, u32> = HashMap::new();
    let mut word_count: i64 = 0;

    let clauses: Vec<Vec<String>> = dictations
        .iter()
        .flat_map(|dictation| clauses(&dictation.text))
        .collect();
    for clause in &clauses {
        let tokens: Vec<&str> = clause.iter().map(String::as_str).collect();
        word_count += tokens.len() as i64;

        for token in &tokens {
            if token.chars().count() >= 3 && !stopwords.contains(token) {
                *words.entry(token).or_default() += 1;
            }
        }
        for size in 2..=MAX_CATCHPHRASE_WORDS {
            for window in tokens.windows(size) {
                // A phrase ending on "de" or "the" is a sentence cut short.
                let ends_on_content = window.last().is_some_and(|last| !stopwords.contains(last));
                if ends_on_content {
                    *phrases.entry(window.to_vec()).or_default() += 1;
                }
            }
        }
        for filler in FILLERS {
            let filler_tokens: Vec<&str> = filler.split(' ').collect();
            let count = tokens
                .windows(filler_tokens.len())
                .filter(|window| *window == filler_tokens.as_slice())
                .count() as u32;
            if count > 0 {
                *fillers.entry(filler).or_default() += count;
            }
        }
    }

    let with_language: Vec<&str> = dictations
        .iter()
        .filter_map(|dictation| dictation.language.as_deref())
        .collect();
    let english = with_language
        .iter()
        .filter(|language| language.starts_with("en"))
        .count();

    VoiceProfile {
        computed_at: now,
        dictation_count: dictations.len() as u32,
        word_count,
        top_words: ranked(
            words
                .into_iter()
                .map(|(word, count)| (word.to_string(), count)),
            TOP_WORDS,
        ),
        catchphrases: top_catchphrases(phrases),
        fillers: ranked(
            fillers
                .into_iter()
                .map(|(filler, count)| (filler.to_string(), count)),
            FILLERS.len(),
        ),
        english_share: (!with_language.is_empty())
            .then(|| english as f64 / with_language.len() as f64),
    }
}

/// The most repeated phrases, longer ones first at equal weight. A phrase
/// that almost always appears inside a longer one is left to the longer one.
fn top_catchphrases(phrases: HashMap<Vec<&str>, u32>) -> Vec<PhraseCount> {
    let mut candidates: Vec<(Vec<&str>, u32)> = phrases
        .into_iter()
        .filter(|(_, count)| *count >= MIN_CATCHPHRASE_COUNT)
        .collect();
    // Weight by the words a phrase saves repeating, then break ties stably.
    candidates.sort_by(|(a, a_count), (b, b_count)| {
        let weight = |tokens: &Vec<&str>, count: u32| count * (tokens.len() as u32 - 1);
        weight(b, *b_count)
            .cmp(&weight(a, *a_count))
            .then_with(|| b.len().cmp(&a.len()))
            .then_with(|| a.cmp(b))
    });

    let mut kept: Vec<(Vec<&str>, u32)> = Vec::new();
    for (tokens, count) in candidates {
        let overlaps = kept.iter().any(|(other, _)| {
            let (short, long) = if tokens.len() <= other.len() {
                (&tokens, other)
            } else {
                (other, &tokens)
            };
            long.windows(short.len())
                .any(|window| window == short.as_slice())
        });
        if !overlaps {
            kept.push((tokens, count));
        }
        if kept.len() == TOP_CATCHPHRASES {
            break;
        }
    }
    kept.into_iter()
        .map(|(tokens, count)| PhraseCount {
            text: tokens.join(" "),
            count,
        })
        .collect()
}

/// The `limit` most frequent entries, alphabetical at equal count.
fn ranked(counts: impl Iterator<Item = (String, u32)>, limit: usize) -> Vec<PhraseCount> {
    let mut ranked: Vec<PhraseCount> = counts
        .map(|(text, count)| PhraseCount { text, count })
        .collect();
    ranked.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.text.cmp(&b.text)));
    ranked.truncate(limit);
    ranked
}

/// Lowercased words, grouped by clause so that no phrase spans a pause.
fn clauses(text: &str) -> Vec<Vec<String>> {
    text.split(['.', '!', '?', ';', ':', ',', '\n', '(', ')', '«', '»', '"'])
        .map(|clause| {
            clause
                .split(|c: char| !c.is_alphabetic())
                .filter(|word| !word.is_empty())
                .map(str::to_lowercase)
                .collect::<Vec<_>>()
        })
        .filter(|words| !words.is_empty())
        .collect()
}

/// Sounds and expressions that fill a pause, in French and English.
const FILLERS: &[&str] = &[
    "euh",
    "heu",
    "hum",
    "ben",
    "bah",
    "bon",
    "voilà",
    "quoi",
    "genre",
    "du coup",
    "en fait",
    "en gros",
    "tu vois",
    "um",
    "uh",
    "like",
    "you know",
    "i mean",
    "basically",
    "actually",
];

/// Words every sentence needs, in French and English. Elided forms ("l'",
/// "qu'") reach here as their bare letters.
const STOPWORDS: &[&str] = &[
    // French
    "a", "à", "ai", "as", "au", "aux", "avec", "avez", "avons", "c", "ce", "cela", "ces", "cet",
    "cette", "ça", "d", "dans", "de", "des", "donc", "du", "elle", "elles", "en", "es", "est",
    "et", "été", "être", "eu", "il", "ils", "j", "je", "l", "la", "le", "les", "leur", "leurs",
    "lui", "m", "ma", "mais", "me", "mes", "moi", "mon", "n", "ne", "nos", "notre", "nous", "on",
    "ont", "ou", "où", "par", "pas", "plus", "pour", "qu", "que", "qui", "s", "sa", "se", "ses",
    "si", "son", "sont", "suis", "sur", "t", "ta", "te", "tes", "toi", "ton", "tu", "un", "une",
    "vos", "votre", "vous", "y", "était", "avait", "sera", "fait", "faire", "peut", "tout", "tous",
    "toute", "toutes", "très", "aussi", "bien", "comme", "quand", "alors", "sans", "sous", "entre",
    "chez", "vers", "cest", "oui", "non", "là", "ici", "puis", "car", "ni", "dont",
    // English
    "the", "and", "an", "of", "to", "in", "is", "it", "that", "this", "for", "on", "with", "be",
    "are", "was", "were", "i", "you", "he", "she", "we", "they", "them", "my", "your", "our",
    "their", "his", "her", "its", "at", "by", "from", "or", "but", "not", "have", "has", "had",
    "do", "does", "did", "will", "would", "can", "could", "should", "so", "if", "then", "there",
    "what", "which", "who", "when", "where", "how", "about", "just", "also", "been", "into",
    "than", "these", "those", "am", "me", "us", "no", "yes", "up", "out", "all", "some",
];

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_conn() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.execute_batch(
            "CREATE TABLE transcription_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_name TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                saved BOOLEAN NOT NULL DEFAULT 0,
                title TEXT NOT NULL DEFAULT '',
                transcription_text TEXT NOT NULL,
                source_name TEXT,
                language TEXT,
                audio_duration_ms INTEGER,
                word_count INTEGER
            );",
        )
        .expect("create transcription_history table");
        conn
    }

    fn insert(
        conn: &Connection,
        timestamp: i64,
        text: &str,
        words: Option<i64>,
        duration_ms: Option<i64>,
        source_name: Option<&str>,
    ) {
        conn.execute(
            "INSERT INTO transcription_history
                (file_name, timestamp, transcription_text, word_count, audio_duration_ms, source_name)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                format!("handy-{timestamp}.wav"),
                timestamp,
                text,
                words,
                duration_ms,
                source_name
            ],
        )
        .expect("insert entry");
    }

    fn dictation(text: &str, language: Option<&str>) -> Dictation {
        Dictation {
            text: text.to_string(),
            language: language.map(str::to_string),
        }
    }

    #[test]
    fn stats_count_dictations_only_and_pace_what_has_both_measures() {
        let conn = setup_conn();
        insert(&conn, 100, "a b c", Some(150), Some(60_000), None);
        // No duration: counted in the words, left out of the pace.
        insert(&conn, 200, "a b", Some(50), None, None);
        insert(
            &conn,
            300,
            "from a file",
            Some(999),
            Some(1),
            Some("talk.mp3"),
        );
        insert(&conn, 400, "", None, Some(5_000), None);

        let stats = dictation_stats(&conn).expect("compute stats");

        assert_eq!(stats.dictation_count, 2);
        assert_eq!(stats.word_count, 200);
        assert_eq!(stats.duration_ms, 60_000);
        assert_eq!(stats.words_per_minute, Some(150.0));
    }

    #[test]
    fn stats_of_an_empty_history_have_no_pace() {
        let stats = dictation_stats(&setup_conn()).expect("compute stats");

        assert_eq!(stats.dictation_count, 0);
        assert_eq!(stats.words_per_minute, None);
    }

    #[test]
    fn activity_is_grouped_by_day_in_order() {
        let conn = setup_conn();
        let day = 24 * 60 * 60;
        insert(&conn, 10 * day, "a", Some(10), Some(1_000), None);
        insert(&conn, 10 * day + 60, "b", Some(5), Some(2_000), None);
        insert(&conn, 13 * day, "c", Some(1), Some(500), None);

        let activity = daily_activity(&conn).expect("compute activity");

        assert_eq!(activity.len(), 2);
        assert!(activity[0].date < activity[1].date);
        assert_eq!(activity[0].dictation_count, 2);
        assert_eq!(activity[0].word_count, 15);
        assert_eq!(activity[0].duration_ms, 3_000);
    }

    #[test]
    fn backfill_counts_words_and_reads_durations_from_recordings() {
        let conn = setup_conn();
        let dir = std::env::temp_dir().join(format!("unmute-backfill-{}", std::process::id()));
        fs::create_dir_all(&dir).expect("create recordings dir");
        // One second of 16 kHz mono 16-bit audio.
        fs::write(dir.join("handy-100.wav"), vec![0u8; 44 + 32_000]).expect("write wav");
        insert(&conn, 100, "trois petits mots", None, None, None);
        insert(&conn, 200, "audio gone", None, None, None);

        let filled = backfill_metadata(&conn, &dir).expect("backfill");
        let again = backfill_metadata(&conn, &dir).expect("backfill again");
        fs::remove_dir_all(&dir).ok();

        assert_eq!(filled, 2);
        assert_eq!(again, 0);
        let row = |timestamp: i64| -> (Option<i64>, Option<i64>) {
            conn.query_row(
                    "SELECT word_count, audio_duration_ms FROM transcription_history WHERE timestamp = ?1",
                    [timestamp],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .expect("read row")
        };
        assert_eq!(row(100), (Some(3), Some(1_000)));
        assert_eq!(row(200), (Some(2), None));
    }

    #[test]
    fn profile_finds_the_catchphrase_and_the_top_word() {
        let dictations = vec![
            dictation("Du coup, on lance le projet Fruggr demain.", Some("fr")),
            dictation("Du coup le projet avance. Du coup c'est bien !", Some("fr")),
            dictation("The Fruggr project is late, du coup.", Some("en")),
            dictation("Fruggr encore, Fruggr toujours, Fruggr.", None),
        ];

        let profile = build_voice_profile(&dictations, 42);

        assert_eq!(profile.computed_at, 42);
        assert_eq!(profile.dictation_count, 4);
        assert_eq!(
            profile.catchphrases.first(),
            Some(&PhraseCount {
                text: "du coup".to_string(),
                count: 4
            })
        );
        assert_eq!(
            profile.top_words.first(),
            Some(&PhraseCount {
                text: "fruggr".to_string(),
                count: 5
            })
        );
        assert!(profile.fillers.contains(&PhraseCount {
            text: "du coup".to_string(),
            count: 4
        }));
        assert_eq!(profile.english_share, Some(1.0 / 3.0));
    }

    #[test]
    fn a_phrase_never_spans_a_pause_or_ends_on_a_stopword() {
        let dictations = vec![
            dictation("le client, le client, le client", None),
            dictation("parle de. parle de. parle de.", None),
        ];

        let profile = build_voice_profile(&dictations, 0);

        assert_eq!(
            profile.catchphrases,
            vec![PhraseCount {
                text: "le client".to_string(),
                count: 3
            }]
        );
    }

    #[test]
    fn an_empty_history_gives_an_empty_profile() {
        let profile = build_voice_profile(&[], 0);

        assert!(profile.top_words.is_empty());
        assert!(profile.catchphrases.is_empty());
        assert_eq!(profile.english_share, None);
    }
}
