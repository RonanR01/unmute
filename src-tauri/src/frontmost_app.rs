//! The application the user is dictating into.
//!
//! Read when the shortcut is pressed: by the time the text is pasted, the
//! user may have switched windows.

use std::sync::Mutex;

/// The application that had focus when a dictation started.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct FrontmostApp {
    /// Its stable identifier, e.g. `com.apple.mail`.
    pub bundle_id: Option<String>,
    /// Its name as the system shows it, e.g. `Mail`.
    pub name: Option<String>,
}

static CAPTURED: Mutex<Option<FrontmostApp>> = Mutex::new(None);

/// Remember the application in front now, for the dictation that is starting.
pub fn capture() {
    let app = current();
    if let Ok(mut captured) = CAPTURED.lock() {
        *captured = app;
    }
}

/// The application remembered by the last [`capture`], handed out once.
pub fn take() -> Option<FrontmostApp> {
    CAPTURED
        .lock()
        .ok()
        .and_then(|mut captured| captured.take())
}

#[cfg(target_os = "macos")]
fn current() -> Option<FrontmostApp> {
    use objc2_app_kit::NSWorkspace;

    let app = NSWorkspace::sharedWorkspace().frontmostApplication()?;
    Some(FrontmostApp {
        bundle_id: app.bundleIdentifier().map(|id| id.to_string()),
        name: app.localizedName().map(|name| name.to_string()),
    })
}

#[cfg(not(target_os = "macos"))]
fn current() -> Option<FrontmostApp> {
    None
}
