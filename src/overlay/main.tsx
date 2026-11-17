import "@fontsource-variable/rethink-sans";
import React from "react";
import ReactDOM from "react-dom/client";
import RecordingOverlay from "./RecordingOverlay";
import "@/i18n";

// The overlay floats over other apps and stays fir green whatever the theme:
// the open microphone's signal yellow reads best there.
document.documentElement.dataset.theme = "dark";

// The overlay floats over other apps, so a stray right-click must not open the
// webview's default menu (Reload, Save as, Print, ...). Kept in dev for Inspect.
if (import.meta.env.PROD) {
  window.addEventListener("contextmenu", (e) => e.preventDefault());
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RecordingOverlay />
  </React.StrictMode>,
);
