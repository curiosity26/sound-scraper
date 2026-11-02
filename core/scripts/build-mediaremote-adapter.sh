#!/bin/bash
# Builds MediaRemoteAdapter.framework from core/vendor/mediaremote-adapter
# (what the macOS now-playing backend runs inside /usr/bin/perl) into
# core/target/apple/mediaremote-adapter/, next to a copy of its Perl script.
# Rebuilds only when a source changed.
#
# From the app's "Embed MediaRemote adapter" Xcode phase it also copies both
# into the app (framework in Contents/Frameworks, script in
# Contents/Resources) and signs the framework like the app. By hand:
#   core/scripts/build-mediaremote-adapter.sh
# then SOUND_SCRAPER_MEDIAREMOTE_ADAPTER=core/target/apple/mediaremote-adapter
# for the nowplaying examples.
set -euo pipefail

CORE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$CORE_DIR/vendor/mediaremote-adapter"
OUT="$CORE_DIR/target/apple/mediaremote-adapter"
NAME=MediaRemoteAdapter
FW="$OUT/$NAME.framework"
# Both slices whatever the app's ARCHS: /usr/bin/perl runs as whichever
# architecture its parent does, and an x86_64 parent (Rosetta, an Intel Rust
# toolchain) gets an x86_64 perl.
ARCHS="arm64 x86_64"
MIN_MACOS="${MACOSX_DEPLOYMENT_TARGET:-11.0}"

sources=("$SRC"/src/adapter/*.m "$SRC"/src/private/*.m "$SRC"/src/utility/*.m)
binary="$FW/Versions/A/$NAME"
stamp="$OUT/.archs"
stale=0
if [ ! -f "$binary" ] || [ "$(cat "$stamp" 2>/dev/null)" != "$ARCHS" ]; then
  stale=1
else
  for f in "${sources[@]}" "$SRC"/src/*/*.h "$SRC"/include/*.h "$0"; do
    [ "$f" -nt "$binary" ] && { stale=1; break; }
  done
fi

if [ "$stale" = 1 ]; then
  arch_flags=()
  for arch in $ARCHS; do arch_flags+=(-arch "$arch"); done
  rm -rf "$FW"
  mkdir -p "$FW/Versions/A/Resources"
  # As upstream's CMakeLists.txt: ARC, and every symbol visible so the Perl
  # script can find the adapter_* entry points.
  xcrun --sdk macosx clang -dynamiclib "${arch_flags[@]}" -mmacosx-version-min="$MIN_MACOS" \
    -fobjc-arc -fvisibility=default -O2 \
    -I"$SRC/include" -I"$SRC/src" \
    -install_name "@rpath/$NAME.framework/Versions/A/$NAME" \
    -framework Foundation -framework AppKit -framework UniformTypeIdentifiers \
    "${sources[@]}" -o "$binary"
  cat > "$FW/Versions/A/Resources/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleExecutable</key><string>$NAME</string>
	<key>CFBundleIdentifier</key><string>com.vandenbe.$NAME</string>
	<key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
	<key>CFBundleName</key><string>$NAME</string>
	<key>CFBundlePackageType</key><string>FMWK</string>
	<key>CFBundleShortVersionString</key><string>0.7.7</string>
	<key>CFBundleVersion</key><string>0.7.7</string>
</dict>
</plist>
PLIST
  ln -s A "$FW/Versions/Current"
  ln -s "Versions/Current/$NAME" "$FW/$NAME"
  ln -s Versions/Current/Resources "$FW/Resources"
  codesign --force --sign - "$FW" 2>&1 | { grep -v "replacing existing signature" || true; }
  echo "$ARCHS" > "$stamp"
  echo "Built $FW ($(lipo -archs "$binary"))"
fi
cp "$SRC/bin/mediaremote-adapter.pl" "$OUT/"

# In an Xcode build: embed and sign like the app.
if [ -n "${TARGET_BUILD_DIR:-}" ] && [ -n "${FRAMEWORKS_FOLDER_PATH:-}" ]; then
  frameworks="$TARGET_BUILD_DIR/$FRAMEWORKS_FOLDER_PATH"
  resources="$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH"
  mkdir -p "$frameworks" "$resources"
  rm -rf "$frameworks/$NAME.framework"
  ditto "$FW" "$frameworks/$NAME.framework"
  cp "$OUT/mediaremote-adapter.pl" "$resources/"
  sign_flags=(--force --sign "${EXPANDED_CODE_SIGN_IDENTITY:--}")
  [ "${ENABLE_HARDENED_RUNTIME:-NO}" = YES ] && sign_flags+=(--options runtime)
  # OTHER_CODE_SIGN_FLAGS carries --timestamp in release builds.
  # shellcheck disable=SC2086
  codesign "${sign_flags[@]}" ${OTHER_CODE_SIGN_FLAGS:-} "$frameworks/$NAME.framework"
fi
