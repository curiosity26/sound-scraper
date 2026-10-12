#!/usr/bin/env bash
# Installs what building and packaging the Linux app needs on Debian,
# Ubuntu, Fedora or Enterprise Linux 10 (RHEL, CentOS Stream, AlmaLinux,
# Rocky): the system packages react-native-gtk4 and the Rust core build
# against, the packaging tools, a display for --smoke (Xvfb,
# or a headless Weston on EL 10, which has no Xvfb; and Mesa's GLES, which
# GTK's renderer loads and a minimal container lacks), Node 22 (from nodejs.org
# when the distribution's is older) and Rust (rustup). Run as root, e.g. in
# the release workflow's containers, or locally:
#
#   podman run --rm -it -v "$PWD:/src" fedora:44 /src/scripts/linux-build-deps.sh
#
# Packages link the distribution's own libraries, so each is built on the
# release it's for (react-native-gtk4 needs GTK 4.14 or newer: Ubuntu 24.04,
# Debian 13, Fedora 40, EL 10).
set -euo pipefail

node_version=22.20.0

. /etc/os-release
family=" ${ID:-} ${ID_LIKE:-} "
case $family in
  *" debian "* | *" ubuntu "*)
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y --no-install-recommends \
      clang cmake ninja-build pkg-config git python3 make \
      libgtk-4-dev libsoup-3.0-dev libssl-dev libicu-dev libreadline-dev \
      libpulse-dev libasound2-dev \
      dpkg-dev fakeroot desktop-file-utils appstream python3-gi gir1.2-gdkpixbuf-2.0 \
      xvfb xauth libgles2 libgl1-mesa-dri ca-certificates curl xz-utils file
    ;;
  *" fedora "* | *" rhel "* | *" centos "*)
    xvfb=()
    if [[ $ID == fedora ]]; then
      xvfb=(xorg-x11-server-Xvfb xorg-x11-xauth)
    else
      # EL: the -devel packages and ninja are in CodeReady Builder (CRB),
      # Weston in EPEL.
      xvfb=(weston)
      dnf install -y dnf-plugins-core
      dnf config-manager --set-enabled crb
      dnf install -y epel-release || dnf install -y \
        "https://dl.fedoraproject.org/pub/epel/epel-release-latest-${VERSION_ID%%.*}.noarch.rpm"
    fi
    dnf install -y --setopt=install_weak_deps=False \
      clang cmake ninja-build pkgconf-pkg-config git python3 make libatomic \
      gtk4-devel libsoup3-devel openssl-devel libicu-devel readline-devel \
      pulseaudio-libs-devel alsa-lib-devel \
      rpm-build desktop-file-utils appstream python3-gobject gdk-pixbuf2 \
      "${xvfb[@]}" libglvnd-gles mesa-dri-drivers findutils tar gzip xz curl which file
    # EL's clang links with the newest GCC Toolset it finds (which it pulls
    # in), so that toolset's libatomic has to be there too.
    for toolset in /opt/rh/gcc-toolset-*; do
      if [[ -d $toolset ]]; then
        dnf install -y "$(basename "$toolset")-libatomic-devel"
      fi
    done
    ;;
  *)
    echo "linux-build-deps.sh: no package list for $PRETTY_NAME" >&2
    exit 1
    ;;
esac

# Node: react-native-gtk4 needs 22.13 or newer.
have_node() {
  command -v node >/dev/null &&
    node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 13) ? 0 : 1)'
}
if ! have_node; then
  case $(uname -m) in
    x86_64) arch=x64 ;;
    aarch64) arch=arm64 ;;
    *) echo "no Node build for $(uname -m)" >&2; exit 1 ;;
  esac
  curl -fsSL "https://nodejs.org/dist/v$node_version/node-v$node_version-linux-$arch.tar.xz" |
    tar -xJ -C /usr/local --strip-components=1
fi
node --version

# Rust: rust-toolchain.toml picks the version.
if ! command -v cargo >/dev/null && [[ ! -x ${CARGO_HOME:-$HOME/.cargo}/bin/cargo ]]; then
  curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain none
fi
