//! Pictures of a skin with sample content (a recording in progress): for
//! the skin picker and the install card, and the `preview_skin` example.

use std::path::Path;

use image::{GenericImageView, RgbaImage, imageops};
use serde_json::{Map, Value};

use crate::resolve::{ImageRef, ResolvedElement, ResolvedLayout, ResolvedSkin};

/// Draws a layout (the main panel or its shade) at `scale` device pixels
/// per point. Images that fail to load are left out.
pub fn render(skin: &ResolvedSkin, layout: &ResolvedLayout, scale: u32) -> RgbaImage {
    let p = Painter { scale: scale.max(1) };
    let s = p.scale as i64;
    let mut out = RgbaImage::new(layout.size[0] as u32 * p.scale, layout.size[1] as u32 * p.scale);
    if let Some(bg) = layout.background.as_ref().and_then(|bg| p.load(bg)) {
        imageops::overlay(&mut out, &bg, 0, 0);
    }
    for (name, el) in &layout.elements {
        let [x, y, w, h] = el.rect;
        if name == "seek" {
            p.seek(&mut out, el, 0.4);
            continue;
        }
        if let Some(sprite) = &el.sprite
            && let Some(sheet) = p.load(&sprite.image)
        {
            let state = match name.as_str() {
                "record" | "play" => "recording",
                "toggleLibrary" => "active",
                "status" => "recording",
                _ => "normal",
            };
            if let Some(at) = sprite.states.get(state).or_else(|| sprite.states.values().next()) {
                blit(&mut out, &sheet, at[0] * s, at[1] * s, w * s, h * s, x * s, y * s);
            }
        }
        if el.font.is_some() {
            let sample = match name.as_str() {
                "elapsed" if el.style.as_ref().and_then(|s| s.get("tenths")).and_then(Value::as_bool) == Some(false) => "12:34",
                "elapsed" => "12:34.5",
                "status" => "● REC",
                "source" => "Spotify: Lo-fi beats",
                _ => "",
            };
            p.sprite_text(&mut out, skin, el, sample);
        }
        if name == "levels"
            && let Some(style) = &el.style
        {
            if style.get("kind").and_then(Value::as_str) == Some("needle") {
                p.needles(&mut out, style, el.rect);
            } else {
                p.segments(&mut out, style, el.rect);
            }
        }
        if name == "visualizer" {
            let preset = skin.visualizer.presets.first().cloned().unwrap_or_default();
            let vis = visualize(&preset, (w * s) as u32, (h * s) as u32, p.scale);
            imageops::overlay(&mut out, &vis, x * s, y * s);
        }
    }
    for animation in &layout.animations {
        let [x, y, w, h] = animation.rect;
        if let Some(sheet) = p.load(&animation.sprite.image)
            && let Some(at) = animation.frames.first().and_then(|f| animation.sprite.states.get(f))
        {
            blit(&mut out, &sheet, at[0] * s, at[1] * s, w * s, h * s, x * s, y * s);
        }
    }
    out
}

/// Writes the main panel at 2x as a PNG.
pub fn write_main_png(skin: &ResolvedSkin, path: &Path) -> Result<(), String> {
    let image = render(skin, &skin.panels.main.layout, 2);
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    }
    image.save(path).map_err(|e| format!("{}: {e}", path.display()))
}

/// A visualizer preset drawn from a made-up frame, straight alpha.
pub fn visualize(preset: &Value, w: u32, h: u32, scale: u32) -> RgbaImage {
    let preset = sound_scraper_vis::render::Preset::from_json(&preset.to_string()).unwrap_or_default();
    let mut renderer = sound_scraper_vis::render::Renderer::new(preset);
    let mut buf = vec![0u8; (w * h * 4) as usize];
    let frame = sample_frame();
    // Twice, so the fire trail has history.
    renderer.render(Some(&frame), w, h, scale as f32, &mut buf);
    renderer.render(Some(&frame), w, h, scale as f32, &mut buf);
    // Premultiplied → straight alpha.
    for px in buf.chunks_exact_mut(4) {
        let a = px[3] as u32;
        if a > 0 && a < 255 {
            for c in &mut px[..3] {
                *c = ((*c as u32 * 255) / a).min(255) as u8;
            }
        }
    }
    RgbaImage::from_raw(w, h, buf).unwrap_or_else(|| RgbaImage::new(w, h))
}

/// A falling spectrum and a wobbly waveform.
fn sample_frame() -> sound_scraper_vis::Frame {
    let mut f = sound_scraper_vis::Frame::default();
    let n = f.bands.len();
    for (i, b) in f.bands.iter_mut().enumerate() {
        let t = i as f32 / n as f32;
        *b = (0.95 - 0.7 * t + 0.15 * (t * 23.0).sin()).clamp(0.05, 1.0);
    }
    f.band_peaks = f.bands.iter().map(|b| (b + 0.08).min(1.0)).collect();
    let m = f.waveform.len();
    for (i, w) in f.waveform.iter_mut().enumerate() {
        let t = i as f32 / m as f32;
        *w = 0.6 * (t * 37.0).sin() * (t * 5.0).cos();
    }
    f
}

