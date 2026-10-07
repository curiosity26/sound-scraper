# Sound Scraper: Playlists and CD Burning Design v0.2

Status: agreed with Alex (2026-10-07); decisions in §11.

## 1. Goal

Alex's brief:

1. **Playlists.** A dropdown in the library chooses the **full library** or
   one of the user's **named playlists**.
2. Songs are **added to a playlist from the library**.
3. **New recordings go into the playlist** that's showing (and the
   library, as always).
4. Tracks in a playlist can be **reordered**.
5. **Burn a playlist to an audio CD** straight from Sound Scraper, or to a
   **disc image file** instead.
6. **Nero-style progress**: the burn broken down track by track.
7. **Never let a playlist that doesn't fit be burned.**
8. Alex has no CD burner on the Mac or in the Windows VM, so it has to be
   testable without one.

Brief item 4 says "reorder the tracks in the library". I read that as
reordering a playlist: the full library keeps sorting by its columns,
since it's a view of the recordings folder with no order of its own
(§11, question 3).

## 2. ISO or BIN/CUE?

**An audio CD can't be an .iso.** An ISO file is a copy of a *data* disc:
a file system (ISO 9660) holding files, written in 2048-byte sectors.
An audio CD (the Red Book standard that every CD player reads) has no file
system at all: it's one long stream of raw 16-bit, 44.1 kHz stereo
samples in 2352-byte sectors, plus a table of contents saying where each
track starts. An ISO has nowhere to put either, so an "audio CD .iso"
burned to disc would be a data disc that CD players can't play.

The standard image for an audio CD is **BIN/CUE**: a `.bin` file holding
the raw audio sectors and a small text `.cue` sheet listing the tracks,
their start times, gaps and CD-Text titles:

```
PERFORMER "Various"
TITLE "Road Trip"
FILE "Road Trip.bin" BINARY
  TRACK 01 AUDIO
    TITLE "So What"
    PERFORMER "Miles Davis"
    INDEX 01 00:00:00
  TRACK 02 AUDIO
    TITLE "Freddie Freeloader"
    PERFORMER "Miles Davis"
    INDEX 00 09:22:10
    INDEX 01 09:24:10
```

ImgBurn and CDBurnerXP (Windows), cdrdao, Brasero and K3b (Linux) burn
BIN/CUE directly, and VLC, foobar2000 and most emulators open it. So the
"image" option writes **`<playlist>.cue` + `<playlist>.bin`** (up to 847 MB
for an 80-minute disc).

There is one thing an ISO *is* right for: an **MP3 data CD**, the MP3
files themselves on a data disc, which many car stereos and later CD
players read and which holds about 10 hours at 192 kbps. That's a
different product (not Red Book, no capacity problem worth a meter), so I
propose it as a later extra (§10, phase 4), not part of this work.

## 3. What other burners do

| | Track list and capacity | Progress | Gaps / CD-Text |
|---|---|---|---|
| **Nero Burning ROM** | A compilation window: tracks listed with length, a **capacity bar along the bottom** with marks at 74 and 80 minutes that turns yellow then red past the disc size. | A burn window with a **log list** (timestamped lines: "Burn process started at 24x", "Track 3: writing", "Burn process completed successfully"), an overall bar, **buffer level** bars (the drive's and the app's), speed in x and KB/s, elapsed/remaining. | Per-track pause length (2 s default), CD-Text from the track properties, Disc-at-Once vs Track-at-Once. |
| **Apple Music** (`File › Burn Playlist to Disc`) | Burns a playlist; tells you after the fact if it needs several discs and offers to split. | A status line in the window header ("Burning track 4 of 12"). | Gap between songs: none, 1 to 5 s; "Include CD Text"; "Use Sound Check". |
| **Windows Media Player** (Burn tab) | A burn list with a **capacity meter** ("23 min remaining") and a "Next disc" divider where the list overflows. | Per-row status in the burn list ("Writing to disc 54%", then "Complete"). | Gaps: none (when the drive allows), 2 s default; volume leveling. |
| **ImgBurn / CDBurnerXP** | Cue-sheet-driven / an audio compilation with a capacity bar. | Log window, buffer bars, per-track lines. | Pregap from the cue sheet; CD-Text from the cue sheet. |

