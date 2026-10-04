//! `skin.json` as written by skin authors (see `skin.schema.json` at the repo
//! root). Unknown keys are tolerated (and reported as warnings) so newer
//! skins still load in older app versions.

use std::collections::BTreeMap;

use serde::Deserialize;

/// The only manifest format this version understands.
pub const FORMAT: u32 = 1;

/// `[x, y, width, height]` in points, relative to the panel's top left.
pub type Rect = [i64; 4];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    #[serde(rename = "$schema", default)]
    pub schema: Option<String>,
    pub format: u32,
    /// Reverse-DNS, e.g. `com.example.green-machine`.
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    /// Color tokens (`#rgb`, `#rrggbb` or `#rrggbbaa`), referenced elsewhere as `@name`.
    #[serde(default)]
    pub colors: BTreeMap<String, String>,
    #[serde(default)]
    pub fonts: BTreeMap<String, FontDef>,
    #[serde(default)]
    pub panels: Panels,
    #[serde(default)]
    pub visualizer: Option<VisualizerDef>,
}

/// A bitmap font: `glyphs[i]` is cell `i` of `sprite`, read left to right,
/// top to bottom.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FontDef {
    pub sprite: String,
    pub glyphs: String,
    /// `[width, height]` of one glyph cell.
    pub cell: [i64; 2],
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Panels {
    #[serde(default)]
    pub main: Option<MainPanel>,
    #[serde(default)]
    pub library: Option<FramePanel>,
    #[serde(default)]
    pub settings: Option<FramePanel>,
    /// The details panel for the selected recording(s).
    #[serde(default)]
    pub details: Option<FramePanel>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MainPanel {
    pub size: [i64; 2],
    #[serde(default)]
    pub background: Option<String>,
    #[serde(default)]
    pub drag_region: Vec<Rect>,
    #[serde(default)]
    pub elements: BTreeMap<String, ElementDef>,
    /// The collapsed one-line layout ("window shade").
    #[serde(default)]
    pub shade: Option<Layout>,
    #[serde(default)]
    pub animations: Vec<AnimationDef>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Layout {
    pub size: [i64; 2],
    #[serde(default)]
    pub background: Option<String>,
    #[serde(default)]
    pub drag_region: Vec<Rect>,
    #[serde(default)]
    pub elements: BTreeMap<String, ElementDef>,
    #[serde(default)]
    pub animations: Vec<AnimationDef>,
}

impl MainPanel {
    pub fn layout(&self) -> Layout {
        Layout {
            size: self.size,
            background: self.background.clone(),
            drag_region: self.drag_region.clone(),
            elements: self.elements.clone(),
            animations: self.animations.clone(),
        }
    }
}

/// A decorative sprite animation (spinning tape reels, blinking LEDs…):
/// cycles through sprite `frames` at `fps` while the recorder is in the
/// `play` state.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationDef {
    #[serde(default)]
    pub name: Option<String>,
    pub rect: Rect,
    pub sprite: SpriteDef,
    /// Sprite states in playing order.
    pub frames: Vec<String>,
    #[serde(default)]
    pub fps: Option<f64>,
    /// "recording" (default; stops when paused), "active" (recording or
    /// paused) or "always".
    #[serde(default)]
    pub play: Option<String>,
    /// "constant" (default) or "level": faster when louder.
    #[serde(default)]
    pub speed: Option<String>,
}

pub const ANIMATION_PLAY: &[&str] = &["recording", "active", "always"];
pub const ANIMATION_SPEED: &[&str] = &["constant", "level"];
pub const VISUALIZER_STYLES: &[&str] = &["bars", "scope", "mirror", "radial", "fire"];

/// One element of a layout. With only a `rect` it's an invisible hot spot
/// over artwork painted into the background.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementDef {
    pub rect: Rect,
    #[serde(default)]
    pub sprite: Option<SpriteDef>,
    /// Name of a sprite font from `fonts`.
    #[serde(default)]
    pub font: Option<String>,
    /// System-font text, when no sprite font is used.
    #[serde(default)]
    pub text: Option<TextStyle>,
    /// "left" (default), "center" or "right" for text elements.
    #[serde(default)]
    pub align: Option<String>,
    /// Element-specific parameters (e.g. the level meter's colors), passed
    /// to the UI with `@token` colors resolved.
    #[serde(default)]
    pub style: Option<serde_json::Map<String, serde_json::Value>>,
}

