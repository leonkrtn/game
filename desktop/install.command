#!/bin/bash
# Installs "Rien ne va plus" as a Mac app: fetches the Electron runtime (Chromium) from GitHub,
# puts the game inside, signs it for this Mac and opens it. Run by double-click.
set -euo pipefail
cd "$(dirname "$0")"
ELECTRON="__ELECTRON__"
NAME="Rien ne va plus"
ARCH=$(uname -m)
[ "$ARCH" = "x86_64" ] && ARCH=x64
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "▶ Rien ne va plus wird installiert ($ARCH) …"
echo "  Lade die Spiel-Engine (Electron $ELECTRON, ca. 120 MB) …"
curl -fL --progress-bar -o "$TMP/electron.zip" "https://github.com/electron/electron/releases/download/v$ELECTRON/electron-v$ELECTRON-darwin-$ARCH.zip"
ditto -x -k "$TMP/electron.zip" "$TMP/x"

APP="$TMP/x/$NAME.app"
mv "$TMP/x/Electron.app" "$APP"
RES="$APP/Contents/Resources"
rm -f "$RES/default_app.asar"
mkdir -p "$RES/app"
cp app/main.cjs app/preload.cjs app/package.json app/game.html "$RES/app/"
cp app/icon.icns "$RES/electron.icns"
PL="$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleName '$NAME'" "$PL"
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName '$NAME'" "$PL" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string '$NAME'" "$PL"
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier de.rienneva.plus" "$PL"
/usr/libexec/PlistBuddy -c "Add :LSApplicationCategoryType string public.app-category.games" "$PL" 2>/dev/null || true
echo "  Signiere für diesen Mac …"
codesign --force --deep --sign - "$APP" >/dev/null
xattr -cr "$APP"

DEST="/Applications"
[ -w "$DEST" ] || DEST="$HOME/Applications"
mkdir -p "$DEST"
rm -rf "$DEST/$NAME.app"
mv "$APP" "$DEST/"
echo "✔ Fertig: $DEST/$NAME.app – das Spiel startet jetzt."
open "$DEST/$NAME.app"