**Closest analog (Alex): ImgBurn and CDBurnerXP.** Their feature set is
the one we're building: an audio compilation with a capacity bar
(CDBurnerXP), cue/bin images in and out (ImgBurn), and a write window
with a timestamped log, device and system buffer bars, speed and
per-track lines (ImgBurn). Nero's look is the same family. §6.2 follows
ImgBurn's write window, with the per-track rows Alex asked for on top.

Patterns worth copying:

- **A capacity bar with the disc size marked**, live while you build the
  playlist, not an error at burn time (Nero, WMP).
- **Per-track rows that change state** (waiting, writing with a bar,
  done), which is exactly what Alex remembers from Nero.
- **A log** for the moments in between tracks (lead-in, lead-out,
  closing the disc) when no track row is active.
- **Gap choice** (2 s or none) and **CD-Text** are the only audio
  settings people actually change.

## 4. Red Book facts that set the rules

- 75 sectors a second; one sector is 2352 bytes = 588 stereo samples at
  44.1 kHz, 16-bit. Track lengths round up to whole sectors (1/75 s).
- **Capacity:** 74 min = 333,000 sectors; 80 min = 360,000 sectors
  (real 80-minute blanks report slightly less, around 79:57). With a disc
  in the drive we use the disc's own free sector count; with no disc (or
  for an image) we use 74:00 or 79:57 so a planned disc never surprises.
- **At most 99 tracks; each at least 4 s** (shorter ones are padded with
  silence, with a note in the burn log).
- **Track 1 always has a 2 s pregap**, and it counts against capacity.
  Between tracks the gap is our choice (2 s default, or 0 for gapless).
- **What counts:** sum of track lengths + all gaps. The capacity check
  is that sum against the disc, computed in sectors, so the meter and
  the burner agree to the sector.
- **Sample format:** our recordings are MP3 at 44.1 or 48 kHz. 44.1 kHz
  decodes straight to CD format; 48 kHz is resampled (rubato, already
  used by the player). Decoded audio is float, so it's **dithered**
  (TPDF) to 16-bit rather than truncated.

## 5. Playlists

### 5.1 Picking a playlist

The library panel's toolbar gets a **playlist dropdown** at the left
(where the skinned panel today shows only search and "Edit N selected"):

```
┌ Library: Road Trip (12) ──────────────────────────────── ☰ × ┐
│ [▾ Road Trip      ]  + Add to ▾      🔍 search               │
├──────────────────────────────────────────────────────────────┤
│ ≡ #  Name                       Duration   Date recorded     │
│ ≡ 1  So What                       9:22    2026-10-03 14:05  │
│ ≡ 2  Freddie Freeloader            9:46    2026-10-03 14:15  │
│ ≡ 3  Blue in Green                 5:37    2026-10-03 14:25  │
│   …                                                          │
├──────────────────────────────────────────────────────────────┤
│ 12 tracks · 52:14 (+0:24 gaps)                               │
│ ████████████████████████████████░░░░░░░│74░░░░│80            │
│ Fits a 74-minute CD with 21:22 to spare        [Burn CD…]    │
└──────────────────────────────────────────────────────────────┘
```

- The dropdown lists **Library** (every recording, today's view), a
  divider, the playlists alphabetically, a divider, then **New
  Playlist…**. It's a custom skinned dropdown (the skin's control
  colours and font), not a native combo box, so it matches both skins.
- The panel title follows it ("Library: Road Trip (12)").
- The title-bar **☰ menu** (the skin's `menu` button, already supported
  by the panel frame) holds the playlist actions: **New Playlist…**,
  **Rename Playlist…**, **Duplicate**, **Delete Playlist…** (asks in the
  in-window modal style the track editor uses; it never touches the
  recordings), **Export as .m3u8…**, **Burn to CD…**. The same items go in
  the native menu bar under a new **Playlist** menu.
- The chosen playlist is remembered across launches.

### 5.2 Adding and removing

