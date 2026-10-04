//! Draws "Hi-Fi '74", a 1970s stereo receiver skin (walnut cheeks, brushed
//! aluminum, a warm amber dial and needle VU meters), into `skins/hifi74/`
//! at the repo root. It isn't built in: it's the skin for trying out
//! installing a `.sskin`.
//!
//!     cargo run --release -p sound_scraper_skin --example gen_hifi_skin
//!
//! Unlike the Default skin's pixel art, everything is drawn smooth
//! (supersampled) at 1x, @2x and @4x from the same geometry, with the wood
//! and metal textures as functions of the point position so every scale
//! shows the same grain.

use std::{collections::BTreeMap, f32::consts::PI, path::Path, path::PathBuf};

use image::{Rgba, RgbaImage};
use serde_json::{Value, json};

type Color = [u8; 4];
/// Draws one sprite cell at (x, y).
type Draw = Box<dyn Fn(&mut Canvas, f32, f32)>;
type States = Vec<(&'static str, Draw)>;

const fn rgb(hex: u32) -> Color {
    [(hex >> 16) as u8, (hex >> 8) as u8, hex as u8, 255]
}
const fn rgba(hex: u32, a: u8) -> Color {
    [(hex >> 16) as u8, (hex >> 8) as u8, hex as u8, a]
}

const INK: Color = rgb(0x17120e);
const ENGRAVE: Color = rgb(0x2b2622);
const ENGRAVE_LIGHT: Color = rgba(0xffffff, 150);
const GLASS: Color = rgb(0x0b0a09);
const AMBER: Color = rgb(0xffb24a);
const AMBER_HOT: Color = rgb(0xffd98a);
const AMBER_GHOST: Color = rgba(0xffb24a, 22);
const RED: Color = rgb(0xe0402a);
const RED_HOT: Color = rgb(0xff8a6a);

const MAIN_W: i32 = 460;
const MAIN_H: i32 = 168;
const SHADE_H: i32 = 18;
const CHEEK: f32 = 14.0;

// VU meters: two faces in the levels rect; the needle geometry is shared
// with the app through the levels style.
const VU_RECT: [i32; 4] = [258, 28, 176, 72];
const VU_GAP: f32 = 6.0;
const VU_PIVOT: (f32, f32) = (42.5, 98.0);
const VU_LENGTH: f32 = 82.0;
const VU_SWEEP: f32 = 64.0;
const VU_RANGE: (f32, f32) = (-20.0, 3.0);
const VU_REFERENCE: f32 = -16.0;

// ---------------------------------------------------------------- canvas

/// An image drawn in point coordinates at scale `s` (1, 2 or 4).
struct Canvas {
    img: RgbaImage,
    s: f32,
}

impl Canvas {
    fn new(w: i32, h: i32, s: u32) -> Self {
        Self { img: RgbaImage::new(w as u32 * s, h as u32 * s), s: s as f32 }
    }

    fn blend(&mut self, x: i64, y: i64, c: [f32; 4]) {
        if x < 0 || y < 0 || x >= self.img.width() as i64 || y >= self.img.height() as i64 || c[3] <= 0.0 {
            return;
        }
        let p = self.img.get_pixel_mut(x as u32, y as u32);
        let a = c[3];
        let da = p[3] as f32 / 255.0;
        let oa = a + da * (1.0 - a);
        let mut out = [0u8; 4];
        for i in 0..3 {
            out[i] = ((c[i] * a + p[i] as f32 * da * (1.0 - a)) / oa).round().clamp(0.0, 255.0) as u8;
        }
        out[3] = (oa * 255.0).round() as u8;
        *p = Rgba(out);
    }

    /// Paints `f` (a color at a point, or none) over the point box, 3×3
    /// supersampled per device pixel so edges are smooth at every scale.
    fn paint(&mut self, x0: f32, y0: f32, x1: f32, y1: f32, f: impl Fn(f32, f32) -> Option<Color>) {
        let s = self.s;
        let (px0, py0) = ((x0 * s).floor().max(0.0) as i64, (y0 * s).floor().max(0.0) as i64);
        let (px1, py1) = ((x1 * s).ceil() as i64, (y1 * s).ceil() as i64);
        const N: usize = 3;
        for py in py0..py1 {
            for px in px0..px1 {
                let mut acc = [0.0f32; 4];
                for sy in 0..N {
                    for sx in 0..N {
                        let fx = (px as f32 + (sx as f32 + 0.5) / N as f32) / s;
                        let fy = (py as f32 + (sy as f32 + 0.5) / N as f32) / s;
                        if fx < x0 || fy < y0 || fx >= x1 || fy >= y1 {
                            continue;
                        }
                        if let Some(c) = f(fx, fy) {
                            let a = c[3] as f32 / 255.0;
                            for i in 0..3 {
                                acc[i] += c[i] as f32 * a;
                            }
                            acc[3] += a;
                        }
                    }
                }
                if acc[3] > 0.0 {
                    let n = (N * N) as f32;
                    self.blend(px, py, [acc[0] / acc[3], acc[1] / acc[3], acc[2] / acc[3], acc[3] / n]);
                }
            }
        }
    }

    fn rect(&mut self, x: f32, y: f32, w: f32, h: f32, c: Color) {
        self.paint(x, y, x + w, y + h, |_, _| Some(c));
    }

    fn round_rect(&mut self, x: f32, y: f32, w: f32, h: f32, r: f32, c: Color) {
        self.paint(x, y, x + w, y + h, |fx, fy| in_round_rect(fx, fy, x, y, w, h, r).then_some(c));
    }

    fn circle(&mut self, cx: f32, cy: f32, r: f32, c: Color) {
        self.paint(cx - r, cy - r, cx + r, cy + r, |fx, fy| ((fx - cx).powi(2) + (fy - cy).powi(2) <= r * r).then_some(c));
    }

    /// A line `w` points wide from (x0, y0) to (x1, y1).
    fn line(&mut self, x0: f32, y0: f32, x1: f32, y1: f32, w: f32, c: Color) {
        let pad = w;
        let (dx, dy) = (x1 - x0, y1 - y0);
        let len2 = dx * dx + dy * dy;
        self.paint(x0.min(x1) - pad, y0.min(y1) - pad, x0.max(x1) + pad, y0.max(y1) + pad, |fx, fy| {
            let t = (((fx - x0) * dx + (fy - y0) * dy) / len2).clamp(0.0, 1.0);
            let (qx, qy) = (x0 + t * dx, y0 + t * dy);
            (((fx - qx).powi(2) + (fy - qy).powi(2)).sqrt() <= w / 2.0).then_some(c)
        });
    }

    fn save(&self, dir: &Path, name: &str) {
        let file = if self.s == 1.0 { format!("{name}.png") } else { format!("{name}@{}x.png", self.s) };
        self.img.save(dir.join(file)).unwrap();
    }
}

fn in_round_rect(fx: f32, fy: f32, x: f32, y: f32, w: f32, h: f32, r: f32) -> bool {
    let dx = (x + r - fx).max(fx - (x + w - r)).max(0.0);
    let dy = (y + r - fy).max(fy - (y + h - r)).max(0.0);
    fx >= x && fy >= y && fx < x + w && fy < y + h && dx * dx + dy * dy <= r * r
}

/// Draws the same picture at 1x, @2x and @4x and saves them.
fn draw_all(dir: &Path, name: &str, w: i32, h: i32, draw: impl Fn(&mut Canvas)) {
    for s in [1, 2, 4] {
        let mut c = Canvas::new(w, h, s);
        draw(&mut c);
        c.save(dir, name);
    }
}

// ------------------------------------------------------------ materials

fn hash(i: i32, j: i32, seed: u32) -> f32 {
    let mut h = (i as u32).wrapping_mul(0x8da6_b343) ^ (j as u32).wrapping_mul(0xd816_3841) ^ seed.wrapping_mul(0xcb1a_b31f);
    h ^= h >> 13;
    h = h.wrapping_mul(0x5bd1_e995);
    h ^= h >> 15;
    (h & 0xffff) as f32 / 65535.0
}

fn noise(x: f32, y: f32, seed: u32) -> f32 {
    let (i, j) = (x.floor() as i32, y.floor() as i32);
    let (fx, fy) = (x - x.floor(), y - y.floor());
    let (u, v) = (fx * fx * (3.0 - 2.0 * fx), fy * fy * (3.0 - 2.0 * fy));
    let a = hash(i, j, seed) + (hash(i + 1, j, seed) - hash(i, j, seed)) * u;
    let b = hash(i, j + 1, seed) + (hash(i + 1, j + 1, seed) - hash(i, j + 1, seed)) * u;
    a + (b - a) * v
}

fn fbm(x: f32, y: f32, seed: u32, octaves: u32) -> f32 {
    let (mut sum, mut amp, mut freq, mut norm) = (0.0, 1.0, 1.0, 0.0);
    for o in 0..octaves {
        sum += noise(x * freq, y * freq, seed + o) * amp;
        norm += amp;
        amp *= 0.5;
        freq *= 2.0;
    }
    sum / norm
}

fn mix(a: Color, b: Color, t: f32) -> Color {
    let t = t.clamp(0.0, 1.0);
    let m = |i: usize| (a[i] as f32 + (b[i] as f32 - a[i] as f32) * t).round() as u8;
    [m(0), m(1), m(2), m(3)]
}

fn shade(c: Color, k: f32) -> Color {
    let m = |i: usize| (c[i] as f32 * k).round().clamp(0.0, 255.0) as u8;
    [m(0), m(1), m(2), c[3]]
}

/// Walnut veneer; `vertical` grain runs top to bottom.
fn walnut(x: f32, y: f32, vertical: bool) -> Color {
    let (u, v) = if vertical { (x, y) } else { (y, x) };
    let warp = fbm(u * 0.06, v * 0.010, 11, 3) * 9.0;
    let rings = ((u + warp) * 0.95).sin() * 0.5 + 0.5;
    let fine = fbm(u * 1.4, v * 0.05, 23, 2);
    let t = (0.55 * rings + 0.45 * fine).powf(1.4);
    let mut c = mix(rgb(0x2e180b), rgb(0x7a4824), t);
    if noise(u * 3.0, v * 0.5, 37) > 0.86 {
        c = shade(c, 0.7);
    }
    c
}

/// Brushed aluminum: fine horizontal streaks over a soft vertical sheen.
fn aluminum(x: f32, y: f32) -> Color {
    let streak = fbm(x * 0.012, y * 2.4, 51, 3);
    let fine = noise(x * 0.4, y * 7.0, 63);
    let l = 0.70 + 0.13 * streak + 0.04 * fine;
    let c = (l * 255.0).min(255.0);
    [c as u8, c as u8, (c * 0.975) as u8, 255]
}

/// Lacquered wood cheek with a highlight down its left side.
fn cheek(c: &mut Canvas, x: f32, y: f32, w: f32, h: f32) {
    c.paint(x, y, x + w, y + h, |fx, fy| {
        let mut col = walnut(fx, fy, true);
        let t = (fx - x) / w;
        col = shade(col, 0.8 + 0.35 * (1.0 - (t - 0.3).abs() * 1.6).max(0.0));
        Some(col)
    });
    c.rect(x, y, 1.0, h, rgba(0xffffff, 30));
    c.rect(x + w - 1.0, y, 1.0, h, rgba(0x000000, 90));
}

fn faceplate(c: &mut Canvas, x: f32, y: f32, w: f32, h: f32) {
    c.paint(x, y, x + w, y + h, |fx, fy| {
        let sheen = 1.0 + 0.06 * (1.0 - ((fy - y) / h - 0.25).abs() * 2.0);
        Some(shade(aluminum(fx, fy), sheen))
    });
    c.rect(x, y, w, 1.0, rgba(0xffffff, 140));
    c.rect(x, y + h - 1.0, w, 1.0, rgba(0x000000, 110));
}

/// A recessed opening with a thin chrome bezel.
fn bezel(c: &mut Canvas, x: f32, y: f32, w: f32, h: f32, r: f32) {
    c.round_rect(x - 2.0, y - 2.0, w + 4.0, h + 4.0, r + 2.0, rgba(0x000000, 70));
    c.paint(x - 1.5, y - 1.5, x + w + 1.5, y + h + 1.5, |fx, fy| {
        in_round_rect(fx, fy, x - 1.5, y - 1.5, w + 3.0, h + 3.0, r + 1.5).then(|| {
            let t = (fy - y) / h;
            mix(rgb(0xf4f4f0), rgb(0x6c6c68), t)
        })
    });
}

/// Black glass with a faint diagonal reflection.
fn glass(c: &mut Canvas, x: f32, y: f32, w: f32, h: f32, r: f32) {
    bezel(c, x, y, w, h, r);
    c.paint(x, y, x + w, y + h, |fx, fy| {
        in_round_rect(fx, fy, x, y, w, h, r).then(|| {
            let d = (fx - x) * 0.35 + (fy - y);
            let sheen = (1.0 - (d - h * 0.35).abs() / (h * 0.5)).max(0.0) * 10.0;
            let l = sheen as u8;
            [GLASS[0] + l, GLASS[1] + l, GLASS[2] + l, 255]
        })
    });
}

/// A backlit amber window: brighter in the middle, dark at the edges.
fn amber_window(c: &mut Canvas, x: f32, y: f32, w: f32, h: f32) {
    c.paint(x, y, x + w, y + h, |fx, fy| {
        let (u, v) = ((fx - x) / w - 0.5, (fy - y) / h - 0.5);
        let glow = (1.0 - (u * u * 2.2 + v * v * 2.8)).max(0.0);
        Some(mix(rgb(0x120902), rgb(0x3a2108), glow))
    });
    // Inner shadow under the bezel.
    c.rect(x, y, w, 1.0, rgba(0x000000, 140));
    c.rect(x, y, 1.0, h, rgba(0x000000, 90));
}

// ----------------------------------------------------------------- text

include!("common/glyphs.rs");

fn glyph(c: char) -> [u8; 7] {
    GLYPHS.iter().find(|(g, _)| *g == c).map(|(_, rows)| *rows).unwrap_or([0; 7])
}

fn text_width(s: &str, size: f32) -> f32 {
    s.chars().count() as f32 * 6.0 * size - size
}

/// Solid block lettering (the 5×7 cells filled edge to edge).
fn blocks(c: &mut Canvas, x: f32, y: f32, s: &str, size: f32, color: Color) {
    for (i, ch) in s.chars().enumerate() {
        let rows = glyph(ch);
        let ox = x + i as f32 * 6.0 * size;
        c.paint(ox, y, ox + 5.0 * size, y + 7.0 * size, |fx, fy| {
            let (col, row) = (((fx - ox) / size) as usize, ((fy - y) / size) as usize);
            (row < 7 && col < 5 && rows[row] & (0b10000 >> col) != 0).then_some(color)
        });
    }
}

/// Lettering engraved into metal: a light edge below the dark letters.
fn engraved(c: &mut Canvas, x: f32, y: f32, s: &str, size: f32) {
    blocks(c, x, y + 0.5, s, size, ENGRAVE_LIGHT);
    blocks(c, x, y, s, size, ENGRAVE);
}

fn engraved_centered(c: &mut Canvas, cx: f32, y: f32, s: &str, size: f32) {
    engraved(c, cx - text_width(s, size) / 2.0, y, s, size);
}

/// Glowing round dots, like a vacuum fluorescent display; unlit dots
/// as `ghost`.
fn vfd_glyph(c: &mut Canvas, x: f32, y: f32, ch: char, dot: f32, lit: Color, ghost: Option<Color>) {
    let rows = glyph(ch);
    let r = dot * 0.42;
    c.paint(x - dot, y - dot, x + 6.0 * dot, y + 8.0 * dot, |fx, fy| {
        let mut best: Option<Color> = None;
        let mut glow = 0.0f32;
        for (row, bits) in rows.iter().enumerate() {
            for col in 0..5 {
                let (cx, cy) = (x + (col as f32 + 0.5) * dot, y + (row as f32 + 0.5) * dot);
                let d = ((fx - cx).powi(2) + (fy - cy).powi(2)).sqrt();
                let on = bits & (0b10000 >> col) != 0;
                if d <= r {
                    best = Some(if on { lit } else { ghost.unwrap_or([0; 4]) });
                } else if on {
                    glow = glow.max((1.0 - (d - r) / (dot * 0.9)).max(0.0));
                }
            }
        }
        best.filter(|c| c[3] > 0).or_else(|| (glow > 0.0).then(|| [lit[0], lit[1], lit[2], (glow * 70.0) as u8]))
    });
}

fn font_sheet(dir: &Path, name: &str, chars: &str, cell: (i32, i32), columns: i32, draw: impl Fn(&mut Canvas, f32, f32, char)) {
    let count = chars.chars().count() as i32;
    let rows = (count + columns - 1) / columns;
    draw_all(dir, name, cell.0 * columns, cell.1 * rows, |c| {
        for (i, ch) in chars.chars().enumerate() {
            let (cx, cy) = ((i as i32 % columns) * cell.0, (i as i32 / columns) * cell.1);
            draw(c, cx as f32, cy as f32, ch);
        }
    });
}

/// Seven-segment amber digits with a soft glow; unlit segments ghosted.
fn digits_sheet(dir: &Path, chars: &str, cell: (i32, i32)) {
    // Signed distance to segment k of a 14×26 cell (negative inside).
    let seg = |k: usize, fx: f32, fy: f32| -> f32 {
        let t = 1.5;
        let (l, r, top, mid, bot) = (3.5, 11.5, 3.0, 13.0, 23.0);
        let slant = |fy: f32| (13.0 - fy) * 0.08; // a slight italic
        let fx = fx - slant(fy);
        let horiz = |y: f32| (fy - y).abs() + ((fx - (l + r) / 2.0).abs() - ((r - l) / 2.0 - t - 0.6)).max(0.0) - t;
        let vert = |x: f32, y0: f32, y1: f32| (fx - x).abs() + ((fy - (y0 + y1) / 2.0).abs() - ((y1 - y0) / 2.0 - t - 0.6)).max(0.0) - t;
        match k {
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
    draw_all(dir, "digits", cell.0 * n, cell.1, |c| {
        for (i, ch) in chars.chars().enumerate() {
            let ox = (i as i32 * cell.0) as f32;
            let bits = pattern(ch);
            let segmented = ch.is_ascii_digit() || ch == '-' || ch == ' ';
            c.paint(ox, 0.0, ox + cell.0 as f32, cell.1 as f32, |fx, fy| {
                let fx = fx - ox;
                let (lit_d, ghost_d) = if segmented {
                    let mut lit = f32::MAX;
                    let mut ghost = f32::MAX;
                    for k in 0..7 {
                        let d = seg(k, fx, fy);
                        if bits & (1 << k) != 0 { lit = lit.min(d) } else { ghost = ghost.min(d) }
                    }
                    (lit, ghost)
                } else {
                    let dot = |x: f32, y: f32| ((fx - x).powi(2) + (fy - y).powi(2)).sqrt() - 1.6;
                    let d = match ch {
                        ':' => dot(7.4, 9.0).min(dot(6.6, 18.0)),
                        '.' => dot(6.4, 22.5),
                        _ => f32::MAX,
                    };
                    (d, f32::MAX)
                };
                if lit_d <= 0.0 {
                    Some(mix(AMBER, AMBER_HOT, (-lit_d / 1.5).min(1.0)))
                } else if ghost_d <= 0.0 {
                    Some(AMBER_GHOST)
                } else if lit_d < 2.2 {
                    Some([AMBER[0], AMBER[1], AMBER[2], ((1.0 - lit_d / 2.2) * 80.0) as u8])
                } else {
                    None
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
    cells: Vec<(i32, i32, Draw)>,
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
            self.cells.push((self.cursor.0, self.cursor.1, draw));
            self.cursor.0 += w;
        }
        self.row_h = self.row_h.max(h);
        offsets
    }

    fn save(&self, dir: &Path, name: &str) {
        let height = self.cursor.1 + self.row_h;
        draw_all(dir, name, self.width, height, |c| {
            for (x, y, draw) in &self.cells {
                draw(c, *x as f32, *y as f32);
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
    None,
}

fn symbol(c: &mut Canvas, sym: Symbol, cx: f32, cy: f32, color: Color) {
    match sym {
        Symbol::Record => c.circle(cx, cy, 3.2, color),
        Symbol::Pause => {
            c.rect(cx - 3.0, cy - 3.5, 2.2, 7.0, color);
            c.rect(cx + 0.8, cy - 3.5, 2.2, 7.0, color);
        }
        Symbol::Stop => c.rect(cx - 3.0, cy - 3.0, 6.0, 6.0, color),
        Symbol::None => {}
    }
}

/// A chunky silver key in a `w`×`h` cell: the face, a front lip below it,
/// and a colored inlay strip on top. Pressed (or latched) keys sit 2
/// points lower with a shorter lip.
fn silver_key(c: &mut Canvas, x: f32, y: f32, w: f32, h: f32, label: &str, sym: Symbol, inlay: Option<Color>, state: Key) {
    let down = matches!(state, Key::Pressed | Key::Active);
    let drop = if down { 2.0 } else { 0.0 };
    let lip = if down { 2.0 } else { 4.0 };
    let face_h = h - 4.0;
    let (fx0, fy0) = (x + 1.0, y + drop);
    // Front lip (the key's thickness), darker brushed metal.
    c.paint(fx0, fy0 + face_h - 2.0, fx0 + w - 2.0, fy0 + face_h + lip - 2.0 + 2.0, |px, py| {
        in_round_rect(px, py, fx0, fy0 + face_h - 2.0, w - 2.0, lip + 2.0, 1.5).then(|| shade(aluminum(px, py * 3.0), 0.62))
    });
    // Face.
    let dim = if state == Key::Disabled { 0.78 } else if down { 0.92 } else { 1.0 };
    c.paint(fx0, fy0, fx0 + w - 2.0, fy0 + face_h, |px, py| {
        in_round_rect(px, py, fx0, fy0, w - 2.0, face_h, 1.5).then(|| {
            let t = (py - fy0) / face_h;
            shade(aluminum(px + x * 3.1, py + y * 1.7), dim * (1.08 - 0.16 * t))
        })
    });
    c.rect(fx0 + 1.0, fy0, w - 4.0, 0.75, rgba(0xffffff, 170));
    if let Some(inlay) = inlay {
        let lit = matches!(state, Key::Active);
        c.rect(fx0 + 3.0, fy0 + 2.0, w - 8.0, 2.5, if lit { RED_HOT } else { inlay });
        if lit {
            c.rect(fx0 + 2.0, fy0 + 1.0, w - 6.0, 4.5, rgba(0xff6040, 60));
        }
    }
    let label_y = fy0 + if inlay.is_some() { 7.5 } else { 5.0 } + (face_h - 13.0).max(0.0) / 2.0;
    let ink = if state == Key::Disabled { rgba(0x2b2622, 110) } else { ENGRAVE };
    let size = 1.0;
    let lw = text_width(label, size);
    let has_sym = !matches!(sym, Symbol::None);
    let total = lw + if has_sym { 11.0 } else { 0.0 };
    let lx = fx0 + (w - 2.0 - total) / 2.0;
    if has_sym {
        let col = if matches!(sym, Symbol::Record) && state != Key::Disabled { RED } else { ink };
        symbol(c, sym, lx + 3.5, label_y + 3.5, col);
    }
    let tx = lx + if has_sym { 11.0 } else { 0.0 };
    blocks(c, tx, label_y + 0.5, label, size, rgba(0xffffff, 120));
    blocks(c, tx, label_y, label, size, ink);
}

/// A toggle key with an amber pilot lamp, lit while its panel is open.
fn lamp_key(c: &mut Canvas, x: f32, y: f32, w: f32, h: f32, label: &str, state: Key) {
    let down = matches!(state, Key::Pressed);
    let drop = if down { 2.0 } else { 0.0 };
    silver_key(c, x, y, w, h, "", Symbol::None, None, if down { Key::Pressed } else { Key::Normal });
    let (fx0, fy0) = (x + 1.0, y + drop);
    let lamp = (fx0 + 8.0, fy0 + (h - 4.0) / 2.0);
    c.circle(lamp.0, lamp.1, 3.4, rgb(0x3a352f));
    if state == Key::Active {
        c.circle(lamp.0, lamp.1, 5.0, rgba(0xffb24a, 60));
        c.circle(lamp.0, lamp.1, 2.6, AMBER);
        c.circle(lamp.0 - 0.8, lamp.1 - 0.8, 1.0, AMBER_HOT);
    } else {
        c.circle(lamp.0, lamp.1, 2.6, rgb(0x5a3a18));
    }
    let lx = fx0 + 15.0 + (w - 2.0 - 15.0 - text_width(label, 1.0)) / 2.0;
    let ly = fy0 + (h - 4.0 - 7.0) / 2.0;
    blocks(c, lx, ly + 0.5, label, 1.0, rgba(0xffffff, 120));
    blocks(c, lx, ly, label, 1.0, ENGRAVE);
}

/// A small chrome title-bar button (14×10) with an engraved symbol.
fn title_button(c: &mut Canvas, x: f32, y: f32, kind: char, pressed: bool) {
    c.round_rect(x, y, 14.0, 10.0, 2.5, rgba(0x000000, 120));
    c.paint(x + 0.5, y + 0.5, x + 13.5, y + 9.5, |px, py| {
        in_round_rect(px, py, x + 0.5, y + 0.5, 13.0, 9.0, 2.0).then(|| {
            let t = (py - y) / 10.0;
            if pressed { mix(rgb(0x8a8a86), rgb(0xc8c8c2), t) } else { mix(rgb(0xfafaf6), rgb(0x9a9a94), t) }
        })
    });
    let (cx, cy) = (x + 7.0, y + 5.0);
    let ink = ENGRAVE;
    match kind {
        '_' => c.rect(cx - 3.0, cy + 1.0, 6.0, 1.2, ink),
        '=' => {
            c.rect(cx - 3.0, cy - 1.8, 6.0, 1.2, ink);
            c.rect(cx - 3.0, cy + 0.8, 6.0, 1.2, ink);
        }
        'x' => {
            c.line(cx - 2.5, cy - 2.5, cx + 2.5, cy + 2.5, 1.3, ink);
            c.line(cx - 2.5, cy + 2.5, cx + 2.5, cy - 2.5, 1.3, ink);
        }
        _ => {
            // Gear: a ring with teeth.
            c.paint(cx - 4.0, cy - 4.0, cx + 4.0, cy + 4.0, |px, py| {
                let (dx, dy) = (px - cx, py - cy);
                let r = (dx * dx + dy * dy).sqrt();
                let a = dy.atan2(dx);
                let tooth = (a * 6.0).cos() > 0.2;
                ((r <= 2.6 && r >= 1.1) || (tooth && r <= 3.6 && r >= 2.0)).then_some(ink)
            });
        }
    }
}

/// Mini keys for the shade strip (12×12).
fn tiny_key(c: &mut Canvas, x: f32, y: f32, sym: Symbol, state: Key) {
    let down = matches!(state, Key::Pressed | Key::Active);
    let drop = if down { 1.0 } else { 0.0 };
    c.round_rect(x, y + 1.0, 12.0, 11.0, 2.0, rgba(0x000000, 110));
    c.paint(x + 0.5, y + drop, x + 11.5, y + drop + 10.5, |px, py| {
        in_round_rect(px, py, x + 0.5, y + drop, 11.0, 10.5, 1.8).then(|| {
            let t = (py - y) / 12.0;
            shade(aluminum(px * 2.0, py * 2.0), if state == Key::Disabled { 0.78 } else { 1.08 - 0.2 * t })
        })
    });
    let col = match (sym, state) {
        (_, Key::Disabled) => rgba(0x2b2622, 110),
        (Symbol::Record, Key::Active) => RED_HOT,
        (Symbol::Record, _) => RED,
        _ => ENGRAVE,
    };
    symbol(c, sym, x + 6.0, y + drop + 5.2, col);
}

/// A red pilot lamp (12×12), lit or not.
fn rec_lamp(c: &mut Canvas, x: f32, y: f32, lit: bool) {
    let (cx, cy) = (x + 6.0, y + 6.0);
    c.circle(cx, cy, 5.6, rgb(0x9a9a94));
    c.circle(cx, cy, 4.8, rgb(0x2a2420));
    if lit {
        c.circle(cx, cy, 4.2, RED);
        c.circle(cx, cy, 2.6, RED_HOT);
        c.circle(cx - 1.2, cy - 1.4, 1.1, rgb(0xffe0d0));
    } else {
        c.circle(cx, cy, 4.2, rgb(0x5a1a12));
        c.circle(cx - 1.2, cy - 1.4, 1.0, rgba(0xffffff, 60));
    }
}

/// A silver knob with a knurled edge and a pointer line (decorative).
fn knob(c: &mut Canvas, cx: f32, cy: f32, r: f32, pointer: f32) {
    c.circle(cx + 1.0, cy + 1.5, r + 1.0, rgba(0x000000, 70));
    c.paint(cx - r, cy - r, cx + r, cy + r, |px, py| {
        let (dx, dy) = (px - cx, py - cy);
        let d = (dx * dx + dy * dy).sqrt();
        if d > r {
            return None;
        }
        let a = dy.atan2(dx);
        let light = 0.5 - 0.5 * (a + PI * 0.75).cos(); // lit from the top left
        if d > r * 0.78 {
            // Knurling: fine ridges around the skirt.
            let ridge = ((a * 64.0).sin() * 0.5 + 0.5) * 0.35;
            Some(shade(rgb(0xb8b8b2), 0.55 + 0.45 * (1.0 - light) + ridge))
        } else {
            // Cap: concentric brushing.
            let ring = noise(d * 3.0, 0.5, 71) * 0.12;
            Some(shade(rgb(0xd6d6d0), 0.9 + ring + 0.15 * (1.0 - light)))
        }
    });
    let a = pointer.to_radians() - PI / 2.0;
    c.line(cx + a.cos() * r * 0.25, cy + a.sin() * r * 0.25, cx + a.cos() * r * 0.72, cy + a.sin() * r * 0.72, 1.4, ENGRAVE);
}

// --------------------------------------------------------------- meters

/// Where the needle points for a VU reading, in degrees from straight up
/// (the app's needleAngle with the level already in VU).
fn vu_angle(vu: f32) -> f32 {
    let t = ((vu - VU_RANGE.0) / (VU_RANGE.1 - VU_RANGE.0)).clamp(0.0, 1.0);
    -VU_SWEEP / 2.0 + t * VU_SWEEP
}

/// A backlit VU meter face: scale, red zone and labels, matching the
/// needle the app draws over it.
fn vu_face(c: &mut Canvas, x: f32, y: f32, w: f32, h: f32, channel: &str) {
    bezel(c, x, y, w, h, 1.5);
    let (px, py) = (x + VU_PIVOT.0, y + VU_PIVOT.1);
    c.paint(x, y, x + w, y + h, |fx, fy| {
        let (u, v) = ((fx - x) / w - 0.5, (fy - y) / h - 0.35);
        let glow = (1.0 - (u * u * 1.6 + v * v * 1.4)).clamp(0.0, 1.0);
        Some(mix(rgb(0xb07a2a), rgb(0xfbe6aa), glow))
    });
    let polar = |deg: f32, r: f32| {
        let a = deg.to_radians() - PI / 2.0;
        (px + a.cos() * r, py + a.sin() * r)
    };
    // Arc: black to 0 VU, then a wider red band.
    let (r_arc, r_red) = (66.0, 68.5);
    c.paint(x, y, x + w, y + h, |fx, fy| {
        let (dx, dy) = (fx - px, fy - py);
        let d = (dx * dx + dy * dy).sqrt();
        let deg = dx.atan2(-dy).to_degrees();
        if deg < vu_angle(VU_RANGE.0) || deg > vu_angle(VU_RANGE.1) {
            return None;
        }
        if (d - r_arc).abs() <= 0.45 {
            return Some(INK);
        }
        (deg >= vu_angle(0.0) && d > r_arc && d <= r_red + 1.2).then_some(RED)
    });
    for (vu, major, label) in [
        (-20.0, true, "20"),
        (-10.0, true, "10"),
        (-7.0, true, "7"),
        (-5.0, true, "5"),
        (-3.0, true, "3"),
        (-2.0, false, ""),
        (-1.0, false, ""),
        (0.0, true, "0"),
        (1.0, false, ""),
        (2.0, false, ""),
        (3.0, true, "3"),
    ] {
        let a = vu_angle(vu);
        let len = if major { 6.0 } else { 3.5 };
        let (x0, y0) = polar(a, r_arc);
        let (x1, y1) = polar(a, r_arc + len);
        let col = if vu > 0.0 { RED } else { INK };
        c.line(x0, y0, x1, y1, if major { 0.9 } else { 0.7 }, col);
        if !label.is_empty() {
            let (lx, ly) = polar(a, r_arc + len + 5.0);
            let size = 0.6;
            let lw = text_width(label, size);
            // Keep the end labels inside the face.
            let lx = (lx - lw / 2.0).clamp(x + 3.0, x + w - 3.0 - lw);
            blocks(c, lx, ly - 2.1, label, size, col);
        }
    }
    // Minus and plus signs at the ends.
    let (mx, my) = polar(vu_angle(VU_RANGE.0) - 4.0, r_arc + 3.0);
    c.rect(mx - 1.5, my - 0.35, 3.0, 0.7, INK);
    let (qx, qy) = polar(vu_angle(VU_RANGE.1) + 4.5, r_arc + 3.0);
    c.rect(qx - 1.5, qy - 0.35, 3.0, 0.7, RED);
    c.rect(qx - 0.35, qy - 1.5, 0.7, 3.0, RED);
    let vu_w = text_width("VU", 1.3);
    blocks(c, px - vu_w / 2.0, y + 40.0, "VU", 1.3, INK);
    blocks(c, x + 5.0, y + h - 9.0, channel, 0.7, rgba(0x17120e, 200));
    // Glass glare.
    c.paint(x, y, x + w, y + h, |fx, fy| {
        let d = (fx - x) + (fy - y) * 1.4;
        (d > 18.0 && d < 30.0).then_some(rgba(0xffffff, 26))
    });
    c.rect(x, y, w, 1.5, rgba(0x000000, 110));
}

// ------------------------------------------------------------ panels

fn main_background(c: &mut Canvas) {
    let (w, h) = (MAIN_W as f32, MAIN_H as f32);
    cheek(c, 0.0, 0.0, CHEEK, h);
    cheek(c, w - CHEEK, 0.0, CHEEK, h);
    faceplate(c, CHEEK, 0.0, w - 2.0 * CHEEK, h);
    // Title.
    engraved(c, 24.0, 6.0, "SOUND SCRAPER", 1.4);
    engraved(c, 152.0, 8.5, "STEREO MASTER RECORDER  SS-74", 0.75);
    // The glass band: dial window and meters.
    glass(c, 20.0, 22.0, 420.0, 84.0, 2.0);
    bezel(c, 26.0, 28.0, 226.0, 72.0, 1.5);
    amber_window(c, 26.0, 28.0, 226.0, 72.0);
    // A printed dial scale along the window's bottom edge.
    for i in 0..=20 {
        let x = 34.0 + i as f32 * 5.6;
        let tall = i % 5 == 0;
        c.rect(x, 96.5 - if tall { 3.0 } else { 1.5 }, 0.6, if tall { 3.0 } else { 1.5 }, rgba(0xffb24a, 90));
    }
    let face_w = (VU_RECT[2] as f32 - VU_GAP) / 2.0;
    vu_face(c, VU_RECT[0] as f32, VU_RECT[1] as f32, face_w, VU_RECT[3] as f32, "LEFT");
    vu_face(c, VU_RECT[0] as f32 + face_w + VU_GAP, VU_RECT[1] as f32, face_w, VU_RECT[3] as f32, "RIGHT");
    // Source window, record lamp (an animation) and the power lamp.
    bezel(c, 20.0, 109.0, 300.0, 18.0, 1.0);
    amber_window(c, 20.0, 109.0, 300.0, 18.0);
    engraved(c, 344.0, 115.0, "REC", 0.85);
    rec_lamp(c, 328.0, 112.0, false);
    c.circle(378.0, 118.0, 5.6, rgb(0x9a9a94));
    c.circle(378.0, 118.0, 4.8, rgb(0x2a2420));
    c.circle(378.0, 118.0, 6.5, rgba(0xffb24a, 40));
    c.circle(378.0, 118.0, 4.2, AMBER);
    c.circle(376.8, 116.6, 1.1, AMBER_HOT);
    engraved(c, 388.0, 115.0, "POWER", 0.85);
    // Key slots.
    for (x, y, kw, kh) in [(20.0, 132.0, 72.0, 30.0), (96.0, 132.0, 72.0, 30.0), (290.0, 134.0, 72.0, 26.0), (366.0, 134.0, 72.0, 26.0)] {
        c.round_rect(x - 1.0, y - 1.0, kw + 2.0, kh + 2.0, 2.0, rgba(0x000000, 60));
        c.round_rect(x, y, kw, kh, 1.5, INK);
    }
    // Tone knobs (decorative).
    engraved_centered(c, 198.0, 127.0, "BASS", 0.85);
    engraved_centered(c, 248.0, 127.0, "TREBLE", 0.85);
    knob(c, 198.0, 149.0, 13.0, -30.0);
    knob(c, 248.0, 149.0, 13.0, 20.0);
}

fn shade_background(c: &mut Canvas) {
    let (w, h) = (MAIN_W as f32, SHADE_H as f32);
    cheek(c, 0.0, 0.0, CHEEK, h);
    cheek(c, w - CHEEK, 0.0, CHEEK, h);
    faceplate(c, CHEEK, 0.0, w - 2.0 * CHEEK, h);
    engraved(c, 20.0, 5.5, "SOUND SCRAPER", 0.85);
    bezel(c, 92.0, 3.0, 214.0, 12.0, 1.0);
    amber_window(c, 92.0, 3.0, 214.0, 12.0);
}

/// Nine-slice frame for the library, details and settings panels: walnut
/// sides and bottom, a brushed aluminum title strip.
fn frame_image(c: &mut Canvas) {
    let (w, h) = (48.0, 48.0);
    c.paint(0.0, 0.0, w, h, |fx, fy| Some(walnut(fx, fy, true)));
    // Bottom edge: grain running along it (it stretches sideways).
    c.paint(8.0, h - 8.0, w - 8.0, h, |fx, fy| Some(walnut(fx, fy + 40.0, false)));
    c.rect(0.0, 0.0, w, 1.0, rgba(0xffffff, 40));
    c.rect(0.0, h - 1.0, w, 1.0, rgba(0x000000, 120));
    faceplate(c, 8.0, 0.0, w - 16.0, 24.0);
    c.rect(8.0, 24.0, w - 16.0, h - 32.0, rgb(0x1b1511));
    c.rect(8.0, 24.0, w - 16.0, 1.0, rgba(0x000000, 160));
    c.rect(8.0, 24.0, 1.0, h - 32.0, rgba(0x000000, 100));
}

fn scrollbar_image(c: &mut Canvas) {
    // Track 10×32 at (0,0); thumb 10×24 at (12,0).
    c.rect(0.0, 0.0, 10.0, 32.0, INK);
    c.rect(1.0, 1.0, 8.0, 30.0, rgb(0x241b15));
    c.paint(12.0, 0.0, 22.0, 24.0, |px, py| {
        in_round_rect(px, py, 12.0, 0.0, 10.0, 24.0, 2.0).then(|| {
            let t = (px - 12.0) / 10.0;
            shade(aluminum(px * 3.0, py), 1.1 - 0.25 * t)
        })
    });
    for gy in [9.0, 11.0, 13.0] {
        c.rect(14.0, gy, 6.0, 0.8, rgba(0x000000, 90));
    }
}

// ----------------------------------------------------------------- main

fn main() {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../skins/hifi74");
    std::fs::create_dir_all(&dir).unwrap();
    for entry in std::fs::read_dir(&dir).unwrap().flatten() {
        if entry.path().extension().is_some_and(|e| e == "png") {
            std::fs::remove_file(entry.path()).unwrap();
        }
    }

    draw_all(&dir, "main", MAIN_W, MAIN_H, main_background);
    draw_all(&dir, "shade", MAIN_W, SHADE_H, shade_background);
    draw_all(&dir, "frame", 48, 48, frame_image);
    draw_all(&dir, "scrollbar", 22, 32, scrollbar_image);

    let chars: String = GLYPHS.iter().map(|(c, _)| *c).collect();
    font_sheet(&dir, "font-dial", &chars, (12, 16), 16, |c, x, y, ch| vfd_glyph(c, x + 1.0, y + 1.0, ch, 2.0, AMBER, Some(AMBER_GHOST)));
    font_sheet(&dir, "font-tiny", &chars, (6, 8), 16, |c, x, y, ch| vfd_glyph(c, x, y, ch, 1.0, AMBER, None));
    font_sheet(&dir, "font-label", &chars, (6, 8), 16, |c, x, y, ch| {
        let s = ch.to_string();
        blocks(c, x, y + 0.5, &s, 1.0, ENGRAVE_LIGHT);
        blocks(c, x, y, &s, 1.0, ENGRAVE);
    });
    let digit_chars = "0123456789:.- ";
    digits_sheet(&dir, digit_chars, (14, 26));

    // Buttons.
    let mut sheet = Sheet::new(72 * 7);
    let red = Some(rgb(0xb02a1c));
    let record_states: [(&'static str, Symbol, &'static str, Key); 7] = [
        ("normal", Symbol::Record, "REC", Key::Normal),
        ("pressed", Symbol::Record, "REC", Key::Pressed),
        ("disabled", Symbol::Record, "REC", Key::Disabled),
        ("recording", Symbol::Pause, "PAUSE", Key::Active),
        ("recordingPressed", Symbol::Pause, "PAUSE", Key::Pressed),
        ("paused", Symbol::Record, "RESUME", Key::Normal),
        ("pausedPressed", Symbol::Record, "RESUME", Key::Pressed),
    ];
    let keys = |states: &[(&'static str, Symbol, &'static str, Key)], inlay: Option<Color>| -> States {
        states
            .iter()
            .map(|&(name, sym, label, k)| {
                (name, Box::new(move |c: &mut Canvas, x, y| silver_key(c, x, y, 72.0, 30.0, label, sym, inlay, k)) as Draw)
            })
            .collect()
    };
    let record = sheet.add(72, 30, keys(&record_states, red));
    let stop = sheet.add(
        72,
        30,
        keys(
            &[
                ("normal", Symbol::Stop, "STOP", Key::Normal),
                ("pressed", Symbol::Stop, "STOP", Key::Pressed),
                ("disabled", Symbol::Stop, "STOP", Key::Disabled),
            ],
            Some(rgb(0x6a6a66)),
        ),
    );
    let lamp_keys = |label: &'static str| -> States {
        [("normal", Key::Normal), ("pressed", Key::Pressed), ("active", Key::Active)]
            .iter()
            .map(|&(name, k)| (name, Box::new(move |c: &mut Canvas, x, y| lamp_key(c, x, y, 72.0, 26.0, label, k)) as Draw))
            .collect()
    };
    let library = sheet.add(72, 26, lamp_keys("LIBRARY"));
    let settings = sheet.add(72, 26, lamp_keys("SETTINGS"));
    let title = |kind: char| -> States {
        vec![
            ("normal", Box::new(move |c: &mut Canvas, x, y| title_button(c, x, y, kind, false))),
            ("pressed", Box::new(move |c: &mut Canvas, x, y| title_button(c, x, y, kind, true))),
        ]
    };
    let minimize = sheet.add(14, 10, title('_'));
    let shade_btn = sheet.add(14, 10, title('='));
    let close = sheet.add(14, 10, title('x'));
    let gear = sheet.add(14, 10, title('*'));
    let tiny = |states: &[(&'static str, Symbol, &'static str, Key)]| -> States {
        states.iter().map(|&(name, sym, _, k)| (name, Box::new(move |c: &mut Canvas, x, y| tiny_key(c, x, y, sym, k)) as Draw)).collect()
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
    let lamp = sheet.add(
        12,
        12,
        vec![
            ("off", Box::new(|c: &mut Canvas, x, y| rec_lamp(c, x, y, false)) as Draw),
            ("on", Box::new(|c: &mut Canvas, x, y| rec_lamp(c, x, y, true)) as Draw),
        ],
    );
    sheet.save(&dir, "buttons");

    let sprite = |states: &BTreeMap<String, [i32; 2]>| json!({ "image": "buttons.png", "states": states });
    let r = |x: i32, y: i32, w: i32, h: i32| -> Value { json!([x, y, w, h]) };
    let controls = json!({
        "background": "#241b15", "text": "@cream", "border": "#4a3a2c",
        "accent": "@amber", "button": "@aluminum", "buttonText": "@text"
    });
    let frame = |min: [i32; 2], menu: bool| {
        let mut p = json!({
            "minSize": min,
            "resizable": true,
            "frame": { "image": "frame.png", "slice": [24, 8, 8, 8] },
            "title": { "font": "label", "offset": [14, 9], "background": "#0000" },
            "close": { "offset": [12, 7], "size": [14, 10], "sprite": sprite(&close) },
            "grip": [14, 14],
            "controls": controls.clone()
        });
        if menu {
            p["menu"] = json!({ "offset": [28, 7], "size": [14, 10], "sprite": sprite(&gear) });
        }
        p
    };
    let mut library_panel = frame([400, 240], false);
    library_panel["table"] = json!({
        "background": "#1b1511", "alternate": "#221a14", "text": "@cream",
        "selection": "@amber", "selectionText": "#1b1108",
        "header": "@aluminum", "headerText": "@text", "grid": "#3a2d22"
    });
    library_panel["scrollbar"] =
        json!({ "image": "scrollbar.png", "track": [0, 0, 10, 32], "thumb": [12, 0, 10, 24], "thumbSlice": [4, 0, 4, 0] });
    let manifest = json!({
        "$schema": "../../skin.schema.json",
        "format": 1,
        "id": "com.alexboyce.soundscraper.hifi74",
        "name": "Hi-Fi '74",
        "author": "Sound Scraper",
        "version": "1.0",
        "description": "A 1970s stereo receiver: walnut cheeks, brushed aluminum, a warm amber dial and needle VU meters.",
        "colors": {
            "background": "#c9c8c2",
            "aluminum": "#c9c8c2",
            "text": "#1e1a16",
            "panel": "#1b1511",
            "amber": "#ffb24a",
            "amberHot": "#ffd98a",
            "amberGhost": "#ffb24a1f",
            "accent": "#ffb24a",
            "record": "#e0402a",
            "cream": "#f1e3c2",
            "walnut": "#4a2b17"
        },
        "fonts": {
            "dial": { "sprite": "font-dial.png", "glyphs": chars.clone(), "cell": [12, 16] },
            "tiny": { "sprite": "font-tiny.png", "glyphs": chars.clone(), "cell": [6, 8] },
            "label": { "sprite": "font-label.png", "glyphs": chars.clone(), "cell": [6, 8] },
            "digits": { "sprite": "digits.png", "glyphs": digit_chars, "cell": [14, 26] }
        },
        "panels": {
            "main": {
                "size": [MAIN_W, MAIN_H],
                "background": "main.png",
                "dragRegion": [[0, 0, MAIN_W, MAIN_H]],
                "elements": {
                    "minimize": { "rect": r(398, 6, 14, 10), "sprite": sprite(&minimize) },
                    "shade": { "rect": r(414, 6, 14, 10), "sprite": sprite(&shade_btn) },
                    "close": { "rect": r(430, 6, 14, 10), "sprite": sprite(&close) },
                    "elapsed": { "rect": r(32, 34, 112, 26), "font": "digits", "align": "right" },
                    "status": { "rect": r(32, 72, 120, 16), "font": "dial", "style": { "pad": true } },
                    "visualizer": {
                        "rect": r(152, 32, 96, 62),
                        "style": { "grid": "@amberGhost", "line": "@amber", "pixelated": false }
                    },
                    "levels": {
                        "rect": VU_RECT,
                        "style": {
                            "kind": "needle", "faces": 2, "gap": VU_GAP,
                            "pivot": [VU_PIVOT.0, VU_PIVOT.1], "length": VU_LENGTH,
                            "sweep": VU_SWEEP, "range": [VU_RANGE.0, VU_RANGE.1], "reference": VU_REFERENCE,
                            "needle": "#1a120a", "tip": "#b02a1c", "width": 1.2
                        }
                    },
                    "source": { "rect": r(24, 110, 288, 16), "font": "dial", "style": { "pad": true } },
                    "record": { "rect": r(20, 132, 72, 30), "sprite": sprite(&record) },
                    "stop": { "rect": r(96, 132, 72, 30), "sprite": sprite(&stop) },
                    "toggleLibrary": { "rect": r(290, 134, 72, 26), "sprite": sprite(&library) },
                    "toggleSettings": { "rect": r(366, 134, 72, 26), "sprite": sprite(&settings) }
                },
                "animations": [{
                    "name": "recLamp",
                    "rect": [328, 112, 12, 12],
                    "sprite": sprite(&lamp),
                    "frames": ["on", "off"],
                    "fps": 2,
                    "play": "recording"
                }],
                "shade": {
                    "size": [MAIN_W, SHADE_H],
                    "background": "shade.png",
                    "dragRegion": [[0, 0, MAIN_W, SHADE_H]],
                    "elements": {
                        "status": { "rect": r(96, 5, 60, 8), "font": "tiny" },
                        "elapsed": { "rect": r(158, 5, 48, 8), "font": "tiny", "align": "right" },
                        "levels": {
                            "rect": r(212, 5, 90, 8),
                            "style": { "rows": 1, "segments": 24, "gap": 1, "on": "@amber", "hot": "@amberHot", "clip": "@record", "off": "@amberGhost" }
                        },
                        "record": { "rect": r(316, 3, 12, 12), "sprite": sprite(&tiny_record) },
                        "stop": { "rect": r(330, 3, 12, 12), "sprite": sprite(&tiny_stop) },
                        "minimize": { "rect": r(398, 4, 14, 10), "sprite": sprite(&minimize) },
                        "shade": { "rect": r(414, 4, 14, 10), "sprite": sprite(&shade_btn) },
                        "close": { "rect": r(430, 4, 14, 10), "sprite": sprite(&close) }
                    }
                }
            },
            "library": library_panel,
            "details": frame([240, 320], true),
            "settings": frame([360, 340], false)
        },
        "visualizer": {
            "presets": [
                { "name": "Bars", "style": "bars", "bands": 20, "color": "@amber", "peak": "@amberHot", "gap": 1, "beat": 0.4,
                  "grid": "@amberGhost", "line": "@amber" },
                { "name": "Scope", "style": "scope", "color": "@amber", "lineWidth": 1, "grid": "@amberGhost", "line": "@amber" },
                { "name": "Mirror", "style": "mirror", "bands": 20, "gradient": ["@amber", "@amberHot"], "gap": 1,
                  "grid": "@amberGhost", "line": "@amber" },
                { "name": "Radial", "style": "radial", "bands": 30, "color": "@amber", "lineWidth": 1,
                  "grid": "@amberGhost", "line": "@amber" },
                { "name": "Fire", "style": "fire", "bands": 20, "gradient": ["@record", "@amber", "#fff0c0"], "gap": 1,
                  "decay": 0.86, "grid": "@amberGhost", "line": "@amberHot" }
            ]
        }
    });
    let text = serde_json::to_string_pretty(&manifest).unwrap() + "\n";
    std::fs::write(dir.join("skin.json"), text).unwrap();
    println!("wrote {}", dir.canonicalize().unwrap().display());
}
