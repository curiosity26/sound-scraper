//! Draws the Default skin (pixel art in the app icon's colors: orange deck
//! plastic, slime-green LCD, red piano keys, a mix tape) and writes it with
//! its skin.json to `skins/default/` at the repo root:
//!
//!     cargo run -p sound_scraper_skin --example gen_default_skin
//!
//! Every image is drawn twice from the same geometry: 1x, and @2x for
//! Retina (where the LCD fonts get real dot-matrix gaps).

use std::{collections::BTreeMap, path::PathBuf};

use image::{Rgba, RgbaImage};
use serde_json::{Value, json};

type Color = [u8; 4];
/// Draws one sprite cell at (x, y).
type Draw = Box<dyn Fn(&mut Canvas, i32, i32)>;
type States = Vec<(&'static str, Draw)>;

const fn rgb(hex: u32) -> Color {
    [(hex >> 16) as u8, (hex >> 8) as u8, hex as u8, 255]
}
const fn rgba(hex: u32, a: u8) -> Color {
    [(hex >> 16) as u8, (hex >> 8) as u8, hex as u8, a]
}

const INK: Color = rgb(0x1b1410);
const ORANGE: Color = rgb(0xe2742b);
const ORANGE_TOP: Color = rgb(0xee8a3e);
const ORANGE_BOTTOM: Color = rgb(0xcf6422);
const ORANGE_LIGHT: Color = rgb(0xffb46a);
const ORANGE_SHADOW: Color = rgb(0x9c4716);
const CHAR: Color = rgb(0x2a2522);
const CHAR_LIGHT: Color = rgb(0x4a423c);
const CHAR_MID: Color = rgb(0x3a3430);
const CHAR_DARK: Color = rgb(0x191513);
const LCD_BG: Color = rgb(0x0d1709);
const LCD_SCAN: Color = rgb(0x101c0b);
const LCD_LIT: Color = rgb(0xb8f23e);
const LCD_GHOST: Color = rgba(0xb8f23e, 26);
const SLIME: Color = rgb(0x9fd630);
const SLIME_LIGHT: Color = rgb(0xd4f57a);
const RED: Color = rgb(0xd8302a);
const RED_LIGHT: Color = rgb(0xf26a5e);
const RED_DARK: Color = rgb(0x8c1a14);
const CREAM: Color = rgb(0xf3ead0);
const CREAM_DARK: Color = rgb(0xc9bc96);
const TAPE: Color = rgb(0x4a2c1a);

const MAIN_W: i32 = 420;
const MAIN_H: i32 = 150;
const SHADE_H: i32 = 18;
const KEY_W: i32 = 74;

// ---------------------------------------------------------------- canvas

/// An image drawn in point coordinates at scale `s` (1 or 2).
struct Canvas {
    img: RgbaImage,
    s: u32,
}

impl Canvas {
    fn new(w: i32, h: i32, s: u32) -> Self {
        Self { img: RgbaImage::new(w as u32 * s, h as u32 * s), s }
    }

    fn blend(&mut self, x: i64, y: i64, c: Color) {
        if x < 0 || y < 0 || x >= self.img.width() as i64 || y >= self.img.height() as i64 || c[3] == 0 {
            return;
        }
        let p = self.img.get_pixel_mut(x as u32, y as u32);
        let a = c[3] as f32 / 255.0;
        let da = p[3] as f32 / 255.0;
        let oa = a + da * (1.0 - a);
        if oa <= 0.0 {
            return;
        }
        let mut out = [0u8; 4];
        for i in 0..3 {
            out[i] = ((c[i] as f32 * a + p[i] as f32 * da * (1.0 - a)) / oa).round() as u8;
        }
        out[3] = (oa * 255.0).round() as u8;
        *p = Rgba(out);
    }

    /// Fills a rectangle given in points.
    fn rect(&mut self, x: i32, y: i32, w: i32, h: i32, c: Color) {
        let s = self.s as i64;
        for py in (y as i64 * s)..((y + h) as i64 * s) {
            for px in (x as i64 * s)..((x + w) as i64 * s) {
                self.blend(px, py, c);
            }
        }
    }

    /// Evaluates `f` at the center of every device pixel inside the point
    /// box, in point coordinates (so curves get finer at @2x).
    fn shape(&mut self, x: i32, y: i32, w: i32, h: i32, f: impl Fn(f32, f32) -> Option<Color>) {
        let s = self.s as i64;
        for py in (y as i64 * s)..((y + h) as i64 * s) {
            for px in (x as i64 * s)..((x + w) as i64 * s) {
                let (fx, fy) = ((px as f32 + 0.5) / s as f32, (py as f32 + 0.5) / s as f32);
                if let Some(c) = f(fx, fy) {
                    self.blend(px, py, c);
                }
            }
        }
    }

    fn circle(&mut self, cx: f32, cy: f32, r: f32, c: Color) {
        let (x, y, d) = ((cx - r).floor() as i32, (cy - r).floor() as i32, (2.0 * r).ceil() as i32 + 2);
        self.shape(x, y, d, d, |fx, fy| ((fx - cx).powi(2) + (fy - cy).powi(2) <= r * r).then_some(c));
    }

    fn round_rect(&mut self, x: i32, y: i32, w: i32, h: i32, r: f32, c: Color) {
        let (x0, y0, x1, y1) = (x as f32, y as f32, (x + w) as f32, (y + h) as f32);
        self.shape(x, y, w, h, |fx, fy| {
            let dx = (x0 + r - fx).max(fx - (x1 - r)).max(0.0);
            let dy = (y0 + r - fy).max(fy - (y1 - r)).max(0.0);
            (dx * dx + dy * dy <= r * r).then_some(c)
        });
    }

    /// 1-point bevel: light top/left, dark bottom/right.
    fn bevel(&mut self, x: i32, y: i32, w: i32, h: i32, light: Color, dark: Color) {
        self.rect(x, y, w, 1, light);
        self.rect(x, y, 1, h, light);
        self.rect(x, y + h - 1, w, 1, dark);
        self.rect(x + w - 1, y, 1, h, dark);
    }

    fn outline(&mut self, x: i32, y: i32, w: i32, h: i32, c: Color) {
        self.bevel(x, y, w, h, c, c);
    }

    fn save(&self, dir: &std::path::Path, name: &str) {
        let file = if self.s == 1 { format!("{name}.png") } else { format!("{name}@{}x.png", self.s) };
        self.img.save(dir.join(file)).unwrap();
    }
}

/// Draws the same picture at 1x and @2x and saves both.
fn draw_both(dir: &std::path::Path, name: &str, w: i32, h: i32, draw: impl Fn(&mut Canvas)) {
    for s in [1, 2, 4] {
        let mut c = Canvas::new(w, h, s);
        draw(&mut c);
        c.save(dir, name);
    }
}

// ------------------------------------------------------------------ font

/// The 5×7 dot-matrix glyphs, shared by the "lcd" (2-point dots) and
/// "tiny" (1-point dots) fonts.
const GLYPHS: &[(char, [u8; 7])] = &[
    (' ', [0, 0, 0, 0, 0, 0, 0]),
    ('A', [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001]),
    ('B', [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110]),
    ('C', [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110]),
    ('D', [0b11100, 0b10010, 0b10001, 0b10001, 0b10001, 0b10010, 0b11100]),
    ('E', [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111]),
    ('F', [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000]),
    ('G', [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111]),
    ('H', [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001]),
    ('I', [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110]),
    ('J', [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100]),
    ('K', [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001]),
    ('L', [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111]),
    ('M', [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001]),
    ('N', [0b10001, 0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001]),
    ('O', [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110]),
    ('P', [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000]),
    ('Q', [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101]),
    ('R', [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001]),
    ('S', [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110]),
    ('T', [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100]),
    ('U', [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110]),
    ('V', [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100]),
    ('W', [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010]),
    ('X', [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001]),
    ('Y', [0b10001, 0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100]),
    ('Z', [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111]),
    ('a', [0,0,0b01110,0b00001,0b01111,0b10001,0b01111]),
    ('b', [0b10000,0b10000,0b10110,0b11001,0b10001,0b10001,0b11110]),
    ('c', [0,0,0b01110,0b10000,0b10000,0b10001,0b01110]),
    ('d', [0b00001,0b00001,0b01101,0b10011,0b10001,0b10001,0b01111]),
    ('e', [0,0,0b01110,0b10001,0b11111,0b10000,0b01110]),
    ('f', [0b00110,0b01001,0b01000,0b11100,0b01000,0b01000,0b01000]),
    ('g', [0,0b01111,0b10001,0b10001,0b01111,0b00001,0b01110]),
    ('h', [0b10000,0b10000,0b10110,0b11001,0b10001,0b10001,0b10001]),
    ('i', [0b00100,0,0b01100,0b00100,0b00100,0b00100,0b01110]),
    ('j', [0b00010,0,0b00110,0b00010,0b00010,0b10010,0b01100]),
    ('k', [0b10000,0b10000,0b10010,0b10100,0b11000,0b10100,0b10010]),
    ('l', [0b01100,0b00100,0b00100,0b00100,0b00100,0b00100,0b01110]),
    ('m', [0,0,0b11010,0b10101,0b10101,0b10001,0b10001]),
    ('n', [0,0,0b10110,0b11001,0b10001,0b10001,0b10001]),
    ('o', [0,0,0b01110,0b10001,0b10001,0b10001,0b01110]),
    ('p', [0,0,0b11110,0b10001,0b11110,0b10000,0b10000]),
    ('q', [0,0,0b01101,0b10011,0b01111,0b00001,0b00001]),
    ('r', [0,0,0b10110,0b11001,0b10000,0b10000,0b10000]),
    ('s', [0,0,0b01110,0b10000,0b01110,0b00001,0b11110]),
    ('t', [0b01000,0b01000,0b11100,0b01000,0b01000,0b01001,0b00110]),
    ('u', [0,0,0b10001,0b10001,0b10001,0b10011,0b01101]),
    ('v', [0,0,0b10001,0b10001,0b10001,0b01010,0b00100]),
    ('w', [0,0,0b10001,0b10001,0b10101,0b10101,0b01010]),
    ('x', [0,0,0b10001,0b01010,0b00100,0b01010,0b10001]),
    ('y', [0,0,0b10001,0b10001,0b01111,0b00001,0b01110]),
    ('z', [0,0,0b11111,0b00010,0b00100,0b01000,0b11111]),
    ('0', [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110]),
    ('1', [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110]),
    ('2', [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111]),
    ('3', [0b11111, 0b00010, 0b00100, 0b00010, 0b00001, 0b10001, 0b01110]),
    ('4', [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010]),
    ('5', [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110]),
    ('6', [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110]),
    ('7', [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000]),
    ('8', [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110]),
    ('9', [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100]),
    ('.', [0, 0, 0, 0, 0, 0b01100, 0b01100]),
    (',', [0, 0, 0, 0, 0b01100, 0b00100, 0b01000]),
    (':', [0, 0b01100, 0b01100, 0, 0b01100, 0b01100, 0]),
    (';', [0, 0b01100, 0b01100, 0, 0b01100, 0b00100, 0b01000]),
    ('!', [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0, 0b00100]),
    ('?', [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0, 0b00100]),
    ('\'', [0b01100, 0b00100, 0b01000, 0, 0, 0, 0]),
    ('"', [0b01010, 0b01010, 0b01010, 0, 0, 0, 0]),
    ('-', [0, 0, 0, 0b11111, 0, 0, 0]),
    ('+', [0, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0]),
    ('/', [0, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0]),
    ('(', [0b00010, 0b00100, 0b01000, 0b01000, 0b01000, 0b00100, 0b00010]),
    (')', [0b01000, 0b00100, 0b00010, 0b00010, 0b00010, 0b00100, 0b01000]),
    ('[', [0b01110, 0b01000, 0b01000, 0b01000, 0b01000, 0b01000, 0b01110]),
    (']', [0b01110, 0b00010, 0b00010, 0b00010, 0b00010, 0b00010, 0b01110]),
    ('&', [0b01100, 0b10010, 0b10100, 0b01000, 0b10101, 0b10010, 0b01101]),
    ('#', [0b01010, 0b01010, 0b11111, 0b01010, 0b11111, 0b01010, 0b01010]),
    ('%', [0b11000, 0b11001, 0b00010, 0b00100, 0b01000, 0b10011, 0b00011]),
    ('@', [0b01110, 0b10001, 0b00001, 0b01101, 0b10101, 0b10101, 0b01110]),
    ('*', [0, 0b00100, 0b10101, 0b01110, 0b10101, 0b00100, 0]),
    ('_', [0, 0, 0, 0, 0, 0, 0b11111]),
    ('<', [0b00010, 0b00100, 0b01000, 0b10000, 0b01000, 0b00100, 0b00010]),
    ('>', [0b01000, 0b00100, 0b00010, 0b00001, 0b00010, 0b00100, 0b01000]),
    ('=', [0, 0, 0b11111, 0, 0b11111, 0, 0]),
    ('$', [0b00100, 0b01111, 0b10100, 0b01110, 0b00101, 0b11110, 0b00100]),
    ('~', [0, 0, 0b01000, 0b10101, 0b00010, 0, 0]),
    ('|', [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100]),
    ('●', [0, 0b01110, 0b11111, 0b11111, 0b11111, 0b01110, 0]),
    ('▶', [0b01000, 0b01100, 0b01110, 0b01111, 0b01110, 0b01100, 0b01000]),
    ('■', [0, 0b11111, 0b11111, 0b11111, 0b11111, 0b11111, 0]),
    ('⏸', [0, 0b11011, 0b11011, 0b11011, 0b11011, 0b11011, 0]),
    ('♪', [0b00110, 0b00101, 0b00100, 0b00100, 0b01100, 0b11100, 0b11000]),
    ('▼', [0, 0, 0b11111, 0b01110, 0b00100, 0, 0]),
];

fn glyph(c: char) -> [u8; 7] {
    GLYPHS.iter().find(|(g, _)| *g == c).map(|(_, rows)| *rows).unwrap_or([0; 7])
}

/// Draws one 5×7 glyph with `dot`-point dots at (x, y). With `ghost` (the
/// unlit dots) it's an LCD: dots of 4+ device pixels get a 1-pixel gap,
/// like a real dot-matrix display. Without, the glyph is solid lettering.
fn dots(c: &mut Canvas, x: i32, y: i32, rows: [u8; 7], dot: i32, lit: Color, ghost: Option<Color>) {
    let s = c.s as i64;
    let size = dot as i64 * s;
    let fill = if size >= 4 && ghost.is_some() { size - 1 } else { size };
    for (row, bits) in rows.iter().enumerate() {
        for col in 0..5 {
            let on = bits & (0b10000 >> col) != 0;
            let Some(color) = (if on { Some(lit) } else { ghost }) else { continue };
            let (px, py) = ((x + col * dot) as i64 * s, (y + row as i32 * dot) as i64 * s);
            for dy in 0..fill {
                for dx in 0..fill {
                    c.blend(px + dx, py + dy, color);
                }
            }
        }
    }
}

fn text(c: &mut Canvas, x: i32, y: i32, s: &str, dot: i32, lit: Color) {
    for (i, ch) in s.chars().enumerate() {
        dots(c, x + i as i32 * 6 * dot, y, glyph(ch), dot, lit, None);
    }
}

/// Text with a 1-point outline (for the dripping title).
fn outlined_text(c: &mut Canvas, x: i32, y: i32, s: &str, dot: i32, fill: Color, edge: Color) {
    for (ox, oy) in [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1), (-1, 1), (1, -1)] {
        for (i, ch) in s.chars().enumerate() {
            let rows = glyph(ch);
            for (row, bits) in rows.iter().enumerate() {
                for col in 0..5 {
                    if bits & (0b10000 >> col) != 0 {
                        c.rect(x + i as i32 * 6 * dot + col * dot + ox, y + row as i32 * dot + oy, dot, dot, edge);
                    }
                }
            }
        }
    }
    for (i, ch) in s.chars().enumerate() {
        let rows = glyph(ch);
        for (row, bits) in rows.iter().enumerate() {
            for col in 0..5 {
                if bits & (0b10000 >> col) != 0 {
                    let (gx, gy) = (x + i as i32 * 6 * dot + col * dot, y + row as i32 * dot);
                    c.rect(gx, gy, dot, dot, fill);
                    if row == 0 {
                        c.rect(gx, gy, dot, 1, SLIME_LIGHT);
                    }
                }
            }
        }
    }
}