- **Add to ▾** appears when rows are checked (beside "Edit N selected"),
  listing the playlists and **New Playlist…** ("New Playlist from 5
  checked").
- The details panel's gear menu gets **Add to Playlist ›** for the
  selection, and right-clicking a row gives the same submenu.
- Adding appends to the end. A recording can be in many playlists, and
  in one playlist more than once (a mixtape can repeat a song); adding
  one that's already there asks "Add it again?" in the modal style.
- In a playlist, **Remove from Playlist** (Delete/Backspace, the gear menu
  or right-click) only takes it off the list. **Move to Trash** stays in
  the gear menu and still trashes the file, with a reminder that it
  leaves every playlist.

### 5.3 Reordering

- A playlist's natural order is its **#** column, the default sort when
  a playlist is showing.
- **Drag a row by its ≡ handle** to move it (a line shows where it will
  land; several checked rows move together). **⌥↑ / ⌥↓** (Alt+↑/↓ on
  Windows) move the selection one place, for keyboard users and as the
  fallback if dragging in a list is awkward on one platform.
- Clicking another column header sorts the *view* only, as today. While
  sorted that way the handles hide, and a **Use this order** link makes
  the current sort the playlist's order (one step, undoable with ⌘Z).

### 5.4 New recordings

- When a playlist is showing as a recording stops, the new recording is
  appended to it. The record bar shows **"Recording into Road Trip"** so
  it's never a surprise; switching the dropdown while recording changes
  where it goes.
- Track editor saves never touch playlists: the new tracks go into the
  library only, and add them to playlists by hand. If the original is
  deleted (**No, delete it**), it simply leaves every playlist, the same
  as trashing it from the library (§11, question 4).

### 5.5 Files that change underneath

Playlists point at recordings by file name, the library's key.

- Renames made in the app (inline rename, title edits that rename,
  track editor) update every playlist.
- A file renamed or removed outside the app leaves a **missing** row
  (dimmed, "missing" in place of the duration). It's skipped when
  burning, with a warning, and **Remove Missing** clears them. A file
  that comes back under the same name is found again.
- Moving to a different recordings folder (Settings) keeps playlists;
  rows whose names aren't in the new folder show as missing.

### 5.6 Playing a playlist

Today selecting a recording loads it and Play plays that one recording.
With a playlist showing, I propose Play **continues to the next track**
when one ends, like any music player, with the loaded row following
along (§11, question 5). In the full library view nothing changes.

### 5.7 Capacity footer

When a playlist is showing, the panel's footer has the Nero/WMP-style
**capacity bar**: filled by the playlist's total (tracks plus gaps, §4),
with marks at 74 and 80 minutes. It's the accent colour while it fits a
74-minute disc, amber past 74 (needs an 80-minute disc), red past 80. The
line under it says what's true ("Fits a 74-minute CD with 21:22 to
spare", "Needs an 80-minute CD", "4:12 too long for a CD: remove a track
or two"), and past 80 minutes the rows that don't fit get a red edge,
where the disc ends, as WMP's "next disc" line does. **Burn CD…** is
disabled with a tooltip saying why when it doesn't fit, has more than 99
tracks, or is empty.

## 6. Burning

### 6.1 Burn setup

**Burn CD…** opens a new docking, resizable **burn panel**, snapped under
the library by default, starting on the setup page:

```
┌ Burn: Road Trip ─────────────────────────────────────────── × ┐
│ Write to   [▾ HL-DT-ST DVDRAM GP65NB60 (CD-R 80 min, blank) ] │
│            Disc image (.cue/.bin)…                            │
│            Simulated CD Recorder                              │
│ Speed      [▾ Maximum (24x) ]                                 │
│ Gaps       (•) 2 seconds   ( ) None (gapless)                 │
│ CD-Text    [x] Write titles and artists                       │
│ Test write [ ] Laser off: everything but the burn             │
│ When done  [x] Eject the disc                                 │
│                                                               │
│ 12 tracks · 52:38 with gaps · fits (27:19 free)               │
│                                     [Cancel]  [Burn]          │
└───────────────────────────────────────────────────────────────┘
```

- **Write to** lists every CD recorder the OS reports, with what's in it
  ("no disc", "CD-R 80 min, blank", "CD-RW, not blank: erase first",
  "DVD: needs a CD"), then **Disc image (.cue/.bin)…** (asks where to
  save; default the recordings folder), and **Simulated CD Recorder** in
  test builds (§9.2).
- **Burn to CD is driven by what's detected, not a setting.** Both OS
  APIs enumerate recorders and report hot-plugging (DiscRecording device
  notifications; IMAPI2's recorder list, re-checked on Windows device
  arrival/removal messages). With a CD writer present, the library
  footer's button reads **Burn CD…** and the panel defaults to the drive;
  with none it reads **Save CD Image…** and the panel shows only the
  image (and the simulator in test builds). Plug a USB burner in and the
  button changes without a restart. Drives that only read CDs, or only
  write DVDs, aren't listed (both APIs report each drive's write
  capabilities).
