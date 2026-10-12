#!/usr/bin/env python3
"""Adapts react-native-gtk4's Flatpak manifest to Sound Scraper.

`react-native package-linux --format flatpak --manifest-only` writes a
manifest whose app module builds the app/ folder alone. Sound Scraper's
build also compiles the Rust core (../core) with cargo, so its module gets:

- the whole repository as its source (scripts/package-flatpak.sh makes the
  archive), building in app/;
- Rust from the SDK's rust-stable extension, and the core's crates as
  offline sources (cargo-sources.json, from flatpak-cargo-generator).

The react-native-gtk4 module also installs the headers the app's own native
code builds against (React Native's, Hermes'...) into /app/rngtk and points
its SDK file there. react-native-gtk4 does this only for apps with
autolinked native libraries, but Sound Scraper's app/linux uses the SDK too.

Every module also compiles with `-include cstdint`: Hermes and React
Native's headers expect <cstdint> to come in through other headers, which
the SDK's newer libstdc++ no longer does (as for Fedora 44's packages).

    flatpak_manifest.py MANIFEST SOURCE_ARCHIVE CARGO_SOURCES
"""

import hashlib
import json
import os
import sys


SDK_HEADER_COMMANDS = [
    "mkdir -p /app/rngtk/deps && cp -a deps/react-native deps/third-party-ndk deps/fantom-third-party"
    " deps/codegen deps/hermes-headers /app/rngtk/deps/",
    'sed -i "s|$PWD/deps|/app/rngtk/deps|g" /app/rngtk/lib/cmake/ReactNativeGtk/ReactNativeGtkSdk.cmake',
]


def main(manifest_file: str, archive: str, cargo_sources: str) -> None:
    with open(manifest_file) as f:
        manifest = json.load(f)
    here = os.path.dirname(os.path.abspath(manifest_file))
    app = manifest["modules"][-1]
    name = app["name"]

    # Appended to the SDK's own CXXFLAGS, for every module.
    common = manifest.setdefault("build-options", {})
    flags = common.get("cxxflags", "")
    if "-include cstdint" not in flags:
        common["cxxflags"] = f"{flags} -include cstdint".strip()

    # As react-native-gtk4's lib/cli/flatpak.js SDK_HEADER_COMMANDS.
    host = next(m for m in manifest["modules"] if m.get("name") == "react-native-gtk4")
    for command in SDK_HEADER_COMMANDS:
        if command not in host["build-commands"]:
            host["build-commands"].append(command)

    rust = "org.freedesktop.Sdk.Extension.rust-stable"
    if rust not in manifest["sdk-extensions"]:
        manifest["sdk-extensions"].append(rust)
    options = app["build-options"]
    options["append-path"] += ":/usr/lib/sdk/rust-stable/bin"
    # flatpak-cargo-generator's sources go in cargo/ (vendored crates and a
    # config pointing cargo at them).
    options["env"]["CARGO_HOME"] = f"/run/build/{name}/cargo"
    options["env"]["CARGO_NET_OFFLINE"] = "true"

    with open(archive, "rb") as f:
        digest = hashlib.sha256(f.read()).hexdigest()
    source = {
        "type": "archive",
        "path": os.path.relpath(os.path.abspath(archive), here),
        "sha256": digest,
        "strip-components": 0,
    }
    # The app's own archive is the first source; the npm sources follow.
    app["sources"] = [source, *app["sources"][1:], os.path.relpath(os.path.abspath(cargo_sources), here)]
    app["build-commands"] = [
        c.replace("cd . && ", "cd app && ", 1) for c in app["build-commands"]
    ]

    with open(manifest_file, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
