---
title: Troubleshooting
description: Silent recordings, missing apps and other things that can go sideways.
group: Help
order: 1
---

## My recording is silent (macOS)

macOS needs your permission to record system audio. Open **System Settings › Privacy & Security › Screen & System Audio Recording** and turn Sound Scraper on. Sound Scraper warns you when a recording gets no audio.

## Recording Safari on its own is silent

Safari plays sound from a separate WebKit process, so picking Safari as the source records nothing. Record **All system audio** instead, or use another browser.

## The app I want isn't in the source list

An app appears once it has started playing sound. Start playback, then open the list again. ♪ marks the apps playing right now.

## I can't record a single app on Windows

Single-app recording needs Windows build 20348 or later (Windows 11, or a recent Windows Server). On older builds, record **All system audio**.

## Windows doesn't show my cover art

Windows Explorer and Media Player only show cover art from ID3v2.3 tags. Sound Scraper uses v2.3 on Windows by default; for recordings tagged on a Mac or Linux, choose ID3v2.3 for the recording or as the default in [Settings](../settings/).

## There's no Burn CD button on Linux

CD burning isn't available on Linux yet. **Save CD Image…** writes a `.cue`/`.bin` you can burn with Brasero or cdrdao.

## Something else

[Report a bug on GitHub](https://github.com/curiosity26/sound-scraper/issues). Include your OS and Sound Scraper version (**SETTINGS › About**).