/// A slime drip hanging from (x, y): `len` points long, 2 wide, with a
/// rounded drop at the end.
fn drip(c: &mut Canvas, x: i32, y: i32, len: i32) {
    c.rect(x - 1, y, 4, len, INK);
    c.rect(x, y, 2, len, SLIME);
    c.circle(x as f32 + 1.0, (y + len) as f32 + 0.5, 2.6, INK);
    c.circle(x as f32 + 1.0, (y + len) as f32 + 0.5, 1.8, SLIME);
    c.rect(x, y, 1, len, SLIME_LIGHT);
}

/// The sprite font sheet: glyphs in a row-major grid.
fn font_sheet(dir: &std::path::Path, name: &str, chars: &str, cell: (i32, i32), columns: i32, dot: i32, pad: (i32, i32)) {
    let count = chars.chars().count() as i32;
    let rows = (count + columns - 1) / columns;
    draw_both(dir, name, cell.0 * columns, cell.1 * rows, |c| {
        for (i, ch) in chars.chars().enumerate() {
            let (cx, cy) = ((i as i32 % columns) * cell.0, (i as i32 / columns) * cell.1);
            dots(c, cx + pad.0, cy + pad.1, glyph(ch), dot, LCD_LIT, Some(LCD_GHOST));
        }
    });
}

