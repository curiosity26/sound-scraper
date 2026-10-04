//! Renders a skin's main panel and shade layout with sample content into a
//! PNG, through the same resolver the app uses (for checking artwork
//! without running the app):
//!
//!     cargo run -p sound_scraper_skin --example preview_skin -- [skin folder] [out.png]
//!
//! Defaults to the Default skin and `skin-preview.png`.

use std::path::PathBuf;

use image::{RgbaImage, imageops};
use sound_scraper_skin::{SkinStore, preview};

const SCALE: u32 = 2;

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
    let main = preview::render(&skin, &skin.panels.main.layout, SCALE);
    let shade = skin.panels.main.shade.as_ref().map(|l| preview::render(&skin, l, SCALE));
    let gap = 12 * SCALE;
    // Every visualizer preset, on the skin's LCD color.
    let (vw, vh) = (112 * SCALE, 34 * SCALE);
    let lcd = preview::hex(skin.colors.get("lcdBackground").map_or("#000000", |s| s.as_str()));
    let looks: Vec<RgbaImage> = skin
        .visualizer
        .presets
        .iter()
        .map(|p| {
            let mut tile = RgbaImage::from_pixel(vw, vh, image::Rgba(lcd));
            imageops::overlay(&mut tile, &preview::visualize(p, vw, vh, SCALE), 0, 0);
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