/// Cells of a sprite sheet, all of the element's size: `states` maps a state
/// (normal, pressed, active, disabled, …) to the cell's top-left corner.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpriteDef {
    pub image: String,
    pub states: BTreeMap<String, [i64; 2]>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextStyle {
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub size: Option<f64>,
    #[serde(default)]
    pub family: Option<String>,
    /// "normal" or "bold".
    #[serde(default)]
    pub weight: Option<String>,
    #[serde(default)]
    pub uppercase: Option<bool>,
}

/// The library and settings panels: resizable windows drawn with a
/// nine-slice frame.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FramePanel {
    #[serde(default)]
    pub min_size: Option<[i64; 2]>,
    #[serde(default)]
    pub resizable: Option<bool>,
    #[serde(default)]
    pub frame: Option<FrameDef>,
    /// Table colors: background, alternate, text, selection, selectionText,
    /// header, headerText, grid.
    #[serde(default)]
    pub table: Option<BTreeMap<String, String>>,
    #[serde(default)]
    pub scrollbar: Option<ScrollbarDef>,
    /// Control colors: background, text, border, accent, button, buttonText.
    #[serde(default)]
    pub controls: Option<BTreeMap<String, String>>,
    /// The window title, drawn in the frame's top strip.
    #[serde(default)]
    pub title: Option<TitleDef>,
    /// The close button, placed from the top right corner.
    #[serde(default)]
    pub close: Option<CloseDef>,
    /// Size of the resize hot corner at the bottom right (resizable panels).
    #[serde(default)]
    pub grip: Option<[i64; 2]>,
}

/// Title text: a sprite font (or the system font when omitted), its
/// top-left corner `offset` from the panel's top left.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TitleDef {
    #[serde(default)]
    pub font: Option<String>,
    pub offset: [i64; 2],
    /// System-font color when there's no sprite font.
    #[serde(default)]
    pub color: Option<String>,
}

/// A frame's close button: `offset` is [right, top] from the top right
/// corner; the sprite needs a "normal" state.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloseDef {
    pub offset: [i64; 2],
    pub size: [i64; 2],
    pub sprite: SpriteDef,
}

/// A nine-slice frame: `slice` is the `[top, right, bottom, left]` inset
/// whose corners stay fixed while the edges and center stretch.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameDef {
    pub image: String,
    pub slice: [i64; 4],
}

/// Scroll bar parts in `image`: the track (stretched) and the thumb.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrollbarDef {
    pub image: String,
    pub track: Rect,
    pub thumb: Rect,
    /// `[top, right, bottom, left]` nine-slice inset for stretching the thumb.
    #[serde(default)]
    pub thumb_slice: Option<[i64; 4]>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualizerDef {
    /// Analyzer/renderer presets; interpreted by the visualizer (phase 2).
    #[serde(default)]
    pub presets: Vec<serde_json::Value>,
}

/// Elements the main panel and its shade layout know about.
pub const MAIN_ELEMENTS: &[&str] = &[
    "record",
    "pause",
    "stop",
    "elapsed",
    "status",
    "source",
    "levels",
    "visualizer",
    "toggleLibrary",
    "toggleSettings",
    "minimize",
    "shade",
    "close",
];

/// Sprite states an element must define when it has a sprite.
pub fn required_states(element: &str) -> &'static [&'static str] {
    match element {
        "status" => &["idle"],
        "levels" => &["off", "on"],
        "elapsed" | "source" | "visualizer" => &[],
        _ => &["normal"],
    }
}

pub const TABLE_COLORS: &[&str] =
    &["background", "alternate", "text", "selection", "selectionText", "header", "headerText", "grid"];
pub const CONTROL_COLORS: &[&str] = &["background", "text", "border", "accent", "button", "buttonText"];