/// Seven-segment LCD digits, unlit segments as ghosts.
fn digits_sheet(dir: &std::path::Path, chars: &str, cell: (i32, i32)) {
    // Segment polygons (hexagons) in a 14×26 cell: a b c d e f g.
    let seg = |i: usize, fx: f32, fy: f32| -> bool {
        let t = 1.4; // half thickness
        let (l, r, top, mid, bot) = (3.0, 11.0, 3.0, 13.0, 23.0);
        let horiz = |y: f32| (fy - y).abs() + ((fx - (l + r) / 2.0).abs() - ((r - l) / 2.0 - t - 0.6)).max(0.0) <= t;
        let vert = |x: f32, y0: f32, y1: f32| {
            (fx - x).abs() + ((fy - (y0 + y1) / 2.0).abs() - ((y1 - y0) / 2.0 - t - 0.6)).max(0.0) <= t
        };
        match i {
            0 => horiz(top),
            1 => vert(r, top, mid),
            2 => vert(r, mid, bot),
            3 => horiz(bot),
            4 => vert(l, mid, bot),
            5 => vert(l, top, mid),
            _ => horiz(mid),
        }
    };
    let pattern = |ch: char| -> u8 {
        match ch {
            '0' => 0b0111111,
            '1' => 0b0000110,
            '2' => 0b1011011,
            '3' => 0b1001111,
            '4' => 0b1100110,
            '5' => 0b1101101,
            '6' => 0b1111101,
            '7' => 0b0000111,
            '8' => 0b1111111,
            '9' => 0b1101111,
            '-' => 0b1000000,
            _ => 0,
        }
    };
    let n = chars.chars().count() as i32;
    draw_both(dir, "digits", cell.0 * n, cell.1, |c| {
        for (i, ch) in chars.chars().enumerate() {
            let ox = i as i32 * cell.0;
            let bits = pattern(ch);
            let is_segment_char = ch.is_ascii_digit() || ch == '-' || ch == ' ';
            c.shape(ox, 0, cell.0, cell.1, |fx, fy| {
                let (fx, fy) = (fx - ox as f32, fy);
                match ch {
                    ':' => {
                        let dot = |y: f32| (fx - 7.0).abs() <= 1.5 && (fy - y).abs() <= 1.5;
                        (dot(9.0) || dot(18.0)).then_some(LCD_LIT)
                    }
                    '.' => ((fx - 7.0).abs() <= 1.5 && (fy - 22.5).abs() <= 1.5).then_some(LCD_LIT),
                    _ if is_segment_char => (0..7).find(|&k| seg(k, fx, fy)).map(|k| {
                        if bits & (1 << k) != 0 { LCD_LIT } else { LCD_GHOST }
                    }),
                    _ => None,
                }
            });
        }
    });
}

