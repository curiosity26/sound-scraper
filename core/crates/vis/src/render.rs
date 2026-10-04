//! Draws frames into RGBA buffers with tiny-skia, styled by a skin's
//! visualizer preset.

use serde::Deserialize;
use tiny_skia::{
    Color, FillRule, GradientStop, LinearGradient, Paint, PathBuilder, Pixmap, PixmapMut, PixmapPaint, Point, Rect,
    Shader, Stroke, Transform,
};

use crate::Frame;

/// A skin's visualizer preset (skin.json `visualizer.presets[]`), with
/// colors already resolved.
#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Preset {
    pub name: String,
    /// "bars", "scope", "mirror", "radial" or "fire".
    pub style: String,
    /// Bars (1..=64).
    pub bands: usize,
    pub color: String,
    /// Colors from the bottom (quiet) to the top (loud) of the bars;
    /// overrides `color` when given.
    pub gradient: Vec<String>,
    /// Falling peak markers; none when empty.
    pub peak: String,
    /// Gap between bars, in skin points.
    pub gap: f32,
    /// Line width for scope/radial, in skin points.
    pub line_width: f32,
    /// Fill behind the visualizer; transparent when empty.
    pub background: String,
    /// Idle look: grid lines every 8 points, and a flat line.
    pub grid: String,
    pub line: String,
    /// Fire: how much of the trail survives each frame (0..1).
    pub decay: f32,
    /// Bar heights jump with the onset (beat) signal, 0..1.
    pub beat: f32,
}

impl Default for Preset {
    fn default() -> Self {
        Self {
            name: "Bars".into(),
            style: "bars".into(),
            bands: 28,
            color: "#9fd630".into(),
            gradient: Vec::new(),
            peak: String::new(),
            gap: 1.0,
            line_width: 1.0,
            background: String::new(),
            grid: String::new(),
            line: String::new(),
            decay: 0.82,
            beat: 0.0,
        }
    }
}

pub const STYLES: &[&str] = &["bars", "scope", "mirror", "radial", "fire"];

impl Preset {
    pub fn from_json(json: &str) -> Result<Self, String> {
        let preset: Preset = serde_json::from_str(json).map_err(|e| format!("visualizer preset: {e}"))?;
        if !STYLES.contains(&preset.style.as_str()) {
            return Err(format!("visualizer preset: unknown style \"{}\" (use {})", preset.style, STYLES.join(", ")));
        }
        if preset.bands == 0 || preset.bands > crate::BANDS {
            return Err(format!("visualizer preset: bands must be 1..={}", crate::BANDS));
        }
        Ok(preset)
    }
}

/// Parses `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`.
pub fn parse_color(s: &str) -> Option<Color> {
    let hex = s.strip_prefix('#')?;
    let v = |i: usize, n: usize| u8::from_str_radix(&hex[i..i + n], 16).ok();
    let (r, g, b, a) = match hex.len() {
        3 | 4 => {
            let d = |i| v(i, 1).map(|x| x * 17);
            (d(0)?, d(1)?, d(2)?, if hex.len() == 4 { d(3)? } else { 255 })
        }
        6 | 8 => (v(0, 2)?, v(2, 2)?, v(4, 2)?, if hex.len() == 8 { v(6, 2)? } else { 255 }),
        _ => return None,
    };
    Some(Color::from_rgba8(r, g, b, a))
}

/// Draws frames for one visualizer view; keeps per-view state (the fire
/// trail).
pub struct Renderer {
    preset: Preset,
    trail: Option<Pixmap>,
}

impl Default for Renderer {
    fn default() -> Self {
        Self::new(Preset::default())
    }
}

impl Renderer {
    pub fn new(preset: Preset) -> Self {
        Self { preset, trail: None }
    }

    pub fn preset(&self) -> &Preset {
        &self.preset
    }

    pub fn set_preset(&mut self, preset: Preset) {
        self.preset = preset;
        self.trail = None;
    }

