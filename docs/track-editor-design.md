# Sound Scraper: Track Editor Design v0.3

Status: agreed with Alex (2026-10-06); decisions in §10.

## 1. Goal

A recording often holds more than one thing: an album streamed end to end, a
radio show, a playlist. The track editor turns one recording into the tracks
it contains. Alex's brief:

1. **Edit Track…** in the details panel's gear menu opens an **editor
   panel** showing the recording's waveform.
2. A **time ruler** across the top: drag in it to place **splice marks**.
3. **Name each splice mark.** The name is the title *and* the file name of
   the track that starts there.
4. **Select regions and delete them** (an ad, a DJ talking, dead air).
5. A **Find Tracks** button places splice marks automatically where tracks
   begin.
6. **Zoom** in and out for more or less precision, and a **snap to ruler**
   toggle that snaps to an interval that follows the zoom.
7. **Playback and scrubbing** while editing.
8. Nothing changes until **Save**. Save asks, in an in-window modal (not a
   system dialog), whether to keep the original: **Yes, keep it**, **No,
   delete it**, **Cancel**.
9. New tracks **inherit the original's ID3 tags except the title**.

It is not a general audio editor: no effects rack, no multitrack mixing.
Fades are a possible later addition.

## 2. What other editors do

| | How a split point is made | Automatic detection | Output |
|---|---|---|---|
| **Audacity** | Labels in a separate label track: Ctrl+B at the cursor or selection, Ctrl+M at the play position while playing; Ctrl+I splits the clip itself. Labels are dragged to move; a yellow guide line shows when an edge snaps to a label or clip boundary. | *Label Sounds* (replaced *Sound Finder* / *Silence Finder*), analysing in 10 ms steps: threshold (default −30 dB), measured as peak, average or RMS (RMS advised for vinyl crackle), minimum silence (1 s), minimum label interval (1 s), and where the label goes (before, after, around or between sounds). The legacy Silence Finder used −30 dB, 1.5 s, label 0.1 s before the sound resumes. | *Export Multiple*: one file per label or region, named from the label text or numbered. Always decodes and re-encodes MP3. |
| **Ocenaudio** | Markers and regions, plus multi-selection (several ranges selected at once) and a mini overview waveform for navigation. Its marker documentation is thin. | Not well documented. | Markers and regions export as XML; people use third-party scripts to batch-export regions, which suggests built-in split-by-markers is limited (not confirmed). Re-encodes. |
| **Adobe Audition** | M drops a point marker at the playhead, also while playing; with a selection, a range marker. A Markers panel lists, renames and merges them (merging points makes ranges), and imports/exports them as CSV. | Diagnostics › *Mark Audio*, preset "Mark Non-Silent Areas": *Find Levels* sets thresholds from the audio, *Scan* proposes, *Mark All* creates range markers. | *Export Audio of Selected Range Markers to Separate Files*. Re-encodes. |
| **Rogue Amoeba Fission** | ⌘T splits at the playhead; ⇧⌘A adds a split at a typed time. Drag a split to move it, click and Delete to remove, *Clear All Splits*. ⌘+/− zoom, ⌥⌘+ zoom to selection, Space plays; scrubbing is a preference. | *Smart Split*: *Length* (minimum gap, default 2 s) and *Sensitivity* (threshold, −60 dB in its "Digital Recording" preset), with savable presets (e.g. vinyl). Proposed splits are reviewed, then *Insert Splits* commits them. | Split into tracks, or one file with chapters; an Inspector for ID3 and artwork. **Lossless for MP3 and AAC**: trims and splits without re-encoding, its main selling point. |
| **Audio Hijack** (Rogue Amoeba) | n/a: a recorder. | The Recorder block's Silence Monitor can start a new file on silence (examples use about −30 dB and 1.5 to 2 s), remove silence, or stop recording. | One file per track straight from recording. |
| **WaveLab / Sound Forge** | CD-track and generic markers, region lists. | WaveLab *Auto Split*: by markers, fixed intervals, silence (RMS threshold with automatic level detection, minimum silence, minimum region length), beats, or a text file. Sound Forge *Auto Region*: minimum level, release sensitivity, minimum length. | CD track markers, batch export. Re-encode. |
| **mp3DirectCut** | Cue points on a frame-level view. | Split by pause detection, by fixed time ("Auto cue"), or from a cue sheet. | Lossless frame cuts; names files, writes ID3, keeps the LAME header parameters. |
| **Vinyl tools (VinylStudio, Audacity's vinyl workflow)** | A dedicated split-tracks view where markers are dragged over each side. | Silence gaps, typically −40 to −50 dB for about 1.5 s, measured as RMS to ignore crackle. VinylStudio looks the album up on Discogs for track names and count. | One file per song, tagged from the lookup. |

Patterns worth copying:

- **Markers live in their own lane** above the waveform, with a handle you
  drag. Clicking the waveform itself moves the playhead or makes a
  selection, never a marker, so you can't move a split by accident.
- **A key drops a marker at the playhead while listening** (Audacity Ctrl+M,
  Audition M, Fission ⌘T). This is how people actually split a radio show.
- **Auto detection is a proposal, not an action.** The good tools show
  where the splits would go, let you nudge them, then split.
- **Three detection knobs are universal:** threshold (dBFS), minimum silence
  length, minimum track length. A fourth, where the cut goes inside the
  gap, is often fixed. Fission and VinylStudio-style tools save them as
  presets ("Digital", "Vinyl").
- **Tracks as a list beside the waveform** (Fission, Audition's Markers
  panel): titles are typed there, and selecting a row zooms to it.
- **Lossless MP3 cutting** is a selling point when it exists (Fission,
  mp3DirectCut); everyone else silently re-encodes.

## 3. Where we start from

- Recordings are MP3 only (CBR 128 to 320 or VBR V0/V2), written by LAME
  with a LAME/Xing tag. No lossless copy is kept.
- `mp3.rs` already parses frame headers, scans frame layout and rewrites the
  Info tag. That is most of what a lossless cutter needs.
- `player.rs` decodes with Symphonia with gapless on, so our own playback
  already honours LAME encoder delay and padding.
- `trim.rs` already decides "silent" at -60 dBFS for the live trimmer.
- The visualizer is drawn by Rust into an RGBA buffer that a small native
  view shows (SSVisualizerView on macOS, VisualizerView on Windows). A
  waveform view can use the same path.
- Panels are skinned, docking and resizable (library, details, settings),
  with the layout crate handling snapping.

## 4. The editor

### 4.1 Opening it

- **Edit Track…** in the details panel's gear menu (enabled when exactly
  one recording is selected and nothing is recording). It opens a new
  docking, resizable panel, `editor`, snapped under the main panel by
  default.
