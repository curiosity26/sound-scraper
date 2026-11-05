---
title: Now playing tags and splits
description: Let the music app tell Sound Scraper what's playing, so recordings tag and split themselves.
group: Using the app
order: 4
---

Most music apps tell your computer what they're playing: the song, the artist, the album and the cover. Sound Scraper listens while you record and uses it.

## Tags for one song

When a recording holds one song, Sound Scraper fills in its title, artist, album and cover from what the app said was playing. This is **Tag recordings from now playing** in [Settings](../settings/), on by default.

## Splits for many songs

When the song changes during a recording, Sound Scraper proposes a split there. Open the recording in the [track editor](../track-editor/) and you'll find it already sliced, each track named and tagged from now playing. Check the slices, move any that landed a little early or late, and save.

This is **Split at track changes** in Settings, also on by default. Nothing is split until you save in the editor.

## Which apps work

- **Windows**: apps that show up in Windows' media controls, like Spotify and most browsers.
- **Linux**: apps that support MPRIS, which covers most music players and browsers.
- **macOS**: apps that show in the system's Now Playing controls, including Music and Spotify.

> **Tip:** Now playing info is a hint, not a stopwatch. Apps report track changes a moment early or late, so Sound Scraper lines each split up with the nearest gap in the audio.
