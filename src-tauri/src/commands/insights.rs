use crate::managers::{
    badges::BadgeBoard,
    history::HistoryManager,
    insights::{DailyActivity, DictationStats, VoicePortrait, VoiceProfile},
};
use crate::voice_portrait::{self, PortraitProvider};
use std::sync::Arc;
use tauri::{AppHandle, State};

#[tauri::command]
#[specta::specta]
pub async fn get_dictation_stats(
    history_manager: State<'_, Arc<HistoryManager>>,
) -> Result<DictationStats, String> {
    history_manager.dictation_stats().map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn get_daily_activity(
    history_manager: State<'_, Arc<HistoryManager>>,
) -> Result<Vec<DailyActivity>, String> {
    history_manager.daily_activity().map_err(|e| e.to_string())
}

/// The profile from the last refresh; `None` before the first one.
#[tauri::command]
#[specta::specta]
pub async fn get_voice_profile(
    history_manager: State<'_, Arc<HistoryManager>>,
) -> Result<Option<VoiceProfile>, String> {
    Ok(history_manager.voice_profile())
}

#[tauri::command]
#[specta::specta]
pub async fn refresh_voice_profile(
    history_manager: State<'_, Arc<HistoryManager>>,
) -> Result<VoiceProfile, String> {
    history_manager
        .refresh_voice_profile()
        .map_err(|e| e.to_string())
}

/// The portrait from the last time one was written; `None` before the first.
#[tauri::command]
#[specta::specta]
pub async fn get_voice_portrait(
    history_manager: State<'_, Arc<HistoryManager>>,
) -> Result<Option<VoicePortrait>, String> {
    Ok(history_manager.voice_portrait())
}

/// The model a portrait would be written with; `None` when none is set up.
#[tauri::command]
#[specta::specta]
pub async fn get_voice_portrait_provider(
    app: AppHandle,
) -> Result<Option<PortraitProvider>, String> {
    Ok(voice_portrait::provider(&app))
}

/// Have the post-processing provider write the portrait. Sends excerpts of the
/// dictations to it, so call this only when the user asks.
#[tauri::command]
#[specta::specta]
pub async fn refresh_voice_portrait(app: AppHandle) -> Result<VoicePortrait, String> {
    voice_portrait::refresh(&app).await
}

/// Badges and the belt, checked against the history as it is now.
#[tauri::command]
#[specta::specta]
pub async fn get_badge_board(
    history_manager: State<'_, Arc<HistoryManager>>,
) -> Result<BadgeBoard, String> {
    history_manager.badge_board().map_err(|e| e.to_string())
}
