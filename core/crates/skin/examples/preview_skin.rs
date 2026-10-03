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

fn sprite_text(dst: &mut RgbaImage, skin: &ResolvedSkin, el: &ResolvedElement, text: &str) {
    let font = &skin.fonts[el.font.as_ref().unwrap()];
    let sheet = load(&font.image);
    let [cw, ch] = font.cell;
    let capacity = (el.rect[2] / cw) as usize;
    let pad = el.style.as_ref().and_then(|s| s.get("pad")).and_then(|v| v.as_bool()).unwrap_or(false);
    let mut chars: Vec<char> = text.to_uppercase().chars().take(capacity).collect();
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
                "record" | "toggleLibrary" => "active",
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
                "source" => "All system audio",
                _ => "",
            };
            sprite_text(&mut out, skin, el, sample);
        }
        if name == "levels"
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
        if name == "visualizer"
            && let Some(style) = &el.style
        {
            let line = hex(style.get("line").and_then(|v| v.as_str()).unwrap_or("#ffffff"));
            let grid = hex(style.get("grid").and_then(|v| v.as_str()).unwrap_or("#ffffff22"));
            for gx in (0..w).step_by(8) {
                fill(&mut out, (x + gx) * s, y * s, 1, h * s, grid);
            }
            fill(&mut out, x * s, (y + h / 2) * s, w * s, s, line);
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
    let height = main.height() + shade.as_ref().map_or(0, |s| s.height() + gap) + 2 * gap;
    let width = main.width().max(shade.as_ref().map_or(0, |s| s.width())) + 2 * gap;
    let mut sheet = RgbaImage::from_pixel(width, height, image::Rgba([47, 107, 110, 255]));
    imageops::overlay(&mut sheet, &main, gap as i64, gap as i64);
    if let Some(shade) = shade {
        imageops::overlay(&mut sheet, &shade, gap as i64, (main.height() + 2 * gap) as i64);
    }
    sheet.save(&out).unwrap();
    println!("wrote {out}");
}
