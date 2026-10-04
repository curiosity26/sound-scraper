//! Renders a skin's main panel and shade layout with sample content into a
//! PNG, through the same resolver the app uses (for checking artwork
//! without running the app):
//!
//!     cargo run -p sound_scraper_skin --example preview_skin -- [skin folder] [out.png]
//!
//! Defaults to the Default skin and `skin-preview.png`.

use std::path::PathBuf;

use image::{GenericImageView, RgbaImage, imageops};
use sound_scraper_skin::{
    SkinStore,
    resolve::{ResolvedElement, ResolvedLayout, ResolvedSkin},
};

const SCALE: u32 = 2;

fn load(img: &sound_scraper_skin::ImageRef) -> RgbaImage {
    match &img.path2x {
        Some(p) => image::open(p).unwrap().to_rgba8(),
        None => imageops::resize(
            &image::open(&img.path).unwrap().to_rgba8(),
            img.width * SCALE,
            img.height * SCALE,
            imageops::FilterType::Nearest,
        ),
    }
}

fn hex(c: &str) -> [u8; 4] {
    let h = c.trim_start_matches('#');
    let v = |i: usize| u8::from_str_radix(&h[i..i + 2], 16).unwrap();
    match h.len() {
        6 => [v(0), v(2), v(4), 255],
        8 => [v(0), v(2), v(4), v(6)],
        _ => [255, 0, 255, 255],
    }
}

#[allow(clippy::too_many_arguments)]
fn blit(dst: &mut RgbaImage, src: &RgbaImage, sx: u32, sy: u32, w: u32, h: u32, dx: i64, dy: i64) {
    let view = src.view(sx, sy, w, h).to_image();
    imageops::overlay(dst, &view, dx, dy);
}

fn fill(dst: &mut RgbaImage, x: i64, y: i64, w: i64, h: i64, c: [u8; 4]) {
    let patch = RgbaImage::from_pixel(w as u32, h as u32, image::Rgba(c));
    imageops::overlay(dst, &patch, x, y);
}

/// Needle meters (style kind "needle") at about -3 and -6 VU.
fn needles(dst: &mut RgbaImage, style: &serde_json::Map<String, serde_json::Value>, rect: [i64; 4]) {
    let n = |k: &str, d: f64| style.get(k).and_then(|v| v.as_f64()).unwrap_or(d);
    let pair = |k: &str, d: [f64; 2]| {
        style.get(k).and_then(|v| v.as_array()).filter(|a| a.len() == 2).map_or(d, |a| {
            [a[0].as_f64().unwrap_or(d[0]), a[1].as_f64().unwrap_or(d[1])]
        })
    };
    let faces = n("faces", 2.0).clamp(1.0, 2.0) as i64;
    let gap = n("gap", 4.0);
    let face_w = (rect[2] as f64 - gap * (faces - 1) as f64) / faces as f64;
    let pivot = pair("pivot", [face_w / 2.0, rect[3] as f64 * 1.3]);
    let length = n("length", pivot[1] * 0.9);
    let (sweep, range) = (n("sweep", 90.0), pair("range", [-20.0, 3.0]));
    let color = hex(style.get("needle").and_then(|v| v.as_str()).unwrap_or("#1a120a"));
    let s = SCALE as f64;
    for (face, vu) in [-3.0, -6.0].into_iter().take(faces as usize).enumerate() {
        let t = ((vu - range[0]) / (range[1] - range[0])).clamp(0.0, 1.0);
        let a = (-sweep / 2.0 + t * sweep).to_radians();
        let (ox, oy) = (rect[0] as f64 + face as f64 * (face_w + gap), rect[1] as f64);
        let (px, py) = (ox + pivot[0], oy + pivot[1]);
        for i in 0..(length * s * 2.0) as i64 {
            let d = i as f64 / (s * 2.0);
            let (x, y) = (px + a.sin() * d, py - a.cos() * d);
            if x >= ox && x < ox + face_w && y >= oy && y < oy + rect[3] as f64 {
                fill(dst, (x * s) as i64, (y * s) as i64, SCALE as i64, SCALE as i64, color);
            }
        }
    }
}