- One recording at a time. Opening the editor loads that recording into the
  player, so the main panel's Play, Stop and seek bar drive the editor's
  playhead too. Pressing Record while the editor has unsaved changes shows
  the same in-window modal style: "Discard edits and record?"
- Closing the editor with unsaved changes asks **Save**, **Discard**,
  **Cancel** in the same modal style. Unsaved edits are also kept as a
  draft (§7.1), so a crash loses nothing.

### 4.2 Layout

```
┌ Editor: Spotify 2026-10-03 14-05 ─────────────────────────────── × ┐
│ ▁▂▃▅▆▅▃▁▁▂▅▆▇▆▅▃▂▁   [===viewport===]   ▁▂▅▆▅▃▁▂▃▅▆▅▃▁    overview │
│ ▼So What          ▼Freddie Freeloader       ▼Blue in Green          │
│ 0:00 ╷ ╷ ╷ ╷ 1:00 ╷ ╷ ╷ ╷ 2:00 ╷ ╷ ╷ ╷ 3:00 ╷ ╷ ╷ ╷ 4:00      ruler │
│ ▂▃▅▇█▇▅▃▂▃▅▇▇▅▃▂▁  ▂▅▇█▓▓▓▓▓▓▓▂▁▁ │  ▂▅▇█▇▅▃▂▃▅▇▇▅▃  waveform │
│                    selection ┘     playhead ┘                      │
├────────────────────────────────────────────────────────────────────┤
│ #  Title (file name)         Start     Length                      │
│ 1  So What                   0:00.00   9:22.10                     │
│ 2  Freddie Freeloader        9:24.03   9:46.50                     │
├────────────────────────────────────────────────────────────────────┤
│ ▶ ■  [Find Tracks…]  [Delete Region]  Snap ☑  Zoom − + Fit  [Save] │
└────────────────────────────────────────────────────────────────────┘
```