/// `#rrggbb` or `#rrggbbaa` (resolved skin colors); magenta otherwise.
pub fn hex(c: &str) -> [u8; 4] {
    let h = c.trim_start_matches('#');
    let v = |i: usize| h.get(i..i + 2).and_then(|s| u8::from_str_radix(s, 16).ok()).unwrap_or(0);
    match h.len() {
        6 => [v(0), v(2), v(4), 255],
        8 => [v(0), v(2), v(4), v(6)],
        _ => [255, 0, 255, 255],
    }
}

#[allow(clippy::too_many_arguments)]
fn blit(dst: &mut RgbaImage, src: &RgbaImage, sx: i64, sy: i64, w: i64, h: i64, dx: i64, dy: i64) {
    if sx < 0 || sy < 0 || w <= 0 || h <= 0 || sx + w > src.width() as i64 || sy + h > src.height() as i64 {
        return;
    }
    let view = src.view(sx as u32, sy as u32, w as u32, h as u32).to_image();
    imageops::overlay(dst, &view, dx, dy);
}

fn fill(dst: &mut RgbaImage, x: i64, y: i64, w: i64, h: i64, c: [u8; 4]) {
    if w <= 0 || h <= 0 {
        return;
    }
    let patch = RgbaImage::from_pixel(w as u32, h as u32, image::Rgba(c));
    imageops::overlay(dst, &patch, x, y);
}

struct Painter {
    scale: u32,
}

impl Painter {
    /// The image at this scale: its @4x/@2x file when there is one, else
    /// the 1x file enlarged.
    fn load(&self, img: &ImageRef) -> Option<RgbaImage> {
        let exact = match self.scale {
            4.. => img.path4x.as_ref(),
            2..=3 => img.path2x.as_ref(),
            _ => Some(&img.path),
        };
        let (w, h) = (img.width * self.scale, img.height * self.scale);
        match exact {
            Some(p) => {
                let i = image::open(p).ok()?.to_rgba8();
                Some(if i.dimensions() == (w, h) { i } else { imageops::resize(&i, w, h, imageops::FilterType::Triangle) })
            }
            None => {
                let source = img.path2x.as_ref().unwrap_or(&img.path);
                let i = image::open(source).ok()?.to_rgba8();
                Some(imageops::resize(&i, w, h, imageops::FilterType::Nearest))
            }
        }
    }

    fn sprite_text(&self, dst: &mut RgbaImage, skin: &ResolvedSkin, el: &ResolvedElement, text: &str) {
        let Some(font) = el.font.as_ref().and_then(|f| skin.fonts.get(f)) else { return };
        let Some(sheet) = self.load(&font.image) else { return };
        let s = self.scale as i64;
        let [cw, ch] = font.cell;
        let capacity = (el.rect[2] / cw.max(1)) as usize;
        let pad = el.style.as_ref().and_then(|s| s.get("pad")).and_then(Value::as_bool).unwrap_or(false);
        let mut chars: Vec<char> =
            text.chars().map(|c| if font.glyphs.contains(c) { c } else { c.to_ascii_uppercase() }).take(capacity).collect();
        let right = el.align.as_deref() == Some("right");
        if pad || right {
            while chars.len() < capacity {
                if right { chars.insert(0, ' ') } else { chars.push(' ') }
            }
        }
        for (i, c) in chars.iter().enumerate() {
            let Some(index) = font.glyphs.chars().position(|g| g == *c) else { continue };
            let (gx, gy) = ((index as i64 % font.columns) * cw, (index as i64 / font.columns) * ch);
            blit(dst, &sheet, gx * s, gy * s, cw * s, ch * s, (el.rect[0] + i as i64 * cw) * s, el.rect[1] * s);
        }
    }

    fn segments(&self, dst: &mut RgbaImage, style: &Map<String, Value>, rect: [i64; 4]) {
        let s = self.scale as i64;
        let [x, y, w, h] = rect;
        let rows = style.get("rows").and_then(Value::as_i64).unwrap_or(1).clamp(1, 2);
        let segments = style.get("segments").and_then(Value::as_i64).unwrap_or(20).max(1);
        let gap = style.get("gap").and_then(Value::as_i64).unwrap_or(1).max(0);
        let color = |k: &str, d: &str| hex(style.get(k).and_then(Value::as_str).unwrap_or(d));
        let row_h = (h - gap * (rows - 1)) / rows;
        for row in 0..rows {
            let lit = if row == 0 { segments * 8 / 10 } else { segments * 6 / 10 };
            for seg in 0..segments {
                let sw = (w - gap * (segments - 1)) as f64 / segments as f64;
                let sx = x as f64 + seg as f64 * (sw + gap as f64);
                let on = color("on", "#9fd630");
                let c = if seg >= lit {
                    color("off", "#00000033")
                } else if seg >= segments * 9 / 10 {
                    style.get("clip").map_or(on, |_| color("clip", ""))
                } else if seg >= segments * 7 / 10 {
                    style.get("hot").map_or(on, |_| color("hot", ""))
                } else {
                    on
                };
                fill(dst, (sx * s as f64) as i64, (y + row * (row_h + gap)) * s, (sw * s as f64).max(1.0) as i64, row_h * s, c);
            }
        }
    }