fn sprite_text(dst: &mut RgbaImage, skin: &ResolvedSkin, el: &ResolvedElement, text: &str) {
    let font = &skin.fonts[el.font.as_ref().unwrap()];
    let sheet = load(&font.image);
    let [cw, ch] = font.cell;
    let capacity = (el.rect[2] / cw) as usize;
    let pad = el.style.as_ref().and_then(|s| s.get("pad")).and_then(|v| v.as_bool()).unwrap_or(false);
    let mut chars: Vec<char> = text.chars().map(|c| if font.glyphs.contains(c) { c } else { c.to_ascii_uppercase() }).take(capacity).collect();
    let right = el.align.as_deref() == Some("right");
    if pad || right {
        while chars.len() < capacity {
            if right { chars.insert(0, ' ') } else { chars.push(' ') }
        }
    }
    for (i, c) in chars.iter().enumerate() {
        let Some(index) = font.glyphs.chars().position(|g| g == *c) else { continue };
        let (gx, gy) = ((index as i64 % font.columns) * cw, (index as i64 / font.columns) * ch);
        blit(
            dst,
            &sheet,
            (gx * SCALE as i64) as u32,
            (gy * SCALE as i64) as u32,
            (cw * SCALE as i64) as u32,
            (ch * SCALE as i64) as u32,
            (el.rect[0] + i as i64 * cw) * SCALE as i64,
            el.rect[1] * SCALE as i64,
        );
    }
}

/// A made-up frame: a falling spectrum and a wobbly waveform.
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

fn visualize(preset: &serde_json::Value, w: u32, h: u32) -> RgbaImage {
    let preset = sound_scraper_vis::render::Preset::from_json(&preset.to_string()).unwrap_or_default();
    let mut renderer = sound_scraper_vis::render::Renderer::new(preset);
    let mut buf = vec![0u8; (w * h * 4) as usize];
    let frame = sample_frame();
    // Twice, so the fire trail has history.
    renderer.render(Some(&frame), w, h, SCALE as f32, &mut buf);
    renderer.render(Some(&frame), w, h, SCALE as f32, &mut buf);
    // Premultiplied → straight alpha for the PNG.
    for px in buf.chunks_exact_mut(4) {
        let a = px[3] as u32;
        if a > 0 && a < 255 {
            for c in &mut px[..3] {
                *c = ((*c as u32 * 255) / a).min(255) as u8;
            }
        }
    }
    RgbaImage::from_raw(w, h, buf).unwrap()
}

