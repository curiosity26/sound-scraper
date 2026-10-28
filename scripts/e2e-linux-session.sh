#!/usr/bin/env bash
# Runs a command in a private desktop session for the Linux end-to-end
# tests (app/e2e): its own D-Bus session bus, an X server (Xvfb), the
# accessibility bus the tests drive the app through, and a PipeWire sound
# server whose default output is a null sink, so audio the tests play can
# be recorded without a sound card (the app plays back through ALSA, which
# pipewire-alsa routes to the same server). The CI e2e workflow runs this;
# so can you, on Ubuntu 24.04 with the packages it installs:
#
#   scripts/e2e-linux-session.sh npm --prefix app run e2e
set -euo pipefail

if [[ -z ${E2E_SESSION:-} ]]; then
  exec env E2E_SESSION=1 dbus-run-session -- \
    xvfb-run -a -s "-screen 0 1920x1080x24" "$0" "$@"
fi

runtime=$(mktemp -d)
chmod 700 "$runtime"
export XDG_RUNTIME_DIR=$runtime
pids=()
cleanup() {
  kill "${pids[@]}" 2>/dev/null || true
  wait 2>/dev/null || true
  rm -rf "$runtime"
}
trap cleanup EXIT

log=${E2E_SESSION_LOG:-$runtime/session.log}
pipewire >>"$log" 2>&1 & pids+=($!)
wireplumber >>"$log" 2>&1 & pids+=($!)
pipewire-pulse >>"$log" 2>&1 & pids+=($!)
for _ in $(seq 50); do
  pactl info >/dev/null 2>&1 && break
  sleep 0.2
done
pactl info >/dev/null || { echo "the sound server didn't start:" >&2; cat "$log" >&2; exit 1; }
pactl load-module module-null-sink sink_name=e2e \
  sink_properties=device.description=E2E-Output >/dev/null
# pipewire-pulse answers before WirePlumber has created the "default"
# metadata, and until it has, setting the default sink fails with "Not
# supported", so keep trying.
for _ in $(seq 50); do
  pactl set-default-sink e2e 2>/dev/null && break
  sleep 0.2
done
pactl set-default-sink e2e || { echo "couldn't make e2e the default sink:" >&2; cat "$log" >&2; exit 1; }

/usr/libexec/at-spi-bus-launcher --launch-immediately >>"$log" 2>&1 & pids+=($!)
export GDK_BACKEND=x11 GTK_A11Y=atspi

"$@"