    /// A seek bar at `progress` (0..1): the track, the fill up to the
    /// thumb's center and the thumb, from sprite cells or style colors.
    fn seek(&self, dst: &mut RgbaImage, el: &ResolvedElement, progress: f64) {
        let s = self.scale as i64;
        let [x, y, w, h] = el.rect;
        let style = el.style.clone().unwrap_or_default();
        let thumb = style
            .get("thumbSize")
            .and_then(Value::as_array)
            .and_then(|a| Some([a.first()?.as_f64()? as i64, a.get(1)?.as_f64()? as i64]))
            .unwrap_or([6.max(h / 2), h]);
        let travel = (w - thumb[0]).max(0);
        let tx = x + (travel as f64 * progress).round() as i64;
        let fill_w = tx - x + thumb[0] / 2;
        let sheet = el.sprite.as_ref().and_then(|sp| Some((sp, self.load(&sp.image)?)));
        let cell = |state: &str| sheet.as_ref().and_then(|(sp, img)| Some((sp.states.get(state)?, img)));
        let color = |k: &str| style.get(k).and_then(Value::as_str).map(hex);
        if let Some((at, img)) = cell("track") {
            blit(dst, img, at[0] * s, at[1] * s, w * s, h * s, x * s, y * s);
        } else if let Some(c) = color("track") {
            fill(dst, x * s, y * s, w * s, h * s, c);
        }
        if let Some((at, img)) = cell("fill") {
            blit(dst, img, at[0] * s, at[1] * s, fill_w * s, h * s, x * s, y * s);
        } else if let Some(c) = color("fill") {
            fill(dst, x * s, y * s, fill_w * s, h * s, c);
        }
        let ty = y + (h - thumb[1]) / 2;
        if let Some((at, img)) = cell("thumb") {
            blit(dst, img, at[0] * s, at[1] * s, thumb[0] * s, thumb[1] * s, tx * s, ty * s);
        } else if let Some(c) = color("thumb") {
            fill(dst, tx * s, ty * s, thumb[0] * s, thumb[1] * s, c);
        }
    }

    /// Needle meters (style kind "needle") at about -3 and -6 VU.
    fn needles(&self, dst: &mut RgbaImage, style: &Map<String, Value>, rect: [i64; 4]) {
        let n = |k: &str, d: f64| style.get(k).and_then(Value::as_f64).unwrap_or(d);
        let pair = |k: &str, d: [f64; 2]| {
            style.get(k).and_then(Value::as_array).filter(|a| a.len() == 2).map_or(d, |a| {
                [a[0].as_f64().unwrap_or(d[0]), a[1].as_f64().unwrap_or(d[1])]
            })
        };
        let faces = n("faces", 2.0).clamp(1.0, 2.0) as i64;
        let gap = n("gap", 4.0);
        let face_w = (rect[2] as f64 - gap * (faces - 1) as f64) / faces as f64;
        let pivot = pair("pivot", [face_w / 2.0, rect[3] as f64 * 1.3]);
        let length = n("length", pivot[1] * 0.9);
        let (sweep, range) = (n("sweep", 90.0), pair("range", [-20.0, 3.0]));
        let color = hex(style.get("needle").and_then(Value::as_str).unwrap_or("#1a120a"));
        let s = self.scale as f64;
        let width = (n("width", 1.0) * s).max(1.0) as i64;
        for (face, vu) in [-3.0, -6.0].into_iter().take(faces as usize).enumerate() {
            let t = ((vu - range[0]) / (range[1] - range[0])).clamp(0.0, 1.0);
            let a = (-sweep / 2.0 + t * sweep).to_radians();
            let (ox, oy) = (rect[0] as f64 + face as f64 * (face_w + gap), rect[1] as f64);
            let (px, py) = (ox + pivot[0], oy + pivot[1]);
            for i in 0..(length * s * 2.0) as i64 {
                let d = i as f64 / (s * 2.0);
                let (x, y) = (px + a.sin() * d, py - a.cos() * d);
                if x >= ox && x < ox + face_w && y >= oy && y < oy + rect[3] as f64 {
                    fill(dst, (x * s) as i64, (y * s) as i64, width, width, color);
                }
            }
        }
    }
}
