use crate::managers::{
    history::HistoryManager,
    insights::{DailyActivity, DictationStats, VoiceProfile},
};
use std::sync::Arc;
use tauri::State;

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