// ----------------------------------------------------------- sprite sheet

/// Packs equally tall rows of cells left to right.
struct Sheet {
    width: i32,
    cursor: (i32, i32),
    row_h: i32,
    cells: Vec<(i32, i32, i32, i32, Draw)>,
}

impl Sheet {
    fn new(width: i32) -> Self {
        Self { width, cursor: (0, 0), row_h: 0, cells: Vec::new() }
    }

    /// Adds the states of one element in a row; returns their offsets.
    fn add(&mut self, w: i32, h: i32, states: States) -> BTreeMap<String, [i32; 2]> {
        if self.cursor.0 + w * states.len() as i32 > self.width {
            self.cursor = (0, self.cursor.1 + self.row_h);
            self.row_h = 0;
        }
        let mut offsets = BTreeMap::new();
        for (name, draw) in states {
            offsets.insert(name.to_string(), [self.cursor.0, self.cursor.1]);
            self.cells.push((self.cursor.0, self.cursor.1, w, h, draw));
            self.cursor.0 += w;
        }
        self.row_h = self.row_h.max(h);
        offsets
    }

    fn save(&self, dir: &std::path::Path, name: &str) {
        let height = self.cursor.1 + self.row_h;
        draw_both(dir, name, self.width, height, |c| {
            for (x, y, _, _, draw) in &self.cells {
                draw(c, *x, *y);
            }
        });
    }
}

#[derive(Clone, Copy, PartialEq)]
enum Key {
    Normal,
    Pressed,
    Active,
    Disabled,
}

#[derive(Clone, Copy)]
enum Symbol {
    Record,
    Pause,
    Stop,
}

fn draw_symbol(c: &mut Canvas, sym: Symbol, cx: i32, cy: i32, color: Color) {
    match sym {
        Symbol::Record => c.circle(cx as f32, cy as f32, 3.6, color),
        Symbol::Pause => {
            c.rect(cx - 3, cy - 4, 2, 8, color);
            c.rect(cx + 1, cy - 4, 2, 8, color);
        }
        Symbol::Stop => c.rect(cx - 3, cy - 3, 7, 7, color),
    }
}

/// A red piano key like the deck in the app icon (KEY_W×18).
fn piano_key(c: &mut Canvas, x: i32, y: i32, sym: Symbol, label: &str, state: Key) {
    let (w, h) = (KEY_W, 18);
    let down = matches!(state, Key::Pressed | Key::Active);
    let depth = if down { 2 } else { 4 };
    let (face, light, dark) = match state {
        Key::Disabled => (rgb(0x8f6a62), rgb(0xa88880), rgb(0x5e4440)),
        Key::Active => (rgb(0xe8403a), RED_LIGHT, RED_DARK),
        Key::Pressed => (rgb(0xc42a24), rgb(0xd84a42), RED_DARK),
        Key::Normal => (RED, RED_LIGHT, RED_DARK),
    };
    let top = y + (4 - depth);
    // Side (depth) and face.
    c.round_rect(x, top, w, h - (4 - depth), 2.5, INK);
    c.round_rect(x + 1, top + 1, w - 2, h - (4 - depth) - 2, 2.0, dark);
    c.round_rect(x + 1, top + 1, w - 2, h - depth - 3, 2.0, face);
    c.rect(x + 3, top + 1, w - 6, 1, light);
    c.rect(x + 2, top + 2, 1, h - depth - 6, light);
    let ink = match state {
        Key::Disabled => rgb(0xc8b8b0),
        Key::Active => rgb(0xfff0a0),
        _ => CREAM,
    };
    let cy = top + 1 + (h - depth - 3) / 2;
    // Symbol and label, centered.
    let sx = x + (w - (9 + label.len() as i32 * 6)) / 2 + 3;
    draw_symbol(c, sym, sx, cy, ink);
    text(c, sx + 7, cy - 3, label, 1, ink);
    if state == Key::Active {
        // Lit symbol glow.
        c.circle(sx as f32, cy as f32, 5.5, rgba(0xfff0a0, 50));
    }
}

/// Small charcoal title-bar button (12×10).
fn title_button(c: &mut Canvas, x: i32, y: i32, kind: char, pressed: bool) {
    c.rect(x, y, 12, 10, INK);
    c.rect(x + 1, y + 1, 10, 8, if pressed { CHAR_DARK } else { CHAR_MID });
    if pressed {
        c.bevel(x + 1, y + 1, 10, 8, CHAR_DARK, CHAR_LIGHT);
    } else {
        c.bevel(x + 1, y + 1, 10, 8, CHAR_LIGHT, CHAR_DARK);
    }
    let ink = if pressed { SLIME_LIGHT } else { SLIME };
    let o = pressed as i32;
    match kind {
        '_' => c.rect(x + 3 + o, y + 6 + o, 6, 2, ink),
        '=' => {
            c.rect(x + 3 + o, y + 3 + o, 6, 1, ink);
            c.rect(x + 3 + o, y + 6 + o, 6, 1, ink);
        }
        _ => {
            for i in 0..5 {
                c.rect(x + 3 + i + o, y + 2 + i + o, 2, 1, ink);
                c.rect(x + 7 - i + o, y + 2 + i + o, 2, 1, ink);
            }
        }
    }
}

