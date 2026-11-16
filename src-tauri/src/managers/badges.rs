//! Badges and the belt: small rewards for using dictation, earned from the
//! history.
//!
//! The history is purged after a while, so what was earned and the lifetime
//! totals are kept in their own file: a badge stays earned, and the belt keeps
//! counting, after the dictations behind them are gone.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::PathBuf;

use anyhow::Result;
use chrono::{Datelike, Local, NaiveDate, NaiveDateTime, TimeZone, Timelike, Utc, Weekday};
use log::warn;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use specta::Type;

use super::history::HistoryManager;
use super::insights::{clauses, ENGLISH_STOPWORDS, FRENCH_STOPWORDS};

const BADGES_FILE: &str = "badges.json";

/// Lifetime words needed for each belt, white to black.
const BELT_WORDS: [i64; 7] = [0, 2_000, 10_000, 25_000, 60_000, 120_000, 250_000];

const WEEK_WORDS: f64 = 10_000.0;
const DAY_WORDS: f64 = 3_500.0;
const STREAK_DAYS: f64 = 100.0;
const COMEBACK_DAYS: i64 = 14;
const MAILS_A_DAY: f64 = 20.0;
const WEEK_VOCABULARY: f64 = 1_000.0;
const SHORT_MESSAGE_WORDS: i64 = 10;
const SHORT_MESSAGES_A_DAY: f64 = 10.0;
const FAST_PACE: f64 = 180.0;
/// A pace over fewer words than this is noise.
const PACED_WORDS: i64 = 30;
const LONG_SENTENCE_WORDS: f64 = 60.0;
const CLEAN_DICTATION_WORDS: usize = 150;
const FRANGLAIS_WORDS: usize = 3;
const NEW_WORD_LETTERS: usize = 9;
/// History a word must be absent from before it counts as new.
const NEW_WORD_HISTORY: usize = 2_000;
const BURST_DICTATIONS: usize = 5;
const BURST_SECONDS: i64 = 15 * 60;
const NOMAD_APPS: f64 = 10.0;
const DIESEL_SIDE_DICTATIONS: usize = 3;
const DIESEL_GAIN: f64 = 1.2;
const PHOENIX_PERIOD_DAYS: i64 = 30;
const PHOENIX_PERIOD_WORDS: i64 = 1_000;
const SECRET_WORD: &str = "unmute";
const SECRET_TIMES: usize = 3;

/// Sounds of hesitation. Narrower than the profile's fillers: "bon" or
/// "voilà" are words, "euh" is a stumble.
const HESITATIONS: &[&str] = &["euh", "heu", "hum", "hmm", "ben", "bah", "um", "uh", "er"];

/// English that French offices speak.
const OFFICE_ENGLISH: &[&str] = &[
    "asap",
    "call",
    "meeting",
    "roadmap",
    "deadline",
    "feedback",
    "brief",
    "briefing",
    "kickoff",
    "workshop",
    "team",
    "lead",
    "manager",
    "business",
    "pitch",
    "deck",
    "slide",
    "slides",
    "sprint",
    "backlog",
    "release",
    "review",
    "process",
    "reporting",
    "planning",
    "challenge",
    "insight",
    "insights",
    "mindset",
    "pipeline",
    "onboarding",
    "update",
    "sync",
    "checker",
    "forward",
    "forwarder",
    "booster",
    "driver",
    "aligner",
    "benchmark",
    "scope",
    "staffing",
    "followup",
    "target",
    "deal",
    "lead",
    "leads",
    "prospect",
    "closing",
    "upsell",
];

const MAIL_APPS: &[&str] = &[
    "mail",
    "outlook",
    "gmail",
    "spark",
    "airmail",
    "superhuman",
    "thunderbird",
    "mimestream",
    "proton",
    "hey",
];

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum BadgeCategory {
    Volume,
    Style,
    Moments,
    Progress,
    Together,
    Secret,
}