    /// Draws `frame` (or the idle look when None) into `rgba`: premultiplied
    /// RGBA, `width` × `height` pixels, `unit` pixels per skin point.
    pub fn render(&mut self, frame: Option<&Frame>, width: u32, height: u32, unit: f32, rgba: &mut [u8]) -> bool {
        let Some(mut pixmap) = PixmapMut::from_bytes(rgba, width, height) else { return false };
        let p = &self.preset;
        pixmap.fill(parse_color(&p.background).unwrap_or(Color::TRANSPARENT));
        let (w, h) = (width as f32, height as f32);
        let Some(frame) = frame else {
            self.trail = None;
            draw_idle(&mut pixmap, p, w, h, unit);
            return true;
        };
        let color = parse_color(&p.color).unwrap_or(Color::WHITE);
        let fill = bar_paint(p, color, h);
        let boost = 1.0 + p.beat * frame.onset * 0.35;
        let bands = resample(&frame.bands, p.bands, boost);
        let peaks = resample(&frame.band_peaks, p.bands, 1.0);
        match p.style.as_str() {
            "scope" => draw_scope(&mut pixmap, frame, color, w, h, p.line_width * unit),
            "radial" => draw_radial(&mut pixmap, &bands, color, w, h, p.line_width * unit),
            "mirror" => {
                let (bw, step) = bar_metrics(p, w, unit);
                for (i, v) in bands.iter().enumerate() {
                    let bh = (v * h / 2.0).max(unit.min(1.0));
                    fill_rect(&mut pixmap, i as f32 * step, h / 2.0 - bh, bw, bh * 2.0, &fill);
                }
            }
            "fire" => {
                let mut layer = Pixmap::new(width, height).expect("size checked by PixmapMut");
                if let Some(trail) = &self.trail
                    && trail.width() == width
                    && trail.height() == height
                {
                    let rise = unit.max(1.0).round() as i32;
                    let paint = PixmapPaint { opacity: p.decay.clamp(0.0, 0.98), ..PixmapPaint::default() };
                    layer.draw_pixmap(0, -rise, trail.as_ref(), &paint, Transform::identity(), None);
                }
                draw_bars(&mut layer.as_mut(), p, &bands, &[], &fill, None, w, h, unit);
                pixmap.draw_pixmap(0, 0, layer.as_ref(), &PixmapPaint::default(), Transform::identity(), None);
                self.trail = Some(layer);
            }
            _ => {
                let peak = parse_color(&p.peak);
                draw_bars(&mut pixmap, p, &bands, &peaks, &fill, peak, w, h, unit);
            }
        }
        true
    }
}

/// Combines the analyzer's bands into `n` bars (max of each group).
fn resample(values: &[f32], n: usize, gain: f32) -> Vec<f32> {
    (0..n)
        .map(|i| {
            let start = i * values.len() / n;
            let end = ((i + 1) * values.len() / n).max(start + 1);
            (values[start..end].iter().copied().fold(0.0, f32::max) * gain).min(1.0)
        })
        .collect()
}

fn bar_metrics(p: &Preset, w: f32, unit: f32) -> (f32, f32) {
    let n = p.bands as f32;
    let gap = (p.gap * unit).min(w / n * 0.5);
    let bw = (w - gap * (n - 1.0)) / n;
    (bw.max(1.0), bw + gap)
}

fn bar_paint(p: &Preset, color: Color, h: f32) -> Paint<'static> {
    let mut paint = Paint { anti_alias: false, ..Paint::default() };
    let colors: Vec<Color> = p.gradient.iter().filter_map(|c| parse_color(c)).collect();
    let last = colors.len().max(2) - 1;
    let stops: Vec<GradientStop> =
        colors.iter().enumerate().map(|(i, c)| GradientStop::new(i as f32 / last as f32, *c)).collect();
    let shader = if stops.len() >= 2 {
        LinearGradient::new(Point::from_xy(0.0, h), Point::from_xy(0.0, 0.0), stops, tiny_skia::SpreadMode::Pad, Transform::identity())
    } else {
        None
    };
    paint.shader = shader.unwrap_or(Shader::SolidColor(color));
    paint
}

fn fill_rect(pixmap: &mut PixmapMut, x: f32, y: f32, w: f32, h: f32, paint: &Paint) {
    if let Some(rect) = Rect::from_xywh(x, y, w, h) {
        pixmap.fill_rect(rect, paint, Transform::identity(), None);
    }
}

