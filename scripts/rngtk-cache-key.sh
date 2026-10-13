#!/usr/bin/env bash
# Prints the CI cache key for react-native-gtk4's build (React Native's
# sources, Hermes, the host library) for one build environment:
# rngtk-NAME-<react-native-gtk4 commit>. The commit, from the lockfile, pins
# React Native and Hermes too, so the cache changes only with it.
#
#   scripts/rngtk-cache-key.sh NAME     # NAME: the system, architecture...
set -euo pipefail

name=${1:?usage: rngtk-cache-key.sh NAME}
root=$(cd "$(dirname "$0")/.." && pwd)
ref=$(jq -er '.packages["node_modules/@curiosity26/react-native-gtk4"].resolved | sub(".*#"; "")' \
  "$root/app/package-lock.json")
echo "rngtk-$name-$ref"
