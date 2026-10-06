//! Draws "Hi-Fi '74", a 1970s stereo receiver skin with nothing digital on
//! it (brushed aluminum, screwed-on black modules, an enamel nameplate, a
//! flip-card clock, pilot lamps, label tape, a phosphor scope, needle VU
//! meters and engraving-machine lettering),
//! into `skins/hifi74/`
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
const AMBER: Color = rgb(0xffb24a);
const AMBER_HOT: Color = rgb(0xffd98a);
const RED: Color = rgb(0xe0402a);
const RED_HOT: Color = rgb(0xff8a6a);

const MAIN_W: i32 = 460;
const MAIN_H: i32 = 186;
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

/// Brushed aluminum: fine horizontal streaks over a soft vertical sheen.
fn aluminum(x: f32, y: f32) -> Color {
    let streak = fbm(x * 0.012, y * 2.4, 51, 3);
    let fine = noise(x * 0.4, y * 7.0, 63);
    let l = 0.70 + 0.13 * streak + 0.04 * fine;
    let c = (l * 255.0).min(255.0);
    [c as u8, c as u8, (c * 0.975) as u8, 255]
}

/// Dark molded plastic, lit from above (the scope's housing).
fn plastic(y: f32, top: f32, h: f32) -> Color {
    mix(rgb(0x3a3632), rgb(0x1a1816), ((y - top) / h).clamp(0.0, 1.0))
}

/// A slotted chrome screw head.
fn screw(c: &mut Canvas, x: f32, y: f32, r: f32) {
    c.circle(x, y + 0.3, r + 0.4, rgba(0x000000, 90));
    c.circle(x, y, r, rgb(0x8a8680));
    c.circle(x - r * 0.25, y - r * 0.3, r * 0.45, rgba(0xffffff, 70));
    c.line(x - r * 0.7, y + r * 0.2, x + r * 0.7, y - r * 0.2, (r * 0.32).max(0.35), rgb(0x2a2622));
}

/// A molded end cap in place of a wood cheek, screwed on top and bottom.
fn cheek(c: &mut Canvas, x: f32, y: f32, w: f32, h: f32) {
    c.paint(x, y, x + w, y + h, |fx, fy| {
        let t = (fx - x) / w;
        Some(shade(plastic(fy, y, h.max(60.0)), 0.85 + 0.3 * (1.0 - (t - 0.35).abs() * 1.6).max(0.0)))
    });
    c.rect(x, y, 1.0, h, rgba(0xffffff, 40));
    c.rect(x + w - 1.0, y, 1.0, h, rgba(0x000000, 120));
    if h > 30.0 {
        for sy in [y + 8.0, y + h - 8.0] {
            screw(c, x + w / 2.0, sy, 1.6);
        }
    }
}

