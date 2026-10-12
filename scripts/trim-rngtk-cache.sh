#!/usr/bin/env bash
# Trims react-native-gtk4's build cache to what a later build reads, so CI
# saves a smaller cache: each finished host library's install/ (not its
# build/ tree), and of the Hermes build only libhermesvm.so, which the host
# build links (React Native's sources and Hermes' headers stay).
#
#   scripts/trim-rngtk-cache.sh CACHE_DIR
set -euo pipefail

cache=${1:?usage: trim-rngtk-cache.sh CACHE_DIR}
shopt -s nullglob

for host in "$cache"/*/host/*/; do
  [[ -e $host/install/.complete ]] && rm -rf "$host/build"
done
for build in "$cache"/*/deps/hermes-build; do
  keep=$(mktemp -d)
  mv "$build"/lib/libhermesvm.so* "$keep"/
  rm -rf "$build"
  mkdir -p "$build/lib"
  mv "$keep"/* "$build/lib/"
  rmdir "$keep"
done
du -sh "$cache"