- The panel watches the drive: inserting a disc, ejecting it or plugging
  in a USB burner updates the list and the fit line at once, using the
  disc's real free space. With no recorder at all, it says "No CD burner
  found" and offers the image.
- **CD-RW that isn't blank** offers **Erase and Burn** (a quick erase,
  confirmed in the modal). DVDs and full CD-Rs are refused with the
  reason.
- **Speed** offers what the drive and disc support, defaulting to
  maximum. (Audio burned slower used to be "better"; with modern drives
  and buffer underrun protection that's folklore, but the option stays.)
- **Gaps**: 2 s, or none. "None" needs Disc-at-Once, which nearly every
  drive since around 2000 supports; if the drive doesn't, the option is
  disabled with a note.
- **CD-Text** writes the playlist name as the album title, each track's
  title and artist (from its tags, else the file name). Players and cars
  that show CD-Text display them; others ignore it. Windows is limited
  here (§7.2).
- **Test write** (laser off) runs the whole burn without writing, the way
  Nero's "Simulate" did. It's offered where the drive and OS API support
  it (macOS: yes; Windows: §7.2).

### 6.2 Burning: the Nero-style progress

**Burn** switches the same panel to the progress page:

```
┌ Burn: Road Trip ─────────────────────────────────────────── × ┐
│  #  Track                         Length   Status              │
│  ✓  1  So What                      9:22   Done                │
│  ✓  2  Freddie Freeloader           9:46   Done                │
│  ●  3  Blue in Green                5:37   ██████▌░░░░  58%    │
│  ○  4  All Blues                   11:33   Waiting             │
│  ○  5  Flamenco Sketches            9:26   Waiting             │
├───────────────────────────────────────────────────────────────┤
│ Writing track 3 of 12 at 24x (3,528 KB/s)                      │
│ Total  ███████████████▌░░░░░░░░░░░░░░░  41%   2:14 / ~5:25     │
│ Buffer ████████████████████████████▉░  96%                     │
├───────────────────────────────────────────────────────────────┤
│ 14:02:11  Preparing 12 tracks (decoding to CD audio)           │
│ 14:02:39  Burn started at 24x, Disc-at-Once, CD-Text on        │
│ 14:02:40  Writing lead-in                                      │
│ 14:02:52  Track 1: So What                                     │
│ 14:03:15  Track 2: Freddie Freeloader                          │
│ 14:03:39  Track 3: Blue in Green                               │
│                                                     [Cancel]   │
└───────────────────────────────────────────────────────────────┘
```

- **Track rows:** ○ waiting, ◐ preparing (decoding, during the prepare
  phase), ● writing with its own bar and percent, ✓ done, ✕ failed or
  skipped. The writing row scrolls into view.
- **Phases** shown in the status line and the log: *Preparing tracks*
  (decode, resample, dither into a CD-audio cache, with each row's bar
  filling as it's decoded), *Writing lead-in*, *Track n*, *Writing
  lead-out*, *Closing the disc*, *Done*.
- **Total bar** with elapsed and estimated remaining time; **write speed**
  in x and KB/s; a **Buffer** bar where the OS reports one (IMAPI2 does;
  DiscRecording doesn't, so on macOS it's hidden, not faked).
- **Log** with timestamps, copyable, and saved beside the image or in the
  app's logs folder if something goes wrong.
- **Cancel** confirms in the modal ("Stop burning? A CD-R stopped part way
  can't be used again."); during *Preparing*, nothing has been written
  and it just stops.
- **Done:** a chime, "Burned 12 tracks (52:38) to CD" with **Eject**,
  **Burn Another Copy** and **Close**. For an image: "Saved Road
  Trip.cue" with **Show in Finder / Explorer**.
- **Failed:** the failing row turns ✕, the log says why in plain words
  (buffer underrun, disc removed, write error at 34:12), and the panel
  offers **Try Again** and **Save Log**.
- The Mac and PC are kept awake for the burn (IOPMAssertion /
  SetThreadExecutionState); Microsoft documents a sleep mid-burn as a
  ruined disc. Quitting during a burn asks first.
- Recording and playback are disabled while burning (both use disk and
  CPU, and the player shares the decoder); the main panel shows
  "Burning…" in its status.

## 7. Under the hood

### 7.1 Pipeline (shared by every destination)

1. **Plan:** resolve the playlist to files, skip missing ones, read tags
   for CD-Text, compute each track's length in sectors, gaps and start
   positions, and check the plan against the destination's capacity, 99
   tracks and the 4 s minimum. The same function powers the capacity
   footer, so the footer and the burner can't disagree.
2. **Prepare:** decode each MP3 (Symphonia, gapless, as the player does),
   resample 48 kHz to 44.1 kHz, TPDF dither to 16-bit, pad to whole
   sectors and write raw CD audio into a cache folder (up to 847 MB; the
   free space is checked first). Decoding is far faster than burning, but
   preparing first means the drive is never waiting on a decoder (no
   buffer underruns) and a bad file fails before anything is written.
3. **Write** to the destination, which reports progress events (phase,
   track, bytes written, speed, buffer) that the panel shows.
4. **Clean up** the cache (kept briefly for **Burn Another Copy**).

### 7.2 Destinations

One Rust trait, `Burner`, with a backend per destination:

| Backend | API | Gaps | CD-Text | Test write | Per-track progress |
|---|---|---|---|---|---|
| **Image** | Writes `.bin` (little-endian, as ImgBurn/cdrdao expect) and `.cue` | 2 s or 0 (INDEX 00/01 in the cue) | `TITLE`/`PERFORMER` in the cue | n/a | Track being written, bytes |
| **macOS** | **DiscRecording**, through its C API (`DRBurn`, `DRTrack` with our own data producer callback, `DRDevice` notifications). Still in the macOS 26 SDK; its C API makes a Rust FFI backend straightforward. | `kDRPreGapLengthKey` per track; Session-at-Once strategy (`kDRBurnStrategyCDSAO`) for 0 s gaps | `DRCDTextBlock` | `kDRBurnTestingKey` | `kDRStatusCurrentTrackKey` + percent |
| **Windows** | **IMAPI2** (COM, in the `windows` crate we already use): `IDiscMaster2` to find recorders, **`IRawCDImageCreator` + `IDiscFormat2RawCD`** (Disc-at-Once) as the main path, **`IDiscFormat2TrackAtOnce`** as the fallback for drives without raw DAO. | DAO: our choice (gapless supported); TAO: drive's default 2 s | IMAPI2 has no CD-Text call I can find (only raw R-W subcode, which isn't where CD-Text lives); so **no CD-Text on Windows** to start with. (Inferred from the API reference; to confirm with hardware.) | Not exposed for audio, as far as I can find; the option is hidden on Windows. | TAO: `CurrentTrackNumber` events; DAO: written sector mapped to our track table. Buffer level: `FreeSystemBuffer`/`TotalSystemBuffer`. |
| **Linux (later)** | **libburn** (libburnia, what Brasero and Xfburn use) or cdrdao | SAO, any | Yes | Yes (simulate) | Yes |
| **Simulated** | Ours (§9.2) | any | any | n/a | Same events as a real burner |

The macOS and Windows backends live in a new `crates/disc` crate
alongside the plan, cue writer and simulator, so the C ABI, the panel
and the tests are the same on every OS and a Linux backend only adds one
file.

Not using the OS burn dialogs: DiscRecordingUI on macOS has ready-made
burn and progress sheets, but they're system-styled and show one
progress bar, which misses both the skin and the per-track view Alex
wants. Windows has nothing comparable for audio.

### 7.3 Rust core and C ABI

- `crates/core/src/playlists.rs`: two tables in the existing library
  index (`playlists` and `playlist_items` with position), a schema bump to
  version 2, and functions for list, create, rename, duplicate, delete,
  add, remove, move, set order, rename-follow, and `.m3u8` export
  (relative paths, `#EXTINF` lines, so other players and Linux tools
  read it).
- `crates/disc`: `plan.rs` (§4 rules, capacity), `pcm.rs` (sector
  padding, dither), `cue.rs`, `burner.rs` (trait and events),
  `sim.rs`, `macos.rs`, `windows.rs`. Decoding and resampling come from
  core (shared with the player).
- C ABI in the existing style (JSON in and out, events through the
  callback): `ss_playlists_*`, `ss_burn_devices` (with a device-change
  event), `ss_burn_plan(json)`, `ss_burn_start(json)` returning a job,
  `ss_burn_cancel`, `ss_burn_eject`.

### 7.4 App

- `LibraryTable.tsx` gains the dropdown, the # column and handles, and
  the footer; `playlistModel.ts` (pure, unit-tested like
  `libraryModel.ts`) holds the order math, capacity text and the
  missing-row rules.
- `BurnPanel.tsx` and `burnModel.ts` (event reducer: rows, phases, log,
  totals; unit-tested by replaying recorded event streams from the
  simulator).
- The burn panel registers with the layout crate like the editor panel,
  so it docks and snaps.
- The in-window modal from the track editor is reused for delete,
  erase and cancel prompts.

## 8. Skins

Both built-in skins get the new pieces; any other skin falls back to the
Default skin's, so nothing breaks.

- **Library panel:** `dropdown` colours (in `controls`: background,
  text, arrow, highlight), a `capacity` group (`fill`, `fill80` amber,
  `over` red, `mark` for the 74/80 lines, `track`), and the row `handle`
  colour.
- **New `burn` panel** (a framed panel like `library` and `editor`):
  frame, title, scrollbar, table colours from the library's, and a
  `progress` group: `bar`, `barTrack`, `done`, `failed`, `waiting`,
  `buffer`, `log`, `logText`. Optional sprite `states` for the row status
  icons (`waiting`, `preparing`, `writing`, `done`, `failed`), drawn as
  text glyphs when a skin has none.
- **Hi-Fi '74** gets an analog take, keeping its no-LCD rule: track status
  as **pilot lamps** (dark, amber blinking while writing, green done, red
  failed), progress bars as a **phosphor** fill like its scope, the
  capacity bar as a **tape counter style scale** with 74/80 stamped in
  its stroke lettering, the log as phosphor text on black,
  and the burn speed as a small **needle meter** (the same JS
  animation driver as its level meters).
- **Default** gets the plain version: accent bars, ✓/✕ glyphs.
- `docs/skins.md` and `skin.schema.json` gain the new keys.

## 9. Testing without a burner

### 9.1 What gets tested where

| Layer | How | Needs a burner? |
|---|---|---|
| Playlists (storage, order, renames, missing, m3u8) | Rust unit tests + `playlistModel` jest tests + by hand | No |
| Plan and capacity (§4) | Unit tests with exact sector counts at the 74/80 edges, 99 tracks, 4 s minimum, gaps | No |
| Audio conversion | Decode the produced `.bin` back and compare against the MP3 decode (44.1 kHz: bit-exact before dither tolerance; 48 kHz: correlation) | No |
| Image output | The `.cue` checked against the spec in tests; Alex opens it in VLC / burns it later with any tool | No |
| Burn UI | The **simulated recorder** (§9.2) on both OSes and both skins | No |
| Device listing, "no burner" state, OS API wiring | Runs on the real APIs: they report no recorders on Alex's Mac and in the VM | No |
| Actually writing a disc | A real drive (§9.3) | **Yes** |

### 9.2 The simulated recorder

A `Burner` backend that behaves like a drive, so the whole flow,
including the Nero-style panel, runs for real:

- Appears in **Write to** as "Simulated CD Recorder" in Debug builds,
  and in a Release build launched with `SS_SIMULATED_BURNER=1` (how I'll
  launch test builds for Alex). It never shows in a normal install, and
  there's no user setting for it.
- **Pretend disc** chooser on the setup page: blank 74 min, blank 80 min,
  CD-RW with data, no disc, a DVD. Inserting and ejecting are buttons, so
  the device-change paths get exercised.
- Runs the real *Prepare* step, then "writes" at the chosen speed in real
  time (24x burns 52 minutes of audio in about 2:15, like a real drive),
  with a **Fast** switch for quick runs. It emits the same events as the
  real backends: lead-in, per-track progress, a buffer level that
  wobbles, lead-out, closing.
- **Fault injection** (a small menu in the simulator's setup):
  buffer underrun on track n, disc removed, write error, slow drive. That
  tests the failure UI, which is hard to provoke with real hardware.
- Writes what it "burned" as a `.cue`/`.bin` in the app's cache, so a test
  can check that the bytes a real drive would have received are right.

### 9.3 Real hardware (recommended before release)

The OS backends can be built and run against "no recorders" without a
drive, but the only real proof is a disc. A USB external DVD/CD writer
costs about $25 to $35, works on the Mac with no driver, and Parallels
can pass it through to the Windows VM (Devices › USB). A few CD-RW discs
make repeated tests free. Phase 3 is written so everything up to it ships
and works without one; since burning only appears when a writer is
detected, a build without real-disc testing simply never shows it to
people without a burner, and Alex can test on hardware whenever a drive
is around (§11, question 6).

## 10. Phased plan

**Phase 1: playlists** (macOS and Windows, both skins).
- Storage and C ABI; dropdown; add (toolbar, gear, right-click); remove;
  drag and keyboard reorder; # column; renames followed; missing rows;
  new recordings into the showing playlist; trashed recordings leave
  playlists; `.m3u8` export; capacity footer with the fit text (the plan code from
  `crates/disc` arrives here, since the footer needs it).
- Playlist continuous play.

**Phase 2: burn engine, image and simulator** (both OSes, both skins).
- Prepare step, BIN/CUE writer, simulated recorder with fault injection.
- Burn panel: setup page and the Nero-style progress page, cancel,
  finish and failure states, logs, keep-awake.
- At this point Alex can make real images and watch full simulated burns.

**Phase 3: real burners.**
- macOS DiscRecording backend (device watch, CD-Text, SAO gaps, test
  write, erase CD-RW, eject).
- Windows IMAPI2 backend (DAO via raw image, TAO fallback, buffer bar,
  erase, eject).
- Smoke tests against "no recorder" on both; real-disc tests when a drive
  is available.

**Phase 4: later, optional.**
- MP3 data CD (.iso) for car stereos.
- Linux libburn backend (the trait and the rest are already portable).
- Split a long playlist across several discs (WMP-style "next disc").
- Import `.m3u8` playlists; drag rows from the library onto the
  dropdown.

## 11. Decisions (Alex, 2026-10-07)

1. **Image format:** BIN/CUE for audio CDs; the MP3-data-CD `.iso` is a
   later extra.
2. **Gaps:** 2 s by default with "None (gapless)" as the choice.
3. **"Reorder in the library"** means reordering a playlist; the full
   library keeps sorting by column.
4. **Track editor splits don't touch playlists.** A deleted original just
   leaves them; new tracks are added by hand. No assumptions about what
   goes on a playlist.
5. **Continuous play in a playlist:** yes, Play moves on to the next track.
6. **No settings switch for burning:** detect CD writers and show Burn CD
   only when one is present (Save CD Image otherwise), following
   hot-plugging (§6.1).
7. **Closest analog: ImgBurn / CDBurnerXP** (§3): CDBurnerXP's audio
   compilation for the playlist and capacity side, ImgBurn's write window
   (log, buffer bars, per-track lines) for the progress side.

## Sources

- Red Book layout: [Compact Disc Digital Audio (Wikipedia)](https://en.wikipedia.org/wiki/Compact_Disc_Digital_Audio), [cue sheet format (Hydrogenaudio)](https://wiki.hydrogenaud.io/index.php?title=Cue_sheet)
- macOS: DiscRecording headers in the macOS 26.5 SDK (`DRCoreBurn.h`, `DRCoreStatus.h`, `DRCoreCDText.h`, `DRContentTrack.h`), [DRBurn.h](https://jenkins.heirloomcomputing.com/downloads/MacOSX10.8.sdk/System/Library/Frameworks/DiscRecording.framework/Headers/DRBurn.h), [DRTrack.h](https://jenkins.heirloomcomputing.com/downloads/MacOSX10.8.sdk/System/Library/Frameworks/DiscRecording.framework/Headers/DRTrack.h)
- Windows: [IMAPI2 reference](https://learn.microsoft.com/en-us/windows/win32/api/imapi2/), [IDiscFormat2TrackAtOnce](https://learn.microsoft.com/en-us/windows/win32/api/imapi2/nn-imapi2-idiscformat2trackatonce), [IRawCDImageCreator](https://learn.microsoft.com/en-us/windows/win32/api/imapi2/nn-imapi2-irawcdimagecreator), [Rust `windows` crate Imapi module](https://microsoft.github.io/windows-docs-rs/doc/windows/Win32/Storage/Imapi/index.html), [Preventing logoff or suspend during a burn](https://learn.microsoft.com/en-us/windows/win32/imapi/preventing-logoff-or-suspend-during-a-burn)
- Linux: [libburn](https://dev.lovelyhq.com/libburnia/web/wiki/Libburn) (used by Brasero and Xfburn; audio CDs, CD-Text in SAO since 1.2.0)