#[allow(clippy::too_many_arguments)]
fn draw_bars(
    pixmap: &mut PixmapMut,
    p: &Preset,
    bands: &[f32],
    peaks: &[f32],
    fill: &Paint,
    peak: Option<Color>,
    w: f32,
    h: f32,
    unit: f32,
) {
    let (bw, step) = bar_metrics(p, w, unit);
    // Bars snap to whole skin points, like LCD segments.
    let snap = |v: f32| (v * h / unit).round() * unit;
    for (i, v) in bands.iter().enumerate() {
        let bh = snap(*v);
        fill_rect(pixmap, i as f32 * step, h - bh, bw, bh, fill);
    }
    if let Some(color) = peak {
        let mut paint = Paint { anti_alias: false, ..Paint::default() };
        paint.set_color(color);
        let mark = unit.max(1.0);
        for (i, v) in peaks.iter().enumerate() {
            if *v > 0.01 {
                let y = (h - snap(*v) - mark).max(0.0);
                fill_rect(pixmap, i as f32 * step, y, bw, mark, &paint);
            }
        }
    }
}

fn stroke_paint(color: Color) -> Paint<'static> {
    let mut paint = Paint { anti_alias: true, ..Paint::default() };
    paint.set_color(color);
    paint
}

fn draw_scope(pixmap: &mut PixmapMut, frame: &Frame, color: Color, w: f32, h: f32, width: f32) {
    let mut pb = PathBuilder::new();
    let n = frame.waveform.len();
    for (i, s) in frame.waveform.iter().enumerate() {
        let x = i as f32 / (n - 1) as f32 * w;
        let y = h / 2.0 - s.clamp(-1.0, 1.0) * (h / 2.0 - width);
        if i == 0 { pb.move_to(x, y) } else { pb.line_to(x, y) }
    }
    if let Some(path) = pb.finish() {
        let stroke = Stroke { width: width.max(1.0), ..Stroke::default() };
        pixmap.stroke_path(&path, &stroke_paint(color), &stroke, Transform::identity(), None);
    }
}

/// Bars radiating from an ellipse that fills the view.
fn draw_radial(pixmap: &mut PixmapMut, bands: &[f32], color: Color, w: f32, h: f32, width: f32) {
    let (cx, cy) = (w / 2.0, h / 2.0);
    let (rx, ry) = ((w / 2.0 - width).max(1.0), (h / 2.0 - width).max(1.0));
    let inner = 0.35;
    let mut pb = PathBuilder::new();
    let n = bands.len();
    for (i, v) in bands.iter().enumerate() {
        let a = i as f32 / n as f32 * std::f32::consts::TAU - std::f32::consts::FRAC_PI_2;
        let (dx, dy) = (a.cos(), a.sin());
        let k = (inner + v.max(0.03) * (1.0 - inner)).min(1.0);
        pb.move_to(cx + rx * inner * dx, cy + ry * inner * dy);
        pb.line_to(cx + rx * k * dx, cy + ry * k * dy);
    }
    if let Some(oval) = Rect::from_xywh(cx - rx * inner, cy - ry * inner, 2.0 * rx * inner, 2.0 * ry * inner)
        .and_then(PathBuilder::from_oval)
    {
        let mut paint = stroke_paint(color);
        paint.shader = Shader::SolidColor(
            Color::from_rgba(color.red(), color.green(), color.blue(), color.alpha() * 0.35).unwrap_or(color),
        );
        pixmap.fill_path(&oval, &paint, FillRule::Winding, Transform::identity(), None);
    }
    if let Some(path) = pb.finish() {
        let stroke = Stroke { width: width.max(1.0), ..Stroke::default() };
        pixmap.stroke_path(&path, &stroke_paint(color), &stroke, Transform::identity(), None);
    }
}