/// Toggle button with an LED: off, pressed, on (active).
fn toggle_button(c: &mut Canvas, x: i32, y: i32, w: i32, label: &str, state: Key) {
    let h = 16;
    let down = matches!(state, Key::Pressed);
    c.round_rect(x, y, w, h, 3.0, INK);
    c.round_rect(x + 1, y + 1, w - 2, h - 2, 2.0, if down { CHAR_DARK } else { CHAR });
    if down {
        c.rect(x + 3, y + h - 3, w - 6, 1, CHAR_LIGHT);
    } else {
        c.rect(x + 3, y + 2, w - 6, 1, CHAR_LIGHT);
    }
    let o = down as i32;
    let on = state == Key::Active;
    let (lx, ly) = (x + 8 + o, y + 8 + o);
    c.circle(lx as f32, ly as f32, 3.2, INK);
    c.circle(lx as f32, ly as f32, 2.4, if on { SLIME } else { rgb(0x2f3a1c) });
    if on {
        c.circle(lx as f32 - 0.6, ly as f32 - 0.8, 0.9, SLIME_LIGHT);
        c.circle(lx as f32, ly as f32, 5.0, rgba(0x9fd630, 60));
    }
    text(c, x + 15 + o, y + 5 + o, label, 1, if on { SLIME_LIGHT } else { CREAM });
}

/// Tiny round shade-mode button (12×12): record or stop.
fn tiny_button(c: &mut Canvas, x: i32, y: i32, sym: Symbol, state: Key) {
    let (face, ink) = match (sym, state) {
        (_, Key::Disabled) => (rgb(0x6a5450), rgb(0xa89890)),
        (Symbol::Record, Key::Active) => (rgb(0xe8403a), rgb(0xfff0a0)),
        (Symbol::Record | Symbol::Pause, _) => (RED, CREAM),
        (_, _) => (CHAR_MID, CREAM),
    };
    c.round_rect(x, y, 12, 12, 2.5, INK);
    c.round_rect(x + 1, y + 1, 10, 10, 2.0, face);
    let o = matches!(state, Key::Pressed | Key::Active) as i32;
    if o == 0 {
        c.rect(x + 2, y + 1, 8, 1, rgba(0xffffff, 70));
    }
    match sym {
        Symbol::Record => c.circle(x as f32 + 6.0, y as f32 + 6.0 + o as f32, 2.6, ink),
        Symbol::Pause => {
            c.rect(x + 3, y + 3 + o, 2, 6, ink);
            c.rect(x + 7, y + 3 + o, 2, 6, ink);
        }
        Symbol::Stop => c.rect(x + 4, y + 4 + o, 4, 4, ink),
    }
}

// ------------------------------------------------------------ backgrounds

/// LCD well: ink outline, charcoal bezel, scanlined LCD inside.
fn lcd_well(c: &mut Canvas, x: i32, y: i32, w: i32, h: i32, bezel: i32) {
    c.rect(x, y, w, h, INK);
    c.rect(x + 1, y + 1, w - 2, h - 2, CHAR_MID);
    if bezel > 1 {
        c.bevel(x + 1, y + 1, w - 2, h - 2, CHAR_DARK, CHAR_LIGHT);
    }
    let (ix, iy, iw, ih) = (x + bezel, y + bezel, w - 2 * bezel, h - 2 * bezel);
    c.rect(ix, iy, iw, ih, LCD_BG);
    for row in (iy..iy + ih).step_by(2) {
        c.rect(ix, row, iw, 1, LCD_SCAN);
    }
    c.rect(ix, iy, iw, 1, rgba(0x000000, 120));
    c.rect(ix, iy, 1, ih, rgba(0x000000, 90));
}

/// Orange deck plastic with rounded (transparent) corners.
fn deck_body(c: &mut Canvas, w: i32, h: i32) {
    c.round_rect(0, 0, w, h, 5.0, INK);
    let hf = h as f32;
    c.shape(0, 0, w, h, |fx, fy| {
        let (x0, y0, x1, y1, r) = (1.0, 1.0, w as f32 - 1.0, hf - 1.0, 4.0f32);
        let dx = (x0 + r - fx).max(fx - (x1 - r)).max(0.0);
        let dy = (y0 + r - fy).max(fy - (y1 - r)).max(0.0);
        if dx * dx + dy * dy > r * r {
            return None;
        }
        // Vertical sheen: lighter top, deeper bottom.
        let t = fy / hf;
        let mix = |a: u8, b: u8| (a as f32 + (b as f32 - a as f32) * t) as u8;
        Some([mix(ORANGE_TOP[0], ORANGE_BOTTOM[0]), mix(ORANGE_TOP[1], ORANGE_BOTTOM[1]), mix(ORANGE_TOP[2], ORANGE_BOTTOM[2]), 255])
    });
    // Plastic speckle, deterministic.
    let mut seed = 0x2545_f491u32;
    for _ in 0..(w * h / 40) {
        seed ^= seed << 13;
        seed ^= seed >> 17;
        seed ^= seed << 5;
        let (x, y) = (2 + (seed % (w as u32 - 4)) as i32, 2 + ((seed >> 12) % (h as u32 - 4)) as i32);
        c.rect(x, y, 1, 1, if seed & 1 == 0 { rgba(0xffffff, 18) } else { rgba(0x000000, 22) });
    }
    c.rect(4, 1, w - 8, 1, ORANGE_LIGHT);
    c.rect(1, 4, 1, h - 8, ORANGE_LIGHT);
    c.rect(4, h - 2, w - 8, 1, ORANGE_SHADOW);
    c.rect(w - 2, 4, 1, h - 8, ORANGE_SHADOW);
}

fn screw(c: &mut Canvas, x: i32, y: i32) {
    c.circle(x as f32, y as f32, 2.4, INK);
    c.circle(x as f32, y as f32, 1.7, rgb(0xb8aa96));
    c.rect(x - 1, y, 2, 1, INK);
}

/// Grip ridges for the title bar.
fn ridges(c: &mut Canvas, x: i32, y: i32, w: i32, h: i32) {
    for row in (y..y + h).step_by(3) {
        c.rect(x, row, w, 1, CHAR_DARK);
        c.rect(x, row + 1, w, 1, CHAR_LIGHT);
    }
}

