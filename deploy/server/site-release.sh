#!/bin/sh
# Atomic static releases for one site. Layout: <site_dir>/releases/<release>/ holds each uploaded build and
# <site_dir>/current is a symlink to the live one (Nginx serves <site_dir>/current). Release names sort in time order
# (UTC timestamp first). Keeps the newest 10 releases and never removes the live one.
#   site-release.sh activate <site_dir> <release>   make an uploaded release live
#   site-release.sh rollback <site_dir>             make the release before the live one live again
#   site-release.sh status   <site_dir>             show the live release and the ones kept
set -eu

command=${1:-}
dir=${2:-}
[ -n "$command" ] && [ -n "$dir" ] || { echo "usage: site-release.sh activate|rollback|status <site_dir> [release]" >&2; exit 2; }
[ -d "$dir/releases" ] || { echo "no releases in $dir" >&2; exit 1; }

live() { [ -L "$dir/current" ] && basename "$(readlink "$dir/current")" || true; }

switch_to() {
  [ -f "$dir/releases/$1/index.html" ] || { echo "release $1 has no index.html" >&2; exit 1; }
  ln -sfn "releases/$1" "$dir/current.next"
  mv -Tf "$dir/current.next" "$dir/current"
  echo "live: $1"
}

prune() {
  keep=$(live)
  ls -1 "$dir/releases" | sort -r | tail -n +11 | while read -r old; do
    [ "$old" = "$keep" ] || rm -rf "${dir:?}/releases/${old:?}"
  done
}

case "$command" in
  activate)
    release=${3:-}
    [ -n "$release" ] || { echo "activate needs a release name" >&2; exit 2; }
    switch_to "$release"
    prune
    ;;
  rollback)
    current=$(live)
    previous=$(ls -1 "$dir/releases" | sort | awk -v current="$current" '$0 == current { print last; exit } { last = $0 }')
    [ -n "$previous" ] || { echo "no release before $current" >&2; exit 1; }
    switch_to "$previous"
    ;;
  status)
    echo "live: $(live)"
    ls -1 "$dir/releases" | sort -r
    ;;
  *)
    echo "unknown command: $command" >&2; exit 2
    ;;
esac