/// A badge as the catalogue defines it. Names and descriptions are the
/// frontend's, by `id`.
struct Definition {
    id: &'static str,
    category: BadgeCategory,
    /// `false` for badges that wait on a feature Unmute doesn't have yet.
    available: bool,
}

const fn badge(id: &'static str, category: BadgeCategory) -> Definition {
    Definition {
        id,
        category,
        available: true,
    }
}

const fn soon(id: &'static str, category: BadgeCategory) -> Definition {
    Definition {
        id,
        category,
        available: false,
    }
}

const CATALOGUE: &[Definition] = &[
    badge("first_draft", BadgeCategory::Volume),
    badge("big_talker", BadgeCategory::Volume),
    badge("tour_de_france", BadgeCategory::Volume),
    badge("eternal_flame", BadgeCategory::Volume),
    badge("comeback", BadgeCategory::Volume),
    badge("inbox_zero", BadgeCategory::Volume),
    badge("shakespeare", BadgeCategory::Style),
    badge("laconic", BadgeCategory::Style),
    badge("diesel", BadgeCategory::Style),
    badge("tgv", BadgeCategory::Style),
    badge("philosopher", BadgeCategory::Style),
    badge("no_net", BadgeCategory::Style),
    badge("franglais", BadgeCategory::Style),
    badge("neologist", BadgeCategory::Style),
    badge("early_bird", BadgeCategory::Moments),
    badge("afterwork", BadgeCategory::Moments),
    badge("sunday_night", BadgeCategory::Moments),
    badge("coffee_break", BadgeCategory::Moments),
    badge("nomad", BadgeCategory::Moments),
    badge("phoenix", BadgeCategory::Progress),
    soon("metronome", BadgeCategory::Progress),
    soon("perfect_pitch", BadgeCategory::Progress),
    soon("chef_breath", BadgeCategory::Progress),
    soon("remontada", BadgeCategory::Progress),
    soon("ambassador", BadgeCategory::Together),
    soon("influencer", BadgeCategory::Together),
    soon("silver_glossary", BadgeCategory::Together),
    soon("team_spirit", BadgeCategory::Together),
    badge("easter_egg", BadgeCategory::Secret),
];

/// How far along a badge is, in its own unit (words, days, apps).
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, Type)]
pub struct BadgeProgress {
    pub current: f64,
    pub target: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Type)]
pub struct BadgeStatus {
    pub id: String,
    pub category: BadgeCategory,
    pub available: bool,
    pub earned_at: Option<i64>,
    /// Only for badges that count toward something, and until earned.
    pub progress: Option<BadgeProgress>,
}

/// The belt: a level that only goes up, from the words dictated in all.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Standing {
    /// 0 (white) to 6 (black).
    pub belt: u32,
    pub lifetime_words: i64,
    pub lifetime_dictations: i64,
    /// Where this belt started, and where the next one does (`None` at black).
    pub belt_words: i64,
    pub next_belt_words: Option<i64>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Type)]
pub struct BadgeBoard {
    pub standing: Standing,
    pub badges: Vec<BadgeStatus>,
    /// Earned by this very check, for the interface to celebrate.
    pub newly_earned: Vec<String>,
}

/// What outlives the history.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
struct Ledger {
    earned: BTreeMap<String, i64>,
    /// Dictations up to this id are in the lifetime totals.
    counted_up_to_id: i64,
    lifetime_words: i64,
    lifetime_dictations: i64,
}

/// A dictation as the rules read it.
#[derive(Clone, Debug)]
struct Fact {
    id: i64,
    timestamp: i64,
    /// When it was dictated, on the user's clock.
    at: NaiveDateTime,
    text: String,
    words: i64,
    duration_ms: Option<i64>,
    app: Option<String>,
}

impl Fact {
    fn pace(&self) -> Option<f64> {
        let duration = self.duration_ms.filter(|ms| *ms > 0)?;
        (self.words >= PACED_WORDS).then(|| self.words as f64 / (duration as f64 / 60_000.0))
    }