- **Overview strip:** the whole recording, always fitted, with the visible
  window as a box you drag. Deleted regions are hatched.
- **Ruler:** time labels and ticks that adapt to zoom (minutes down to
  milliseconds). This is where splices are made (§4.4). Splice flags sit
  on the ruler with their names.
- **Waveform:** min/max peaks per pixel column, with RMS drawn inside in a
  second shade (Audacity's look, readable for loud masters). Stereo is
  one combined lane, with a toggle for L/R. Clicking moves the playhead;
  dragging selects a region. Each splice continues as a thin line down
  through the waveform.
- **Track list:** one row per track (the stretch from one splice mark to
  the next), with an editable title and read-only start and length. It's
  a second place to name splices; selecting a row selects that track and
  zooms to it.
- **Save** is enabled once something has changed (§4.7).

### 4.3 Zoom and scroll

- Zoom range: the whole recording down to about 20 samples per pixel. Past
  that there's nothing useful to see, since cuts are frame-sized (§6).
- ⌘/Ctrl + scroll wheel or trackpad pinch zooms around the pointer; plain
  scroll pans; ⌘/Ctrl+0 fits the whole recording, ⌘/Ctrl+E zooms to the
  selection or selected track; the − and + buttons and keys step by 2×.
- While playing, the view pages to follow the playhead unless you've just
  scrolled away; following resumes on the next play.

### 4.4 Splice marks

- **Add:** click in the ruler, or drag in it and let go where you want it
  (the flag follows the pointer, with a time readout). M (or ⌘T / Ctrl+T,
  Fission's key) adds one at the playhead, also while playing, so you can
  tap along while listening.
- **Name:** a new splice opens its name field right away (Return to
  accept, Esc to leave the default). Double-click a flag, or edit the row
  in the track list, to rename later. The default name is "Track 2",
  "Track 3", …; the start of the recording is an implicit first splice,
  named after the original's title.
- **The name is the track's title tag and its file name.** File names are
  sanitized and de-duplicated with the library's existing rules
  (" (2)").
- **Move:** drag the flag. ← / → nudge the selected splice by one ruler
  snap step (or one MP3 frame with snapping off); Shift for one second.
- **Delete:** select the flag and press Delete/Backspace, or right-click ›
  Remove.
- **Jump:** Tab / Shift+Tab move the playhead to the next or previous
  splice. P plays two seconds either side of the selected splice to check
  the cut.

### 4.5 Snap to ruler

- A **Snap** toggle in the toolbar (and the S key). When on, splices,
  selection edges and the playhead snap to the ruler's current minor tick,
  so the interval follows the zoom: e.g. 10 s when the whole hour is
  visible, 1 s, 100 ms, 10 ms as you zoom in. The tick interval is shown
  next to the toggle ("Snap 1 s").
- Holding ⌥/Alt while dragging inverts snapping for that drag.
- With snap on, things also snap to other splices, region edges and the
  playhead within about 8 px (Audacity shows a guide line when that
  happens; we do the same).
- Underneath, every cut still lands on an MP3 frame (24 to 26 ms, §6).
  That's finer than any ruler interval except the deepest zoom, where
  faint frame ticks appear.

### 4.6 Regions

- Drag in the waveform to select a region; Shift-click extends it. The
  selection shows its start, end and length, editable as text.
- **Delete Region** (or Delete/Backspace with a region selected) removes
  it. Nothing is cut yet: the region is hatched and skipped during
  playback, and the ruler keeps the original timeline so splice positions
  don't jump. Click a deleted region and choose **Restore** to undo it.
- A deleted region that touches a splice or either end of the recording
  just trims a track's start or end. One in the middle of a track joins
  the audio either side (see §6 for what that means for MP3).
- Space plays the selection when there is one, otherwise from the
  playhead.

### 4.7 Saving

Edits are non-destructive until **Save** (⌘/Ctrl+S). Save:

1. Shows the in-window modal (a sheet drawn inside the editor panel in the
   skin's style, dimming the panel; keyboard: Return = the default,
   Esc = Cancel):

   ```
   ┌─────────────────────────────────────────────┐
   │ Keep the original recording?                │
   │                                             │
   │ Saving creates 9 tracks from                │
   │ "Spotify 2026-10-03 14-05".                 │
   │                                             │
   │ [Cancel]  [No, delete it]  [Yes, keep it]   │
   └─────────────────────────────────────────────┘
   ```

   **Yes, keep it** is the default button. "Delete" moves the original to
   the Trash / Recycle Bin, the same as deleting from the library today,
   so it can still be recovered.
2. Writes every new track (progress shown in the editor), then trashes the
   original if asked. If anything fails, the finished pieces are removed
   and the original is left alone.
3. Closes the editor and selects the new tracks in the library.

With no splices and only deleted regions, Save produces one edited track
(with the same title) and the modal asks the same question.

**Tags.** Every new track gets a copy of the original's ID3 tags (artist,
album, album artist, year, genre, comment, cover art, and any others)
with the **title replaced by its splice name** and the **track number set
to 1/N … N/N** (§10).

### 4.8 Scrubbing and playback

- Play/Pause (Space), Stop, and click-to-move-playhead, shared with the
  main panel's transport.
- **Scrubbing:** drag the playhead (its handle in the ruler) or hold ⌥/Alt
  and drag in the waveform. Two kinds exist in other editors:
  *seek-scrub*, which plays short snippets (about 80 ms) from wherever the
  pointer is, and *tape-style scrub*, where speed and direction follow the
  mouse (Audition, Audacity's newer Scrub). Seek-scrub is straightforward
  with the current player (a "play snippet" command). Tape-style needs
  variable-rate resampling and reverse playback in the player, which is a
  bigger job. Seek-scrub first, tape-style later (§10).
- **Undo/redo** (⌘/Ctrl+Z, ⇧⌘Z / Ctrl+Y) covers splices, names, regions
  and Find Tracks. Edits are plain data, so undo is a snapshot stack.

## 5. Finding tracks automatically

**Find Tracks…** analyses the whole recording and proposes splice marks,
named "Track 2", "Track 3", … for you to rename. It opens a small popover
with a preset (Digital, Vinyl/Radio) and three sliders, with a live
preview: proposed splices appear dashed and the gaps shaded as the sliders
move, and **Apply** turns them into real splices (merging with existing
ones; a proposal within 2 s of an existing splice is dropped).

| Setting | Default | Range | Why |
|---|---|---|---|
| Silence threshold | −60 dBFS (Digital), −40 (Vinyl/Radio) | −80 to −20 | We capture system audio, so gaps between streamed songs are usually digital silence. −60 matches `trim.rs` and Fission's Digital preset. Vinyl or radio needs −40 to −30 because of noise. |
| Minimum gap | 1.5 s | 0.3 to 10 s | Gaps on streamed albums are often 1 to 2 s; shorter ones catch quiet passages inside songs. Streams with crossfade or gapless albums have no gap at all (see §8). |
| Minimum track length | 30 s | 0 s to 5 min | Stops a quiet bridge or a classical movement pause from becoming a split. |

How it works (Rust, `edit/detect.rs`):

1. Decode with Symphonia (gapless) and compute RMS over 10 ms windows
   (as Audacity does), both channels combined. RMS rather than peak, so
   clicks and crackle don't break a gap. This is the same pass that builds the waveform
   peaks (§7.1), so it is cached with them.
2. A window is silent if its RMS is below the threshold. Silent runs at
   least *minimum gap* long are candidate gaps; leading and trailing
   silence of the whole file are ignored.
3. Each gap proposes a split, then splits closer than *minimum track
   length* to their neighbours are dropped, quietest gap kept.
4. **Where the cut goes in the gap:** at the end of the gap minus 200 ms,
   so each track starts with a short breath of silence and the previous
   track keeps its fade-out tail. An option **Remove gaps** instead drops
   the silence between tracks entirely, keeping 100 ms either side (the
   same margin `trim.rs` uses).
5. Analysis of an hour of audio should take a few seconds; it runs on a
   worker thread with progress in the popover.

Later (phase 3), two smarter sources of boundaries:

- **Album lookup:** search MusicBrainz by the recording's album and artist
  tags, fetch the track list with lengths, then place markers by fitting
  those lengths to the detected gaps. It also names the tracks. Works well
  for full albums, not for radio. AcoustID (Chromaprint fingerprints,
  about 3 requests a second) could instead identify each detected track
  and name it, for radio and playlists.
- **Now Playing:** Windows exposes the current media session's title and
  artist through GlobalSystemMediaTransportControls; the recorder could
  log every track change during recording as a named marker. On macOS the
  equivalent (MediaRemote) is private and has been restricted for third
  party apps, so this would be Windows-first or not at all.

## 6. Cutting MP3s: lossless vs re-encode

This is the main design choice.

**MP3 basics that matter here.** An MP3 is a sequence of frames of 1152
samples: 26.1 ms at 44.1 kHz, 24 ms at 48 kHz. Frames can be copied
without decoding, so cutting at a frame boundary is lossless. Two
details make it imperfect:

- **Bit reservoir.** A frame's data may start up to 511 bytes back, in the
  spare bytes of earlier frames. If a cut drops those earlier frames, the first frame
  or two of the new file can't fully decode, which some decoders play as a
  click or a few ms of silence.
- **Encoder delay and padding.** LAME adds about 576 + 529 samples of
  silence at the start and pads the end to a whole frame, recording both
  in the LAME tag. Gapless-aware players (ours, iTunes/Music, foobar2000,
  most modern ones) skip them. A cut file needs a fresh LAME/Info tag with
  its own delay, padding and frame count, or players show the wrong length
  and play extra silence.

**Option A: frame-accurate lossless cut (what Fission and mp3DirectCut do).**
- Copy the frames of each track byte for byte; write a new Info tag at the
  start with the right frame count, byte count and seek table (TOC).
- **Bit reservoir:** start each piece one frame early, so its first real
  frame has its reservoir data, and set the tag's encoder delay to cover
  that extra frame plus the offset of the cut within the frame. Gapless
  players then start exactly at the cut with no glitch. Players that
  ignore the LAME tag hear up to about 50 ms extra at the start, which in
  practice is silence because cuts sit in gaps.
- **Sample accuracy for free on good players:** the delay and padding
  fields are in samples, so the cut point can be sample-accurate for
  gapless-aware players even though the bytes are frame-aligned.
- Pros: no quality loss, very fast (an hour splits in well under a second,
  it's a file copy), no LAME needed at edit time.
- Cons: nothing can change the audio itself. No fades, no normalising, no
  joining across a removed stretch without a possible click at the join.
  (mp3DirectCut does lossless fades and volume changes by rewriting each
  frame's global-gain field in 1.5 dB steps; that is a possible later
  trick, not something to start with.)

**Option B: decode and re-encode.**
- Decode with Symphonia, cut at the exact sample, re-encode with LAME at
  the recording's quality.
- Pros: sample-exact everywhere, any player; fades, normalise, gap removal
  and region deletion are trivial.
- Cons: generation loss. At 256/320 kbps or V0 it is hard to hear; at 128
  kbps a second encode is audible on cymbals and applause. Slower: LAME
  runs at very roughly 50 to 100× real time, so an hour takes about a
  minute.

**Recommendation: A by default, B only for the tracks that need it.**
Splices, and deleted regions at a track's start or end, are lossless
cuts. A region deleted from the *middle* of a track joins two stretches
of audio; a lossless join risks a click at the seam (the bit reservoir
again), so that one track is re-encoded at the recording's quality and the
rest stay lossless. The editor marks such tracks in the track list ("re-encodes")
so it's never a surprise. Fades, if they come later, work the same way.

**Option C (chosen, 2026-10-06): keep a lossless master while recording.**
The recorder writes a FLAC copy beside the MP3 (16-bit, about 400 MB per
hour at 48 kHz stereo, versus 86 MB for the 192 kbps MP3). When a master
exists, the editor cuts from it at the exact sample and encodes each new
track once from the master, so the tracks are no worse than the original
MP3 and every cut, deletion and fade is perfect. Without one (older
recordings, or a master already cleaned up) the editor falls back to
options A and B above.

### 6.1 Masters and disk space

Most recordings are a single track and never edited, so keeping a master
for every one would waste a lot of disk. The plan balances the two cases
automatically, with settings for people who care:

- **Always record a master.** We can't know in advance whether a
  recording will be edited, and the cost while recording is small (FLAC
  encodes far faster than real time). It goes through the same silence
  trimmer as the MP3, so the timelines match sample for sample.
- **Masters live outside the recordings folder**, in the app's data
  folder (`Masters/`), keyed to the recording and following its renames.
  The library stays clean and users never see stray `.flac` files.
- **Short recordings drop their master at stop.** Below a length
  threshold (default **20 minutes**, a setting), a recording is almost
  certainly one song or clip; its master is deleted as soon as the MP3
  is finalized. Long recordings (albums, shows, sets) keep theirs.
- **A disk budget with oldest-first cleanup.** Masters are capped at a
  total size (default **10 GB**, roughly 25 hours) and an age (default
  **30 days** since the recording was last opened in the editor). When
  either is exceeded, the least recently used masters are deleted first.
- **A master's job ends with its recording.** Saving edits with *No,
  delete it* deletes the master along with the original. With *Yes, keep
  it* the master stays (the original may be edited again) until the
  budget or age removes it. Trashing a recording from the library deletes
  its master.
- **Visible and in the user's hands.** Settings › Recording shows "Keep
  lossless masters for recordings longer than [20 min]", the budget and
  age, the space in use, and **Delete all masters**. The editor shows
  whether a master is available ("Lossless master: yes, edits are
  sample-exact"), and the details panel offers **Delete master** for one
  recording.
- **Fallback is graceful.** A recording whose master is gone edits exactly
  as in options A and B, so cleanup never breaks anything; it only makes
  later edits slightly less perfect.

A record-time choice ("this is a long recording") was considered and
dropped: people forget to set it, and the length threshold infers the
same thing after the fact.

Implementation note: FLAC encoding in Rust via a pure-Rust encoder crate
(e.g. `flacenc`) to avoid another C library, if its streaming support is
good enough; otherwise libFLAC (BSD licensed, no LGPL concerns).
Symphonia already decodes FLAC (one feature flag). Crash recovery treats
a leftover master like the `.part` MP3: finished on next launch.

## 7. Architecture

### 7.1 Rust core

New module tree in `crates/core/src/edit/`:

- **`peaks.rs`: waveform summary.** One decoding pass produces min/max/RMS
  per 256 samples and per 16384 samples (Audacity's two-level "summary
  block" approach), plus the 10 ms RMS track for detection. About 1.5 MB
  per hour. Cached in the app's cache folder keyed by file path, size and
  modified time, so reopening is instant and the recordings folder stays
  clean. Built on a worker thread with progress events.
- **`waveform.rs`: rendering.** Draws the visible window (start time,
  samples per pixel, width, height, scale) into an RGBA buffer, like
  `ss_vis_render`, using the coarse level when zoomed out and the fine one
  when in, falling back to decoding the visible span at the deepest zooms.
  Colours come from the skin. Markers, selection and the playhead are
  *not* drawn here; React Native draws them on top so they are
  interactive and cheap to move.
- **`detect.rs`:** §5.
- **`edits.rs`: the edit list.** Splice marks (sample positions and
  names), deleted regions, detection settings. Plain data with serde;
  JSON across the C ABI like the layout and skin APIs. Saved as a draft
  in the app's data folder, keyed by the recording's file name and
  renamed with it, so closing the editor never loses work and the MP3
  isn't rewritten on every drag.
- **`mp3cut.rs`:** frame-index the file with `mp3::scan` (extended to
  return per-frame offsets), map sample positions to frames, copy ranges,
  write the new LAME/Info tag (frame count, bytes, TOC, delay, padding).
- **`split.rs`:** runs a save: for each track, cut (A) or encode (B),
  copy the original's ID3 tag and replace the title and track number, write to `.part` then rename, add to the library. All tracks
  are written before the original is touched; on any error the finished
  pieces are removed and the original is untouched. Then, if asked, the
  original goes to the trash through the library's existing `trash`.

C ABI additions, following the existing style (opaque handle, JSON in and
out, callback for events): `ss_editor_open(recorder, path)` returning a
handle, `ss_editor_peaks_progress`, `ss_editor_render`,
`ss_editor_get_edits` / `ss_editor_set_edits`, `ss_editor_detect(json)`,
`ss_editor_split(json)` with progress and a finished event,
`ss_editor_close`. The player is reused, not duplicated.

### 7.2 App

- `EditorPanel.tsx`: the panel; `editorModel.ts`: edit list, undo stack,
  zoom/scroll math (pure, unit-tested like `libraryModel.ts`);
  `WaveformView`: a native view on each OS that calls
  `ss_editor_render` on demand (not every display refresh, unlike the
  visualizer), with the playhead drawn by RN at 10 Hz from player progress
  and interpolated.
- Panel registered with the layout crate like library/details/settings,
  so it docks and snaps.
- `EditorModal.tsx`: the in-window modal (keep original, unsaved
  changes), skinned, reusable by other panels later.
- Native menu items: Edit › Add Splice, Delete Region, Find Tracks…,
  Snap to Ruler, Save; the usual Undo/Redo.

### 7.3 Skins

A new `editor` panel in the manifest, with the frame, title bar and
controls of the other panels plus waveform colours: `wave`, `waveRms`,
`wavePlayed`, `silence`, `marker`, `markerSelected`, `selection`,
`playhead`, `ruler`, `rulerText`. Everything falls back to the Default
skin, so existing skins (including Hi-Fi '74) work unchanged.

## 8. Edge cases

- **No gaps** (gapless albums, crossfading players, DJ mixes): detection
  finds nothing and says so; markers are placed by hand. Album lookup
  (phase 3) helps for albums.
- **Quiet passages inside songs:** the minimum track length guards
  against them; the dashed preview makes mistakes visible before Apply.
- **Recordings with pauses:** the paused gap isn't in the file, so a pause
  between songs leaves no silence. A Mark button while recording (phase 3) solves it: the
  recorder can drop a splice at every resume.
- **VBR files:** the frame index handles them; the LAME tag's TOC is
  rebuilt per piece.
- **Very long recordings** (several hours): peaks are about 1.5 MB per
  hour and rendering is per visible window, so size isn't a problem; the
  first open shows progress while peaks build.
- **The file changes underneath** (renamed, retagged, deleted while the
  editor is open): the library watcher already notices; the editor
  follows renames and closes on deletion.
- **Name collisions** use the library's existing " (2)" rule.

## 9. Phased plan

**Phase 1: edit by hand, save (the core loop).** macOS.
- Rust: `peaks`, `waveform`, `edits`, `mp3cut`, `split`, with unit tests
  (cut points, LAME tag fields, reservoir handling decoded back through
  Symphonia and compared with the source samples, tags copied except
  title).
- Editor panel from the gear menu: waveform, ruler, zoom and scroll, snap
  to ruler, playhead linked to the player, splice marks (add in the
  ruler or at the playhead, name, drag, delete, nudge, jump), track list,
  undo.
- Region select and delete, including middle-of-track deletion with
  re-encode of that track.
- Save with the keep-original modal; Default skin `editor` panel.

**Phase 2: Find Tracks and scrubbing.**
- Find Tracks with presets, the three settings and a dashed preview,
  plus a **Remove gaps** option.
- Seek-scrub, P to preview a cut, overview strip, frame ticks at deep
  zoom.
- Lossless masters (§6.1): FLAC while recording, the length threshold,
  budget and cleanup, the settings, and editing from the master.
- Windows: the native waveform view and panel parity.

**Phase 3: optional extras.**
- Tape-style scrubbing.
- A Mark button while recording that drops splices into the new
  recording; optional split-on-silence during recording (Audio Hijack
  style).
- Fades in/out per track.
- Album lookup (MusicBrainz) or fingerprinting (AcoustID) to name tracks;
  Windows Now Playing track changes as splices.

## 10. Decisions (Alex, 2026-10-06)

1. A region deleted from the middle of a track re-encodes that track (from
   the master when there is one); everything else is lossless.
2. New tracks are numbered 1/N … N/N.
3. Snippet (seek) scrubbing first; tape-style later.
4. Record a lossless master, balanced against disk space as in §6.1.

## Sources

- Audacity: [keyboard shortcuts](https://support.audacityteam.org/basics/keyboard-shortcuts), [Label Sounds](https://manual.audacityteam.org/man/label_sounds.html), [Silence Finder](https://manual.audacityteam.org/man/silence_finder_setting_parameters.html), [boundary snap guides](https://manual.audacityteam.org/man/boundary_snap_guides.html), [splitting a recording into tracks](https://support.audacityteam.org/audio-editing/splitting-a-recording-into-separate-tracks)
- Ocenaudio: [features](https://www.ocenaudio.com/features)
- Audition: [markers](https://helpx.adobe.com/audition/using/markers.html), [Mark Audio discussion](https://community.adobe.com/t5/audition-discussions/placing-markers-at-specified-lengths-of-silence/m-p/10879546)
- Fission: [manual](https://rogueamoeba.com/support/manuals/fission?print=true), [Macworld on Smart Split](https://www.macworld.com/article/182665/fission11.html), [TidBITS on lossless editing](https://tidbits.com/2006/09/25/fission-manipulates-audio-tracks-of-all-stripes/)
- WaveLab [Auto Split](https://archive.steinberg.help/wavelab_pro/v12/en/wavelab/topics/auto_split/auto_split_dialog_audio_files_r.html); Sound Forge [Auto Region](https://cdn.borisfx.com/borisfx/Documentation/soundforge/2026/en/content/proonly/auto_region.htm); [mp3DirectCut](https://en.wikipedia.org/wiki/Mp3DirectCut)
- MP3 cutting: Hydrogenaudio on [frame cuts](https://hydrogenaudio.org/index.php?msg=571374), [the bit reservoir](https://hydrogenaudio.org/index.php/topic,126893.0.html), [LAME delay and padding](https://hydrogenaudio.org/index.php/topic,61917.0.html)