fn cassette(c: &mut Canvas, x: i32, y: i32) {
    // Shell 122×64.
    c.round_rect(x, y, 122, 64, 4.0, INK);
    c.round_rect(x + 1, y + 1, 120, 62, 3.0, rgb(0x2c2b30));
    c.rect(x + 4, y + 2, 114, 1, rgb(0x4a4950));
    // Label.
    c.round_rect(x + 6, y + 4, 110, 34, 2.0, CREAM);
    c.rect(x + 6, y + 12, 110, 3, RED);
    c.rect(x + 6, y + 15, 110, 1, rgb(0xe2742b));
    text(c, x + 10, y + 5, "SCRAPE TAPE", 1, INK);
    text(c, x + 78, y + 5, "C90", 1, RED_DARK);
    c.round_rect(x + 9, y + 20, 11, 13, 1.5, rgb(0x2f6b6e));
    text(c, x + 12, y + 23, "A", 1, CREAM);
    c.rect(x + 102, y + 24, 10, 1, CREAM_DARK);
    c.rect(x + 102, y + 29, 10, 1, CREAM_DARK);
    // Tape window and reels.
    c.round_rect(x + 24, y + 18, 74, 18, 3.0, INK);
    c.round_rect(x + 25, y + 19, 72, 16, 2.0, rgb(0x16110e));
    c.rect(x + 40, y + 21, 42, 12, rgba(0x6a4a30, 120));
    // The reels at rest; the "reels" animation spins them while recording.
    for cx in [x + 38, x + 84] {
        reel(c, cx as f32, (y + 27) as f32, 0.0);
    }
    // Head opening.
    c.shape(x + 22, y + 44, 78, 20, |fx, fy| {
        let rel = fy - (y + 44) as f32;
        let inset = 8.0 - rel * 0.4;
        (fx >= (x + 22) as f32 + inset && fx <= (x + 100) as f32 - inset && (0.0..19.0).contains(&rel))
            .then_some(rgb(0x232227))
    });
    for hx in [x + 40, x + 58, x + 76] {
        c.round_rect(hx, y + 54, 6, 6, 1.5, INK);
    }
    screw(c, x + 4, y + 60);
    screw(c, x + 118, y + 60);
    screw(c, x + 61, y + 41);
    // A slime drip running off the top right corner.
    c.round_rect(x + 100, y - 1, 20, 5, 2.5, INK);
    c.round_rect(x + 101, y, 18, 3, 1.5, SLIME);
    drip(c, x + 104, y + 2, 6);
    drip(c, x + 113, y + 2, 12);
}

/// A tape reel turned by `angle` radians: tape pack, hub and six teeth.
fn reel(c: &mut Canvas, fx: f32, fy: f32, angle: f32) {
    c.circle(fx, fy, 6.5, TAPE);
    // A darker band on the tape pack makes the turning visible.
    let (bx, by) = (fx + 5.3 * (angle + 0.5).cos(), fy + 5.3 * (angle + 0.5).sin());
    c.circle(bx, by, 1.1, rgb(0x2e1a0f));
    c.circle(fx, fy, 4.2, CREAM);
    c.circle(fx, fy, 2.2, INK);
    for k in 0..6 {
        let a = angle + k as f32 * std::f32::consts::PI / 3.0;
        c.circle(fx + 3.2 * a.cos(), fy + 3.2 * a.sin(), 0.8, INK);
    }
}

/// REEL_FRAMES cells of a 16×16 reel turning clockwise through a full turn.
const REEL_FRAMES: i32 = 12;

fn reels_sheet(dir: &std::path::Path) -> BTreeMap<String, [i32; 2]> {
    draw_both(dir, "reels", 16 * REEL_FRAMES, 16, |c| {
        for k in 0..REEL_FRAMES {
            let angle = k as f32 / REEL_FRAMES as f32 * std::f32::consts::TAU;
            reel(c, (k * 16) as f32 + 8.0, 8.0, angle);
        }
    });
    (0..REEL_FRAMES).map(|k| (format!("f{k}"), [k * 16, 0])).collect()
}

fn grille(c: &mut Canvas, x: i32, y: i32, w: i32, h: i32) {
    c.round_rect(x, y, w, h, 2.0, rgba(0x000000, 40));
    for gy in (y + 3..y + h - 1).step_by(4) {
        for gx in (x + 3..x + w - 1).step_by(4) {
            c.rect(gx, gy, 2, 2, INK);
            c.rect(gx, gy + 2, 2, 1, ORANGE_LIGHT);
        }
    }
}

fn main_background(c: &mut Canvas) {
    deck_body(c, MAIN_W, MAIN_H);
    // Title bar.
    c.rect(2, 2, MAIN_W - 4, 16, CHAR);
    c.rect(2, 18, MAIN_W - 4, 1, INK);
    c.rect(2, 2, MAIN_W - 4, 1, CHAR_LIGHT);
    ridges(c, 172, 5, 192, 10);
    outlined_text(c, 9, 3, "SOUND SCRAPER", 2, SLIME, INK);
    // Displays.
    lcd_well(c, 10, 22, 260, 80, 4);
    lcd_well(c, 274, 22, 138, 80, 4);
    c.rect(278, 26, 130, 72, rgb(0x14100e));
    cassette(c, 282, 30);
    // Glass glare over the cassette window.
    c.shape(278, 26, 130, 72, |fx, fy| ((fx - 278.0) + (fy - 26.0) * 0.6 < 34.0 && (fx - 278.0) + (fy - 26.0) * 0.6 > 24.0).then_some(rgba(0xffffff, 16)));
    // Slime dripping off the title onto the displays.
    for (x, len) in [(14, 5), (40, 9), (77, 4), (112, 11), (139, 6), (160, 8)] {
        drip(c, x, 17, len);
    }
    // Source strip.
    lcd_well(c, 10, 106, 402, 18, 1);
    dots(c, 400, 113, glyph('▼'), 1, LCD_LIT, None);
    // Key well, speaker grille, screws.
    c.round_rect(9, 127, 160, 21, 3.0, INK);
    c.rect(11, 145, 156, 2, rgba(0x000000, 90));
    grille(c, 174, 128, 98, 18);
    screw(c, 6, 24);
    screw(c, 6, 140);
}

fn shade_background(c: &mut Canvas) {
    deck_body(c, MAIN_W, SHADE_H);
    c.rect(2, 2, MAIN_W - 4, SHADE_H - 4, CHAR);
    c.rect(2, 2, MAIN_W - 4, 1, CHAR_LIGHT);
    text(c, 8, 5, "SOUND SCRAPER", 1, SLIME);
    lcd_well(c, 94, 2, 208, 14, 1);
    ridges(c, 338, 5, 30, 8);
}