    fn tokens(&self) -> Vec<String> {
        clauses(&self.text).into_iter().flatten().collect()
    }
}

/// What the rules found for one badge.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct Outcome {
    earned_at: Option<i64>,
    progress: Option<BadgeProgress>,
}

fn earned(at: i64) -> Outcome {
    Outcome {
        earned_at: Some(at),
        progress: None,
    }
}

/// Earned once `best` reaches `target`, at `at`; a progress bar until then.
fn counted(best: f64, target: f64, at: Option<i64>) -> Outcome {
    if best >= target {
        Outcome {
            earned_at: at,
            progress: None,
        }
    } else {
        Outcome {
            earned_at: None,
            progress: Some(BadgeProgress {
                current: best,
                target,
            }),
        }
    }
}

/// The first fact a test holds for, as an earned badge.
fn first(facts: &[Fact], test: impl Fn(&Fact) -> bool) -> Outcome {
    facts
        .iter()
        .find(|fact| test(fact))
        .map_or_else(Outcome::default, |fact| earned(fact.timestamp))
}

/// The largest total among groups of facts, and the last fact of that group.
fn best_group<K: Ord>(
    facts: &[Fact],
    key: impl Fn(&Fact) -> Option<K>,
    weight: impl Fn(&Fact) -> f64,
) -> (f64, Option<i64>) {
    let mut groups: BTreeMap<K, (f64, i64)> = BTreeMap::new();
    for fact in facts {
        if let Some(key) = key(fact) {
            let group = groups.entry(key).or_insert((0.0, fact.timestamp));
            group.0 += weight(fact);
            group.1 = fact.timestamp;
        }
    }
    groups.into_values().fold((0.0, None), |best, (total, at)| {
        if total > best.0 {
            (total, Some(at))
        } else {
            best
        }
    })
}

fn week_of(fact: &Fact) -> (i32, u32) {
    let week = fact.at.iso_week();
    (week.year(), week.week())
}

fn is_mail(fact: &Fact) -> bool {
    fact.app.as_deref().is_some_and(|app| {
        let app = app.to_lowercase();
        MAIL_APPS.iter().any(|mail| app.contains(mail))
    })
}

fn hesitations(tokens: &[String]) -> usize {
    tokens
        .iter()
        .filter(|token| HESITATIONS.contains(&token.as_str()))
        .count()
}

fn longest_streak(facts: &[Fact]) -> (f64, Option<i64>) {
    let mut best = (0.0, None);
    let mut run = 0.0;
    let mut previous: Option<NaiveDate> = None;
    for fact in facts {
        let day = fact.at.date();
        match previous {
            Some(last) if last == day => {}
            Some(last) if last.succ_opt() == Some(day) => run += 1.0,
            _ => run = 1.0,
        }
        previous = Some(day);
        if run > best.0 {
            best = (run, Some(fact.timestamp));
        }
    }
    best
}

fn comeback(facts: &[Fact]) -> Outcome {
    facts
        .windows(2)
        .find(|pair| (pair[1].at.date() - pair[0].at.date()).num_days() >= COMEBACK_DAYS)
        .map_or_else(Outcome::default, |pair| earned(pair[1].timestamp))
}

fn week_vocabulary(facts: &[Fact]) -> (f64, Option<i64>) {
    let mut weeks: BTreeMap<(i32, u32), (HashSet<String>, i64)> = BTreeMap::new();
    for fact in facts {
        let week = weeks.entry(week_of(fact)).or_default();
        week.0.extend(
            fact.tokens()
                .into_iter()
                .filter(|word| word.chars().count() >= 3),
        );
        week.1 = fact.timestamp;
    }
    weeks
        .into_values()
        .map(|(words, at)| (words.len() as f64, Some(at)))
        .fold(
            (0.0, None),
            |best, week| if week.0 > best.0 { week } else { best },
        )
}

