---
title: Recording
description: Choose what to record, pause through the boring bits, and where recordings end up.
group: Using the app
order: 1
---

Sound Scraper records what your computer plays: everything at once, or a single app while the rest of your computer keeps making noise.

## Choosing a source

Click the source display under the seek bar (the line with the ▾):

- **All system audio** records everything you hear.
- **An app** records only that app. An app shows up in the list once it has started playing, and ♪ marks the ones playing right now.

Sound Scraper remembers the last source you recorded from. While a recording is loaded for playback, that line shows its title instead.

## Record, pause, stop

1. Press **REC**. The clock counts up, and the visualizer and level meters follow the audio.
2. Press **Pause** to skip a stretch, like an ad. While recording, the Play button turns into Pause. Press it again to carry on in the same file; the paused part is simply left out.
3. Press **STOP**. The recording is saved as an MP3 and appears in the library.

## Where recordings go

Recordings are named `<Source> YYYY-MM-DD HH-MM.mp3` and saved in `~/Music/Sound Scraper` (on Windows, `Music\Sound Scraper`) unless you choose another folder in [Settings](../settings/). They're tagged with the title, the recording date and, for an app source, "Recorded from <App>".

If the app knows what's playing, it fills in more: see [Now playing](../now-playing/).

## Silence trimming

**Trim silence** is on by default: the silence before the first sound and after the last one is cut off, so a recording starts when the music does. Quiet passages in the middle are kept. Turn it off in Settings if you want everything.

## If something crashes

If the app or the computer crashes mid-recording, the partial recording is repaired and added to your library the next time Sound Scraper starts.
