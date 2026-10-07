#!/bin/bash
# Builds an Apple silicon (arm64) Release app and packages it as dist/SoundScraper-<version>.dmg.
#   scripts/package-macos.sh                       # local self-signed "GolfNutz Dev" build
#   SIGN_IDENTITY="Developer ID Application: ..." scripts/package-macos.sh
# A Developer ID build gets the hardened runtime and a secure timestamp, and the
# .dmg is notarized and stapled with the notarytool keychain profile
# NOTARY_PROFILE (default "soundscraper-notary"; create it with
# `xcrun notarytool store-credentials`), or with an App Store Connect API key
# when NOTARY_KEY (path to the .p8), NOTARY_KEY_ID and NOTARY_ISSUER are set
# (CI). NOTARIZE=0 skips notarization. APP_BUILD overrides the project's
# CURRENT_PROJECT_VERSION (the build number); scripts/version.py sets the version.
# Self-signed builds aren't notarizable; Gatekeeper asks the user to confirm the first launch.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IDENTITY="${SIGN_IDENTITY:-GolfNutz Dev}"
NOTARY_PROFILE="${NOTARY_PROFILE:-soundscraper-notary}"
if [ -n "${NOTARY_KEY:-}" ]; then
  NOTARY_AUTH=(--key "$NOTARY_KEY" --key-id "$NOTARY_KEY_ID")
  # Individual API keys have no issuer; team keys need it.
  if [ -n "${NOTARY_ISSUER:-}" ]; then NOTARY_AUTH+=(--issuer "$NOTARY_ISSUER"); fi
else
  NOTARY_AUTH=(--keychain-profile "$NOTARY_PROFILE")
fi
export LANG=en_US.UTF-8

SIGN_FLAGS=(--force --sign "$IDENTITY")
# The project signs automatically with the team's Apple Development cert; a
# release build names its identity explicitly instead.
BUILD_FLAGS=(CODE_SIGN_STYLE=Manual)
[ -n "${APP_BUILD:-}" ] && BUILD_FLAGS+=(CURRENT_PROJECT_VERSION="$APP_BUILD")
if [[ "$IDENTITY" == "Developer ID Application"* ]]; then
  DISTRIBUTION=1
  # Hardened runtime needs a certificate with a Team ID: its library validation
  # rejects the embedded frameworks otherwise (hence off for self-signed builds).
  SIGN_FLAGS+=(--timestamp --options runtime)
  BUILD_FLAGS+=(ENABLE_HARDENED_RUNTIME=YES OTHER_CODE_SIGN_FLAGS=--timestamp)
  if [ "${NOTARIZE:-1}" != 0 ] && ! NOTARY_CHECK=$(xcrun notarytool history "${NOTARY_AUTH[@]}" 2>&1); then
    echo "$NOTARY_CHECK" | tail -5 >&2
    if [ -n "${NOTARY_KEY:-}" ]; then
      echo "error: notarytool can't sign in with the API key (check NOTARY_KEY, NOTARY_KEY_ID, NOTARY_ISSUER)" >&2
    else
      echo "error: notarytool can't sign in with keychain profile \"$NOTARY_PROFILE\"; create it with" >&2
      echo "  xcrun notarytool store-credentials $NOTARY_PROFILE --apple-id <email> --team-id <TEAMID>" >&2
    fi
    exit 1
  fi
else
  DISTRIBUTION=0
  BUILD_FLAGS+=(DEVELOPMENT_TEAM=)  # self-signed: no team
fi
if [ -d "/Volumes/Sound Scraper" ]; then
  echo "error: eject the mounted \"Sound Scraper\" disk first" >&2; exit 1
fi

cd "$ROOT/app/macos"
xcodebuild -workspace SoundScraper.xcworkspace -scheme SoundScraper-macOS -configuration Release \
  -derivedDataPath build/Release ARCHS=arm64 CODE_SIGN_IDENTITY="$IDENTITY" "${BUILD_FLAGS[@]}" build \
  | grep -E "error:|BUILD (SUCCEEDED|FAILED)"
APP="$ROOT/app/macos/build/Release/Build/Products/Release/SoundScraper.app"

