#!/usr/bin/env bash
# Build Unmute, sign it with a local certificate and install it in
# /Applications.
#
# macOS ties the Accessibility and Microphone grants to the app's signature.
# An ad-hoc signature changes with every build, so each one had to be granted
# again; a certificate gives every build the same identity. Create one once in
# Keychain Access (Certificate Assistant > Create a Certificate, type "Code
# Signing") and name it "Unmute Local Signing", or set UNMUTE_SIGNING_IDENTITY.
#
# The app is installed rather than run from the terminal: a build started from
# a shell has its grants attributed to the terminal, and can't be authorized.
#
# Usage: scripts/install-local.sh [--release]
set -euo pipefail

cd "$(dirname "$0")/.."

IDENTITY="${UNMUTE_SIGNING_IDENTITY:-Unmute Local Signing}"
APP_NAME="Unmute.app"

if [[ "${1:-}" == "--release" ]]; then
  build_flags=()
  profile="release"
else
  build_flags=(--debug)
  profile="debug"
fi

export CMAKE_POLICY_VERSION_MINIMUM="${CMAKE_POLICY_VERSION_MINIMUM:-3.5}"
bun run tauri build "${build_flags[@]}" --bundles app

app="src-tauri/target/${profile}/bundle/macos/${APP_NAME}"

if security find-identity -p codesigning | grep -q "\"${IDENTITY}\""; then
  codesign --force --deep --options runtime \
    --entitlements src-tauri/Entitlements.plist \
    --sign "${IDENTITY}" "${app}"
  echo "Signed with \"${IDENTITY}\"."
else
  echo "No \"${IDENTITY}\" certificate: keeping the ad-hoc signature." >&2
  echo "macOS will ask for Accessibility again after this build." >&2
fi

osascript -e 'tell application "Unmute" to quit' >/dev/null 2>&1 || true
sleep 1
pkill -f "/Applications/${APP_NAME}/Contents/MacOS/" >/dev/null 2>&1 || true

rm -rf "/Applications/${APP_NAME}"
cp -R "${app}" "/Applications/${APP_NAME}"
open "/Applications/${APP_NAME}"
echo "Installed and started /Applications/${APP_NAME}."