/// Nine-slice frame for the library and settings windows (phase 3).
fn frame_image(c: &mut Canvas) {
    let (w, h) = (48, 48);
    deck_body(c, w, h);
    c.rect(4, 4, w - 8, 16, CHAR);
    c.rect(4, 4, w - 8, 1, CHAR_LIGHT);
    ridges(c, 8, 8, w - 16, 9);
    c.rect(4, 20, w - 8, 1, INK);
    c.rect(4, 21, w - 8, h - 25, rgb(0x221d1a));
    c.outline(4, 21, w - 8, h - 25, INK);
}

fn scrollbar_image(c: &mut Canvas) {
    // Track 10×32 at (0,0); thumb 10×24 at (12,0).
    c.rect(0, 0, 10, 32, INK);
    c.rect(1, 1, 8, 30, CHAR_DARK);
    c.round_rect(12, 0, 10, 24, 2.5, INK);
    c.round_rect(13, 1, 8, 22, 2.0, ORANGE);
    c.rect(14, 2, 6, 1, ORANGE_LIGHT);
    for gy in [9, 11, 13] {
        c.rect(14, gy, 6, 1, ORANGE_SHADOW);
    }
}

// ----------------------------------------------------------------- main

fn rect(r: [i32; 4]) -> Value {
    json!(r)
}

