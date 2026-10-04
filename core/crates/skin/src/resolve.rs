//! Loads a skin folder, validates it and resolves it for the UI: image paths
//! become absolute (with their sizes and @2x siblings), `@token` colors are
//! replaced by values, and anything the skin leaves out comes from the
//! Default skin, element by element.

use std::{
    collections::{BTreeMap, HashMap},
    fs,
    path::{Path, PathBuf},
};

use serde::Serialize;
use serde_json::Value;

use crate::{
    files,
    manifest::{self, AnimationDef, ElementDef, FramePanel, Layout, Manifest, Rect, TextStyle},
};

/// An image, ready to draw: `width` × `height` points. `path2x` and
/// `path4x` (when present) have exactly two and four times the pixels, for
/// Retina displays and double-size mode.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageRef {
    pub path: PathBuf,
    pub path2x: Option<PathBuf>,
    pub path4x: Option<PathBuf>,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedSkin {
    pub id: String,
    pub name: String,
    pub author: Option<String>,
    pub version: Option<String>,
    pub description: Option<String>,
    /// The skin's folder.
    pub dir: PathBuf,
    pub builtin: bool,
    pub colors: BTreeMap<String, String>,
    pub fonts: BTreeMap<String, ResolvedFont>,
    pub panels: ResolvedPanels,
    pub visualizer: ResolvedVisualizer,
    /// Problems that didn't stop the skin from loading (unknown keys,
    /// fallbacks that didn't fit…).
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedFont {
    pub image: ImageRef,
    pub glyphs: String,
    pub cell: [i64; 2],
    /// Cells per row of the sprite.
    pub columns: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedPanels {
    pub main: ResolvedMain,
    pub library: ResolvedFramePanel,
    pub settings: ResolvedFramePanel,
    pub details: ResolvedFramePanel,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedMain {
    #[serde(flatten)]
    pub layout: ResolvedLayout,
    pub shade: Option<ResolvedLayout>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedLayout {
    pub size: [i64; 2],
    pub background: Option<ImageRef>,
    pub drag_regions: Vec<Rect>,
    pub elements: BTreeMap<String, ResolvedElement>,
    pub animations: Vec<ResolvedAnimation>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedAnimation {
    pub name: Option<String>,
    pub rect: Rect,
    pub sprite: ResolvedSprite,
    pub frames: Vec<String>,
    pub fps: f64,
    pub play: String,
    pub speed: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedElement {
    pub rect: Rect,
    pub sprite: Option<ResolvedSprite>,
    pub font: Option<String>,
    pub text: Option<ResolvedText>,
    pub align: Option<String>,
    pub style: Option<serde_json::Map<String, Value>>,
    /// Taken from the Default skin because this skin doesn't define it.
    pub fallback: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedSprite {
    pub image: ImageRef,
    pub states: BTreeMap<String, [i64; 2]>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedText {
    pub color: Option<String>,
    pub size: Option<f64>,
    pub family: Option<String>,
    pub weight: Option<String>,
    pub uppercase: bool,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedFramePanel {
    pub min_size: Option<[i64; 2]>,
    pub resizable: bool,
    pub frame: Option<ResolvedFrame>,
    pub table: BTreeMap<String, String>,
    pub scrollbar: Option<ResolvedScrollbar>,
    pub controls: BTreeMap<String, String>,
    pub title: Option<ResolvedTitle>,
    pub close: Option<ResolvedClose>,
    pub menu: Option<ResolvedClose>,
    pub grip: [i64; 2],
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedTitle {
    pub font: Option<String>,
    pub offset: [i64; 2],
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedClose {
    pub offset: [i64; 2],
    pub size: [i64; 2],
    pub sprite: ResolvedSprite,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedFrame {
    pub image: ImageRef,
    pub slice: [i64; 4],
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedScrollbar {
    pub image: ImageRef,
    pub track: Rect,
    pub thumb: Rect,
    pub thumb_slice: Option<[i64; 4]>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedVisualizer {
    pub presets: Vec<Value>,
}

/// Reads and parses `skin.json`; unknown keys go to `warnings`.
pub fn read_manifest(dir: &Path, warnings: &mut Vec<String>) -> Result<Manifest, String> {
    let path = dir.join("skin.json");
    let text = fs::read_to_string(&path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound { "skin.json is missing".to_string() } else { format!("skin.json: {e}") }
    })?;
    let mut de = serde_json::Deserializer::from_str(&text);
    let manifest: Manifest = serde_ignored::deserialize(&mut de, |path| {
        warnings.push(format!("skin.json: unknown key {path} (ignored)"));
    })
    .map_err(|e| format!("skin.json: {e}"))?;
    if manifest.format != manifest::FORMAT {
        return Err(format!(
            "skin.json: format {} is not supported (this version of Sound Scraper reads format {})",
            manifest.format,
            manifest::FORMAT
        ));
    }
    check_id(&manifest.id)?;
    if manifest.name.trim().is_empty() {
        return Err("skin.json: name must not be empty".into());
    }
    Ok(manifest)
}

/// Skin ids are reverse-DNS: lowercase letters, digits and hyphens, in at
/// least two dot-separated parts. They name the install folder, so this
/// also keeps them safe as file names.
pub fn check_id(id: &str) -> Result<(), String> {
    let parts: Vec<&str> = id.split('.').collect();
    let ok = id.len() <= 128
        && parts.len() >= 2
        && parts.iter().all(|p| {
            !p.is_empty()
                && !p.starts_with('-')
                && !p.ends_with('-')
                && p.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        });
    if ok {
        Ok(())
    } else {
        Err(format!(
            "skin.json: id \"{id}\" must be reverse-DNS, e.g. \"com.example.my-skin\" (lowercase letters, digits and hyphens)"
        ))
    }
}

/// Image checks and decoding, cached per path within one skin.
struct Images<'a> {
    dir: &'a Path,
    cache: HashMap<String, ImageRef>,
}

impl<'a> Images<'a> {
    fn new(dir: &'a Path) -> Self {
        Self { dir, cache: HashMap::new() }
    }

    fn get(&mut self, rel: &str, used_by: &str) -> Result<ImageRef, String> {
        if let Some(image) = self.cache.get(rel) {
            return Ok(image.clone());
        }
        let clean = files::safe_relative(rel).map_err(|e| format!("skin.json: {used_by}: {e}"))?;
        if !files::is_image(rel) {
            return Err(format!("skin.json: {used_by}: {rel} is not a PNG, JPEG or WebP image"));
        }
        let path = self.dir.join(&clean);
        if !path.is_file() {
            return Err(format!("skin.json: {used_by}: {rel} is missing"));
        }
        let (width, height) = decode_check(&path, rel)?;
        let stem = clean.file_stem().unwrap().to_string_lossy();
        let ext = clean.extension().unwrap().to_string_lossy();
        let sibling = |factor: u32| -> Result<Option<PathBuf>, String> {
            let rel_n = clean.with_file_name(format!("{stem}@{factor}x.{ext}"));
            let path_n = self.dir.join(&rel_n);
            if !path_n.is_file() {
                return Ok(None);
            }
            let (w, h) = decode_check(&path_n, &rel_n.to_string_lossy())?;
            if (w, h) != (width * factor, height * factor) {
                return Err(format!(
                    "{}: must be exactly {} the size of {rel} ({}×{} pixels), but is {w}×{h}",
                    rel_n.display(),
                    if factor == 2 { "twice" } else { "four times" },
                    width * factor,
                    height * factor
                ));
            }
            Ok(Some(path_n))
        };
        let image = ImageRef { path2x: sibling(2)?, path4x: sibling(4)?, path, width, height };
        self.cache.insert(rel.to_string(), image.clone());
        Ok(image)
    }
}

/// Fully decodes an image to be sure it's valid, refusing oversized ones
/// before allocating their pixels.
fn decode_check(path: &Path, rel: &str) -> Result<(u32, u32), String> {
    let reader = image::ImageReader::open(path)
        .and_then(|r| r.with_guessed_format())
        .map_err(|e| format!("{rel}: {e}"))?;
    let (w, h) = reader.into_dimensions().map_err(|e| format!("{rel}: not a valid image ({e})"))?;
    if w > files::MAX_IMAGE_SIDE || h > files::MAX_IMAGE_SIDE {
        return Err(format!("{rel}: {w}×{h} pixels; images can be at most {0}×{0}", files::MAX_IMAGE_SIDE));
    }
    if w == 0 || h == 0 {
        return Err(format!("{rel}: the image is empty"));
    }
    image::ImageReader::open(path)
        .and_then(|r| r.with_guessed_format())
        .map_err(|e| format!("{rel}: {e}"))?
        .decode()
        .map_err(|e| format!("{rel}: not a valid image ({e})"))?;
    Ok((w, h))
}

fn check_color(value: &str, colors: &BTreeMap<String, String>, at: &str) -> Result<String, String> {
    if let Some(token) = value.strip_prefix('@') {
        return colors.get(token).cloned().ok_or_else(|| format!("skin.json: {at}: unknown color token @{token}"));
    }
    let hex = value.strip_prefix('#').unwrap_or("");
    if matches!(hex.len(), 3 | 4 | 6 | 8) && hex.chars().all(|c| c.is_ascii_hexdigit()) {
        Ok(value.to_string())
    } else {
        Err(format!("skin.json: {at}: \"{value}\" is not a color (use #rgb, #rrggbb, #rrggbbaa or @token)"))
    }
}

fn fmt_rect(r: &Rect) -> String {
    format!("[{}, {}, {}, {}]", r[0], r[1], r[2], r[3])
}

fn check_size(size: [i64; 2], at: &str) -> Result<(), String> {
    if size[0] <= 0 || size[1] <= 0 || size[0] > 4096 || size[1] > 4096 {
        return Err(format!("skin.json: {at}: size [{}, {}] must be between 1 and 4096", size[0], size[1]));
    }
    Ok(())
}

/// Whether `r` lies inside a `size` area.
fn rect_fits(r: &Rect, size: [i64; 2]) -> bool {
    r[0] >= 0 && r[1] >= 0 && r[2] > 0 && r[3] > 0 && r[0] + r[2] <= size[0] && r[1] + r[3] <= size[1]
}

/// Whether a `w`×`h` cell at `at` lies inside `image`.
fn cell_fits(at: [i64; 2], w: i64, h: i64, image: &ImageRef) -> bool {
    at[0] >= 0 && at[1] >= 0 && at[0] + w <= image.width as i64 && at[1] + h <= image.height as i64
}

/// Validates and resolves a skin with no fallback (used for the Default
/// skin itself, and as the first step for any other skin).
struct Resolver<'a> {
    images: Images<'a>,
    colors: BTreeMap<String, String>,
    font_names: Vec<String>,
}

impl Resolver<'_> {
    fn element(&mut self, el: &ElementDef, name: &str, size: [i64; 2], at: &str) -> Result<ResolvedElement, String> {
        if !rect_fits(&el.rect, size) {
            return Err(format!(
                "skin.json: {at}.rect {} must have a positive size and lie inside the {}×{} panel",
                fmt_rect(&el.rect),
                size[0],
                size[1]
            ));
        }
        let sprite = match &el.sprite {
            Some(sprite) => {
                let image = self.images.get(&sprite.image, &format!("{at}.sprite.image"))?;
                for state in manifest::required_states(name) {
                    if !sprite.states.contains_key(*state) {
                        return Err(format!("skin.json: {at}.sprite.states needs a \"{state}\" state"));
                    }
                }
                for (state, offset) in &sprite.states {
                    if !cell_fits(*offset, el.rect[2], el.rect[3], &image) {
                        return Err(format!(
                            "skin.json: {at}.sprite.states.{state}: a {}×{} cell at [{}, {}] extends past {} ({}×{})",
                            el.rect[2],
                            el.rect[3],
                            offset[0],
                            offset[1],
                            sprite.image,
                            image.width,
                            image.height
                        ));
                    }
                }
                Some(ResolvedSprite { image, states: sprite.states.clone() })
            }
            None => None,
        };
        if let Some(font) = &el.font
            && !self.font_names.contains(font)
        {
            return Err(format!("skin.json: {at}.font: no font named \"{font}\""));
        }
        let text = match &el.text {
            Some(t) => Some(self.text(t, &format!("{at}.text"))?),
            None => None,
        };
        if let Some(align) = &el.align
            && !matches!(align.as_str(), "left" | "center" | "right")
        {
            return Err(format!("skin.json: {at}.align must be \"left\", \"center\" or \"right\""));
        }
        let style = match &el.style {
            Some(style) => Some(self.style(style, &format!("{at}.style"))?),
            None => None,
        };
        Ok(ResolvedElement { rect: el.rect, sprite, font: el.font.clone(), text, align: el.align.clone(), style, fallback: false })
    }

    fn text(&self, t: &TextStyle, at: &str) -> Result<ResolvedText, String> {
        let color = match &t.color {
            Some(c) => Some(check_color(c, &self.colors, &format!("{at}.color"))?),
            None => None,
        };
        if let Some(size) = t.size
            && !(4.0..=96.0).contains(&size)
        {
            return Err(format!("skin.json: {at}.size must be between 4 and 96"));
        }
        if let Some(weight) = &t.weight
            && !matches!(weight.as_str(), "normal" | "bold")
        {
            return Err(format!("skin.json: {at}.weight must be \"normal\" or \"bold\""));
        }
        Ok(ResolvedText {
            color,
            size: t.size,
            family: t.family.clone(),
            weight: t.weight.clone(),
            uppercase: t.uppercase.unwrap_or(false),
        })
    }

    /// Resolves `@token` strings in style parameters; other values pass through.
    fn style(
        &self,
        style: &serde_json::Map<String, Value>,
        at: &str,
    ) -> Result<serde_json::Map<String, Value>, String> {
        let mut out = serde_json::Map::new();
        for (key, value) in style {
            let value = match value {
                Value::String(s) if s.starts_with('@') || s.starts_with('#') => {
                    Value::String(check_color(s, &self.colors, &format!("{at}.{key}"))?)
                }
                other => other.clone(),
            };
            out.insert(key.clone(), value);
        }
        Ok(out)
    }

    fn layout(&mut self, layout: &Layout, at: &str, warnings: &mut Vec<String>) -> Result<ResolvedLayout, String> {
        check_size(layout.size, at)?;
        let background = match &layout.background {
            Some(bg) => Some(self.images.get(bg, &format!("{at}.background"))?),
            None => None,
        };
        for (i, r) in layout.drag_region.iter().enumerate() {
            if !rect_fits(r, layout.size) {
                return Err(format!("skin.json: {at}.dragRegion[{i}] {} lies outside the panel", fmt_rect(r)));
            }
        }
        let mut elements = BTreeMap::new();
        for (name, el) in &layout.elements {
            if !manifest::MAIN_ELEMENTS.contains(&name.as_str()) {
                warnings.push(format!("skin.json: {at}.elements.{name}: unknown element (ignored)"));
                continue;
            }
            elements.insert(name.clone(), self.element(el, name, layout.size, &format!("{at}.elements.{name}"))?);
        }
        let mut animations = Vec::new();
        for (i, a) in layout.animations.iter().enumerate() {
            animations.push(self.animation(a, layout.size, &format!("{at}.animations[{i}]"))?);
        }
        Ok(ResolvedLayout { size: layout.size, background, drag_regions: layout.drag_region.clone(), elements, animations })
    }

    fn animation(&mut self, a: &AnimationDef, size: [i64; 2], at: &str) -> Result<ResolvedAnimation, String> {
        if !rect_fits(&a.rect, size) {
            return Err(format!(
                "skin.json: {at}.rect {} must have a positive size and lie inside the {}×{} panel",
                fmt_rect(&a.rect),
                size[0],
                size[1]
            ));
        }
        if a.frames.is_empty() {
            return Err(format!("skin.json: {at}.frames must list at least one sprite state"));
        }
        // Reuse the element checks for the sprite cells.
        let el = ElementDef { rect: a.rect, sprite: Some(a.sprite.clone()), font: None, text: None, align: None, style: None };
        let sprite = self.element(&el, "visualizer", size, at)?.sprite.expect("sprite given");
        if let Some(frame) = a.frames.iter().find(|f| !sprite.states.contains_key(*f)) {
            return Err(format!("skin.json: {at}.frames: \"{frame}\" is not a state of the sprite"));
        }
        let fps = a.fps.unwrap_or(12.0);
        if !(fps > 0.0 && fps <= 60.0) {
            return Err(format!("skin.json: {at}.fps must be more than 0 and at most 60"));
        }
        let play = a.play.clone().unwrap_or_else(|| "recording".into());
        if !manifest::ANIMATION_PLAY.contains(&play.as_str()) {
            return Err(format!("skin.json: {at}.play must be one of {}", manifest::ANIMATION_PLAY.join(", ")));
        }
        let speed = a.speed.clone().unwrap_or_else(|| "constant".into());
        if !manifest::ANIMATION_SPEED.contains(&speed.as_str()) {
            return Err(format!("skin.json: {at}.speed must be one of {}", manifest::ANIMATION_SPEED.join(", ")));
        }
        Ok(ResolvedAnimation { name: a.name.clone(), rect: a.rect, sprite, frames: a.frames.clone(), fps, play, speed })
    }

    /// Checks a visualizer preset and resolves its colors.
    fn preset(&self, preset: &Value, at: &str) -> Result<Value, String> {
        let Value::Object(map) = preset else { return Err(format!("skin.json: {at} must be an object")) };
        if !map.get("name").is_some_and(Value::is_string) {
            return Err(format!("skin.json: {at} needs a \"name\""));
        }
        if let Some(style) = map.get("style")
            && !style.as_str().is_some_and(|s| manifest::VISUALIZER_STYLES.contains(&s))
        {
            return Err(format!("skin.json: {at}.style must be one of {}", manifest::VISUALIZER_STYLES.join(", ")));
        }
        if let Some(bands) = map.get("bands")
            && !bands.as_u64().is_some_and(|b| (1..=64).contains(&b))
        {
            return Err(format!("skin.json: {at}.bands must be 1 to 64"));
        }
        let color = |v: &Value, key: &str| -> Result<Value, String> {
            match v {
                Value::String(s) if s.starts_with('@') || s.starts_with('#') => {
                    Ok(Value::String(check_color(s, &self.colors, &format!("{at}.{key}"))?))
                }
                other => Ok(other.clone()),
            }
        };
        let mut out = serde_json::Map::new();
        for (key, value) in map {
            let value = match value {
                Value::Array(items) => Value::Array(items.iter().map(|v| color(v, key)).collect::<Result<_, _>>()?),
                v => color(v, key)?,
            };
            out.insert(key.clone(), value);
        }
        Ok(Value::Object(out))
    }

    fn colors_map(
        &self,
        map: &BTreeMap<String, String>,
        known: &[&str],
        at: &str,
        warnings: &mut Vec<String>,
    ) -> Result<BTreeMap<String, String>, String> {
        let mut out = BTreeMap::new();
        for (key, value) in map {
            if !known.contains(&key.as_str()) {
                warnings.push(format!("skin.json: {at}.{key}: unknown color (ignored)"));
                continue;
            }
            out.insert(key.clone(), check_color(value, &self.colors, &format!("{at}.{key}"))?);
        }
        Ok(out)
    }

    fn frame_panel(&mut self, p: &FramePanel, at: &str, warnings: &mut Vec<String>) -> Result<ResolvedFramePanel, String> {
        if let Some(min) = p.min_size {
            check_size(min, &format!("{at}.minSize"))?;
        }
        let frame = match &p.frame {
            Some(f) => {
                let image = self.images.get(&f.image, &format!("{at}.frame.image"))?;
                let [t, r, b, l] = f.slice;
                if f.slice.iter().any(|v| *v < 0) || t + b >= image.height as i64 || l + r >= image.width as i64 {
                    return Err(format!(
                        "skin.json: {at}.frame.slice [{t}, {r}, {b}, {l}] doesn't fit {} ({}×{}); \
                         the insets must leave a middle to stretch",
                        f.image, image.width, image.height
                    ));
                }
                Some(ResolvedFrame { image, slice: f.slice })
            }
            None => None,
        };
        let scrollbar = match &p.scrollbar {
            Some(s) => {
                let image = self.images.get(&s.image, &format!("{at}.scrollbar.image"))?;
                let size = [image.width as i64, image.height as i64];
                for (part, r) in [("track", &s.track), ("thumb", &s.thumb)] {
                    if !rect_fits(r, size) {
                        return Err(format!(
                            "skin.json: {at}.scrollbar.{part} {} lies outside {} ({}×{})",
                            fmt_rect(r),
                            s.image,
                            image.width,
                            image.height
                        ));
                    }
                }
                Some(ResolvedScrollbar { image, track: s.track, thumb: s.thumb, thumb_slice: s.thumb_slice })
            }
            None => None,
        };
        let table = match &p.table {
            Some(t) => self.colors_map(t, manifest::TABLE_COLORS, &format!("{at}.table"), warnings)?,
            None => BTreeMap::new(),
        };
        let controls = match &p.controls {
            Some(c) => self.colors_map(c, manifest::CONTROL_COLORS, &format!("{at}.controls"), warnings)?,
            None => BTreeMap::new(),
        };
        let title = match &p.title {
            Some(t) => {
                if let Some(font) = &t.font
                    && !self.font_names.contains(font)
                {
                    return Err(format!("skin.json: {at}.title.font: no font named \"{font}\""));
                }
                let color = match &t.color {
                    Some(c) => Some(check_color(c, &self.colors, &format!("{at}.title.color"))?),
                    None => None,
                };
                Some(ResolvedTitle { font: t.font.clone(), offset: t.offset, color })
            }
            None => None,
        };
        let mut title_button = |def: &Option<crate::manifest::CloseDef>, name: &str| -> Result<Option<ResolvedClose>, String> {
            let Some(c) = def else { return Ok(None) };
            let size = [c.size[0], c.size[1]];
            check_size(size, &format!("{at}.{name}"))?;
            let el = ElementDef {
                rect: [0, 0, size[0], size[1]],
                sprite: Some(c.sprite.clone()),
                font: None,
                text: None,
                align: None,
                style: None,
            };
            let sprite = self.element(&el, "close", size, &format!("{at}.{name}"))?.sprite.expect("sprite given");
            Ok(Some(ResolvedClose { offset: c.offset, size, sprite }))
        };
        let close = title_button(&p.close, "close")?;
        let menu = title_button(&p.menu, "menu")?;
        let grip = p.grip.unwrap_or([14, 14]);
        if grip.iter().any(|v| *v < 0 || *v > 256) {
            return Err(format!("skin.json: {at}.grip must be between 0 and 256"));
        }
        Ok(ResolvedFramePanel {
            min_size: p.min_size,
            resizable: p.resizable.unwrap_or(true),
            frame,
            table,
            scrollbar,
            controls,
            title,
            close,
            menu,
            grip,
        })
    }
}

/// Loads `dir` as a skin, resolving what it leaves out from `base` (the
/// Default skin). With `base` = None the skin must be complete (it *is* the
/// Default skin).
pub fn load_dir(dir: &Path, base: Option<&ResolvedSkin>) -> Result<ResolvedSkin, String> {
    let dir = dir.canonicalize().map_err(|e| format!("{}: {e}", dir.display()))?;
    files::check_folder(&dir)?;
    let mut warnings = Vec::new();
    let m = read_manifest(&dir, &mut warnings)?;

    let mut colors = base.map(|b| b.colors.clone()).unwrap_or_default();
    // Tokens may not refer to other tokens; validate them on their own.
    for (name, value) in &m.colors {
        let value = check_color(value, &BTreeMap::new(), &format!("colors.{name}"))?;
        colors.insert(name.clone(), value);
    }

    let mut fonts = base.map(|b| b.fonts.clone()).unwrap_or_default();
    let mut images = Images::new(&dir);
    for (name, f) in &m.fonts {
        let at = format!("fonts.{name}");
        let image = images.get(&f.sprite, &format!("{at}.sprite"))?;
        let [w, h] = f.cell;
        if w <= 0 || h <= 0 || w > image.width as i64 || h > image.height as i64 {
            return Err(format!("skin.json: {at}.cell [{w}, {h}] doesn't fit {} ({}×{})", f.sprite, image.width, image.height));
        }
        let columns = image.width as i64 / w;
        let capacity = columns * (image.height as i64 / h);
        let count = f.glyphs.chars().count() as i64;
        if count == 0 || count > capacity {
            return Err(format!(
                "skin.json: {at}.glyphs has {count} characters, but {} holds {capacity} cells of {w}×{h}",
                f.sprite
            ));
        }
        fonts.insert(name.clone(), ResolvedFont { image, glyphs: f.glyphs.clone(), cell: f.cell, columns });
    }

    let mut r = Resolver { images, colors: colors.clone(), font_names: fonts.keys().cloned().collect() };

    let main = match (&m.panels.main, base) {
        (Some(main), _) => {
            let mut layout = r.layout(&main.layout(), "panels.main", &mut warnings)?;
            let mut shade = match &main.shade {
                Some(s) => Some(r.layout(s, "panels.main.shade", &mut warnings)?),
                None => None,
            };
            if let Some(base) = base {
                fill_from(&mut layout, &base.panels.main.layout, "panels.main", &mut warnings);
                match (&mut shade, &base.panels.main.shade) {
                    (Some(shade), Some(base_shade)) => fill_from(shade, base_shade, "panels.main.shade", &mut warnings),
                    (None, Some(base_shade)) => shade = Some(as_fallback(base_shade)),
                    _ => {}
                }
            }
            ResolvedMain { layout, shade }
        }
        (None, Some(base)) => ResolvedMain {
            layout: as_fallback(&base.panels.main.layout),
            shade: base.panels.main.shade.as_ref().map(as_fallback),
        },
        (None, None) => return Err("skin.json: panels.main is required".into()),
    };

    let empty = FramePanel::default();
    let library = r.frame_panel(m.panels.library.as_ref().unwrap_or(&empty), "panels.library", &mut warnings)?;
    let settings = r.frame_panel(m.panels.settings.as_ref().unwrap_or(&empty), "panels.settings", &mut warnings)?;
    let details = r.frame_panel(m.panels.details.as_ref().unwrap_or(&empty), "panels.details", &mut warnings)?;
    let (library, settings, details) = match base {
        Some(base) => (
            merge_frame(library, m.panels.library.as_ref(), &base.panels.library),
            merge_frame(settings, m.panels.settings.as_ref(), &base.panels.settings),
            merge_frame(details, m.panels.details.as_ref(), &base.panels.details),
        ),
        None => (library, settings, details),
    };

    let mut presets = Vec::new();
    for (i, preset) in m.visualizer.as_ref().map(|v| v.presets.as_slice()).unwrap_or_default().iter().enumerate() {
        presets.push(r.preset(preset, &format!("visualizer.presets[{i}]"))?);
    }
    if presets.is_empty()
        && let Some(base) = base
    {
        presets = base.visualizer.presets.clone();
    }

    Ok(ResolvedSkin {
        id: m.id,
        name: m.name,
        author: m.author,
        version: m.version,
        description: m.description,
        dir,
        builtin: false,
        colors,
        fonts,
        panels: ResolvedPanels { main, library, settings, details },
        visualizer: ResolvedVisualizer { presets },
        warnings,
    })
}

fn as_fallback(layout: &ResolvedLayout) -> ResolvedLayout {
    let mut layout = layout.clone();
    for el in layout.elements.values_mut() {
        el.fallback = true;
    }
    layout
}

/// Adds the base layout's elements that `layout` lacks, where they fit.
fn fill_from(layout: &mut ResolvedLayout, base: &ResolvedLayout, at: &str, warnings: &mut Vec<String>) {
    for (name, el) in &base.elements {
        if layout.elements.contains_key(name) {
            continue;
        }
        if rect_fits(&el.rect, layout.size) {
            layout.elements.insert(name.clone(), ResolvedElement { fallback: true, ..el.clone() });
        } else {
            warnings.push(format!(
                "skin.json: {at}.elements.{name} is not defined, and the Default skin's {} doesn't fit this panel; it is left out",
                fmt_rect(&el.rect)
            ));
        }
    }
}

/// Fills a frame panel's unset fields from the base skin's.
fn merge_frame(mut p: ResolvedFramePanel, raw: Option<&FramePanel>, base: &ResolvedFramePanel) -> ResolvedFramePanel {
    let raw = raw.cloned().unwrap_or_default();
    if raw.min_size.is_none() {
        p.min_size = base.min_size;
    }
    if raw.resizable.is_none() {
        p.resizable = base.resizable;
    }
    if raw.frame.is_none() {
        p.frame = base.frame.clone();
    }
    if raw.scrollbar.is_none() {
        p.scrollbar = base.scrollbar.clone();
    }
    if raw.title.is_none() {
        p.title = base.title.clone();
    }
    if raw.close.is_none() {
        p.close = base.close.clone();
    }
    if raw.menu.is_none() {
        p.menu = base.menu.clone();
    }
    if raw.grip.is_none() {
        p.grip = base.grip;
    }
    for (key, value) in &base.table {
        p.table.entry(key.clone()).or_insert_with(|| value.clone());
    }
    for (key, value) in &base.controls {
        p.controls.entry(key.clone()).or_insert_with(|| value.clone());
    }
    p
}
