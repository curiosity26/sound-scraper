#!/bin/bash
# Builds the Rust core as a static library for the Xcode build that calls it
# and lipos the slices into core/target/apple/$CONFIGURATION/libsound_scraper_core.a.
# Called from the "Build Rust core" phase of app/macos; also runnable by hand:
#   ARCHS="arm64 x86_64" CONFIGURATION=Release core/scripts/build-apple.sh
set -euo pipefail

CORE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ARCHS="${ARCHS:-$(uname -m)}"
CONFIGURATION="${CONFIGURATION:-Debug}"
OUT_DIR="$CORE_DIR/target/apple/$CONFIGURATION"
LIB=libsound_scraper_core.a

# Xcode runs scripts with a minimal PATH.
[ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"
command -v cargo >/dev/null || { echo "error: cargo not found; install Rust via rustup" >&2; exit 1; }

if [ "$CONFIGURATION" = "Release" ]; then
  PROFILE_FLAG=--release; PROFILE_DIR=release
else
  PROFILE_FLAG=; PROFILE_DIR=debug
fi

slices=()
lame_slices=()
for arch in $ARCHS; do
  case "$arch" in
    arm64) triple=aarch64-apple-darwin ;;
    x86_64) triple=x86_64-apple-darwin ;;
    *) echo "error: unsupported arch $arch" >&2; exit 1 ;;
  esac
  rustup target list --installed 2>/dev/null | grep -qx "$triple" || {
    echo "error: Rust target $triple missing; run: rustup target add $triple" >&2; exit 1; }
  # Use the plain macOS SDK for both host build scripts and C deps (LAME's
  # configure needs it to link test programs).
  env -u LIBRARY_PATH SDKROOT="$(xcrun --sdk macosx --show-sdk-path)" \
    cargo build --manifest-path "$CORE_DIR/Cargo.toml" -p sound_scraper_core \
    --target "$triple" $PROFILE_FLAG
  slices+=("$CORE_DIR/target/$triple/$PROFILE_DIR/$LIB")
  lame_slices+=("$CORE_DIR/target/$triple/$PROFILE_DIR/libmp3lame.0.dylib")
done

mkdir -p "$OUT_DIR"
lipo -create "${slices[@]}" -output "$OUT_DIR/$LIB.tmp"
mv "$OUT_DIR/$LIB.tmp" "$OUT_DIR/$LIB"
echo "Built $OUT_DIR/$LIB ($ARCHS, $CONFIGURATION)"

# LAME is LGPL and ships as its own dylib in Contents/Frameworks. One copy
# serves every configuration (the Xcode project embeds it from here).
LAME_DIR="$CORE_DIR/target/apple"
lipo -create "${lame_slices[@]}" -output "$LAME_DIR/libmp3lame.0.dylib.tmp"
mv "$LAME_DIR/libmp3lame.0.dylib.tmp" "$LAME_DIR/libmp3lame.0.dylib"
ln -sf libmp3lame.0.dylib "$LAME_DIR/libmp3lame.dylib"
echo "Built $LAME_DIR/libmp3lame.0.dylib ($(lipo -archs "$LAME_DIR/libmp3lame.0.dylib"))"
