//! The written part of the voice profile: an archetype and two sentences on
//! how the user dictates.
//!
//! Counting words can't write this, so a language model reads excerpts of the
//! dictations. It is the provider chosen for post-processing, cloud or local,
//! and it only runs when the user asks: excerpts leave the machine with a
//! cloud provider.

use chrono::Utc;
use log::debug;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager};

use crate::managers::history::HistoryManager;
use crate::managers::insights::{PortraitMaterial, VoicePortrait};
use crate::settings::{
    get_settings, AppSettings, PostProcessProvider, APPLE_INTELLIGENCE_PROVIDER_ID,
};

/// Enough text to see habits; small enough for any hosted model.
const EXCERPT_CHARS: usize = 12_000;
/// Apple's on-device model has a short context window.
const APPLE_EXCERPT_CHARS: usize = 2_500;

const TITLE_FIELD: &str = "title";
const DESCRIPTION_FIELD: &str = "description";

/// Why a portrait could not be written, as a code the interface explains.
pub const NO_PROVIDER: &str = "no_provider";
pub const NO_DICTATIONS: &str = "no_dictations";
pub const BAD_ANSWER: &str = "bad_answer";

/// The model that would write the portrait, named so the user can decide.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct PortraitProvider {
    pub label: String,
    /// Whether the excerpts stay on this machine.
    pub local: bool,
}

struct Writer {
    provider: PostProcessProvider,
    model: String,
    api_key: String,
}

fn writer(settings: &AppSettings) -> Option<Writer> {
    let provider = settings.active_post_process_provider()?.clone();
    let model = settings
        .post_process_models
        .get(&provider.id)
        .cloned()
        .unwrap_or_default();
    if model.trim().is_empty() {
        return None;
    }
    let api_key = settings
        .post_process_api_keys
        .get(&provider.id)
        .cloned()
        .unwrap_or_default();
    Some(Writer {
        provider,
        model,
        api_key,
    })
}

fn is_local(provider: &PostProcessProvider) -> bool {
    provider.id == APPLE_INTELLIGENCE_PROVIDER_ID
        || ["://localhost", "://127.0.0.1", "://[::1]"]
            .iter()
            .any(|host| provider.base_url.contains(host))
}

/// The provider a portrait would be written with, if one is ready.
pub fn provider(app: &AppHandle) -> Option<PortraitProvider> {
    let writer = writer(&get_settings(app))?;
    Some(PortraitProvider {
        local: is_local(&writer.provider),
        label: writer.provider.label,
    })
}

fn system_prompt(language: &str) -> String {
    format!(
        "You read excerpts of everything one person dictated into a dictation app and sum \
         up how they speak. Answer with a JSON object holding two strings: \
         \"{TITLE_FIELD}\", a two-to-four-word archetype for their way of dictating (in the \
         spirit of \"Detail Refiner\"), and \"{DESCRIPTION_FIELD}\", two or three sentences \
         addressed to them as \"you\". The description says what they talk about most, what \
         they mainly use dictation for, and how they tell it: their tone, how they build \
         their sentences, whether they instruct, explain, think aloud or converse. Rely only \
         on the excerpts as a whole. Do not quote them, and leave out names and other \
         private details. Write both strings in the language whose code is \"{language}\". \
         Output the JSON object and nothing else."
    )
}

fn user_content(material: &PortraitMaterial) -> String {
    let mut content = String::new();
    if !material.top_apps.is_empty() {
        let apps: Vec<String> = material
            .top_apps
            .iter()
            .map(|app| format!("{} ({})", app.text, app.count))
            .collect();
        content.push_str(&format!(
            "Apps dictated into most, with the number of dictations: {}\n\n",
            apps.join(", ")
        ));
    }
    content.push_str("Excerpts, newest first:\n");
    for (app, text) in &material.excerpts {
        match app {
            Some(app) => content.push_str(&format!("- [{app}] {text}\n")),
            None => content.push_str(&format!("- {text}\n")),
        }
    }
    content
}

/// The title and description in a model's answer, whatever surrounds the JSON
/// object (a reasoning block, a code fence).
fn parse_answer(answer: &str) -> Option<(String, String)> {
    // Reasoning some models leave in the content may hold braces of its own.
    let answer = answer
        .rfind("</think>")
        .map_or(answer, |end| &answer[end + "</think>".len()..]);
    let start = answer.find('{')?;
    let end = answer.rfind('}')?;
    let json: serde_json::Value = serde_json::from_str(answer.get(start..=end)?).ok()?;
    let field = |name: &str| {
        let value = json.get(name)?.as_str()?.trim();
        (!value.is_empty()).then(|| value.to_string())
    };
    Some((field(TITLE_FIELD)?, field(DESCRIPTION_FIELD)?))
}

