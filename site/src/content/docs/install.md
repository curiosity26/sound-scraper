---
title: Install
description: Get Sound Scraper onto your Mac, Windows PC or Linux machine.
group: Start here
order: 1
---

Sound Scraper is free and runs on macOS, Windows and Linux. The [downloads page](../../download/) picks the right installer for your computer; this page explains each one.

## macOS

You need a Mac with Apple silicon (M1 or newer) running macOS 14.2 or later.

1. Download `SoundScraper-<version>.dmg`.
2. Open it and drag **Sound Scraper** into **Applications**.
3. Open Sound Scraper from Applications or Launchpad.

The app is signed and notarized by Apple, so it opens normally without any security warnings. The first time you record, macOS asks for permission to record system audio: see [Your first recording](../first-recording/).

## Windows

Sound Scraper runs on Windows 10 and 11. Recording a single app needs build 20348 or later; recording all system audio works on any supported build.

1. Download the `.msix` for your PC: **x64** for Intel and AMD processors, **ARM64** for Snapdragon and other ARM PCs. If you're not sure, open **Settings › System › About** and look at _System type_.
2. Double-click the `.msix` and choose **Install**.

The package is signed, so Windows installs it without extra steps.

## Linux

Sound Scraper runs on GNOME, Cinnamon and other desktops with GTK 4.14 or newer, on Wayland or X11. Recording uses PulseAudio or PipeWire. Pick the package for your distribution and processor (`x86_64`/`amd64` or `aarch64`/`arm64`):

| Distribution                                           | Install with                                                                 |
| ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Ubuntu 24.04, Linux Mint 22 or newer                   | `sudo apt install ./sound-scraper_<version>-1_ubuntu24.04_amd64.deb`         |
| Debian 13                                              | `sudo apt install ./sound-scraper_<version>-1_debian13_amd64.deb`            |
| Fedora 44                                              | `sudo dnf install ./sound-scraper-<version>-1.fc44.x86_64.rpm`               |
| RHEL 10, CentOS Stream 10, AlmaLinux or Rocky Linux 10 | `sudo dnf install ./sound-scraper-<version>-1.el10.x86_64.rpm`               |
| Any distribution with Flatpak                          | `flatpak install --user ./SoundScraper-<version>-x86_64.flatpak`             |
| Anything else                                          | Unpack `SoundScraper-<version>-linux-<arch>.tar.gz` and run its `install.sh` |

The Flatpak gets the GNOME runtime from Flathub. The tarball installs into `~/.local`.

On Linux, the panels dock and snap together on one monitor (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd> moves them to the next one), and CD burning isn't available yet.

## Betas and checksums

Releases marked _Pre-release_ on [GitHub](https://github.com/curiosity26/sound-scraper/releases) are betas. Every release has a `SHA256SUMS.txt` if you want to check your download.