fn render(skin: &ResolvedSkin, layout: &ResolvedLayout) -> RgbaImage {
    let s = SCALE as i64;
    let mut out = RgbaImage::new(layout.size[0] as u32 * SCALE, layout.size[1] as u32 * SCALE);
    if let Some(bg) = &layout.background {
        imageops::overlay(&mut out, &load(bg), 0, 0);
    }
    for (name, el) in &layout.elements {
        let [x, y, w, h] = el.rect;
        if let Some(sprite) = &el.sprite {
            let sheet = load(&sprite.image);
            let state = match name.as_str() {
                "record" => "recording",
                "toggleLibrary" => "active",
                "status" => "recording",
                _ => "normal",
            };
            let at = sprite.states.get(state).or_else(|| sprite.states.values().next()).unwrap();
            blit(&mut out, &sheet, (at[0] * s) as u32, (at[1] * s) as u32, (w * s) as u32, (h * s) as u32, x * s, y * s);
        }
        if el.font.is_some() {
            let sample = match name.as_str() {
                "elapsed" => "12:34.5",
                "status" => "● REC",
                "source" => "Spotify: Lo-fi beats",
                _ => "",
            };
            sprite_text(&mut out, skin, el, sample);
        }
        if name == "levels"
            && let Some(style) = &el.style
            && style.get("kind").and_then(|v| v.as_str()) == Some("needle")
        {
            needles(&mut out, style, el.rect);
        } else if name == "levels"
            && let Some(style) = &el.style
        {
            let rows = style.get("rows").and_then(|v| v.as_i64()).unwrap_or(1);
            let segments = style.get("segments").and_then(|v| v.as_i64()).unwrap_or(20);
            let gap = style.get("gap").and_then(|v| v.as_i64()).unwrap_or(1);
            let color = |k: &str| hex(style.get(k).and_then(|v| v.as_str()).unwrap_or("#ff00ff"));
            let row_h = (h - gap * (rows - 1)) / rows;
            for row in 0..rows {
                let lit = if row == 0 { segments * 8 / 10 } else { segments * 6 / 10 };
                for seg in 0..segments {
                    let sw = (w - gap * (segments - 1)) as f64 / segments as f64;
                    let sx = x as f64 + seg as f64 * (sw + gap as f64);
                    let c = if seg >= lit {
                        color("off")
                    } else if seg >= segments * 9 / 10 {
                        color("clip")
                    } else if seg >= segments * 7 / 10 {
                        color("hot")
                    } else {
                        color("on")
                    };
                    fill(&mut out, (sx * s as f64) as i64, (y + row * (row_h + gap)) * s, (sw * s as f64).max(1.0) as i64, row_h * s, c);
                }
            }
        }
        if name == "visualizer" {
            let preset = skin.visualizer.presets.first().cloned().unwrap_or_default();
            let vis = visualize(&preset, (w * s) as u32, (h * s) as u32);
            imageops::overlay(&mut out, &vis, x * s, y * s);
        }
    }
    out
}

fn main() {
    let mut args = std::env::args().skip(1);
    let dir = args.next().map(PathBuf::from);
    let out = args.next().unwrap_or_else(|| "skin-preview.png".into());
    let store = SkinStore::new(std::env::temp_dir().join("sound-scraper-skin-preview"));
    let skin = match &dir {
        Some(dir) => store.load_dir(dir),
        None => store.load_default(),
    }
    .unwrap_or_else(|e| {
        eprintln!("error: {e}");
        std::process::exit(1);
    });
    for w in &skin.warnings {
        eprintln!("warning: {w}");
    }
    let main = render(&skin, &skin.panels.main.layout);
    let shade = skin.panels.main.shade.as_ref().map(|l| render(&skin, l));
    let gap = 12 * SCALE;
    // Every visualizer preset, on the skin's LCD color.
    let (vw, vh) = (112 * SCALE, 34 * SCALE);
    let lcd = hex(skin.colors.get("lcdBackground").map_or("#000000", |s| s.as_str()));
    let looks: Vec<RgbaImage> = skin
        .visualizer
        .presets
        .iter()
        .map(|p| {
            let mut tile = RgbaImage::from_pixel(vw, vh, image::Rgba(lcd));
            imageops::overlay(&mut tile, &visualize(p, vw, vh), 0, 0);
            tile
        })
        .collect();
    let looks_h = if looks.is_empty() { 0 } else { vh + gap };
    let height = main.height() + shade.as_ref().map_or(0, |s| s.height() + gap) + 2 * gap + looks_h;
    let width = main.width().max(shade.as_ref().map_or(0, |s| s.width())).max(looks.len() as u32 * (vw + gap / 2)) + 2 * gap;
    let mut sheet = RgbaImage::from_pixel(width, height, image::Rgba([47, 107, 110, 255]));
    imageops::overlay(&mut sheet, &main, gap as i64, gap as i64);
    if let Some(shade) = shade {
        imageops::overlay(&mut sheet, &shade, gap as i64, (main.height() + 2 * gap) as i64);
    }
    for (i, tile) in looks.iter().enumerate() {
        let x = gap as i64 + i as i64 * (vw + gap / 2) as i64;
        imageops::overlay(&mut sheet, tile, x, (height - looks_h - gap / 2) as i64 + gap as i64 / 2);
    }
    sheet.save(&out).unwrap();
    println!("wrote {out}");
}
