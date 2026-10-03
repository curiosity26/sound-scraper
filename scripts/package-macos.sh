#!/bin/bash
# Builds an Apple silicon (arm64) Release app and packages it as dist/SoundScraper-<version>.dmg.
#   SIGN_IDENTITY="Developer ID Application: ..." scripts/package-macos.sh
# Defaults to the local self-signed "GolfNutz Dev" identity (not notarizable;
# Gatekeeper will ask the user to confirm the first launch).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IDENTITY="${SIGN_IDENTITY:-GolfNutz Dev}"
export LANG=en_US.UTF-8

cd "$ROOT/app/macos"
xcodebuild -workspace SoundScraper.xcworkspace -scheme SoundScraper-macOS -configuration Release \
  -derivedDataPath build/Release ARCHS=arm64 CODE_SIGN_IDENTITY="$IDENTITY" build | grep -E "error:|BUILD (SUCCEEDED|FAILED)"
APP="$ROOT/app/macos/build/Release/Build/Products/Release/SoundScraper.app"
codesign --verify --deep --strict "$APP"
VERSION=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$APP/Contents/Info.plist")

ICNS="$APP/Contents/Resources/AppIcon.icns"
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
ditto "$APP" "$STAGE/Sound Scraper.app"

# Styled installer window (background with a drag arrow, big icons) via
# dmgbuild, which writes the Finder layout directly (no Finder scripting).
# One-time setup: /usr/bin/python3 -m venv .venv-dmg && .venv-dmg/bin/pip install dmgbuild
DMGBUILD="$ROOT/.venv-dmg/bin/dmgbuild"
[ -x "$DMGBUILD" ] || { echo "error: run: /usr/bin/python3 -m venv .venv-dmg && .venv-dmg/bin/pip install dmgbuild" >&2; exit 1; }
mkdir -p "$ROOT/dist"
DMG="$ROOT/dist/SoundScraper-$VERSION.dmg"
"$DMGBUILD" -s "$ROOT/scripts/dmg-settings.py" \
  -D app="$STAGE/Sound Scraper.app" -D icon="$ICNS" -D background="$ROOT/assets/dmg/background.tiff" \
  "Sound Scraper" "$DMG" >/dev/null
codesign --sign "$IDENTITY" "$DMG"

# Finder icon for the .dmg file itself (stored in extended attributes, so it
# doesn't affect the signature; it may not survive every download/transfer).
osascript -l JavaScript -e "ObjC.import('AppKit'); \
  \$.NSWorkspace.sharedWorkspace.setIconForFileOptions(\$.NSImage.alloc.initWithContentsOfFile('$ICNS'), '$DMG', 0)" >/dev/null
echo "Built $DMG ($(du -h "$DMG" | cut -f1), signed by $IDENTITY)"