/// A day that starts slow and ends fast.
fn diesel(facts: &[Fact]) -> Outcome {
    let mut days: BTreeMap<NaiveDate, (Vec<f64>, Vec<f64>, i64)> = BTreeMap::new();
    for fact in facts {
        let Some(pace) = fact.pace() else { continue };
        let day = days.entry(fact.at.date()).or_default();
        match fact.at.hour() {
            0..=11 => day.0.push(pace),
            16..=23 => day.1.push(pace),
            _ => {}
        }
        day.2 = fact.timestamp;
    }
    let mean = |paces: &[f64]| paces.iter().sum::<f64>() / paces.len() as f64;
    days.into_values()
        .find(|(morning, evening, _)| {
            morning.len() >= DIESEL_SIDE_DICTATIONS
                && evening.len() >= DIESEL_SIDE_DICTATIONS
                && mean(evening) >= mean(morning) * DIESEL_GAIN
        })
        .map_or_else(Outcome::default, |(_, _, at)| earned(at))
}

fn longest_sentence(facts: &[Fact]) -> (f64, Option<i64>) {
    let mut best = (0.0, None);
    for fact in facts {
        for sentence in fact.text.split(['.', '!', '?', '\n']) {
            let words = sentence.split_whitespace().count() as f64;
            if words > best.0 {
                best = (words, Some(fact.timestamp));
            }
        }
    }
    best
}

/// A French clause carrying office English: "on fait un call ASAP".
fn franglais(facts: &[Fact]) -> Outcome {
    let french: HashSet<&str> = FRENCH_STOPWORDS.iter().copied().collect();
    let english: HashSet<&str> = ENGLISH_STOPWORDS.iter().copied().collect();
    first(facts, |fact| {
        clauses(&fact.text).iter().any(|clause| {
            let count = |set: &HashSet<&str>, other: &HashSet<&str>| {
                clause
                    .iter()
                    .filter(|word| set.contains(word.as_str()) && !other.contains(word.as_str()))
                    .count()
            };
            let office: HashSet<&str> = clause
                .iter()
                .map(String::as_str)
                .filter(|word| OFFICE_ENGLISH.contains(word))
                .collect();
            count(&french, &english) > count(&english, &french) && office.len() >= FRANGLAIS_WORDS
        })
    })
}

/// A long word the history had never heard, once there is a history.
fn neologist(facts: &[Fact]) -> Outcome {
    let mut heard: HashSet<String> = HashSet::new();
    let mut total = 0;
    for fact in facts {
        let tokens = fact.tokens();
        let new_word = total >= NEW_WORD_HISTORY
            && tokens
                .iter()
                .any(|word| word.chars().count() >= NEW_WORD_LETTERS && !heard.contains(word));
        if new_word {
            return earned(fact.timestamp);
        }
        total += tokens.len();
        heard.extend(tokens);
    }
    Outcome::default()
}

fn coffee_break(facts: &[Fact]) -> Outcome {
    facts
        .windows(BURST_DICTATIONS)
        .find(|burst| burst[BURST_DICTATIONS - 1].timestamp - burst[0].timestamp <= BURST_SECONDS)
        .map_or_else(Outcome::default, |burst| {
            earned(burst[BURST_DICTATIONS - 1].timestamp)
        })
}

fn nomad(facts: &[Fact]) -> Outcome {
    let mut apps: HashSet<&str> = HashSet::new();
    let mut reached = None;
    for fact in facts {
        if let Some(app) = fact.app.as_deref() {
            apps.insert(app);
            if apps.len() as f64 >= NOMAD_APPS && reached.is_none() {
                reached = Some(fact.timestamp);
            }
        }
    }
    counted(apps.len() as f64, NOMAD_APPS, reached)
}

