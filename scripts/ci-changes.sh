#!/usr/bin/env bash
# Tells a workflow's jobs which parts of the repository a pull request
# changes, so that a pull request that touches only the website (or only the
# docs) doesn't wait on the app's checks. Skipped jobs count as passed for
# required status checks, which a workflow-level `paths` filter doesn't do.
#
#   scripts/ci-changes.sh NAME=REGEX ...   NAME is true if a changed file matches REGEX
#   scripts/ci-changes.sh NAME!=REGEX ...  NAME is true if a changed file doesn't
#
# REGEX is an extended regular expression matched against repository paths.
# Each NAME=true|false goes to $GITHUB_OUTPUT. Outside a pull request every
# NAME is true. A pull request's checkout is its merge commit, so it needs
# `fetch-depth: 2`: the first parent is the base branch.
set -euo pipefail

out=${GITHUB_OUTPUT:-/dev/stdout}

if [ "${GITHUB_EVENT_NAME:-}" != pull_request ]; then
  for rule in "$@"; do
    name=${rule%%=*}
    echo "${name%!}=true" >>"$out"
  done
  exit 0
fi

changed=$(git diff --name-only HEAD^1 HEAD)
echo "Changed files:"
echo "$changed" | sed 's/^/  /'

for rule in "$@"; do
  case $rule in
    *!=*) name=${rule%%!=*} regex=${rule#*!=} flag=-v ;;
    *=*) name=${rule%%=*} regex=${rule#*=} flag= ;;
    *) echo "::error::bad rule: $rule" >&2; exit 2 ;;
  esac
  if echo "$changed" | grep -Eq $flag -e "$regex"; then
    value=true
  else
    value=false
  fi
  echo "$name=$value"
  echo "$name=$value" >>"$out"
done