# Re-sign inside out with one identity and the same flags, so every nested
# piece of code (Hermes, LAME) matches the app whichever phase embedded it.
sign() { codesign "${SIGN_FLAGS[@]}" "$@" 2> >(grep -v "replacing existing signature" >&2); }
for item in "$APP"/Contents/Frameworks/*.dylib "$APP"/Contents/Frameworks/*.framework; do
  [ -e "$item" ] && sign "$item"
done
# No entitlements: the app isn't sandboxed (SoundScraper.entitlements is unused;
# the sandbox would block writing to the recordings folder).
sign "$APP"
codesign --verify --deep --strict "$APP"
VERSION=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$APP/Contents/Info.plist")

VOLNAME="Sound Scraper"
WORK=$(mktemp -d)
# Installer icon (the .dmg file and the mounted disk), from its own artwork.
# The app inside the window shows its own (app) icon.
ICONSET="$WORK/dmg.iconset"
mkdir "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s "$ROOT/assets/dmg/icon-dmg-source.png" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  # No 1024 px slice: it would add ~1.7 MB twice (volume icon + file icon).
  [ $s -lt 512 ] && sips -z $((s * 2)) $((s * 2)) "$ROOT/assets/dmg/icon-dmg-source.png" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
DMG_ICNS="$WORK/dmg.icns"
iconutil -c icns "$ICONSET" -o "$DMG_ICNS"
STAGE=$(mktemp -d)
cleanup() { [ -n "${MOUNT:-}" ] && hdiutil detach -quiet -force "$MOUNT" 2>/dev/null; rm -rf "$STAGE" "$WORK"; }
trap cleanup EXIT
ditto "$APP" "$STAGE/$VOLNAME.app"
ln -s /Applications "$STAGE/Applications"
mkdir "$STAGE/.background"
cp "$ROOT/assets/dmg/background.tiff" "$STAGE/.background/background.tiff"

# Styled installer window: mount a writable image where Finder can see it and
# let Finder lay it out (macOS asks once to allow controlling Finder).
hdiutil create -quiet -volname "$VOLNAME" -srcfolder "$STAGE" -fs HFS+ -format UDRW -ov "$WORK/rw.dmg"
MOUNT=$(hdiutil attach -readwrite -noverify -noautoopen "$WORK/rw.dmg" | awk -F'\t' '/\/Volumes\//{print $NF}')
chflags hidden "$MOUNT/.background"
osascript "$ROOT/scripts/dmg-layout.applescript" "$VOLNAME"
# Volume icon last: Finder's layout pass drops a .VolumeIcon.icns added earlier.
cp "$DMG_ICNS" "$MOUNT/.VolumeIcon.icns"
SetFile -a V "$MOUNT/.VolumeIcon.icns"
SetFile -a C "$MOUNT"
rm -rf "$MOUNT/.fseventsd" "$MOUNT/.Trashes"
sync
hdiutil detach -quiet "$MOUNT"; MOUNT=

mkdir -p "$ROOT/dist"
DMG="$ROOT/dist/SoundScraper-$VERSION.dmg"
hdiutil convert -quiet "$WORK/rw.dmg" -format UDZO -imagekey zlib-level=9 -ov -o "$DMG"
codesign "${SIGN_FLAGS[@]}" "$DMG"

NOTE="signed by $IDENTITY"
if [ "$DISTRIBUTION" = 1 ] && [ "${NOTARIZE:-1}" != 0 ]; then
  echo "Notarizing $DMG (usually a few minutes)..."
  OUT=$(xcrun notarytool submit "$DMG" "${NOTARY_AUTH[@]}" --wait 2>&1) || true
  echo "$OUT" | grep -E "^\s*(id|status):" | awk '!seen[$0]++'
  if ! echo "$OUT" | grep -q "status: Accepted"; then
    ID=$(echo "$OUT" | awk '/^ *id:/{print $2; exit}')
    [ -n "$ID" ] && xcrun notarytool log "$ID" "${NOTARY_AUTH[@]}" >&2
    echo "error: notarization failed" >&2; exit 1
  fi
  xcrun stapler staple -q "$DMG"
  spctl --assess --type open --context context:primary-signature "$DMG"
  NOTE="$NOTE, notarized"
fi

# Finder icon for the .dmg file itself: the installer artwork (stored in extended attributes, so it
# doesn't affect the signature; it may not survive every download/transfer).
osascript -l JavaScript -e "ObjC.import('AppKit'); \
  \$.NSWorkspace.sharedWorkspace.setIconForFileOptions(\$.NSImage.alloc.initWithContentsOfFile('$DMG_ICNS'), '$DMG', 0)" >/dev/null
echo "Built $DMG ($(du -h "$DMG" | cut -f1), $NOTE)"