/// Hesitations per word halved from one month to the next.
fn phoenix(facts: &[Fact], now: i64) -> Outcome {
    let period = PHOENIX_PERIOD_DAYS * 24 * 60 * 60;
    let rate = |from: i64, to: i64| {
        let (mut words, mut stumbles) = (0, 0);
        for fact in facts
            .iter()
            .filter(|fact| fact.timestamp > from && fact.timestamp <= to)
        {
            let tokens = fact.tokens();
            words += tokens.len() as i64;
            stumbles += hesitations(&tokens) as i64;
        }
        (words >= PHOENIX_PERIOD_WORDS).then(|| stumbles as f64 / words as f64)
    };
    match (
        rate(now - 2 * period, now - period),
        rate(now - period, now),
    ) {
        (Some(before), Some(after)) if before > 0.0 && after <= before / 2.0 => earned(now),
        _ => Outcome::default(),
    }
}

/// Every available badge's outcome over `facts`, oldest first.
fn evaluate(facts: &[Fact], now: i64) -> HashMap<&'static str, Outcome> {
    let words = |fact: &Fact| fact.words as f64;
    let (week_words, week_at) = best_group(facts, |fact| Some(week_of(fact)), words);
    let (day_words, day_at) = best_group(facts, |fact| Some(fact.at.date()), words);
    let (streak, streak_at) = longest_streak(facts);
    let (mails, mails_at) =
        best_group(facts, |fact| is_mail(fact).then(|| fact.at.date()), |_| 1.0);
    let (vocabulary, vocabulary_at) = week_vocabulary(facts);
    let (short, short_at) = best_group(
        facts,
        |fact| (fact.words <= SHORT_MESSAGE_WORDS).then(|| fact.at.date()),
        |_| 1.0,
    );
    let fastest = facts
        .iter()
        .filter_map(|fact| Some((fact.pace()?, fact.timestamp)))
        .fold((0.0, None), |best, (pace, at)| {
            if pace > best.0 {
                (pace, Some(at))
            } else {
                best
            }
        });
    let (sentence, sentence_at) = longest_sentence(facts);

    HashMap::from([
        ("first_draft", first(facts, |_| true)),
        ("big_talker", counted(week_words, WEEK_WORDS, week_at)),
        ("tour_de_france", counted(day_words, DAY_WORDS, day_at)),
        ("eternal_flame", counted(streak, STREAK_DAYS, streak_at)),
        ("comeback", comeback(facts)),
        ("inbox_zero", counted(mails, MAILS_A_DAY, mails_at)),
        (
            "shakespeare",
            counted(vocabulary, WEEK_VOCABULARY, vocabulary_at),
        ),
        ("laconic", counted(short, SHORT_MESSAGES_A_DAY, short_at)),
        ("diesel", diesel(facts)),
        // Strictly faster than the bar: "more than 180 words a minute".
        (
            "tgv",
            counted(fastest.0.floor(), FAST_PACE + 1.0, fastest.1),
        ),
        (
            "philosopher",
            counted(sentence, LONG_SENTENCE_WORDS + 1.0, sentence_at),
        ),
        (
            "no_net",
            first(facts, |fact| {
                let tokens = fact.tokens();
                tokens.len() >= CLEAN_DICTATION_WORDS && hesitations(&tokens) == 0
            }),
        ),
        ("franglais", franglais(facts)),
        ("neologist", neologist(facts)),
        (
            "early_bird",
            first(facts, |fact| (4..7).contains(&fact.at.hour())),
        ),
        (
            "afterwork",
            first(facts, |fact| {
                fact.at.weekday() == Weekday::Fri && fact.at.hour() >= 18
            }),
        ),
        (
            "sunday_night",
            first(facts, |fact| {
                fact.at.weekday() == Weekday::Sun && fact.at.hour() >= 18
            }),
        ),
        ("coffee_break", coffee_break(facts)),
        ("nomad", nomad(facts)),
        ("phoenix", phoenix(facts, now)),
        (
            "easter_egg",
            first(facts, |fact| {
                fact.tokens()
                    .iter()
                    .filter(|word| word.as_str() == SECRET_WORD)
                    .count()
                    >= SECRET_TIMES
            }),
        ),
    ])
}

