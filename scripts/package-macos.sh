#!/bin/bash
# Builds a universal Release app and packages it as dist/SoundScraper-<version>.dmg.
#   SIGN_IDENTITY="Developer ID Application: ..." scripts/package-macos.sh
# Defaults to the local self-signed "GolfNutz Dev" identity (not notarizable;
# Gatekeeper will ask the user to confirm the first launch).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IDENTITY="${SIGN_IDENTITY:-GolfNutz Dev}"
export LANG=en_US.UTF-8

cd "$ROOT/app/macos"
xcodebuild -workspace SoundScraper.xcworkspace -scheme SoundScraper-macOS -configuration Release \
  -derivedDataPath build/Release CODE_SIGN_IDENTITY="$IDENTITY" build | grep -E "error:|BUILD (SUCCEEDED|FAILED)"
APP="$ROOT/app/macos/build/Release/Build/Products/Release/SoundScraper.app"
codesign --verify --deep --strict "$APP"
VERSION=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$APP/Contents/Info.plist")

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
ditto "$APP" "$STAGE/Sound Scraper.app"
ln -s /Applications "$STAGE/Applications"
mkdir -p "$ROOT/dist"
DMG="$ROOT/dist/SoundScraper-$VERSION.dmg"
hdiutil create -quiet -volname "Sound Scraper" -srcfolder "$STAGE" -ov -format UDZO "$DMG"
codesign --sign "$IDENTITY" "$DMG"
echo "Built $DMG ($(du -h "$DMG" | cut -f1), signed by $IDENTITY)"
