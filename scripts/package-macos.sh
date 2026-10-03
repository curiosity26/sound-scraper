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
if [ -d "/Volumes/$VOLNAME" ]; then
  echo "error: eject the mounted \"$VOLNAME\" disk first" >&2; exit 1
fi
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
codesign --sign "$IDENTITY" "$DMG"

# Finder icon for the .dmg file itself: the installer artwork (stored in extended attributes, so it
# doesn't affect the signature; it may not survive every download/transfer).
osascript -l JavaScript -e "ObjC.import('AppKit'); \
  \$.NSWorkspace.sharedWorkspace.setIconForFileOptions(\$.NSImage.alloc.initWithContentsOfFile('$DMG_ICNS'), '$DMG', 0)" >/dev/null
echo "Built $DMG ($(du -h "$DMG" | cut -f1), signed by $IDENTITY)"