fn standing(ledger: &Ledger) -> Standing {
    let belt = BELT_WORDS
        .iter()
        .rposition(|words| ledger.lifetime_words >= *words)
        .unwrap_or(0);
    Standing {
        belt: belt as u32,
        lifetime_words: ledger.lifetime_words,
        lifetime_dictations: ledger.lifetime_dictations,
        belt_words: BELT_WORDS[belt],
        next_belt_words: BELT_WORDS.get(belt + 1).copied(),
    }
}

/// Bring `ledger` up to date with `facts` and lay the board out.
fn check(ledger: &mut Ledger, facts: &[Fact], now: i64) -> BadgeBoard {
    for fact in facts
        .iter()
        .filter(|fact| fact.id > ledger.counted_up_to_id)
    {
        ledger.lifetime_words += fact.words;
        ledger.lifetime_dictations += 1;
    }
    if let Some(latest) = facts.iter().map(|fact| fact.id).max() {
        ledger.counted_up_to_id = ledger.counted_up_to_id.max(latest);
    }

    let outcomes = evaluate(facts, now);
    let mut newly_earned = Vec::new();
    let badges = CATALOGUE
        .iter()
        .map(|definition| {
            let outcome = outcomes.get(definition.id).copied().unwrap_or_default();
            if let Some(at) = outcome.earned_at {
                if !ledger.earned.contains_key(definition.id) {
                    ledger.earned.insert(definition.id.to_string(), at);
                    newly_earned.push(definition.id.to_string());
                }
            }
            let earned_at = ledger.earned.get(definition.id).copied();
            BadgeStatus {
                id: definition.id.to_string(),
                category: definition.category,
                available: definition.available,
                earned_at,
                progress: outcome.progress.filter(|_| earned_at.is_none()),
            }
        })
        .collect();

    BadgeBoard {
        standing: standing(ledger),
        badges,
        newly_earned,
    }
}

