/** Tysta's public repository: About, help pages and releases all hang off it. */
export const TYSTA_REPO_URL = "https://github.com/RonanR01/unmute";

/** Where portable installs find the latest release. */
export const TYSTA_RELEASES_URL = `${TYSTA_REPO_URL}/releases/latest`;

const docsPage = (page: string) => `${TYSTA_REPO_URL}/blob/main/docs/${page}`;

/** Text input tools, Wayland shortcuts and missing libraries on Linux. */
export const LINUX_SETUP_URL = docsPage("linux.md");

/** Shortcuts blocked by macOS Secure Input, and how to release it. */
export const SECURE_INPUT_HELP_URL = docsPage(
  "depannage.md#les-raccourcis-ne-marchent-plus-sur-macos-secure-input",
);
