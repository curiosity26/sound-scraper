# Making a Sound Scraper skin

A skin is a folder with a `skin.json` manifest and its images. Shared as a
single file, it's that folder zipped, with the extension `.sskin`. People
install a `.sskin` by double-clicking it, dropping it on Sound Scraper, or
using **Settings › Skin › Install skin…**.

Anything your skin leaves out comes from the built-in Default skin,
element by element. So you can start small, for example by repainting the
main panel's background and keeping the Default buttons. The full format
is in [`skin.schema.json`](https://raw.githubusercontent.com/curiosity26/sound-scraper/main/skin.schema.json).
Point your editor at it via `"$schema"` and you get completion and checking
as you type.

## Getting started

1. In Sound Scraper, open **Settings › Skin** and choose **New skin from
   template…**. Pick where to put it and give it a name. You get a copy of
   the Default skin with its own id, plus this guide.
2. Choose **Use skin folder…** and pick that folder. The app now draws
   your folder as you work on it: save an image or `skin.json` and the
   change shows within a second or two. Problems such as a typo, a missing
   image or a rect outside the panel are listed under the skin chooser.
3. When it's ready, choose **Package skin…** to make the `.sskin`. Packaging
   checks the skin again and refuses to write a broken one.

## skin.json

```json
{
  "$schema": "https://raw.githubusercontent.com/curiosity26/sound-scraper/main/skin.schema.json",
  "format": 1,
  "id": "com.example.my-skin",
  "name": "My Skin",
  "author": "You",
  "version": "1.0",
  "description": "One line for the skin picker.",
  "colors": { "accent": "#ffb24a" },
  "fonts": {},
  "panels": { "main": {}, "library": {}, "details": {}, "settings": {}, "editor": {}, "burn": {} },
  "visualizer": { "presets": [] }
}
```

- **`id`** is reverse-DNS (`com.yourname.skin-name`). Installing a skin
  with the same id replaces the installed copy, so keep it when you release
  a new version and bump `version`.
- **Coordinates** are points: `[x, y, width, height]` from the panel's top
  left. A rect must lie inside its panel.
- **Colors** are `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`. Name the ones
  you reuse in `colors` and refer to them as `"@name"`.

## Images

PNG, JPEG or WebP, at most 4096 pixels on a side. Draw each image at 1x
(one pixel per point). For sharp results on Retina screens and in double
size, add `name@2x.png` and `name@4x.png` at exactly two and four times the
size. Without them the app enlarges the 1x art.

Buttons, lamps and fonts are **sprite sheets**: one image holding several
cells, all the size of the element. A sprite names each cell's top-left
corner:

```json
"record": {
  "rect": [20, 132, 72, 30],
  "sprite": {
    "image": "buttons.png",
    "states": { "normal": [0, 0], "pressed": [72, 0], "disabled": [144, 0] }
  }
}
```

The states:

- **Buttons:** `normal` is required. They may also have `pressed`,
  `active` (latched on, like Library while its panel is open),
  `activePressed` and `disabled`.
- **Record:** without a separate `pause` element, record doubles as pause.
  It uses `recording`/`recordingPressed` (drawn as pause) and
  `paused`/`pausedPressed` (resume).
- **Status:** `idle`, `recording`, `paused` and `finalizing`.

## The main panel

`panels.main` has a fixed `size`, a `background` image, the `dragRegion`
rects that move the window, and `elements`:

| Element | What it is |
| --- | --- |
| `record`, `play`, `pause`, `stop` | Transport buttons (sprites; see below) |
| `seek` | The playback position bar (scrubber; see below) |
| `elapsed` | Recording time, or the playback position, e.g. `12:34.5` (a sprite `font`, `align: "right"`; `style.tenths: false` shows `12:34`; `style.flip: true` flips changed cells over like split-flap clock cards, so draw each glyph as a whole card split across the middle, as in Hi-Fi '74) |
| `status` | REC / PAUSED / READY / PLAYING and messages (font, `style.pad` shows unlit cells), or a sprite with a cell per state: `idle`, `recording`, `paused`, `finalizing`, `playing`, `stopped` |
| `source` | What's being recorded (or the recording loaded for playback); click to choose |
| `levels` | Level meter (see below) |
| `visualizer` | Spectrum and scope looks from `visualizer.presets`; click to cycle |
| `toggleLibrary`, `toggleSettings` | Open and close those panels (use `active` for open) |
| `minimize`, `shade`, `close` | Window buttons |

An element with only a `rect` is an invisible hot spot over artwork you
painted into the background.

`shade` is the collapsed one-line layout (toggled by double-clicking the
title area). It has the same keys as the main panel.

### Transport

Buttons take a mode state when there is one, falling back to `active`
and then `normal`; `<mode>Pressed` while pressed:

- `record` starts a new recording. While one runs it's disabled and shows
  `recording` or `paused` (so it can stay lit).
- `play` plays the recording selected in the library. It shows `playing`
  while playing back and `recording` while recording (both mean "press to
  pause"), and `paused` while a recording is paused (press to resume).
- `stop` stops a recording, or stops playback and rewinds.
- `pause`, if present, pauses and resumes either.

A skin without `play` (made before playback) keeps record as pause while
recording, as before. `play` and `seek` never fall back to the Default
skin's, since they'd land on top of the skin's own artwork.

### Seek bar

```json
"seek": {
  "rect": [14, 107, 394, 10],
  "sprite": { "image": "seek.png", "states": { "track": [0, 0], "fill": [0, 10], "thumb": [0, 20], "thumbPressed": [4, 20] } },
  "style": { "thumbSize": [4, 10] }
}
```

`track` (drawn always) and `fill` (shown from the left up to the thumb)
are cells the element's size; `thumb`, `thumbPressed` and
`thumbDisabled` are `style.thumbSize`. Without sprite cells, the style
colors `track`, `fill`, `thumb` and `thumbPressed` draw plain bars. Fill
and thumb show only while a recording is loaded for playback.

### Animations

`animations` are decorative sprite loops such as tape reels or a blinking
lamp. Each lists `frames` (sprite states) at `fps`. Set `play` to
`recording` (the default; not during playback), `playing` (playback only),
`rolling` (recording or playing back: the tape is moving), `active`
(recording or playback, paused included) or `always`, and `speed: "level"`
to make it run faster when the audio is louder.

### Fonts

Sprite fonts are grids of glyph cells:

```json
"fonts": {
  "dial": { "sprite": "font-dial.png", "glyphs": " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", "cell": [12, 16] }
}
```

`glyphs` lists the characters in the cells, left to right and top to
bottom. Missing lowercase letters fall back to uppercase. Elements can use
system text instead, with `"text": { "color", "size", "family", "weight" }`.

### Level meters

Segment bars (the default):

```json
"levels": { "rect": [146, 32, 112, 20], "style": {
  "rows": 2, "segments": 28, "gap": 1,
  "on": "@lcdLit", "hot": "@lcdHot", "clip": "@record", "off": "@lcdGhost" } }
```

`rows` is 1 (one bar for the louder channel) or 2 (left and right), and
`vertical: true` turns the bars upright. The top 30% of segments use `hot`
and the top 10% use `clip`. A `sprite` with `off` and `on` cells reveals
`on` up to the level instead.

Analog needles (`"kind": "needle"`), as in Hi-Fi '74:

```json
"levels": { "rect": [258, 28, 176, 72], "style": {
  "kind": "needle", "faces": 2, "gap": 6,
  "pivot": [42.5, 98], "length": 82, "sweep": 64,
  "range": [-20, 3], "reference": -16,
  "needle": "#1a120a", "tip": "#b02a1c", "width": 1.2 } }
```

- **Faces:** the rect holds one face, or two (left and right) side by side,
  `gap` points apart.
- **Pivot and length:** each needle turns on `pivot`, given in points from
  its face's top left, and is `length` long. A pivot below the face hides
  the hub, like a real meter.
- **Sweep and range:** the needle swings `sweep` degrees, from the low end
  of `range` (in VU) to the high end.
- **Reference:** the level in dBFS that reads 0 VU.
- **Source:** needles follow RMS like a VU meter; set `"source": "peak"` for
  peaks.
- **The scale is your artwork.** Draw the ticks at the angles the needle
  will point to. For a VU value `v`, the angle from straight up is
  `-sweep/2 + sweep × (v − low) / (high − low)`.

### Visualizer

`visualizer.presets` are the looks that clicking the visualizer cycles
through; the first is the default. `style` is one of `bars`, `scope`,
`mirror`, `radial` or `fire`, and each takes colors (`color` or a
`gradient`, `peak`), `bands`, `gap`, `lineWidth`, `beat` and `decay` as
fits the style. `grid` and `line` give the idle look. On the visualizer
element, `style.pixelated: false` draws smooth curves for non-pixel skins.

## Library, details, settings and editor

These are resizable panels drawn with a **nine-slice frame**: `slice`
(`[top, right, bottom, left]`) marks the corners that stay fixed while the
edges and middle stretch. Put the title strip in the top slice.

| Key | What it is |
| --- | --- |
| `frame` | `{ "image", "slice" }` |
| `title` | `{ "font", "offset" }`: the panel name in the top strip |
| `close`, `menu` | Title-bar buttons, `offset` from the **top right** corner |
| `grip` | Size of the resize corner at the bottom right |
| `minSize`, `resizable` | Smallest size, and whether it resizes |
| `table` | Library colors: background, alternate, text, selection, selectionText, header, headerText, grid |
| `scrollbar` | `{ "image", "track", "thumb", "thumbSlice" }` |
| `controls` | Form colors: background, text, border, accent, button, buttonText |
| `waveform` | Track editor colors (`editor` only): background, wave, rms, center, ruler, rulerText, splice, spliceSelected, selection, deleted, playhead |
| `playlist` | Playlist colors (`library` only): the CD capacity bar's fill (fits 74 min), fill80 (needs 80 min), over (too long), track, mark (74/80 lines) and text; the reorder handle, the drop insert line, missing rows |
| `progress` | Burn panel colors (`burn` only): bar, track, buffer, the status lamps waiting/preparing/writing/done/failed, glow (lamp halo), log and logText |

## Limits and safety

A skin can hold up to 500 files, 100 MB unpacked, and 25 MB as a `.sskin`.
The only files allowed are images, JSON, text and Markdown (plus `LICENSE`,
`README`, `AUTHORS` and `COPYING`).

Paths must be relative, use forward slashes, and contain no `..`. Symbolic
links are refused. Skins contain no code, so installing one can't run
anything.

## Checking your art without the app

From a checkout of the Sound Scraper repo, this draws your main panel,
shade and visualizer looks with sample content:

```
cargo run -p sound_scraper_skin --example preview_skin -- path/to/skin preview.png
```