/// A dark housing like the scope's: molded plastic with a lit top edge
/// and a screw in each corner.
fn housing(c: &mut Canvas, x: f32, y: f32, w: f32, h: f32) {
    c.round_rect(x - 0.5, y + 0.5, w + 1.0, h + 1.0, 3.5, rgba(0x000000, 80));
    c.paint(x, y, x + w, y + h, |px, py| in_round_rect(px, py, x, y, w, h, 3.0).then(|| plastic(py, y, h)));
    c.rect(x + 2.0, y, w - 4.0, 0.8, rgba(0xffffff, 50));
    for (px, py) in [(x + 3.0, y + 3.0), (x + w - 3.0, y + 3.0), (x + 3.0, y + h - 3.0), (x + w - 3.0, y + h - 3.0)] {
        screw(c, px, py, 1.3);
    }
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

// ----------------------------------------------------------------- text

include!("common/glyphs.rs");

fn glyph(c: char) -> [u8; 7] {
    GLYPHS.iter().find(|(g, _)| *g == c).map(|(_, rows)| *rows).unwrap_or([0; 7])
}

fn text_width(s: &str, size: f32) -> f32 {
    s.chars().count() as f32 * 6.0 * size - size
}

/// Solid block lettering (the 5×7 cells filled edge to edge).
/// Strokes of an engraving-machine capital (like the Gorton lettering on
/// 1970s equipment panels) in the 5×7 cell, y down; None for glyphs that
/// keep their block form (filled symbols).
fn stroke_glyph(ch: char) -> Option<Vec<Vec<(f32, f32)>>> {
    let l = |pts: &[(f32, f32)]| pts.to_vec();
    let sp = |pts: &[(f32, f32)]| -> Vec<(f32, f32)> {
        spline(&pts.iter().map(|&(x, y)| (x, y, 1.0)).collect::<Vec<_>>(), 8).into_iter().map(|p| (p.0, p.1)).collect()
    };
    let cat = |mut a: Vec<(f32, f32)>, b: Vec<(f32, f32)>| {
        a.extend(b);
        a
    };
    let dot = |x: f32, y: f32| vec![(x, y), (x, y + 0.01)];
    let mirror = |v: Vec<Vec<(f32, f32)>>| v.into_iter().map(|p| p.into_iter().map(|(x, y)| (5.0 - x, y)).collect()).collect::<Vec<_>>();
    let rotate = |v: Vec<Vec<(f32, f32)>>| v.into_iter().map(|p| p.into_iter().map(|(x, y)| (5.0 - x, 7.0 - y)).collect()).collect::<Vec<_>>();
    let p_bowl = || cat(l(&[(0.0, 7.0), (0.0, 0.0), (3.1, 0.0)]), cat(arc(3.1, 1.8, 1.9, 1.8, -90.0, 90.0), l(&[(0.0, 3.6)])));
    let six = || vec![sp(&[(4.5, 0.5), (2.8, 0.0), (0.9, 1.2), (0.1, 4.4)]), arc(2.5, 4.85, 2.4, 2.15, 0.0, 360.0)];
    let o = || arc(2.5, 3.5, 2.5, 3.5, 0.0, 360.0);
    let g = match ch.to_ascii_uppercase() {
        ' ' => vec![],
        'A' => vec![l(&[(0.0, 7.0), (2.5, 0.0), (5.0, 7.0)]), l(&[(0.9, 4.6), (4.1, 4.6)])],
        'B' => vec![
            l(&[(0.0, 0.0), (0.0, 7.0)]),
            cat(cat(l(&[(0.0, 0.0), (3.1, 0.0)]), arc(3.1, 1.75, 1.75, 1.75, -90.0, 90.0)), l(&[(0.0, 3.5)])),
            cat(cat(l(&[(0.0, 3.5), (3.3, 3.5)]), arc(3.3, 5.25, 1.7, 1.75, -90.0, 90.0)), l(&[(0.0, 7.0)])),
        ],
        'C' => vec![arc(2.6, 3.5, 2.5, 3.5, 320.0, 40.0)],
        'D' => vec![cat(cat(l(&[(0.0, 7.0), (0.0, 0.0), (2.0, 0.0)]), arc(2.0, 3.5, 3.0, 3.5, -90.0, 90.0)), l(&[(0.0, 7.0)]))],
        'E' => vec![l(&[(4.8, 0.0), (0.0, 0.0), (0.0, 7.0), (4.8, 7.0)]), l(&[(0.0, 3.5), (3.6, 3.5)])],
        'F' => vec![l(&[(4.8, 0.0), (0.0, 0.0), (0.0, 7.0)]), l(&[(0.0, 3.5), (3.6, 3.5)])],
        'G' => vec![cat(arc(2.6, 3.5, 2.5, 3.5, 320.0, 0.0), l(&[(5.1, 5.0)])), l(&[(2.8, 3.8), (5.1, 3.8)])],
        'H' => vec![l(&[(0.0, 0.0), (0.0, 7.0)]), l(&[(5.0, 0.0), (5.0, 7.0)]), l(&[(0.0, 3.5), (5.0, 3.5)])],
        'I' => vec![l(&[(2.5, 0.0), (2.5, 7.0)]), l(&[(1.2, 0.0), (3.8, 0.0)]), l(&[(1.2, 7.0), (3.8, 7.0)])],
        'J' => vec![cat(l(&[(4.2, 0.0), (4.2, 5.1)]), arc(2.35, 5.1, 1.85, 1.9, 0.0, 180.0))],
        'K' => vec![l(&[(0.0, 0.0), (0.0, 7.0)]), l(&[(5.0, 0.0), (0.0, 4.6)]), l(&[(1.7, 3.1), (5.0, 7.0)])],
        'L' => vec![l(&[(0.0, 0.0), (0.0, 7.0), (4.6, 7.0)])],
        'M' => vec![l(&[(0.0, 7.0), (0.0, 0.0), (2.5, 4.6), (5.0, 0.0), (5.0, 7.0)])],
        'N' => vec![l(&[(0.0, 7.0), (0.0, 0.0), (5.0, 7.0), (5.0, 0.0)])],
        'O' => vec![o()],
        'P' => vec![p_bowl()],
        'Q' => vec![o(), l(&[(3.1, 5.0), (5.1, 7.4)])],
        'R' => vec![p_bowl(), l(&[(2.4, 3.6), (5.0, 7.0)])],
        'S' => vec![sp(&[(4.7, 1.0), (3.6, 0.0), (1.4, 0.0), (0.2, 1.1), (0.6, 2.8), (2.5, 3.5), (4.4, 4.2), (4.8, 5.8), (3.6, 7.0), (1.3, 7.0), (0.1, 6.0)])],
        'T' => vec![l(&[(0.0, 0.0), (5.0, 0.0)]), l(&[(2.5, 0.0), (2.5, 7.0)])],
        'U' => vec![cat(cat(l(&[(0.0, 0.0), (0.0, 4.7)]), arc(2.5, 4.7, 2.5, 2.3, 180.0, 0.0)), l(&[(5.0, 0.0)]))],
        'V' => vec![l(&[(0.0, 0.0), (2.5, 7.0), (5.0, 0.0)])],
        'W' => vec![l(&[(0.0, 0.0), (1.2, 7.0), (2.5, 2.2), (3.8, 7.0), (5.0, 0.0)])],
        'X' => vec![l(&[(0.0, 0.0), (5.0, 7.0)]), l(&[(5.0, 0.0), (0.0, 7.0)])],
        'Y' => vec![l(&[(0.0, 0.0), (2.5, 3.6), (5.0, 0.0)]), l(&[(2.5, 3.6), (2.5, 7.0)])],
        'Z' => vec![l(&[(0.2, 0.0), (5.0, 0.0), (0.0, 7.0), (5.0, 7.0)])],
        '0' => vec![arc(2.5, 3.5, 2.3, 3.5, 0.0, 360.0)],
        '1' => vec![l(&[(1.1, 1.5), (2.9, 0.0), (2.9, 7.0)])],
        '2' => vec![cat(arc(2.5, 1.95, 2.3, 1.95, 200.0, 375.0), l(&[(0.0, 7.0), (5.0, 7.0)]))],
        '3' => vec![cat(arc(2.5, 1.75, 2.2, 1.75, 210.0, 450.0), arc(2.5, 5.25, 2.4, 1.75, 270.0, 510.0))],
        '4' => vec![l(&[(3.8, 7.0), (3.8, 0.0), (0.0, 4.9), (5.0, 4.9)])],
        '5' => vec![cat(l(&[(4.6, 0.0), (0.7, 0.0), (0.4, 3.2)]), arc(2.5, 4.8, 2.4, 2.2, 222.0, 500.0))],
        '6' => six(),
        '7' => vec![l(&[(0.0, 0.0), (5.0, 0.0), (1.8, 7.0)])],
        '8' => vec![arc(2.5, 1.7, 2.1, 1.7, 0.0, 360.0), arc(2.5, 5.25, 2.4, 1.75, 0.0, 360.0)],
        '9' => rotate(six()),
        '.' => vec![dot(2.5, 6.8)],
        ',' => vec![l(&[(2.7, 6.4), (2.0, 8.0)])],
        ':' => vec![dot(2.5, 2.2), dot(2.5, 6.8)],
        ';' => vec![dot(2.5, 2.2), l(&[(2.7, 6.4), (2.0, 8.0)])],
        '!' => vec![l(&[(2.5, 0.0), (2.5, 4.8)]), dot(2.5, 6.8)],
        '?' => vec![sp(&[(0.3, 1.4), (1.4, 0.0), (3.6, 0.0), (4.7, 1.4), (3.9, 2.8), (2.5, 3.7), (2.5, 4.8)]), dot(2.5, 6.8)],
        '\'' => vec![l(&[(2.5, 0.0), (2.5, 2.0)])],
        '"' => vec![l(&[(1.6, 0.0), (1.6, 2.0)]), l(&[(3.4, 0.0), (3.4, 2.0)])],
        '-' => vec![l(&[(1.0, 3.5), (4.0, 3.5)])],
        '+' => vec![l(&[(2.5, 1.5), (2.5, 5.5)]), l(&[(0.5, 3.5), (4.5, 3.5)])],
        '/' => vec![l(&[(4.6, 0.0), (0.4, 7.0)])],
        '(' => vec![arc(4.6, 3.5, 2.6, 4.0, 240.0, 120.0)],
        ')' => mirror(vec![arc(4.6, 3.5, 2.6, 4.0, 240.0, 120.0)]),
        '[' => vec![l(&[(3.6, 0.0), (1.6, 0.0), (1.6, 7.0), (3.6, 7.0)])],
        ']' => mirror(vec![l(&[(3.6, 0.0), (1.6, 0.0), (1.6, 7.0), (3.6, 7.0)])]),
        '_' => vec![l(&[(0.0, 7.0), (5.0, 7.0)])],
        '=' => vec![l(&[(0.5, 2.5), (4.5, 2.5)]), l(&[(0.5, 4.5), (4.5, 4.5)])],
        '<' => vec![l(&[(4.5, 1.0), (0.5, 3.5), (4.5, 6.0)])],
        '>' => mirror(vec![l(&[(4.5, 1.0), (0.5, 3.5), (4.5, 6.0)])]),
        '|' => vec![l(&[(2.5, 0.0), (2.5, 7.0)])],
        '*' => vec![l(&[(2.5, 1.0), (2.5, 6.0)]), l(&[(0.4, 2.3), (4.6, 4.7)]), l(&[(0.4, 4.7), (4.6, 2.3)])],
        '#' => vec![l(&[(1.8, 0.5), (1.2, 6.5)]), l(&[(3.8, 0.5), (3.2, 6.5)]), l(&[(0.3, 2.4), (4.9, 2.4)]), l(&[(0.1, 4.6), (4.7, 4.6)])],
        '%' => vec![arc(1.2, 1.3, 1.0, 1.1, 0.0, 360.0), arc(3.8, 5.7, 1.0, 1.1, 0.0, 360.0), l(&[(4.6, 0.0), (0.4, 7.0)])],
        '~' => vec![sp(&[(0.3, 4.0), (1.4, 3.0), (3.6, 4.0), (4.7, 3.0)])],
        _ => return None,
    };
    Some(g)
}

/// Monoline engraved lettering in the 6-unit-per-character grid the
/// layouts use; symbols without strokes keep their 5×7 block form.
fn blocks(c: &mut Canvas, x: f32, y: f32, s: &str, size: f32, color: Color) {
    let half = (0.46 * size).max(0.32);
    let mut segs = Vec::new();
    for (i, ch) in s.chars().enumerate() {
        let ox = x + i as f32 * 6.0 * size;
        match stroke_glyph(ch) {
            Some(paths) => {
                for p in paths {
                    for w in p.windows(2) {
                        segs.push([ox + w[0].0 * size, y + w[0].1 * size, ox + w[1].0 * size, y + w[1].1 * size, half, half]);
                    }
                }
            }
            None => {
                let rows = glyph(ch);
                c.paint(ox, y, ox + 5.0 * size, y + 7.0 * size, |fx, fy| {
                    let (col, row) = (((fx - ox) / size) as usize, ((fy - y) / size) as usize);
                    (row < 7 && col < 5 && rows[row] & (0b10000 >> col) != 0).then_some(color)
                });
            }
        }
    }
    if segs.is_empty() {
        return;
    }
    let ink = Ink::new(segs);
    let (x0, y0, x1, y1) = ink.bounds();
    c.paint(x0, y0, x1, y1, |fx, fy| (ink.distance(fx, fy, 0.0) <= 0.0).then_some(color));
}

/// Lettering engraved into metal: a light edge below the dark letters.
fn engraved(c: &mut Canvas, x: f32, y: f32, s: &str, size: f32) {
    blocks(c, x, y + 0.5, s, size, ENGRAVE_LIGHT);
    blocks(c, x, y, s, size, ENGRAVE);
}

fn engraved_centered(c: &mut Canvas, cx: f32, y: f32, s: &str, size: f32) {
    engraved(c, cx - text_width(s, size) / 2.0, y, s, size);
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
    Play,
    Pause,
    Stop,
    None,
}

fn symbol(c: &mut Canvas, sym: Symbol, cx: f32, cy: f32, color: Color) {
    match sym {
        Symbol::Record => c.circle(cx, cy, 3.2, color),
        Symbol::Play => {
            let (left, right) = (cx - 2.6, cx + 3.6);
            c.paint(left, cy - 3.6, right, cy + 3.6, |px, py| {
                (px >= left && (py - cy).abs() <= (right - px) * 3.6 / (right - left)).then_some(color)
            });
        }
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

// ------------------------------------------------------------- strokes

/// A smooth pen path: points (x, y, width scale) through which a
/// Catmull-Rom spline is drawn.
type Pen = Vec<(f32, f32, f32)>;

fn spline(points: &[(f32, f32, f32)], steps: usize) -> Pen {
    let n = points.len();
    let at = |i: isize| points[i.clamp(0, n as isize - 1) as usize];
    let mut out = Vec::new();
    for i in 0..n.saturating_sub(1) {
        let (p0, p1, p2, p3) = (at(i as isize - 1), at(i as isize), at(i as isize + 1), at(i as isize + 2));
        for k in 0..steps {
            let t = k as f32 / steps as f32;
            let (t2, t3) = (t * t, t * t * t);
            let f = |a: f32, b: f32, c: f32, d: f32| 0.5 * (2.0 * b + (-a + c) * t + (2.0 * a - 5.0 * b + 4.0 * c - d) * t2 + (-a + 3.0 * b - 3.0 * c + d) * t3);
            out.push((f(p0.0, p1.0, p2.0, p3.0), f(p0.1, p1.1, p2.1, p3.1), p1.2 + (p2.2 - p1.2) * t));
        }
    }
    if let Some(&last) = points.last() {
        out.push(last);
    }
    out
}

/// Points along an elliptical arc (degrees, 0 = right, 90 = down).
fn arc(cx: f32, cy: f32, rx: f32, ry: f32, a0: f32, a1: f32) -> Vec<(f32, f32)> {
    let n = (((a1 - a0).abs() / 6.0).ceil() as usize).max(2);
    (0..=n)
        .map(|i| {
            let a = (a0 + (a1 - a0) * i as f32 / n as f32).to_radians();
            (cx + rx * a.cos(), cy + ry * a.sin())
        })
        .collect()
}

/// Capsule segments of strokes, bucketed by x for quick lookups.
struct Ink {
    segs: Vec<[f32; 6]>, // x0, y0, x1, y1, half width at 0, at 1
    buckets: Vec<Vec<usize>>,
    x0: f32,
    cell: f32,
}

impl Ink {
    fn new(segs: Vec<[f32; 6]>) -> Self {
        let cell = 3.0;
        let x0 = segs.iter().map(|s| s[0].min(s[2]) - s[4].max(s[5])).fold(f32::MAX, f32::min) - 1.0;
        let x1 = segs.iter().map(|s| s[0].max(s[2]) + s[4].max(s[5])).fold(f32::MIN, f32::max) + 1.0;
        let mut buckets = vec![Vec::new(); ((x1 - x0) / cell).ceil() as usize + 1];
        for (i, s) in segs.iter().enumerate() {
            let pad = s[4].max(s[5]) + 2.0;
            let a = ((s[0].min(s[2]) - pad - x0) / cell).floor().max(0.0) as usize;
            let b = (((s[0].max(s[2]) + pad - x0) / cell).ceil() as usize).min(buckets.len() - 1);
            for bucket in &mut buckets[a..=b] {
                bucket.push(i);
            }
        }
        Self { segs, buckets, x0, cell }
    }

    /// How far (fx, fy) is outside the ink grown by `grow` (negative inside).
    fn distance(&self, fx: f32, fy: f32, grow: f32) -> f32 {
        let b = ((fx - self.x0) / self.cell).floor();
        if b < 0.0 || b as usize >= self.buckets.len() {
            return f32::MAX;
        }
        let mut best = f32::MAX;
        for &i in &self.buckets[b as usize] {
            let [x0, y0, x1, y1, w0, w1] = self.segs[i];
            let (dx, dy) = (x1 - x0, y1 - y0);
            let len2 = (dx * dx + dy * dy).max(1e-6);
            let t = (((fx - x0) * dx + (fy - y0) * dy) / len2).clamp(0.0, 1.0);
            let d = ((fx - x0 - t * dx).powi(2) + (fy - y0 - t * dy).powi(2)).sqrt() - (w0 + (w1 - w0) * t) - grow;
            best = best.min(d);
        }
        best
    }

    fn bounds(&self) -> (f32, f32, f32, f32) {
        let mut b = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
        for s in &self.segs {
            let w = s[4].max(s[5]);
            b = (b.0.min(s[0].min(s[2]) - w), b.1.min(s[1].min(s[3]) - w), b.2.max(s[0].max(s[2]) + w), b.3.max(s[1].max(s[3]) + w));
        }
        b
    }
}

// ---------------------------------------------------------------- badge

/// Pieces of the badge lettering, in units of a 10-unit cap height (y
/// down from the cap line).
enum Part {
    Rect(f32, f32, f32, f32),
    /// A convex polygon.
    Poly(Vec<(f32, f32)>),
    /// Part of an elliptical ring: center, outer radii, thickness at the
    /// sides and at the top and bottom, angles (degrees, 0 = right,
    /// 90 = down) from a0 increasing to a1.
    Ring(f32, f32, f32, f32, f32, f32, f32, f32),
}

impl Part {
    fn contains(&self, x: f32, y: f32) -> bool {
        match *self {
            Part::Rect(x0, y0, x1, y1) => x >= x0 && x < x1 && y >= y0 && y < y1,
            Part::Poly(ref pts) => {
                let n = pts.len();
                let mut sign = 0.0f32;
                for i in 0..n {
                    let (a, b) = (pts[i], pts[(i + 1) % n]);
                    let cross = (b.0 - a.0) * (y - a.1) - (b.1 - a.1) * (x - a.0);
                    if cross.abs() < 1e-6 {
                        continue;
                    }
                    if sign == 0.0 {
                        sign = cross.signum();
                    } else if cross.signum() != sign {
                        return false;
                    }
                }
                true
            }
            Part::Ring(cx, cy, rx, ry, tx, ty, a0, a1) => {
                let (u, v) = ((x - cx) / rx, (y - cy) / ry);
                if u * u + v * v > 1.0 {
                    return false;
                }
                let (iu, iv) = ((x - cx) / (rx - tx), (y - cy) / (ry - ty));
                if iu * iu + iv * iv < 1.0 {
                    return false;
                }
                let mut a = v.atan2(u).to_degrees();
                while a < a0 {
                    a += 360.0;
                }
                a <= a1
            }
        }
    }
}

const STEM: f32 = 1.9;
const HAIR: f32 = 1.15;

/// Wide slab-serif capitals in the manner of Frigidaire's 1961–76
/// wordmark: the letter's parts and its advance.
fn slab_letter(ch: char) -> (Vec<Part>, f32) {
    use Part::*;
    let serif = |x0: f32, x1: f32, top: bool| if top { Rect(x0, 0.0, x1, HAIR) } else { Rect(x0, 10.0 - HAIR, x1, 10.0) };
    match ch {
        'S' => (
            vec![
                Ring(4.9, 2.75, 4.9, 2.75, STEM, 1.35, 90.0, 335.0),
                Ring(4.9, 7.25, 4.9, 2.75, STEM, 1.35, 270.0, 515.0),
                Rect(8.6, 0.6, 9.8, 3.0),
                Rect(0.0, 7.0, 1.2, 9.4),
            ],
            9.8,
        ),
        'O' => (vec![Ring(6.0, 5.0, 6.0, 5.0, 2.1, 1.25, 0.0, 360.0)], 12.0),
        'U' => (
            vec![
                Rect(1.0, 0.0, 1.0 + STEM, 6.0),
                Rect(8.7, 0.0, 8.7 + STEM * 0.7, 6.0),
                Ring(5.6, 5.6, 4.6, 4.4, STEM, HAIR, 0.0, 180.0),
                serif(0.0, 4.0, true),
                serif(7.6, 11.4, true),
            ],
            11.4,
        ),
        'N' => (
            vec![
                Rect(1.0, 0.0, 1.0 + HAIR, 10.0),
                Rect(9.0, 0.0, 9.0 + HAIR, 10.0),
                Poly(vec![(1.0, 0.0), (1.0 + STEM * 1.3, 0.0), (9.0 + HAIR, 10.0), (9.0 + HAIR - STEM * 1.3, 10.0)]),
                serif(0.0, 3.4, true),
                serif(0.0, 3.4, false),
                serif(7.6, 11.2, true),
            ],
            11.2,
        ),
        'D' => (
            vec![
                Rect(1.0, 0.0, 1.0 + STEM, 10.0),
                Rect(0.0, 0.0, 5.4, HAIR),
                Rect(0.0, 10.0 - HAIR, 5.4, 10.0),
                Ring(5.4, 5.0, 5.6, 5.0, STEM + 0.2, HAIR, 270.0, 450.0),
            ],
            11.0,
        ),
        'C' => (
            vec![Ring(5.9, 5.0, 5.9, 5.0, 2.1, 1.25, 38.0, 322.0), Rect(9.9, 0.7, 11.1, 3.3), Rect(9.9, 6.7, 11.1, 9.3)],
            11.1,
        ),
        'R' | 'P' => {
            let ry = if ch == 'R' { 2.8 } else { 3.0 };
            let mut v = vec![
                Rect(1.0, 0.0, 1.0 + STEM, 10.0),
                Rect(0.0, 0.0, 6.0, HAIR),
                Rect(1.0, 2.0 * ry - HAIR, 6.0, 2.0 * ry),
                Ring(6.0, ry, 4.4, ry, STEM, HAIR, 270.0, 450.0),
                serif(0.0, 4.4, false),
            ];
            if ch == 'R' {
                v.push(Poly(vec![(5.2, 2.0 * ry - 0.4), (5.2 + STEM * 1.1, 2.0 * ry - 0.4), (10.0, 10.0), (10.0 - STEM * 1.1, 10.0)]));
                v.push(serif(8.2, 11.2, false));
            }
            (v, if ch == 'R' { 11.2 } else { 10.6 })
        }
        'A' => (
            vec![
                Poly(vec![(5.6, 0.0), (5.6 + HAIR, 0.0), (1.6 + HAIR, 10.0), (1.6, 10.0)]),
                Poly(vec![(5.4, 0.0), (5.4 + STEM * 1.1, 0.0), (10.6 + STEM * 0.4, 10.0), (10.6 - STEM * 0.7, 10.0)]),
                Rect(3.4, 6.2, 8.8, 6.2 + HAIR),
                Rect(4.6, 0.0, 7.4, HAIR * 0.8),
                serif(0.0, 3.8, false),
                serif(8.6, 12.4, false),
            ],
            12.4,
        ),
        'E' => (
            vec![
                Rect(1.0, 0.0, 1.0 + STEM, 10.0),
                Rect(0.0, 0.0, 9.6, HAIR),
                Rect(0.0, 10.0 - HAIR, 10.0, 10.0),
                Rect(1.0, 4.45, 7.4, 4.45 + HAIR),
                Rect(8.5, 0.0, 9.6, 2.7),
                Rect(8.9, 7.3, 10.0, 10.0),
                Rect(6.6, 3.6, 7.4, 6.4),
            ],
            10.0,
        ),
        _ => (vec![], 5.0),
    }
}

/// Lays out `text` from x at cap line y, `k` points per unit: the parts
/// in point coordinates as (letter origin x, parts) and the width.
fn slab_layout(text: &str, x: f32, k: f32, tracking: f32) -> (Vec<(f32, Vec<Part>)>, f32) {
    let mut out = Vec::new();
    let mut pen = 0.0;
    for ch in text.chars() {
        if ch == ' ' {
            pen += 4.5;
            continue;
        }
        let (parts, adv) = slab_letter(ch);
        out.push((x + pen * k, parts));
        pen += adv + tracking;
    }
    (out, (pen - tracking) * k)
}

/// The nameplate, after Frigidaire's 1961–76 logo: a black square emblem
/// (a crown of level bars over an S) beside a cream enamel bar with the
/// name in wide slab capitals. Returns its width.
fn badge(c: &mut Canvas, x: f32, y: f32, h: f32) -> f32 {
    let ink = rgb(0x1c1814);
    let cream = rgb(0xefe7d4);
    let cap = h * 0.5;
    let k = cap / 10.0;
    let (letters, text_w) = slab_layout("SOUND SCRAPER", 0.0, k, 1.5);
    let em = h;
    let bar_w = text_w + h * 0.9;
    let w = em + bar_w;
    // Shadow and a thin chrome rim around the whole plate.
    c.round_rect(x - 0.5, y + 0.6, w + 1.4, h + 1.2, 1.2, rgba(0x000000, 70));
    c.paint(x - 0.8, y - 0.8, x + w + 0.8, y + h + 0.8, |_, py| Some(mix(rgb(0xf6f6f2), rgb(0x76766f), (py - y) / h)));
    // Emblem.
    c.rect(x, y, em, h, ink);
    let (ex, ey) = (x + em * 0.12, y + em * 0.12);
    let ew = em * 0.76;
    c.rect(ex, ey, ew, em * 0.76, cream);
    c.rect(ex + em * 0.05, ey + em * 0.05, ew - em * 0.1, em * 0.66, ink);
    // Crown: five level bars, tallest in the middle.
    let bars = [0.45, 0.75, 1.0, 0.75, 0.45];
    let bw = ew * 0.1;
    let base = ey + em * 0.33;
    for (i, t) in bars.iter().enumerate() {
        let bx = ex + ew * 0.17 + i as f32 * bw * 1.45;
        let bh = em * 0.2 * t;
        c.rect(bx, base - bh, bw, bh, cream);
    }
    c.rect(ex + ew * 0.12, base + em * 0.035, ew * 0.76, (em * 0.035).max(0.35), cream);
    // The S under it.
    let sk = em * 0.26 / 10.0;
    let (sx, sy) = (x + em / 2.0 - 4.9 * sk, base + em * 0.1);
    let s_parts = slab_letter('S').0;
    c.paint(sx, sy, sx + 10.0 * sk, sy + 10.0 * sk, |px, py| {
        s_parts.iter().any(|p| p.contains((px - sx) / sk, (py - sy) / sk)).then_some(cream)
    });
    // Enamel bar and lettering.
    let bx = x + em;
    c.paint(bx, y, bx + bar_w, y + h, |_, py| Some(mix(rgb(0xfaf4e6), rgb(0xe2d8c2), (py - y) / h)));
    c.rect(bx, y, bar_w, 0.5, rgba(0xffffff, 160));
    let tx = bx + (bar_w - text_w) / 2.0;
    let ty = y + (h - cap) / 2.0;
    c.paint(tx, ty, tx + text_w + 1.0, ty + cap, |px, py| {
        let u = (py - ty) / k;
        letters.iter().any(|(lx, parts)| parts.iter().any(|p| p.contains((px - tx - lx) / k, u))).then_some(ink)
    });
    w
}

// ----------------------------------------------------------- flip cards

/// The flip clock numerals: bold strokes in a 10×18 box.
fn numeral(ch: char) -> Vec<Vec<(f32, f32)>> {
    let flip = |paths: Vec<Vec<(f32, f32)>>| -> Vec<Vec<(f32, f32)>> {
        paths.into_iter().map(|p| p.into_iter().map(|(x, y)| (10.0 - x, 18.0 - y)).collect()).collect()
    };
    let six = || {
        let mut tail: Vec<(f32, f32)> = spline(&[(0.2, 12.6, 1.0), (0.7, 6.0, 1.0), (2.8, 1.6, 1.0), (6.2, 0.0, 1.0), (9.2, 1.4, 1.0)], 8)
            .into_iter()
            .map(|p| (p.0, p.1))
            .collect();
        tail.reverse();
        vec![tail, arc(5.0, 12.8, 4.9, 5.2, 0.0, 360.0)]
    };
    match ch {
        '0' => {
            let mut p = arc(5.0, 5.0, 5.0, 5.0, 180.0, 360.0);
            p.extend(arc(5.0, 13.0, 5.0, 5.0, 0.0, 180.0));
            p.push((0.0, 5.0));
            vec![p]
        }
        '1' => vec![vec![(2.2, 3.6), (6.2, 0.0), (6.2, 18.0)]],
        '2' => {
            let mut p = arc(5.0, 5.0, 5.0, 5.0, 195.0, 380.0);
            p.extend([(0.0, 18.0), (10.0, 18.0)]);
            vec![p]
        }
        '3' => {
            let mut p = arc(5.0, 4.6, 4.6, 4.6, 200.0, 450.0);
            p.extend(arc(5.0, 13.2, 4.9, 4.8, 270.0, 520.0));
            vec![p]
        }
        '4' => vec![vec![(7.6, 18.0), (7.6, 0.0), (0.0, 12.4), (10.4, 12.4)]],
        '5' => {
            let mut p = vec![(9.4, 0.0), (1.2, 0.0), (0.6, 8.4)];
            p.extend(arc(5.0, 12.6, 5.0, 5.4, 225.0, 510.0));
            vec![p]
        }
        '6' => six(),
        '7' => vec![vec![(0.0, 0.0), (10.0, 0.0), (3.6, 18.0)]],
        '8' => vec![arc(5.0, 4.4, 4.3, 4.4, 0.0, 360.0), arc(5.0, 13.2, 4.9, 4.8, 0.0, 360.0)],
        '9' => flip(six()),
        '-' => vec![vec![(1.5, 9.0), (8.5, 9.0)]],
        _ => vec![],
    }
}

/// One split-flap card filling a `w`×`h` cell: a dark card split across
/// the middle, with a cream numeral. ':' is a colon on the housing.
fn flip_card(c: &mut Canvas, x: f32, y: f32, w: f32, h: f32, ch: char) {
    let cream = rgb(0xf3ede0);
    if ch == ':' || ch == '.' {
        let r = (w * 0.11).max(0.8);
        let dots: &[f32] = if ch == ':' { &[0.36, 0.64] } else { &[0.86] };
        for &t in dots {
            c.circle(x + w / 2.0, y + h * t, r, cream);
        }
        return;
    }
    let (cx, cy, cw, chh) = (x + w * 0.06, y + 0.25, w * 0.88, h - 0.5);
    let r = (w * 0.12).max(1.0);
    let mid = cy + chh / 2.0;
    c.paint(cx, cy, cx + cw, cy + chh, |px, py| {
        in_round_rect(px, py, cx, cy, cw, chh, r).then(|| {
            let t = (py - cy) / chh;
            if py < mid { mix(rgb(0x34302c), rgb(0x23201d), t * 2.0) } else { mix(rgb(0x1d1a18), rgb(0x141210), t * 2.0 - 1.0) }
        })
    });
    c.rect(cx + r, cy, cw - 2.0 * r, (h / 60.0).max(0.4), rgba(0xffffff, 40));
    // The numeral.
    let paths = numeral(ch);
    if !paths.is_empty() {
        let k = chh * 0.66 / 18.0;
        let (ox, oy) = (x + w / 2.0 - 5.0 * k, y + h / 2.0 - 9.0 * k);
        let half = 1.45 * k;
        let mut segs = Vec::new();
        for p in &paths {
            for s in p.windows(2) {
                segs.push([ox + s[0].0 * k, oy + s[0].1 * k, ox + s[1].0 * k, oy + s[1].1 * k, half, half]);
            }
        }
        let ink = Ink::new(segs);
        c.paint(cx, cy, cx + cw, cy + chh, |px, py| {
            (ink.distance(px, py, 0.0) <= 0.0).then(|| if py < mid { cream } else { shade(cream, 0.9) })
        });
    }
    // The split, and the hinge pins at its ends.
    let gap = (h / 40.0).max(0.5);
    c.rect(cx, mid - gap / 2.0, cw, gap, rgba(0x000000, 230));
    c.rect(cx, mid + gap / 2.0, cw, (gap * 0.6).max(0.3), rgba(0xffffff, 26));
    let pin = (w * 0.05).max(0.5);
    c.rect(x, mid - gap, pin * 1.4, gap * 2.0, rgb(0x8a8680));
    c.rect(x + w - pin * 1.4, mid - gap, pin * 1.4, gap * 2.0, rgb(0x8a8680));
}

/// A smoked housing the cards sit in.
fn card_housing(c: &mut Canvas, x: f32, y: f32, w: f32, h: f32) {
    c.round_rect(x - 1.0, y - 1.0, w + 2.0, h + 2.0, 2.5, rgba(0xffffff, 30));
    c.paint(x, y, x + w, y + h, |px, py| {
        in_round_rect(px, py, x, y, w, h, 2.0).then(|| mix(rgb(0x050404), rgb(0x141210), (py - y) / h))
    });
    c.rect(x + 1.0, y, w - 2.0, 1.0, rgba(0x000000, 200));
}

// ----------------------------------------------------------------- dymo

/// Embossed label-maker lettering: the raised plastic goes white where
/// it was stretched, lit from above.
fn dymo_glyph(c: &mut Canvas, x: f32, y: f32, ch: char) {
    let size = 1.12;
    let Some(paths) = stroke_glyph(ch) else {
        blocks(c, x, y, &ch.to_string(), size, rgba(0xf0ebe4, 240));
        return;
    };
    let half = 0.62 * size;
    let segs: Vec<[f32; 6]> = paths
        .iter()
        .flat_map(|p| p.windows(2).map(|w| [x + w[0].0 * size, y + w[0].1 * size, x + w[1].0 * size, y + w[1].1 * size, half, half]))
        .collect();
    if segs.is_empty() {
        return;
    }
    let ink = Ink::new(segs);
    let inside = |fx: f32, fy: f32| ink.distance(fx, fy, 0.0) <= 0.0;
    c.paint(x - 1.0, y - 1.0, x + 6.0 * size + 1.0, y + 8.0 * size + 1.0, |fx, fy| {
        if !inside(fx, fy) {
            return inside(fx - 0.4, fy - 0.6).then_some(rgba(0x000000, 70));
        }
        let lit = !inside(fx, fy - 0.45);
        let dark = !inside(fx, fy + 0.45);
        Some(if lit {
            rgba(0xffffff, 250)
        } else if dark {
            rgba(0xb8b2aa, 245)
        } else {
            rgba(0xf0ebe4, 240)
        })
    });
}

/// A strip of red embossing tape, ends cut on a slant.
fn dymo_tape(c: &mut Canvas, x: f32, y: f32, w: f32, h: f32) {
    let cut = 3.0;
    let shape = move |px: f32, py: f32| {
        let t = (py - y) / h;
        px >= x + cut * (1.0 - t) && px <= x + w - cut * t && py >= y && py < y + h
    };
    c.paint(x, y + 0.8, x + w + 1.0, y + h + 1.2, |px, py| shape(px - 0.6, py - 1.0).then_some(rgba(0x000000, 80)));
    c.paint(x, y, x + w, y + h, |px, py| {
        shape(px, py).then(|| {
            let t = (py - y) / h;
            let rib = noise(px * 1.6, py * 0.15, 91) * 0.08;
            let gloss = (1.0 - ((t - 0.22) / 0.16).abs()).max(0.0) * 0.28;
            let base = shade(rgb(0xa8221a), 0.86 + rib + 0.18 * (1.0 - t));
            mix(base, rgb(0xffd0c8), gloss)
        })
    });
}

// ---------------------------------------------------------------- lamps

#[derive(Clone, Copy)]
enum Lamp {
    Red,
    Amber,
    Green,
}

fn lamp_colors(l: Lamp) -> (Color, Color, Color) {
    // Unlit lens, lit lens, hot center.
    match l {
        Lamp::Red => (rgb(0x4a1410), RED, RED_HOT),
        Lamp::Amber => (rgb(0x4a3010), AMBER, AMBER_HOT),
        Lamp::Green => (rgb(0x163a1e), rgb(0x52d66a), rgb(0xb8ffc4)),
    }
}

/// A jewel pilot lamp's chrome bezel and unlit lens.
fn lamp_socket(c: &mut Canvas, cx: f32, cy: f32, r: f32, l: Lamp) {
    c.circle(cx, cy + 0.5, r + 1.2, rgba(0x000000, 120));
    c.circle(cx, cy, r + 0.9, rgb(0x9a9a94));
    c.circle(cx, cy, r + 0.3, rgb(0x2a2420));
    c.circle(cx, cy, r, lamp_colors(l).0);
    c.circle(cx - r * 0.35, cy - r * 0.4, r * 0.3, rgba(0xffffff, 60));
}

/// The lit lens and its glow (drawn over a socket).
fn lamp_lit(c: &mut Canvas, cx: f32, cy: f32, r: f32, l: Lamp) {
    let (_, lit, hot) = lamp_colors(l);
    c.circle(cx, cy, r * 2.0, [lit[0], lit[1], lit[2], 50]);
    c.circle(cx, cy, r, lit);
    c.circle(cx, cy, r * 0.6, hot);
    c.circle(cx - r * 0.35, cy - r * 0.4, r * 0.28, rgb(0xfff4e8));
}

/// Cream print on a dark panel.
fn printed(c: &mut Canvas, cx: f32, y: f32, s: &str, size: f32) {
    blocks(c, cx - text_width(s, size) / 2.0, y, s, size, rgb(0xe8dcc0));
}

const STATUS_RECT: [i32; 4] = [26, 70, 122, 28];
const STATUS_LAMPS: [(&str, Lamp); 4] = [("REC", Lamp::Red), ("PAUSE", Lamp::Amber), ("PLAY", Lamp::Green), ("STOP", Lamp::Amber)];

fn status_lamp_center(i: usize) -> (f32, f32) {
    let col = STATUS_RECT[2] as f32 / 4.0;
    (STATUS_RECT[0] as f32 + col * (i as f32 + 0.5), STATUS_RECT[1] as f32 + 9.0)
}

/// Which status lamp is lit for a recorder or player state.
fn status_lamp(state: &str) -> Option<usize> {
    match state {
        "recording" | "finalizing" => Some(0),
        "paused" => Some(1),
        "playing" => Some(2),
        "stopped" => Some(3),
        _ => None,
    }
}

// ----------------------------------------------------------- oscilloscope

const SCOPE_RECT: [i32; 4] = [158, 33, 88, 62];
const SCOPE_HOUSING: [f32; 4] = [152.0, 22.0, 100.0, 84.0];

/// A small oscilloscope: a dark green phosphor screen with a graticule in
/// a black bezel; the visualizer draws the trace.
fn scope(c: &mut Canvas) {
    let [sx, sy, sw, sh] = SCOPE_RECT.map(|v| v as f32);
    housing(c, SCOPE_HOUSING[0], SCOPE_HOUSING[1], SCOPE_HOUSING[2], SCOPE_HOUSING[3]);
    let r = 7.0;
    c.round_rect(sx - 1.0, sy - 1.0, sw + 2.0, sh + 2.0, r + 1.0, rgb(0x050505));
    c.paint(sx, sy, sx + sw, sy + sh, |px, py| {
        in_round_rect(px, py, sx, sy, sw, sh, r).then(|| {
            let (u, v) = ((px - sx) / sw - 0.5, (py - sy) / sh - 0.5);
            let glow = (1.0 - (u * u + v * v) * 2.2).max(0.0);
            let mut col = mix(rgb(0x030a06), rgb(0x0e2616), glow);
            // Graticule: 8 × 6 divisions, a scale on the axes.
            let (gx, gy) = ((px - sx) / sw * 8.0, (py - sy) / sh * 6.0);
            let line = |g: f32, per: f32| ((g - g.round()).abs() * per) < 0.35;
            if line(gx, sw / 8.0) || line(gy, sh / 6.0) {
                col = mix(col, rgb(0x4f8c62), 0.35);
            }
            let axis_x = (py - (sy + sh / 2.0)).abs() < 1.4 && ((gx * 5.0 - (gx * 5.0).round()).abs() * sw / 40.0) < 0.3;
            let axis_y = (px - (sx + sw / 2.0)).abs() < 1.4 && ((gy * 5.0 - (gy * 5.0).round()).abs() * sh / 30.0) < 0.3;
            if axis_x || axis_y {
                col = mix(col, rgb(0x6fb884), 0.5);
            }
            col
        })
    });
    // Curved glass catching the light.
    c.paint(sx, sy, sx + sw, sy + sh, |px, py| {
        let (u, v) = ((px - sx) / sw, (py - sy) / sh);
        (in_round_rect(px, py, sx, sy, sw, sh, r) && u + v * 0.6 < 0.42 && u + v * 0.6 > 0.18).then_some(rgba(0xffffff, 12))
    });
}

// --------------------------------------------------- edgewise meters

const EDGE_RECT: [i32; 4] = [230, 3, 80, 12];
const EDGE_GAP: f32 = 4.0;
const EDGE_PIVOT: (f32, f32) = (19.0, 58.0);
const EDGE_LENGTH: f32 = 57.0;
const EDGE_SWEEP: f32 = 40.0;

/// A cassette deck's edgewise level meter: a narrow backlit strip the
/// needle swings across.
fn edge_face(c: &mut Canvas, x: f32, y: f32, w: f32, h: f32) {
    bezel(c, x, y, w, h, 1.0);
    c.paint(x, y, x + w, y + h, |fx, _| {
        let u = (fx - x) / w - 0.5;
        Some(mix(rgb(0xb07a2a), rgb(0xfbe6aa), (1.0 - u * u * 3.0).clamp(0.0, 1.0)))
    });
    let (px, py) = (x + EDGE_PIVOT.0, y + EDGE_PIVOT.1);
    let angle = |vu: f32| {
        let t = ((vu - VU_RANGE.0) / (VU_RANGE.1 - VU_RANGE.0)).clamp(0.0, 1.0);
        (-EDGE_SWEEP / 2.0 + t * EDGE_SWEEP).to_radians()
    };
    let r = 52.5;
    for vu in [-20.0, -10.0, -7.0, -5.0, -3.0, -2.0, -1.0, 0.0, 1.0, 2.0, 3.0] {
        let a = angle(vu);
        let len = if vu == 0.0 || vu == -20.0 || vu == -10.0 { 3.5 } else { 2.2 };
        let col = if vu > 0.0 { RED } else { INK };
        c.line(px + a.sin() * r, py - a.cos() * r, px + a.sin() * (r + len), py - a.cos() * (r + len), 0.6, col);
    }
    // The red zone.
    c.paint(x, y, x + w, y + h, |fx, fy| {
        let (dx, dy) = (fx - px, fy - py);
        let d = (dx * dx + dy * dy).sqrt();
        let a = dx.atan2(-dy);
        (a >= angle(0.0) && a <= angle(3.0) && (d - r - 0.4).abs() < 0.6).then_some(RED)
    });
    c.rect(x, y, w, 1.0, rgba(0x000000, 110));
}

// ------------------------------------------------------------ panels

fn main_background(c: &mut Canvas) {
    let (w, h) = (MAIN_W as f32, MAIN_H as f32);
    cheek(c, 0.0, 0.0, CHEEK, h);
    cheek(c, w - CHEEK, 0.0, CHEEK, h);
    faceplate(c, CHEEK, 0.0, w - 2.0 * CHEEK, h);
    // Title: a chrome script badge.
    badge(c, LOGO.0, LOGO.1, LOGO.2);
    engraved(c, 176.0, 8.5, "STEREO MASTER RECORDER  SS-74", 0.75);
    // The glass band: the clock panel, the scope and the meters.
    // Three modules on the faceplate: clock, scope and meters.
    housing(c, 20.0, 22.0, 130.0, 84.0);
    housing(c, 254.0, 22.0, 186.0, 84.0);
    let [ex, ey, ew, eh] = ELAPSED_RECT.map(|v| v as f32);
    card_housing(c, ex - 4.0, ey - 2.0, ew + 8.0, eh + 4.0);
    for (i, (label, lamp)) in STATUS_LAMPS.iter().enumerate() {
        let (lx, ly) = status_lamp_center(i);
        lamp_socket(c, lx, ly, 3.0, *lamp);
        printed(c, lx, ly + 7.0, label, 0.75);
    }
    scope(c);
    let face_w = (VU_RECT[2] as f32 - VU_GAP) / 2.0;
    vu_face(c, VU_RECT[0] as f32, VU_RECT[1] as f32, face_w, VU_RECT[3] as f32, "LEFT");
    vu_face(c, VU_RECT[0] as f32 + face_w + VU_GAP, VU_RECT[1] as f32, face_w, VU_RECT[3] as f32, "RIGHT");
    // Source window, record lamp (an animation) and the power lamp.
    dymo_tape(c, 20.0, 109.0, 300.0, 18.0);
    engraved(c, 344.0, 115.0, "REC", 0.85);
    rec_lamp(c, 328.0, 112.0, false);
    c.circle(378.0, 118.0, 5.6, rgb(0x9a9a94));
    c.circle(378.0, 118.0, 4.8, rgb(0x2a2420));
    c.circle(378.0, 118.0, 6.5, rgba(0xffb24a, 40));
    c.circle(378.0, 118.0, 4.2, AMBER);
    c.circle(376.8, 116.6, 1.1, AMBER_HOT);
    engraved(c, 388.0, 115.0, "POWER", 0.85);
    // Tape position: a fader slot with a printed scale (the seek bar).
    let (sx, sw) = (SEEK_RECT[0] as f32, SEEK_RECT[2] as f32);
    let sy = SEEK_RECT[1] as f32 + SEEK_RECT[3] as f32 / 2.0;
    for i in 0..=20 {
        let x = sx + 5.0 + i as f32 * (sw - 10.0) / 20.0;
        let tall = i % 5 == 0;
        c.rect(x - 0.3, sy + 4.0, 0.6, if tall { 2.5 } else { 1.2 }, rgba(0x2b2622, 150));
        c.rect(x - 0.3, sy - 4.0 - if tall { 2.5 } else { 1.2 }, 0.6, if tall { 2.5 } else { 1.2 }, rgba(0x2b2622, 150));
    }
    c.round_rect(sx + 1.0, sy - 2.0, sw - 2.0, 4.0, 2.0, rgba(0xffffff, 140));
    c.round_rect(sx + 1.0, sy - 2.5, sw - 2.0, 4.0, 2.0, INK);
    // Key slots.
    for (x, y, kw, kh) in [
        (20.0, 148.0, 72.0, 30.0),
        (96.0, 148.0, 72.0, 30.0),
        (172.0, 148.0, 72.0, 30.0),
        (290.0, 150.0, 72.0, 26.0),
        (366.0, 150.0, 72.0, 26.0),
    ] {
        c.round_rect(x - 1.0, y - 1.0, kw + 2.0, kh + 2.0, 2.0, rgba(0x000000, 60));
        c.round_rect(x, y, kw, kh, 1.5, INK);
    }
    // Tone knob (decorative).
    engraved_centered(c, 267.0, 146.0, "TONE", 0.75);
    knob(c, 267.0, 166.0, 12.0, -20.0);
}

/// The seek bar: the slot is in the background; the fill is an amber glow
/// along it and the thumb a silver fader cap.
const SEEK_RECT: [i32; 4] = [26, 130, 408, 14];
const SEEK_THUMB: [i32; 2] = [10, 14];

fn seek_image(c: &mut Canvas) {
    let (w, h) = (SEEK_RECT[2] as f32, SEEK_RECT[3] as f32);
    let cy = h / 2.0;
    c.round_rect(1.0, cy - 3.5, w - 2.0, 6.0, 3.0, rgba(0xffb24a, 40));
    c.round_rect(1.5, cy - 2.0, w - 3.0, 3.0, 1.5, AMBER);
    c.rect(2.5, cy - 1.5, w - 5.0, 1.0, AMBER_HOT);
    for (x, pressed) in [(0.0, false), (SEEK_THUMB[0] as f32, true)] {
        let (tw, th) = (SEEK_THUMB[0] as f32, SEEK_THUMB[1] as f32);
        let y = h;
        c.round_rect(x + 0.5, y + 1.0, tw - 1.0, th - 1.0, 1.5, rgba(0x000000, 110));
        c.paint(x + 1.0, y, x + tw - 1.0, y + th - 1.5, |px, py| {
            in_round_rect(px, py, x + 1.0, y, tw - 2.0, th - 1.5, 1.5).then(|| {
                let t = (py - y) / th;
                shade(aluminum(px * 3.0, py * 0.7), if pressed { 0.85 } else { 1.1 - 0.25 * t })
            })
        });
        c.rect(x + tw / 2.0 - 0.5, y + 2.0, 1.0, th - 5.0, ENGRAVE);
        c.rect(x + 1.5, y + 0.5, tw - 3.0, 0.6, rgba(0xffffff, 170));
    }
}

fn shade_background(c: &mut Canvas) {
    let (w, h) = (MAIN_W as f32, SHADE_H as f32);
    cheek(c, 0.0, 0.0, CHEEK, h);
    cheek(c, w - CHEEK, 0.0, CHEEK, h);
    faceplate(c, CHEEK, 0.0, w - 2.0 * CHEEK, h);
    badge(c, SHADE_LOGO.0, SHADE_LOGO.1, SHADE_LOGO.2);
    let [ex, ey, ew, eh] = SHADE_ELAPSED_RECT.map(|v| v as f32);
    card_housing(c, ex - 2.0, ey - 1.0, ew + 4.0, eh + 2.0);
    let face_w = (EDGE_RECT[2] as f32 - EDGE_GAP) / 2.0;
    for i in 0..2 {
        edge_face(c, EDGE_RECT[0] as f32 + i as f32 * (face_w + EDGE_GAP), EDGE_RECT[1] as f32, face_w, EDGE_RECT[3] as f32);
    }
}

/// The shade strip's status: a lamp and the engraved word.
fn shade_status(c: &mut Canvas, x: f32, y: f32, state: &str) {
    let (word, lamp) = match state {
        "recording" => ("REC", Some(Lamp::Red)),
        "finalizing" => ("SAVING", Some(Lamp::Red)),
        "paused" => ("PAUSE", Some(Lamp::Amber)),
        "playing" => ("PLAY", Some(Lamp::Green)),
        "stopped" => ("STOP", Some(Lamp::Amber)),
        _ => ("READY", None),
    };
    let (lx, ly) = (x + 4.5, y + 6.0);
    lamp_socket(c, lx, ly, 2.2, lamp.unwrap_or(Lamp::Amber));
    if let Some(l) = lamp {
        lamp_lit(c, lx, ly, 2.2, l);
    }
    engraved(c, x + 11.0, y + 3.0, word, 0.85);
}

const LOGO: (f32, f32, f32) = (22.0, 4.0, 14.0);
const SHADE_LOGO: (f32, f32, f32) = (20.0, 4.0, 10.0);
const ELAPSED_RECT: [i32; 4] = [33, 34, 108, 30];
const SHADE_STATUS_RECT: [i32; 4] = [122, 3, 50, 12];
const SHADE_ELAPSED_RECT: [i32; 4] = [176, 3, 48, 12];
const STATUS_STATES: [&str; 6] = ["idle", "recording", "paused", "finalizing", "playing", "stopped"];

/// Nine-slice frame for the library, details and settings panels: walnut
/// sides and bottom, a brushed aluminum title strip.
fn frame_image(c: &mut Canvas) {
    let (w, h) = (48.0, 48.0);
    c.paint(0.0, 0.0, w, h, |_, fy| Some(plastic(fy, 0.0, h * 3.0)));
    c.rect(0.0, 0.0, w, 1.0, rgba(0xffffff, 40));
    c.rect(0.0, h - 1.0, w, 1.0, rgba(0x000000, 120));
    faceplate(c, 8.0, 0.0, w - 16.0, 24.0);
    c.rect(8.0, 24.0, w - 16.0, h - 32.0, rgb(0x1b1511));
    c.rect(8.0, 24.0, w - 16.0, 1.0, rgba(0x000000, 160));
    c.rect(8.0, 24.0, 1.0, h - 32.0, rgba(0x000000, 100));
    for x in [4.0, w - 4.0] {
        screw(c, x, h - 4.0, 1.3);
    }
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
    draw_all(&dir, "seek", SEEK_RECT[2], SEEK_RECT[3] + SEEK_THUMB[1], seek_image);

    let chars: String = GLYPHS.iter().map(|(c, _)| *c).collect();
    // Label tape has capitals only (lowercase text maps onto them).
    let dymo_chars: String = chars.chars().filter(|c| !c.is_lowercase()).collect();
    font_sheet(&dir, "font-dymo", &dymo_chars, (8, 12), 16, |c, x, y, ch| dymo_glyph(c, x + 1.0, y + 2.0, ch));
    font_sheet(&dir, "font-label", &chars, (6, 8), 16, |c, x, y, ch| {
        let s = ch.to_string();
        blocks(c, x, y + 0.5, &s, 1.0, ENGRAVE_LIGHT);
        blocks(c, x, y, &s, 1.0, ENGRAVE);
    });
    let flip_chars = "0123456789:.- ";
    font_sheet(&dir, "flip", flip_chars, (18, 30), 14, |c, x, y, ch| flip_card(c, x, y, 18.0, 30.0, ch));
    font_sheet(&dir, "flip-small", flip_chars, (8, 12), 14, |c, x, y, ch| flip_card(c, x, y, 8.0, 12.0, ch));

    // Buttons.
    let mut sheet = Sheet::new(STATUS_RECT[2] * 6);
    let red = Some(rgb(0xb02a1c));
    // Record latches down with a lit inlay while recording (and is
    // disabled); play is pause while recording or playing, and RESUME while
    // a recording is paused.
    let record_states: [(&'static str, Symbol, &'static str, Key); 5] = [
        ("normal", Symbol::Record, "REC", Key::Normal),
        ("pressed", Symbol::Record, "REC", Key::Pressed),
        ("disabled", Symbol::Record, "REC", Key::Disabled),
        ("recording", Symbol::Record, "REC", Key::Active),
        ("paused", Symbol::Record, "REC", Key::Active),
    ];
    let play_states: [(&'static str, Symbol, &'static str, Key); 9] = [
        ("normal", Symbol::Play, "PLAY", Key::Normal),
        ("pressed", Symbol::Play, "PLAY", Key::Pressed),
        ("disabled", Symbol::Play, "PLAY", Key::Disabled),
        ("playing", Symbol::Pause, "PAUSE", Key::Normal),
        ("playingPressed", Symbol::Pause, "PAUSE", Key::Pressed),
        ("recording", Symbol::Pause, "PAUSE", Key::Normal),
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
    let play = sheet.add(72, 30, keys(&play_states, Some(rgb(0x3d6b3a))));
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
    let tiny_play = sheet.add(12, 12, tiny(&play_states));
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
    let status_cells = |w: i32, h: i32, draw: fn(&mut Canvas, f32, f32, &str)| -> States {
        let _ = (w, h);
        STATUS_STATES.iter().map(|&state| (state, Box::new(move |c: &mut Canvas, x, y| draw(c, x, y, state)) as Draw)).collect()
    };
    let status = sheet.add(
        STATUS_RECT[2],
        STATUS_RECT[3],
        status_cells(STATUS_RECT[2], STATUS_RECT[3], |c, x, y, state| {
            if let Some(i) = status_lamp(state) {
                let (lx, ly) = status_lamp_center(i);
                lamp_lit(c, x + lx - STATUS_RECT[0] as f32, y + ly - STATUS_RECT[1] as f32, 3.0, STATUS_LAMPS[i].1);
            }
        }),
    );
    let shade_status_sprite = sheet.add(SHADE_STATUS_RECT[2], SHADE_STATUS_RECT[3], status_cells(0, 0, shade_status));
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
        "version": "1.2",
        "description": "A 1970s stereo receiver: brushed aluminum, screwed-on black modules, an enamel nameplate, a flip-card clock, pilot lamps, label tape, a phosphor scope and needle VU meters.",
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
            "walnut": "#4a2b17",
            "phosphor": "#6dff9a",
            "phosphorHot": "#d2ffe0",
            "phosphorGhost": "#6dff9a24"
        },
        "fonts": {
            "dymo": { "sprite": "font-dymo.png", "glyphs": dymo_chars, "cell": [8, 12] },
            "label": { "sprite": "font-label.png", "glyphs": chars.clone(), "cell": [6, 8] },
            "flip": { "sprite": "flip.png", "glyphs": flip_chars, "cell": [18, 30] },
            "flipSmall": { "sprite": "flip-small.png", "glyphs": flip_chars, "cell": [8, 12] }
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
                    "elapsed": { "rect": ELAPSED_RECT, "font": "flip", "align": "right", "style": { "flip": true, "tenths": false } },
                    "status": { "rect": STATUS_RECT, "sprite": sprite(&status) },
                    "visualizer": {
                        "rect": SCOPE_RECT,
                        "style": { "grid": "#00000000", "line": "@phosphor", "pixelated": false }
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
                    "source": { "rect": r(26, 112, 288, 12), "font": "dymo" },
                    "seek": {
                        "rect": SEEK_RECT,
                        "sprite": { "image": "seek.png", "states": { "fill": [0, 0], "thumb": [0, SEEK_RECT[3]], "thumbPressed": [SEEK_THUMB[0], SEEK_RECT[3]] } },
                        "style": { "thumbSize": SEEK_THUMB }
                    },
                    "record": { "rect": r(20, 148, 72, 30), "sprite": sprite(&record) },
                    "play": { "rect": r(96, 148, 72, 30), "sprite": sprite(&play) },
                    "stop": { "rect": r(172, 148, 72, 30), "sprite": sprite(&stop) },
                    "toggleLibrary": { "rect": r(290, 150, 72, 26), "sprite": sprite(&library) },
                    "toggleSettings": { "rect": r(366, 150, 72, 26), "sprite": sprite(&settings) }
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
                        "status": { "rect": SHADE_STATUS_RECT, "sprite": sprite(&shade_status_sprite) },
                        "elapsed": { "rect": SHADE_ELAPSED_RECT, "font": "flipSmall", "align": "right", "style": { "flip": true, "tenths": false } },
                        "levels": {
                            "rect": EDGE_RECT,
                            "style": {
                                "kind": "needle", "faces": 2, "gap": EDGE_GAP,
                                "pivot": [EDGE_PIVOT.0, EDGE_PIVOT.1], "length": EDGE_LENGTH,
                                "sweep": EDGE_SWEEP, "range": [VU_RANGE.0, VU_RANGE.1], "reference": VU_REFERENCE,
                                "needle": "#1a120a", "tip": "#b02a1c", "width": 0.8
                            }
                        },
                        "record": { "rect": r(316, 3, 12, 12), "sprite": sprite(&tiny_record) },
                        "play": { "rect": r(330, 3, 12, 12), "sprite": sprite(&tiny_play) },
                        "stop": { "rect": r(344, 3, 12, 12), "sprite": sprite(&tiny_stop) },
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
            // A phosphor trace on the scope screen (its graticule is the
            // artwork, so no grid).
            "presets": [
                { "name": "Scope", "style": "scope", "color": "@phosphor", "lineWidth": 1.5, "grid": "#00000000", "line": "@phosphor" },
                { "name": "Radial", "style": "radial", "bands": 30, "color": "@phosphor", "lineWidth": 1,
                  "grid": "#00000000", "line": "@phosphor" },
                { "name": "Spectrum", "style": "bars", "bands": 16, "color": "@phosphorGhost", "peak": "@phosphorHot", "gap": 2, "beat": 0.3,
                  "grid": "#00000000", "line": "@phosphor" },
                { "name": "Mirror", "style": "mirror", "bands": 16, "gradient": ["@phosphorGhost", "@phosphor"], "gap": 2,
                  "grid": "#00000000", "line": "@phosphor" }
            ]
        }
    });
    let text = serde_json::to_string_pretty(&manifest).unwrap() + "\n";
    std::fs::write(dir.join("skin.json"), text).unwrap();
    println!("wrote {}", dir.canonicalize().unwrap().display());
}