async fn ask(writer: &Writer, system: String, user: String) -> Result<String, String> {
    if writer.provider.id == APPLE_INTELLIGENCE_PROVIDER_ID {
        #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
        {
            if !crate::apple_intelligence::check_apple_intelligence_availability() {
                return Err(NO_PROVIDER.to_string());
            }
            let token_limit = writer.model.trim().parse::<i32>().unwrap_or(0);
            return crate::apple_intelligence::process_text_with_system_prompt(
                &system,
                &user,
                token_limit,
            );
        }
        #[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
        return Err(NO_PROVIDER.to_string());
    }

    let schema = writer.provider.supports_structured_output.then(|| {
        serde_json::json!({
            "type": "object",
            "properties": {
                (TITLE_FIELD): { "type": "string" },
                (DESCRIPTION_FIELD): { "type": "string" }
            },
            "required": [TITLE_FIELD, DESCRIPTION_FIELD],
            "additionalProperties": false
        })
    });
    let disable_reasoning = matches!(writer.provider.id.as_str(), "custom" | "openrouter");
    let answer = if schema.is_some() {
        crate::llm_client::send_chat_completion_with_schema(
            &writer.provider,
            writer.api_key.clone(),
            &writer.model,
            user,
            Some(system),
            schema,
            disable_reasoning,
        )
        .await?
    } else {
        // No system role on this path: the instructions lead the one message.
        crate::llm_client::send_chat_completion(
            &writer.provider,
            writer.api_key.clone(),
            &writer.model,
            format!("{system}\n\n{user}"),
            disable_reasoning,
        )
        .await?
    };
    answer.ok_or_else(|| BAD_ANSWER.to_string())
}

/// Write the portrait from the latest dictations and store it.
pub async fn refresh(app: &AppHandle) -> Result<VoicePortrait, String> {
    let settings = get_settings(app);
    let writer = writer(&settings).ok_or_else(|| NO_PROVIDER.to_string())?;
    let history = app.state::<std::sync::Arc<HistoryManager>>();

    let budget = if writer.provider.id == APPLE_INTELLIGENCE_PROVIDER_ID {
        APPLE_EXCERPT_CHARS
    } else {
        EXCERPT_CHARS
    };
    let material = history
        .portrait_material(budget)
        .map_err(|e| e.to_string())?;
    if material.excerpts.is_empty() {
        return Err(NO_DICTATIONS.to_string());
    }

    debug!(
        "Writing the voice portrait from {} excerpts with provider '{}'",
        material.excerpts.len(),
        writer.provider.id
    );
    let answer = ask(
        &writer,
        system_prompt(&settings.app_language),
        user_content(&material),
    )
    .await?;
    let (title, description) = parse_answer(&answer).ok_or_else(|| BAD_ANSWER.to_string())?;

    let portrait = VoicePortrait {
        title,
        description,
        computed_at: Utc::now().timestamp(),
        provider_label: writer.provider.label.clone(),
    };
    history
        .save_voice_portrait(&portrait)
        .map_err(|e| e.to_string())?;
    Ok(portrait)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::managers::insights::PhraseCount;

    #[test]
    fn an_answer_is_read_through_its_wrapping() {
        let answer = "<think>hmm {not json</think>\n```json\n{\"title\": \" Detail Refiner \", \
                      \"description\": \"You refine slides.\"}\n```";

        assert_eq!(
            parse_answer(answer),
            Some((
                "Detail Refiner".to_string(),
                "You refine slides.".to_string()
            ))
        );
    }

    #[test]
    fn an_answer_missing_a_field_is_rejected() {
        assert_eq!(parse_answer("{\"title\": \"Only a title\"}"), None);
        assert_eq!(
            parse_answer("{\"title\": \"\", \"description\": \"x\"}"),
            None
        );
        assert_eq!(parse_answer("no json here"), None);
    }

    #[test]
    fn the_model_is_told_the_apps_and_shown_the_excerpts() {
        let material = PortraitMaterial {
            excerpts: vec![
                (Some("Mail".to_string()), "Bonjour".to_string()),
                (None, "Sans app".to_string()),
            ],
            top_apps: vec![PhraseCount {
                text: "Mail".to_string(),
                count: 12,
            }],
        };

        let content = user_content(&material);

        assert!(content.contains("Mail (12)"));
        assert!(content.contains("- [Mail] Bonjour\n"));
        assert!(content.contains("- Sans app\n"));
    }

    #[test]
    fn only_this_machine_counts_as_local() {
        let provider = |id: &str, base_url: &str| PostProcessProvider {
            id: id.to_string(),
            label: id.to_string(),
            base_url: base_url.to_string(),
            allow_base_url_edit: false,
            models_endpoint: None,
            supports_structured_output: false,
            api_format: Default::default(),
        };

        assert!(is_local(&provider("custom", "http://localhost:11434/v1")));
        assert!(is_local(&provider(APPLE_INTELLIGENCE_PROVIDER_ID, "")));
        assert!(!is_local(&provider("openai", "https://api.openai.com/v1")));
    }
}
