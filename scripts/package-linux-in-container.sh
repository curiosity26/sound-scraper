#!/usr/bin/env bash
# Builds the Linux app's .deb or .rpm for another distribution in a
# container of it (podman or docker), installs it there and checks it
# starts. Packages link the distribution's own libraries, so each is built
# on the release it's for. The release workflow runs this; so can you:
#
#   scripts/package-linux-in-container.sh IMAGE FORMAT TAG
#   scripts/package-linux-in-container.sh debian:13 deb debian13
#   scripts/package-linux-in-container.sh fedora:44 rpm fc44
#   scripts/package-linux-in-container.sh almalinux:10 rpm el10
#
# The package lands in dist/ with TAG in its name
# (sound-scraper_0.2.0-1_debian13_amd64.deb, sound-scraper-0.2.0-1.fc44.x86_64.rpm).
# The build cache (Rust, npm, react-native-gtk4's Hermes and host build)
# lives in .cache/linux-TAG, so the next run is quick.
set -euo pipefail

image=${1:?usage: package-linux-in-container.sh IMAGE deb|rpm TAG}
format=${2:?usage: package-linux-in-container.sh IMAGE deb|rpm TAG}
tag=${3:?usage: package-linux-in-container.sh IMAGE deb|rpm TAG}
root=$(cd "$(dirname "$0")/.." && pwd)
engine=${CONTAINER_ENGINE:-$(command -v podman || command -v docker || true)}
[[ -n $engine ]] || { echo "podman or docker is needed" >&2; exit 1; }

cache=$root/.cache/linux-$tag
mkdir -p "$cache" "$root/dist"
out=$(mktemp -d "$root/dist/.$tag.XXXXXX")
trap 'rm -rf "$out"' EXIT

echo "== $tag: packaging the app as a .$format in $image"
# CXXFLAGS: Hermes and React Native's headers expect <cstdint> to come in
# through other headers, which newer libstdc++ (Fedora 44's GCC 16) no
# longer does; react-native-gtk4's host build adds the same flag.
# The repository's files (tracked, and new ones not ignored), without
# build trees or node_modules.
git -C "$root" ls-files -co --exclude-standard -z |
  tar -C "$root" --null -T - -cf - |
  "$engine" run --rm -i --security-opt label=disable \
    -v "$cache:/cache" -v "$out:/out" \
    -e CARGO_HOME=/cache/cargo -e RUSTUP_HOME=/cache/rustup \
    -e npm_config_cache=/cache/npm -e RNGTK_CACHE_DIR=/cache/rngtk \
    -e FORMAT="$format" \
    -e CXXFLAGS="-include cstdint" \
    "$image" bash -c '
      set -euo pipefail
      mkdir -p /work && tar -C /work -xf -
      /work/scripts/linux-build-deps.sh
      export PATH=/cache/cargo/bin:$PATH
      mkdir -p /cache/target && ln -s /cache/target /work/core/target
      cd /work/app
      npm ci --no-audit --no-fund
      npx react-native package-linux --format "$FORMAT" --output /out
      # Installed with the distribution'"'"'s package manager, so its
      # dependencies have to resolve there; then it has to start.
      if [[ $FORMAT == deb ]]; then
        apt-get install -y /out/*.deb
      else
        dnf install -y /out/*.rpm
      fi
      if command -v xvfb-run >/dev/null; then
        xvfb-run -a env GDK_BACKEND=x11 /usr/bin/SoundScraper --smoke
      else
        # No Xvfb (EL 10): a headless Weston.
        export XDG_RUNTIME_DIR=/tmp/runtime && mkdir -m 700 -p $XDG_RUNTIME_DIR
        weston --backend=headless --socket=wayland-smoke & weston=$!
        sleep 3
        WAYLAND_DISPLAY=wayland-smoke GDK_BACKEND=wayland /usr/bin/SoundScraper --smoke
        kill $weston
      fi
    '

for f in "$out"/*."$format"; do
  name=$(basename "$f")
  case $format in
    # sound-scraper_0.2.0-1_amd64.deb -> sound-scraper_0.2.0-1_debian13_amd64.deb
    deb) name=$(sed -E "s/^([^_]+_[^_]+)_/\1_${tag}_/" <<<"$name") ;;
    # sound-scraper-0.2.0-1.x86_64.rpm -> sound-scraper-0.2.0-1.fc44.x86_64.rpm
    rpm) name=$(sed -E "s/\.([^.]+)\.rpm$/.$tag.\1.rpm/" <<<"$name") ;;
  esac
  mv "$f" "$root/dist/$name"
  echo "== dist/$name"
done
