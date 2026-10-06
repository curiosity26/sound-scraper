# Sound Scraper: Track Editor Design v0.1

Status: proposal, waiting for Alex's answers to the questions in §10.

## 1. Goal

A recording often holds more than one thing: an album streamed end to end, a
radio show, a DJ set, a playlist. The track editor turns one recording into
the tracks it contains:

1. Open a recording and see its waveform.
2. Find the track boundaries: automatically (silence between songs), by
   hand (click, or tap a key while listening), or both.
3. Name each track and fill its tags.
4. Split: write one MP3 per track into the library, tagged and numbered.

It is not a general audio editor. No effects rack, no multitrack mixing, no
spectral repair. Removing a stretch (an ad, a DJ talking) and fades are
in scope as later phases because they come up constantly when ripping
streams.

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

- **Edit Tracks…** in the details panel's actions menu, and a double-click
  on a recording with ⌥ (Alt). It opens a new docking panel, `editor`,
  wide and resizable, snapped under the main panel by default.
- One recording at a time. Opening the editor loads that recording into the
  player, so the main panel's Play, Stop and seek bar drive the editor's
  playhead too. Pressing Record closes the editor (same rule as unloading
  the player today).

### 4.2 Layout

```
┌ Editor: Spotify 2026-10-03 14-05 ─────────────────────────────── × ┐
│ ▁▂▃▅▆▅▃▁▁▂▅▆▇▆▅▃▂▁   [===viewport===]   ▁▂▅▆▅▃▁▂▃▅▆▅▃▁    overview │
│ 0:00      1:00      2:00      3:00      4:00      5:00       ruler │
│    ▼1           ▼2                    ▼3                   markers │
│ ▂▃▅▇█▇▅▃▂▃▅▇▇▅▃▂▁  ▂▅▇█▇▅▃▂▃▅▇▇▅▃▂▁▁ │  ▂▅▇█▇▅▃▂▃▅▇▇▅▃  waveform │
│ ░░░ gap ░░░                   playhead ┘                           │
├────────────────────────────────────────────────────────────────────┤
│ #  Title                 Artist            Start     Length        │
│ 1  So What               Miles Davis       0:00.00   9:22.10       │
│ 2  Freddie Freeloader    Miles Davis       9:24.03   9:46.50       │
│ …                                                                  │
├────────────────────────────────────────────────────────────────────┤
│ [Find Tracks…]  [+ Marker]   Zoom − +  Fit      [Split into 9 ▸]  │
└────────────────────────────────────────────────────────────────────┘
```

- **Overview strip:** the whole recording, always fitted, with the visible
  window as a box you drag. Detected gaps are shaded.
- **Ruler:** time labels that adapt to zoom (minutes down to milliseconds).
  Dragging in the ruler scrubs (§4.5).
- **Marker lane:** one flag per split, numbered, with the track title on
  hover. Drag to move, double-click to rename the track that starts there,
  select and press Delete to remove.
