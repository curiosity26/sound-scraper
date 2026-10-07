#!/usr/bin/env python3
"""Keeps the app's version the same everywhere it's written down.

  scripts/version.py                 # print each file's version
  scripts/version.py set 0.2.0       # write it everywhere (also 0.2.0-beta.1)
  scripts/version.py check v0.2.0    # exit 1 unless every file matches the tag

The full version (with any -label) goes in app/package.json (+ lock) and the
Cargo workspace (+ Cargo.lock). Xcode's MARKETING_VERSION and the MSIX manifest
only take numbers, so they get 0.2.0 and 0.2.0.0.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PACKAGE_JSON = ROOT / "app/package.json"
PACKAGE_LOCK = ROOT / "app/package-lock.json"
CARGO_TOML = ROOT / "core/Cargo.toml"
CARGO_LOCK = ROOT / "core/Cargo.lock"
PBXPROJ = ROOT / "app/macos/SoundScraper.xcodeproj/project.pbxproj"
MANIFEST = ROOT / "app/windows/SoundScraper.Package/Package.appxmanifest"

SEMVER = re.compile(r"^(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?$")
CARGO_VERSION = re.compile(r'(\[workspace\.package\][^\[]*?\nversion = ")([^"]+)(")', re.S)
CARGO_LOCK_VERSION = re.compile(r'(name = "sound_scraper_[a-z_]+"\nversion = ")([^"]+)(")')
XCODE_VERSION = re.compile(r"(MARKETING_VERSION = )([^;]+)(;)")
MANIFEST_VERSION = re.compile(r'(<Identity\b[^>]*?\bVersion=")([^"]+)(")', re.S)


def read():
    """Each file's version, as written there."""
    lock = json.loads(PACKAGE_LOCK.read_text())
    return {
        "app/package.json": json.loads(PACKAGE_JSON.read_text())["version"],
        "app/package-lock.json": lock["packages"][""]["version"],
        "core/Cargo.toml": CARGO_VERSION.search(CARGO_TOML.read_text()).group(2),
        **{f"core/Cargo.lock ({i})": v for i, v in
           enumerate(sorted({m.group(2) for m in CARGO_LOCK_VERSION.finditer(CARGO_LOCK.read_text())}))},
        **{f"Xcode MARKETING_VERSION ({i})": v for i, v in
           enumerate(sorted({m.group(2) for m in XCODE_VERSION.finditer(PBXPROJ.read_text())}))},
        "Package.appxmanifest": MANIFEST_VERSION.search(MANIFEST.read_text(encoding="utf-8-sig")).group(2),
    }


def expected(version):
    """What each file should say for this version."""
    numbers = version.split("-")[0]
    return lambda name: (numbers if name.startswith("Xcode") else
                         numbers + ".0" if name == "Package.appxmanifest" else version)


def parse(arg):
    version = arg[1:] if arg.startswith("v") else arg
    if not SEMVER.match(version):
        sys.exit(f"error: {arg!r} isn't <major>.<minor>.<patch>[-label]")
    return version


def sub(path, pattern, value, encoding="utf-8", count=0):
    text = path.read_text(encoding=encoding)
    new, n = pattern.subn(lambda m: m.group(1) + value + m.group(3), text, count=count)
    if n == 0:
        sys.exit(f"error: no version found in {path.relative_to(ROOT)}")
    # newline="" keeps the file's own line endings.
    path.open("w", encoding=encoding, newline="").write(new)


def set_version(version):
    numbers = version.split("-")[0]
    for path in (PACKAGE_JSON, PACKAGE_LOCK):
        text = path.read_text()
        # Only the app's own version: the first "version" in package.json, and
        # the top-level and packages[""] ones in the lock (the first two).
        text = re.sub(r'("version": ")[^"]+(")', lambda m: m.group(1) + version + m.group(2), text,
                      count=1 if path == PACKAGE_JSON else 2)
        path.write_text(text)
    sub(CARGO_TOML, CARGO_VERSION, version, count=1)
    sub(CARGO_LOCK, CARGO_LOCK_VERSION, version)
    sub(PBXPROJ, XCODE_VERSION, numbers)
    sub(MANIFEST, MANIFEST_VERSION, numbers + ".0", encoding="utf-8-sig", count=1)


def main():
    args = sys.argv[1:]
    if args and args[0] == "set" and len(args) == 2:
        set_version(parse(args[1]))
    if not args or args[0] == "set":
        for name, v in read().items():
            print(f"{v:<16} {name}")
    elif args[0] == "check" and len(args) == 2:
        version = parse(args[1])
        want = expected(version)
        wrong = [(name, v, want(name)) for name, v in read().items() if v != want(name)]
        for name, v, w in wrong:
            print(f"error: {name} is {v}, expected {w}", file=sys.stderr)
        if wrong:
            sys.exit(f"Run scripts/version.py set {version}, commit, and move the tag to that commit.")
        print(f"All versions match {version}")
    elif args[0] != "set":
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