fn load_facts(conn: &Connection) -> Result<Vec<Fact>> {
    let mut stmt = conn.prepare(
        "SELECT id, timestamp, transcription_text, word_count, audio_duration_ms,
                COALESCE(app_name, app_bundle_id)
         FROM transcription_history
         WHERE source_name IS NULL AND transcription_text != ''
         ORDER BY timestamp, id",
    )?;
    let rows = stmt.query_map([], |row| {
        let timestamp: i64 = row.get(1)?;
        let text: String = row.get(2)?;
        let words = row
            .get::<_, Option<i64>>(3)?
            .unwrap_or_else(|| text.split_whitespace().count() as i64);
        Ok(Fact {
            id: row.get(0)?,
            timestamp,
            at: Local
                .timestamp_opt(timestamp, 0)
                .single()
                .map(|at| at.naive_local())
                .unwrap_or_default(),
            text,
            words,
            duration_ms: row.get(4)?,
            app: row.get(5)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

impl HistoryManager {
    fn badges_path(&self) -> Option<PathBuf> {
        Some(self.recordings_dir().parent()?.join(BADGES_FILE))
    }

    /// Check the history for badges, remember what was earned, and return
    /// the board.
    pub fn badge_board(&self) -> Result<BadgeBoard> {
        let path = self.badges_path();
        let mut ledger: Ledger = path
            .as_ref()
            .and_then(|path| fs::read_to_string(path).ok())
            .and_then(|content| serde_json::from_str(&content).ok())
            .unwrap_or_default();
        let before = ledger.clone();

        let facts = load_facts(&self.get_connection()?)?;
        let board = check(&mut ledger, &facts, Utc::now().timestamp());

        if ledger != before {
            if let Some(path) = path {
                fs::write(path, serde_json::to_string(&ledger)?)?;
            }
        }
        Ok(board)
    }

    /// Count what the history holds before any of it is purged.
    pub(super) fn record_badges(&self) {
        if let Err(e) = self.badge_board() {
            warn!("Could not update the badges: {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const DAY: i64 = 24 * 60 * 60;
    /// Monday 4 January 2027, midnight.
    const MONDAY: i64 = 1_799_020_800;

    /// A dictation `seconds` after that Monday, clock and timestamp agreeing.
    fn fact(id: i64, seconds: i64, text: &str) -> Fact {
        let timestamp = MONDAY + seconds;
        Fact {
            id,
            timestamp,
            at: chrono::DateTime::from_timestamp(timestamp, 0)
                .expect("valid timestamp")
                .naive_utc(),
            text: text.to_string(),
            words: text.split_whitespace().count() as i64,
            duration_ms: None,
            app: None,
        }
    }

    fn words(count: usize) -> String {
        vec!["mot"; count].join(" ")
    }

    fn earned_ids(facts: &[Fact]) -> Vec<&'static str> {
        let mut ids: Vec<_> = evaluate(facts, MONDAY + 400 * DAY)
            .into_iter()
            .filter(|(_, outcome)| outcome.earned_at.is_some())
            .map(|(id, _)| id)
            .collect();
        ids.sort_unstable();
        ids
    }

    #[test]
    fn the_calendar_anchor_is_a_monday() {
        assert_eq!(fact(1, 0, "x").at.weekday(), Weekday::Mon);
    }

    #[test]
    fn a_first_dictation_earns_only_the_first_badge() {
        assert_eq!(
            earned_ids(&[fact(1, 10 * 3600, "bonjour")]),
            ["first_draft"]
        );
    }

    #[test]
    fn a_big_day_is_counted_and_shown_as_progress_until_then() {
        let short = [fact(1, 10 * 3600, &words(1_000))];
        let outcome = evaluate(&short, MONDAY)["tour_de_france"];
        assert_eq!(
            outcome.progress,
            Some(BadgeProgress {
                current: 1_000.0,
                target: DAY_WORDS
            })
        );

        let long = [
            fact(1, 10 * 3600, &words(2_000)),
            fact(2, 11 * 3600, &words(1_500)),
        ];
        assert_eq!(
            evaluate(&long, MONDAY)["tour_de_france"].earned_at,
            Some(MONDAY + 11 * 3600)
        );
    }

    #[test]
    fn a_streak_counts_days_in_a_row_and_breaks_on_a_gap() {
        let facts = [
            fact(1, 10 * 3600, "a"),
            fact(2, 12 * 3600, "a"),
            fact(3, DAY + 10 * 3600, "a"),
            fact(4, 3 * DAY + 10 * 3600, "a"),
        ];

        assert_eq!(longest_streak(&facts).0, 2.0);
    }

    #[test]
    fn coming_back_after_two_weeks_is_noticed() {
        let away = [fact(1, 10 * 3600, "a"), fact(2, 14 * DAY + 10 * 3600, "a")];
        let regular = [fact(1, 10 * 3600, "a"), fact(2, 13 * DAY + 10 * 3600, "a")];

        assert!(earned_ids(&away).contains(&"comeback"));
        assert!(!earned_ids(&regular).contains(&"comeback"));
    }

    #[test]
    fn moments_follow_the_clock() {
        let early = fact(1, 6 * 3600, "a");
        let friday_evening = fact(2, 4 * DAY + 19 * 3600, "a");
        let sunday_evening = fact(3, 6 * DAY + 20 * 3600, "a");
        let ids = earned_ids(&[early, friday_evening, sunday_evening]);

        assert!(ids.contains(&"early_bird"));
        assert!(ids.contains(&"afterwork"));
        assert!(ids.contains(&"sunday_night"));
        assert!(!earned_ids(&[fact(1, 2 * 3600, "a")]).contains(&"early_bird"));
    }

    #[test]
    fn five_dictations_in_a_quarter_of_an_hour_is_a_coffee_break() {
        let burst: Vec<Fact> = (0..5).map(|i| fact(i, 10 * 3600 + i * 200, "a")).collect();
        let spread: Vec<Fact> = (0..5).map(|i| fact(i, 10 * 3600 + i * 300, "a")).collect();

        assert!(earned_ids(&burst).contains(&"coffee_break"));
        assert!(!earned_ids(&spread).contains(&"coffee_break"));
    }

    #[test]
    fn a_fast_long_enough_dictation_is_a_tgv() {
        let mut fast = fact(1, 10 * 3600, &words(100));
        fast.duration_ms = Some(30_000); // 200 words a minute
        let mut short = fact(2, 11 * 3600, &words(10));
        short.duration_ms = Some(1_000);

        assert!(earned_ids(&[fast]).contains(&"tgv"));
        assert!(!earned_ids(&[short]).contains(&"tgv"));
    }

    #[test]
    fn franglais_is_french_carrying_office_english() {
        let mixed = fact(
            1,
            10 * 3600,
            "On fait un call ASAP pour aligner la roadmap.",
        );
        let english = fact(
            2,
            11 * 3600,
            "We have a call about the roadmap and the deadline.",
        );

        assert!(earned_ids(&[mixed]).contains(&"franglais"));
        assert!(!earned_ids(&[english]).contains(&"franglais"));
    }

    #[test]
    fn the_secret_is_the_name_said_three_times() {
        let found = fact(1, 10 * 3600, "Unmute, unmute et encore Unmute !");
        let twice = fact(2, 11 * 3600, "Unmute et unmute.");

        assert!(earned_ids(&[found]).contains(&"easter_egg"));
        assert!(!earned_ids(&[twice]).contains(&"easter_egg"));
    }

    #[test]
    fn apps_are_counted_toward_the_nomad() {
        let mut facts: Vec<Fact> = (0..10).map(|i| fact(i, i * 3600, "a")).collect();
        for (index, fact) in facts.iter_mut().enumerate() {
            fact.app = Some(format!("App {index}"));
        }

        assert!(earned_ids(&facts).contains(&"nomad"));
        assert_eq!(
            evaluate(&facts[..4], MONDAY)["nomad"].progress,
            Some(BadgeProgress {
                current: 4.0,
                target: NOMAD_APPS
            })
        );
    }

    #[test]
    fn what_was_earned_and_counted_outlives_the_history() {
        let mut ledger = Ledger::default();
        let facts = [
            fact(1, 10 * 3600, &words(1_500)),
            fact(2, 11 * 3600, &words(600)),
        ];

        let board = check(&mut ledger, &facts, MONDAY + DAY);
        assert!(board.newly_earned.contains(&"first_draft".to_string()));
        assert_eq!(board.standing.lifetime_words, 2_100);
        assert_eq!(board.standing.belt, 1);
        assert_eq!(board.standing.next_belt_words, Some(10_000));

        // The history is purged; a new dictation arrives.
        let later = [fact(3, 2 * DAY, &words(100))];
        let board = check(&mut ledger, &later, MONDAY + 3 * DAY);
        assert!(board.newly_earned.is_empty());
        assert_eq!(board.standing.lifetime_words, 2_200);
        assert_eq!(board.standing.lifetime_dictations, 3);
        let first = board
            .badges
            .iter()
            .find(|badge| badge.id == "first_draft")
            .expect("badge listed");
        assert_eq!(first.earned_at, Some(MONDAY + 10 * 3600));
    }

    #[test]
    fn every_available_badge_has_a_rule_and_the_rest_wait() {
        let outcomes = evaluate(&[], MONDAY);
        for definition in CATALOGUE {
            assert_eq!(
                outcomes.contains_key(definition.id),
                definition.available,
                "{}",
                definition.id
            );
        }
    }
}