- **Waveform:** min/max peaks per pixel column, with RMS drawn inside in a
  second shade (Audacity's look, readable for loud masters). Stereo is
  drawn as one combined lane; a toggle shows L/R. Silence below the
  detection threshold is tinted so gaps are visible at any zoom.
- **Track list:** one row per track (the stretch between two markers),
  editable title and artist, read-only start and length. Selecting a row
  selects that stretch and zooms to it. Album, year, genre and cover come
  from the recording's tags and apply to all tracks; they're edited in the
  details panel as today.

### 4.3 Zoom and scroll

- Zoom range: whole recording to about 1 pixel per 20 samples; past that
  there is nothing useful to see in an MP3 edit (cuts are frame-sized,
  §6).
- ⌘/Ctrl + scroll wheel or trackpad pinch zooms around the pointer; plain
  scroll pans; ⌘/Ctrl+1 fits the recording, ⌘/Ctrl+E zooms to the selected
  track or selection; + and − step.
- While playing, the view pages to follow the playhead unless the user has
  just scrolled away (resume following on the next play).

### 4.4 Markers and snapping

- **Add:** M (or ⌘T / Ctrl+T, Fission's key) at the playhead, while stopped or playing. The
  **+ Marker** button does the same. Clicking in the marker lane adds one
  at the pointer.
- **Move:** drag the flag; ← / → nudge the selected marker by one MP3 frame,
  with Shift by one second.
- **Delete:** select and press Delete/Backspace.
- **Jump:** Tab / Shift+Tab move the playhead to the next or previous
  marker; Space plays and pauses; P plays two seconds either side of the
  selected marker to check the cut.
- **Snap targets, in order:** the middle (or end, see §5) of a detected
  silence gap, the playhead, other markers. Snap distance is about 8
  pixels. Hold ⌥/Alt while dragging to turn snapping off.
- **Every marker lands on an MP3 frame boundary** (§6), so the flag snaps
  in steps of 24 to 26 ms at deep zoom. That is shown, not hidden: at deep
  zoom faint frame ticks appear in the ruler.
- **Undo/redo** (⌘/Ctrl+Z, ⇧⌘Z / Ctrl+Y) for every marker, title and
  detection change. Edits are plain data, so undo is a snapshot stack.

### 4.5 Scrubbing

Two modes in other editors: *seek-scrub* (Audacity's Seek: play normally
from wherever the pointer is) and *varispeed scrub* (tape-style, speed and
direction follow the mouse). Phase 1 does neither; phase 2 adds
seek-scrub: while dragging in the ruler, the player plays short snippets
(about 80 ms) from the pointer position, restarting as it moves. This
needs a "play snippet" command in the player but no varispeed resampling.
Varispeed is not planned.

## 5. Finding tracks automatically

**Find Tracks…** analyses the whole recording and proposes markers. It
opens a small popover with a preset (Digital, Vinyl/Radio) and three sliders, with a live preview: proposed
markers appear dashed and the gaps shaded as the sliders move, and
**Apply** turns them into real markers (merging with existing ones; a
proposal within 2 s of an existing marker is dropped).

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

Later (phase 4), two smarter sources of boundaries:

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

**Recommendation: A by default, B only when the edit needs it.** Splitting
and trimming the ends of tracks (everything in phases 1 and 2) uses lossless
cuts. Fades, region deletion and normalising (phase 3) re-encode only the
tracks they touch, and the UI says so ("Fades re-encode this track at 192
kbps"). The **Split** sheet shows which method each track will use.

**Option C, worth deciding now:** keep a lossless copy while recording.
The recorder could write FLAC beside the MP3 (about 450 MB per hour for
48 kHz stereo, versus 86 MB for the 192 kbps MP3), and the editor would
cut from it and encode each track once, sample-exact with no generation
loss, then delete the FLAC after the split (or keep it, as a setting).
It doubles the encoding work during recording and costs disk, but it
makes every later edit perfect. See question 3.

## Sources

- Audacity: [keyboard shortcuts](https://support.audacityteam.org/basics/keyboard-shortcuts), [Label Sounds](https://manual.audacityteam.org/man/label_sounds.html), [Silence Finder](https://manual.audacityteam.org/man/silence_finder_setting_parameters.html), [boundary snap guides](https://manual.audacityteam.org/man/boundary_snap_guides.html), [splitting a recording into tracks](https://support.audacityteam.org/audio-editing/splitting-a-recording-into-separate-tracks)
- Ocenaudio: [features](https://www.ocenaudio.com/features)
- Audition: [markers](https://helpx.adobe.com/audition/using/markers.html), [Mark Audio discussion](https://community.adobe.com/t5/audition-discussions/placing-markers-at-specified-lengths-of-silence/m-p/10879546)
- Fission: [manual](https://rogueamoeba.com/support/manuals/fission?print=true), [Macworld on Smart Split](https://www.macworld.com/article/182665/fission11.html), [TidBITS on lossless editing](https://tidbits.com/2006/09/25/fission-manipulates-audio-tracks-of-all-stripes/)
- WaveLab [Auto Split](https://archive.steinberg.help/wavelab_pro/v12/en/wavelab/topics/auto_split/auto_split_dialog_audio_files_r.html); Sound Forge [Auto Region](https://cdn.borisfx.com/borisfx/Documentation/soundforge/2026/en/content/proonly/auto_region.htm); [mp3DirectCut](https://en.wikipedia.org/wiki/Mp3DirectCut)
- MP3 cutting: Hydrogenaudio on [frame cuts](https://hydrogenaudio.org/index.php?msg=571374), [the bit reservoir](https://hydrogenaudio.org/index.php/topic,126893.0.html), [LAME delay and padding](https://hydrogenaudio.org/index.php/topic,61917.0.html)

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
- **`edits.rs`: the edit list.** Markers (sample positions), per-track
  title/artist, detection settings, gap handling. Plain data with serde;
  JSON across the C ABI like the layout and skin APIs. Saved as a draft
  in the app's data folder, keyed by the recording's file name and
  renamed with it, so closing the editor never loses work and the MP3
  isn't rewritten on every drag.
- **`mp3cut.rs`:** frame-index the file with `mp3::scan` (extended to
  return per-frame offsets), map sample positions to frames, copy ranges,
  write the new LAME/Info tag (frame count, bytes, TOC, delay, padding).
- **`split.rs`:** runs a split: for each track, cut (A) or encode (B),
  write tags (album, album artist, year, genre and cover copied from the
  source; title, artist, track n/N per track), write to `.part` then
  rename, add to the library. All tracks are written before the original
  is touched; on any error the finished pieces are removed and the
  original is untouched.

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
- Native menu items: Edit › Add Marker, Find Tracks…, Split…; the usual
  Undo/Redo.

### 7.3 Skins

A new `editor` panel in the manifest, with the frame, title bar and
controls of the other panels plus waveform colours: `wave`, `waveRms`,
`wavePlayed`, `silence`, `marker`, `markerSelected`, `selection`,
`playhead`, `ruler`, `rulerText`. Everything falls back to the Default
skin, so existing skins (including Hi-Fi '74) work unchanged.

## 8. Edge cases

- **No gaps** (gapless albums, crossfading players, DJ mixes): detection
  finds nothing and says so; markers are placed by hand. Album lookup
  (phase 4) helps for albums.
- **Quiet passages inside songs:** the minimum track length guards
  against them; the dashed preview makes mistakes visible before Apply.
- **Recordings with pauses:** the paused gap isn't in the file, so a pause
  between songs leaves no silence. Live markers (phase 3) solve it: the
  recorder can drop a marker at every resume.
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

**Phase 1: split by hand (the core loop).**
- `peaks`, `waveform`, `edits`, `mp3cut`, `split` in Rust with unit tests
  (cut points, LAME tag fields, reservoir handling decoded back through
  Symphonia and compared with the source samples).
- Editor panel on macOS: waveform, ruler, zoom/scroll, playhead linked to
  the player, markers (add at playhead, drag, delete, nudge, jump), track
  list with titles, undo, lossless Split into tracks with tags.
- Default skin `editor` panel.

**Phase 2: find tracks, comfort.**
- Find Tracks with the three settings, dashed preview, Remove gaps.
- Overview strip, snapping to gaps, seek-scrub, P to preview a cut,
  frame ticks at deep zoom.
- Windows: the native waveform view and panel parity.

**Phase 3: live markers and real edits.**
- **Mark** button and key while recording (and optionally a marker at
  every resume after a pause): markers recorded with the file and shown
  when it's opened in the editor.
- Auto-split while recording (Audio Hijack style): optional, using the
  same detector live.
- Delete a stretch (an ad, talk), fade in/out per track, all with
  re-encode for the affected tracks; export as a single file with ID3
  chapters as an alternative to separate files.

**Phase 4: smarter boundaries (optional).**
- MusicBrainz album lookup to place and name tracks.
- Windows Now Playing track-change markers.
- Lossless sidecar while recording, if chosen in question 3.

## 10. Questions for Alex

1. **The original after splitting:** keep it in the library (recommended,
   so a bad split costs nothing), or move it to the trash?
2. **Cutting method:** lossless frame cuts with re-encode only for fades
   and deletions (recommended), or always re-encode for sample-exact cuts
   everywhere?
3. **Lossless copy while recording (§6, option C):** no (recommended for
   now, revisit in phase 4), or yes, record FLAC beside the MP3 so every
   edit is perfect?
4. **Where the editor lives:** its own docking panel (recommended), or
   inside the library panel?
5. **Split file names:** "Artist - Title" (recommended), "NN Title", or
   "Recording name NN"?
6. **Live Mark button while recording:** phase 3 as planned (recommended),
   or pull it into phase 1 since it's small and useful for radio?
