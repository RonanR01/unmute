#!/usr/bin/env bash
# Produit les visuels du site de Tysta dans visuels-site/ (ou le dossier passé
# en argument) : les captures PNG, la vidéo de démonstration et le kit média.
# Demande Google Chrome, ffmpeg et zip.
#
#   scripts/visuels/render.sh [dossier]
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
OUT="$(mkdir -p "${1:-$REPO/visuels-site}" && cd "${1:-$REPO/visuels-site}" && pwd)"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

shot() { # nom largeur hauteur échelle
  local dest="$OUT/$1.png"
  case "$1" in video/*) dest="$WORK/frames/$(basename "$1").png" ;; esac
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files \
    --user-data-dir="$WORK/chrome-$RANDOM$RANDOM" --force-device-scale-factor="$4" \
    --default-background-color=00000000 --window-size="$2,$3" --virtual-time-budget=2000 \
    --screenshot="$dest" "file://$WORK/pages/$1.html" >/dev/null 2>&1
}
export -f shot
export OUT WORK CHROME

mkdir -p "$WORK/frames"
bun "$HERE/generate.mjs" "$WORK/pages" | xargs -P 6 -L 1 bash -c 'shot "$@"' _

ffmpeg -y -loglevel error -framerate 12 -i "$WORK/frames/f%03d.png" \
  -vf "scale=1280:800:flags=lanczos,format=yuv420p" -c:v libx264 -crf 20 \
  -movflags +faststart "$OUT/tysta-demo.mp4"
cat >"$OUT/tysta-demo.vtt" <<'VTT'
WEBVTT

00:00:00.000 --> 00:00:01.500
Placez le curseur là où vous voulez écrire.

00:00:01.500 --> 00:00:05.500
Maintenez votre raccourci et parlez.

00:00:05.500 --> 00:00:06.500
Tysta transcrit sur votre machine.

00:00:06.500 --> 00:00:10.000
Le texte s'écrit dans votre mail.
VTT

KIT="$WORK/kit/tysta-kit-media"
mkdir -p "$KIT/logos" "$KIT/captures" "$KIT/partage"
cp "$HERE"/logos/*.svg "$KIT/logos/"
cp "$REPO/src-tauri/icons/icon.png" "$KIT/logos/app-icon.png"
for name in hero hero-sapin insights insights-clair dictees dictees-clair badges badges-clair \
  dictionnaire dictionnaire-clair profil-de-voix profil-de-voix-clair dictee-en-cours; do
  cp "$OUT/tysta-$name.png" "$KIT/captures/"
done
cp "$OUT"/tysta-partage-*.png "$OUT/tysta-og.png" "$KIT/partage/"
cp "$HERE/kit-lisez-moi.txt" "$KIT/LISEZ-MOI.txt"
rm -f "$OUT/tysta-kit-media.zip"
(cd "$WORK/kit" && zip -qr "$OUT/tysta-kit-media.zip" tysta-kit-media)

echo "Visuels dans $OUT"
