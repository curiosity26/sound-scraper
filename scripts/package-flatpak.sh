#!/usr/bin/env bash
# Builds the Linux app as a Flatpak bundle (dist/SoundScraper-<version>-<arch>.flatpak)
# for the machine's architecture, from source in the GNOME SDK with no
# network during the build, as Flathub requires.
#
#   scripts/package-flatpak.sh [--smoke]
#
# react-native-gtk4 writes the manifest (package-linux --format flatpak
# --manifest-only); scripts/flatpak_manifest.py adds the Rust core to it.
# Needs flatpak, flatpak-builder, flatpak-node-generator and
# flatpak-cargo-generator (flatpak-builder-tools; FLATPAK_NODE_GENERATOR and
# FLATPAK_CARGO_GENERATOR name them when they aren't on PATH). The GNOME SDK
# and its node, llvm and rust-stable extensions come from Flathub (for the
# user) on the first build, which also compiles React Native and Hermes;
# flatpak-builder's state lives in react-native-gtk4's cache after that.
# --smoke installs the bundle for the user and starts it with --smoke.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root/app"
smoke=false
[[ ${1:-} == --smoke ]] && smoke=true

app_id=$(node -p "require('./app.json').linux.appId")
version=$(node -p "require('./package.json').version")
arch=$(uname -m)
out=linux/build/package
flatpak_dir=$out/flatpak

flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo

npx react-native package-linux --format flatpak --manifest-only --output "$out"

# The repository as the app module's source (the app builds ../core).
mkdir -p "$flatpak_dir/sources"
archive=$flatpak_dir/sources/SoundScraper-$version-src.tar.gz
git -C "$root" ls-files -co --exclude-standard -z |
  tar -C "$root" --null -T - --sort=name --owner=0 --group=0 --numeric-owner \
    --mtime=@0 -cf - | gzip -n >"$archive"

cargo_generator=${FLATPAK_CARGO_GENERATOR:-flatpak-cargo-generator}
$cargo_generator "$root/core/Cargo.lock" -o "$flatpak_dir/cargo-sources.json"
python3 "$root/scripts/flatpak_manifest.py" "$flatpak_dir/$app_id.json" "$archive" "$flatpak_dir/cargo-sources.json"

# As react-native-gtk4's package-linux builds it (lib/cli/flatpakBuild.js).
cache=${RNGTK_CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/react-native-gtk4}/flatpak
flatpak-builder --user --install-deps-from=flathub --force-clean --disable-updates \
  --disable-rofiles-fuse --state-dir="$cache/state" --repo="$cache/repo" \
  "$flatpak_dir/build-dir" "$flatpak_dir/$app_id.json"
mkdir -p "$root/dist"
bundle=$root/dist/SoundScraper-$version-$arch.flatpak
flatpak build-bundle --runtime-repo=https://dl.flathub.org/repo/flathub.flatpakrepo \
  "$cache/repo" "$bundle" "$app_id"
rm -rf "$flatpak_dir/build-dir"
echo "== $bundle"

if $smoke; then
  flatpak install --user -y --noninteractive --bundle --reinstall "$bundle"
  (cd /tmp && flatpak run "$app_id" --smoke)
fi