/// Not recording: the grid and a flat line.
fn draw_idle(pixmap: &mut PixmapMut, p: &Preset, w: f32, h: f32, unit: f32) {
    let mut paint = Paint { anti_alias: false, ..Paint::default() };
    if let Some(grid) = parse_color(&p.grid) {
        paint.set_color(grid);
        let mut x = 0.0;
        while x < w {
            fill_rect(pixmap, x, 0.0, unit.max(1.0), h, &paint);
            x += 8.0 * unit;
        }
    }
    if let Some(line) = parse_color(&p.line).or_else(|| parse_color(&p.color)) {
        paint.set_color(line);
        fill_rect(pixmap, 0.0, ((h / 2.0) / unit).floor() * unit, w, unit.max(1.0), &paint);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame() -> Frame {
        let mut f = Frame::default();
        for (i, b) in f.bands.iter_mut().enumerate() {
            *b = if i < 32 { 0.9 } else { 0.1 };
        }
        f.band_peaks = f.bands.iter().map(|b| (b + 0.05).min(1.0)).collect();
        for (i, s) in f.waveform.iter_mut().enumerate() {
            *s = (i as f32 / 20.0).sin() * 0.8;
        }
        f
    }

    fn render(style: &str, frame: Option<&Frame>) -> Vec<u8> {
        let preset = Preset {
            style: style.into(),
            bands: 16,
            color: "#00ff00".into(),
            peak: "#ff0000".into(),
            grid: "#ffffff20".into(),
            line: "#00ff00".into(),
            ..Preset::default()
        };
        let mut r = Renderer::new(preset);
        let mut buf = vec![0u8; 64 * 32 * 4];
        assert!(r.render(frame, 64, 32, 1.0, &mut buf));
        if style == "fire" {
            assert!(r.render(frame, 64, 32, 1.0, &mut buf));
        }
        buf
    }

    fn pixel(buf: &[u8], x: usize, y: usize) -> [u8; 4] {
        let i = (y * 64 + x) * 4;
        [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]]
    }

    fn lit(buf: &[u8]) -> usize {
        buf.chunks_exact(4).filter(|p| p[3] > 0).count()
    }

    #[test]
    fn bars_follow_the_bands_with_peaks() {
        let buf = render("bars", Some(&frame()));
        // Loud low bars on the left, quiet high bars on the right.
        assert_eq!(pixel(&buf, 1, 10), [0, 255, 0, 255]);
        assert_eq!(pixel(&buf, 62, 10)[3], 0);
        assert_eq!(pixel(&buf, 62, 31), [0, 255, 0, 255]);
        // A red peak marker sits above the left bars.
        assert!((0..32).any(|y| pixel(&buf, 1, y) == [255, 0, 0, 255]));
    }

    #[test]
    fn every_style_draws_something() {
        for style in STYLES {
            assert!(lit(&render(style, Some(&frame()))) > 20, "{style}");
        }
    }

    #[test]
    fn idle_draws_grid_and_line() {
        let buf = render("bars", None);
        assert_eq!(pixel(&buf, 30, 16), [0, 255, 0, 255]);
        assert!(pixel(&buf, 0, 2)[3] > 0 && pixel(&buf, 8, 2)[3] > 0 && pixel(&buf, 4, 2)[3] == 0);
    }

    #[test]
    fn presets_parse_and_validate() {
        let p = Preset::from_json(r##"{"name":"Fire","style":"fire","bands":20,"gradient":["#f00","#ff0"]}"##).unwrap();
        assert_eq!((p.style.as_str(), p.bands, p.gradient.len()), ("fire", 20, 2));
        assert!(Preset::from_json(r#"{"style":"lasers"}"#).unwrap_err().contains("unknown style"));
        assert!(Preset::from_json(r#"{"bands":0}"#).is_err());
        assert_eq!(parse_color("#f008"), Some(Color::from_rgba8(255, 0, 0, 136)));
        assert_eq!(parse_color("nope"), None);
    }

    #[test]
    fn gradient_bars_change_color_with_height() {
        let preset = Preset { bands: 4, gradient: vec!["#0000ff".into(), "#ff0000".into()], ..Preset::default() };
        let mut r = Renderer::new(preset);
        let mut f = Frame::default();
        f.bands.iter_mut().for_each(|b| *b = 1.0);
        let mut buf = vec![0u8; 64 * 32 * 4];
        r.render(Some(&f), 64, 32, 1.0, &mut buf);
        let (top, bottom) = (pixel(&buf, 2, 0), pixel(&buf, 2, 31));
        assert!(top[0] > top[2] && bottom[2] > bottom[0], "{top:?} {bottom:?}");
    }

    #[test]
    fn rejects_bad_buffers() {
        let mut r = Renderer::default();
        assert!(!r.render(None, 64, 32, 1.0, &mut [0u8; 10]));
    }
}