fn main() {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../skins/default");
    std::fs::create_dir_all(&dir).unwrap();
    for entry in std::fs::read_dir(&dir).unwrap().flatten() {
        if entry.path().extension().is_some_and(|e| e == "png") {
            std::fs::remove_file(entry.path()).unwrap();
        }
    }

    draw_both(&dir, "main", MAIN_W, MAIN_H, main_background);
    draw_both(&dir, "shade", MAIN_W, SHADE_H, shade_background);
    draw_both(&dir, "frame", 48, 48, frame_image);
    draw_both(&dir, "scrollbar", 22, 32, scrollbar_image);

    let lcd_chars: String = GLYPHS.iter().map(|(c, _)| *c).collect();
    font_sheet(&dir, "font-lcd", &lcd_chars, (12, 16), 16, 2, (1, 1));
    font_sheet(&dir, "font-tiny", &lcd_chars, (6, 8), 16, 1, (0, 0));
    let digit_chars = "0123456789:.- ";
    digits_sheet(&dir, digit_chars, (14, 26));

    // Buttons.
    let mut sheet = Sheet::new(KEY_W * 7);
    // Record is also pause: while recording it shows PAUSE, while paused a
    // lit RESUME (the "recording…"/"paused…" states the UI asks for).
    let record_states: [(&'static str, Symbol, &'static str, Key); 7] = [
        ("normal", Symbol::Record, "REC", Key::Normal),
        ("pressed", Symbol::Record, "REC", Key::Pressed),
        ("disabled", Symbol::Record, "REC", Key::Disabled),
        ("recording", Symbol::Pause, "PAUSE", Key::Normal),
        ("recordingPressed", Symbol::Pause, "PAUSE", Key::Pressed),
        ("paused", Symbol::Record, "RESUME", Key::Active),
        ("pausedPressed", Symbol::Record, "RESUME", Key::Pressed),
    ];
    let keys = |states: &[(&'static str, Symbol, &'static str, Key)]| -> States {
        states
            .iter()
            .map(|&(name, sym, label, k)| (name, Box::new(move |c: &mut Canvas, x, y| piano_key(c, x, y, sym, label, k)) as Draw))
            .collect()
    };
    let record = sheet.add(KEY_W, 18, keys(&record_states));
    let stop = sheet.add(
        KEY_W,
        18,
        keys(&[
            ("normal", Symbol::Stop, "STOP", Key::Normal),
            ("pressed", Symbol::Stop, "STOP", Key::Pressed),
            ("disabled", Symbol::Stop, "STOP", Key::Disabled),
        ]),
    );
    let title = |kind: char| -> States {
        vec![
            ("normal", Box::new(move |c: &mut Canvas, x, y| title_button(c, x, y, kind, false))),
            ("pressed", Box::new(move |c: &mut Canvas, x, y| title_button(c, x, y, kind, true))),
        ]
    };
    let minimize = sheet.add(12, 10, title('_'));
    let shade_btn = sheet.add(12, 10, title('='));
    let close = sheet.add(12, 10, title('x'));
    let toggle = |w: i32, label: &'static str| -> States {
        [("normal", Key::Normal), ("pressed", Key::Pressed), ("active", Key::Active)]
            .iter()
            .map(|&(name, k)| (name, Box::new(move |c: &mut Canvas, x, y| toggle_button(c, x, y, w, label, k)) as Draw))
            .collect()
    };
    let library = sheet.add(66, 16, toggle(66, "LIBRARY"));
    let settings = sheet.add(66, 16, toggle(66, "SETTINGS"));
    let tiny = |states: &[(&'static str, Symbol, &'static str, Key)]| -> States {
        states
            .iter()
            .map(|&(name, sym, _, k)| (name, Box::new(move |c: &mut Canvas, x, y| tiny_button(c, x, y, sym, k)) as Draw))
            .collect()
    };
    let tiny_record = sheet.add(12, 12, tiny(&record_states));
    let tiny_stop = sheet.add(
        12,
        12,
        tiny(&[
            ("normal", Symbol::Stop, "", Key::Normal),
            ("pressed", Symbol::Stop, "", Key::Pressed),
            ("disabled", Symbol::Stop, "", Key::Disabled),
        ]),
    );
    sheet.save(&dir, "buttons");
    let reel_states = reels_sheet(&dir);
    let reel_frames: Vec<String> = (0..REEL_FRAMES).map(|k| format!("f{k}")).collect();
    // Cassette at (282, 30); reel centers at +38/+84, +27.
    let reel_animation = |name: &str, cx: i32| {
        json!({
            "name": name,
            "rect": [cx - 8, 57 - 8, 16, 16],
            "sprite": { "image": "reels.png", "states": reel_states },
            "frames": reel_frames,
            "fps": 18,
            "play": "recording"
        })
    };

    let sprite = |states: &BTreeMap<String, [i32; 2]>| json!({ "image": "buttons.png", "states": states });
    let levels_style = json!({
        "rows": 2, "segments": 28, "gap": 1,
        "on": "@lcdLit", "hot": "@lcdHot", "clip": "@record", "off": "@lcdGhost"
    });
    let manifest = json!({
        "$schema": "../../skin.schema.json",
        "format": 1,
        "id": "com.alexboyce.soundscraper.default",
        "name": "Default",
        "author": "Sound Scraper",
        "version": "1.0",
        "description": "Orange deck plastic, a slime-green LCD and a mix tape.",
        "colors": {
            "background": "#e2742b",
            "text": "#1b1410",
            "panel": "#2a2522",
            "lcdBackground": "#0d1709",
            "lcdLit": "#b8f23e",
            "lcdHot": "#ffb03a",
            "lcdGhost": "#b8f23e1a",
            "accent": "#9fd630",
            "record": "#ff4a3a",
            "cream": "#f3ead0"
        },
        "fonts": {
            "lcd": { "sprite": "font-lcd.png", "glyphs": lcd_chars.clone(), "cell": [12, 16] },
            "tiny": { "sprite": "font-tiny.png", "glyphs": lcd_chars.clone(), "cell": [6, 8] },
            "digits": { "sprite": "digits.png", "glyphs": digit_chars, "cell": [14, 26] }
        },
        "panels": {
            "main": {
                "size": [MAIN_W, MAIN_H],
                "background": "main.png",
                "dragRegion": [[0, 0, MAIN_W, MAIN_H]],
                "elements": {
                    "minimize": { "rect": rect([372, 5, 12, 10]), "sprite": sprite(&minimize) },
                    "shade": { "rect": rect([386, 5, 12, 10]), "sprite": sprite(&shade_btn) },
                    "close": { "rect": rect([400, 5, 12, 10]), "sprite": sprite(&close) },
                    "elapsed": { "rect": rect([20, 32, 112, 26]), "font": "digits", "align": "right" },
                    "status": { "rect": rect([20, 74, 120, 16]), "font": "lcd", "style": { "pad": true } },
                    "levels": { "rect": rect([146, 32, 112, 20]), "style": levels_style },
                    "visualizer": { "rect": rect([146, 58, 112, 34]), "style": { "grid": "@lcdGhost", "line": "@lcdLit" } },
                    "source": { "rect": rect([14, 107, 384, 16]), "font": "lcd", "style": { "pad": true } },
                    "record": { "rect": rect([12, 128, KEY_W, 18]), "sprite": sprite(&record) },
                    "stop": { "rect": rect([16 + KEY_W, 128, KEY_W, 18]), "sprite": sprite(&stop) },
                    "toggleLibrary": { "rect": rect([278, 129, 66, 16]), "sprite": sprite(&library) },
                    "toggleSettings": { "rect": rect([346, 129, 66, 16]), "sprite": sprite(&settings) }
                },
                "animations": [reel_animation("reelLeft", 282 + 38), reel_animation("reelRight", 282 + 84)],
                "shade": {
                    "size": [MAIN_W, SHADE_H],
                    "background": "shade.png",
                    "dragRegion": [[0, 0, MAIN_W, SHADE_H]],
                    "elements": {
                        "status": { "rect": rect([98, 5, 60, 8]), "font": "tiny" },
                        "elapsed": { "rect": rect([160, 5, 48, 8]), "font": "tiny", "align": "right" },
                        "levels": { "rect": rect([214, 5, 84, 8]), "style": { "rows": 1, "segments": 21, "gap": 1, "on": "@lcdLit", "hot": "@lcdHot", "clip": "@record", "off": "@lcdGhost" } },
                        "record": { "rect": rect([306, 3, 12, 12]), "sprite": sprite(&tiny_record) },
                        "stop": { "rect": rect([320, 3, 12, 12]), "sprite": sprite(&tiny_stop) },
                        "minimize": { "rect": rect([372, 4, 12, 10]), "sprite": sprite(&minimize) },
                        "shade": { "rect": rect([386, 4, 12, 10]), "sprite": sprite(&shade_btn) },
                        "close": { "rect": rect([400, 4, 12, 10]), "sprite": sprite(&close) }
                    }
                }
            },
            "library": {
                "minSize": [480, 280],
                "resizable": true,
                "frame": { "image": "frame.png", "slice": [22, 6, 6, 6] },
                "title": { "font": "tiny", "offset": [12, 8] },
                "close": { "offset": [10, 7], "size": [12, 10], "sprite": sprite(&close) },
                "grip": [14, 14],
                "table": {
                    "background": "#221d1a", "alternate": "#2a2421", "text": "@cream",
                    "selection": "@accent", "selectionText": "#10180a",
                    "header": "@background", "headerText": "@text", "grid": "#3a3430"
                },
                "scrollbar": { "image": "scrollbar.png", "track": [0, 0, 10, 32], "thumb": [12, 0, 10, 24], "thumbSlice": [4, 0, 4, 0] },
                "controls": {
                    "background": "@panel", "text": "@cream", "border": "#4a423c",
                    "accent": "@accent", "button": "@background", "buttonText": "@text"
                }
            },
            "settings": {
                "minSize": [420, 480],
                "resizable": false,
                "frame": { "image": "frame.png", "slice": [22, 6, 6, 6] },
                "title": { "font": "tiny", "offset": [12, 8] },
                "close": { "offset": [10, 7], "size": [12, 10], "sprite": sprite(&close) },
                "controls": {
                    "background": "@panel", "text": "@cream", "border": "#4a423c",
                    "accent": "@accent", "button": "@background", "buttonText": "@text"
                }
            }
        },
        "visualizer": {
            "presets": [
                { "name": "Bars", "style": "bars", "bands": 28, "color": "@lcdLit", "peak": "@lcdHot", "gap": 1, "beat": 0.5,
                  "grid": "@lcdGhost", "line": "@lcdLit" },
                { "name": "Scope", "style": "scope", "color": "@lcdLit", "lineWidth": 1, "grid": "@lcdGhost", "line": "@lcdLit" },
                { "name": "Mirror", "style": "mirror", "bands": 28, "gradient": ["@lcdLit", "@lcdHot"], "gap": 1,
                  "grid": "@lcdGhost", "line": "@lcdLit" },
                { "name": "Radial", "style": "radial", "bands": 36, "color": "@lcdLit", "lineWidth": 1,
                  "grid": "@lcdGhost", "line": "@lcdLit" },
                { "name": "Fire", "style": "fire", "bands": 28, "gradient": ["@record", "@lcdHot", "#fff0a0"], "gap": 1,
                  "decay": 0.86, "grid": "@lcdGhost", "line": "@lcdHot" }
            ]
        }
    });
    let text = serde_json::to_string_pretty(&manifest).unwrap() + "\n";
    std::fs::write(dir.join("skin.json"), text).unwrap();
    println!("wrote {}", dir.canonicalize().unwrap().display());
}
