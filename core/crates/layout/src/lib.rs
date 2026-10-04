//! Panel layout: where the main panel, library and settings windows sit,
//! how they dock and snap (WinAMP style), and saving it all.
//!
//! Coordinates are global screen points with the origin at the top left
//! and y growing down (the native side converts). Docking is geometric:
//! two visible panels are docked when they touch edge to edge with some
//! overlap, so restoring positions restores the dock graph too.
//!
//! - Dragging the main panel moves everything docked to it (transitively).
//!   Dragging any other panel moves just that panel (detaching it).
//! - While dragging, panel edges snap within [`SNAP`] points to other
//!   panels' edges (docking), to their left/right or top/bottom edges when
//!   stacked (alignment), and to the screens' work areas.
//! - Resizing a panel keeps the panels docked on its moving (right/bottom)
//!   edges attached.

use std::{collections::VecDeque, path::Path};

use serde::{Deserialize, Serialize};

/// Snap distance in points.
pub const SNAP: f64 = 10.0;
/// Edges this close count as touching.
const TOUCH: f64 = 1.0;
/// How much of a panel's top strip must stay on a screen.
const KEEP_VISIBLE: f64 = 40.0;

pub const MAIN: &str = "main";

#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl Rect {
    pub fn new(x: f64, y: f64, w: f64, h: f64) -> Self {
        Self { x, y, w, h }
    }
    fn right(&self) -> f64 {
        self.x + self.w
    }
    fn bottom(&self) -> f64 {
        self.y + self.h
    }
    fn offset(&self, dx: f64, dy: f64) -> Self {
        Self { x: self.x + dx, y: self.y + dy, ..*self }
    }
    /// Overlap of the two [start, end) ranges (negative: the gap).
    fn overlap(a0: f64, a1: f64, b0: f64, b1: f64) -> f64 {
        a1.min(b1) - a0.max(b0)
    }
    fn v_overlap(&self, o: &Rect) -> f64 {
        Self::overlap(self.y, self.bottom(), o.y, o.bottom())
    }
    fn h_overlap(&self, o: &Rect) -> f64 {
        Self::overlap(self.x, self.right(), o.x, o.right())
    }
    fn intersects(&self, o: &Rect) -> bool {
        self.v_overlap(o) > 0.0 && self.h_overlap(o) > 0.0
    }
}

/// A panel window.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Panel {
    pub id: String,
    #[serde(flatten)]
    pub frame: Rect,
    #[serde(default = "yes")]
    pub visible: bool,
}

fn yes() -> bool {
    true
}

/// The windows and screens a gesture works with.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Scene {
    pub panels: Vec<Panel>,
    /// Screen work areas (without menu bar and Dock).
    #[serde(default)]
    pub screens: Vec<Rect>,
}

/// A new frame for a panel.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Placement {
    pub id: String,
    #[serde(flatten)]
    pub frame: Rect,
}

/// Whether `a` and `b` touch edge to edge, overlapping along that edge.
pub fn touching(a: &Rect, b: &Rect) -> bool {
    let side = ((a.right() - b.x).abs() <= TOUCH || (b.right() - a.x).abs() <= TOUCH) && a.v_overlap(b) > 0.0;
    let stack = ((a.bottom() - b.y).abs() <= TOUCH || (b.bottom() - a.y).abs() <= TOUCH) && a.h_overlap(b) > 0.0;
    side || stack
}

impl Scene {
    pub fn index(&self, id: &str) -> Option<usize> {
        self.panels.iter().position(|p| p.id == id)
    }

    /// Visible panels connected to `root` through touching edges, `root`
    /// included (first).
    pub fn docked_chain(&self, root: usize) -> Vec<usize> {
        self.chain_excluding(root, None)
    }

    fn chain_excluding(&self, root: usize, excluded: Option<usize>) -> Vec<usize> {
        let mut seen = vec![false; self.panels.len()];
        seen[root] = true;
        if let Some(e) = excluded {
            seen[e] = true;
        }
        let mut order = vec![root];
        let mut queue = VecDeque::from([root]);
        while let Some(i) = queue.pop_front() {
            for (j, p) in self.panels.iter().enumerate() {
                if !seen[j] && p.visible && touching(&self.panels[i].frame, &p.frame) {
                    seen[j] = true;
                    order.push(j);
                    queue.push_back(j);
                }
            }
        }
        order
    }

    /// Ids of the panels docked to the main panel (not including it).
    pub fn docked_to_main(&self) -> Vec<String> {
        match self.index(MAIN) {
            Some(m) => self.docked_chain(m).into_iter().skip(1).map(|i| self.panels[i].id.clone()).collect(),
            None => Vec::new(),
        }
    }

    /// Moves panels that are (mostly) off-screen back onto the nearest
    /// screen; the main panel brings its docked chain along.
    pub fn constrain(&self) -> Vec<Placement> {
        if self.screens.is_empty() {
            return Vec::new();
        }
        let mut out = Vec::new();
        let mut done = vec![false; self.panels.len()];
        let order: Vec<usize> = self.index(MAIN).into_iter().chain(0..self.panels.len()).collect();
        for i in order {
            if done[i] || !self.panels[i].visible {
                continue;
            }
            let group = if self.panels[i].id == MAIN { self.docked_chain(i) } else { vec![i] };
            group.iter().for_each(|&g| done[g] = true);
            let f = self.panels[i].frame;
            let strip = Rect::new(f.x, f.y, f.w, f.h.min(20.0));
            let visible = self.screens.iter().any(|s| {
                Rect::overlap(strip.x, strip.right(), s.x, s.right()) >= KEEP_VISIBLE.min(f.w)
                    && Rect::overlap(strip.y, strip.bottom(), s.y, s.bottom()) > 0.0
            });
            if visible {
                continue;
            }
            let screen = nearest_screen(&self.screens, &f);
            let dx = clamp_shift(f.x, f.w, screen.x, screen.right());
            let dy = clamp_shift(f.y, f.h, screen.y, screen.bottom());
            for &g in &group {
                let p = &self.panels[g];
                out.push(Placement { id: p.id.clone(), frame: p.frame.offset(dx, dy) });
            }
        }
        out
    }
}

fn nearest_screen<'a>(screens: &'a [Rect], f: &Rect) -> &'a Rect {
    let (cx, cy) = (f.x + f.w / 2.0, f.y + f.h / 2.0);
    let dist = |s: &Rect| {
        let dx = (s.x - cx).max(cx - s.right()).max(0.0);
        let dy = (s.y - cy).max(cy - s.bottom()).max(0.0);
        dx * dx + dy * dy
    };
    screens.iter().min_by(|a, b| dist(a).total_cmp(&dist(b))).expect("screens not empty")
}

/// The shift that brings [start, start+len) inside [lo, hi] (or to lo when
/// it can't fit).
fn clamp_shift(start: f64, len: f64, lo: f64, hi: f64) -> f64 {
    if len >= hi - lo || start < lo {
        lo - start
    } else if start + len > hi {
        hi - (start + len)
    } else {
        0.0
    }
}

/// The best adjustment within [`SNAP`]: smallest in size.
fn best(candidates: impl Iterator<Item = f64>) -> f64 {
    candidates.filter(|d| d.abs() <= SNAP).min_by(|a, b| a.abs().total_cmp(&b.abs())).unwrap_or(0.0)
}

/// Snap adjustments (dx, dy) for `moving` rects against `fixed` rects and
/// screen work areas.
fn snap_group(moving: &[Rect], fixed: &[Rect], screens: &[Rect]) -> (f64, f64) {
    let mut xs = Vec::new();
    let mut ys = Vec::new();
    for m in moving {
        for s in fixed {
            if m.v_overlap(s) > 0.0 {
                xs.extend([s.x - m.right(), s.right() - m.x]); // dock side by side
            }
            if m.v_overlap(s) >= -SNAP {
                xs.extend([s.x - m.x, s.right() - m.right()]); // align when stacked
            }
            if m.h_overlap(s) > 0.0 {
                ys.extend([s.y - m.bottom(), s.bottom() - m.y]); // dock stacked
            }
            if m.h_overlap(s) >= -SNAP {
                ys.extend([s.y - m.y, s.bottom() - m.bottom()]); // align side by side
            }
        }
        for w in screens {
            if m.intersects(w) || m.v_overlap(w) > 0.0 && m.h_overlap(w) > -SNAP {
                xs.extend([w.x - m.x, w.right() - m.right()]);
            }
            if m.intersects(w) || m.h_overlap(w) > 0.0 && m.v_overlap(w) > -SNAP {
                ys.extend([w.y - m.y, w.bottom() - m.bottom()]);
            }
        }
    }
    (best(xs.into_iter()), best(ys.into_iter()))
}

/// A window drag in progress.
pub struct Drag {
    scene: Scene,
    /// Indices of the panels that move.
    moving: Vec<usize>,
}

impl Drag {
    /// Starts dragging `id`: the main panel brings its docked chain; any
    /// other panel moves alone.
    pub fn begin(scene: Scene, id: &str) -> Result<Self, String> {
        let i = scene.index(id).ok_or_else(|| format!("no panel \"{id}\""))?;
        let moving = if id == MAIN { scene.docked_chain(i) } else { vec![i] };
        Ok(Self { scene, moving })
    }

    /// Where the moving panels go for a pointer moved by (dx, dy) since the
    /// drag began; `snap` false (Option held) moves freely.
    pub fn update(&self, dx: f64, dy: f64, snap: bool) -> Vec<Placement> {
        let moved: Vec<Rect> = self.moving.iter().map(|&i| self.scene.panels[i].frame.offset(dx, dy)).collect();
        let (sx, sy) = if snap {
            let fixed: Vec<Rect> = self
                .scene
                .panels
                .iter()
                .enumerate()
                .filter(|(i, p)| p.visible && !self.moving.contains(i))
                .map(|(_, p)| p.frame)
                .collect();
            snap_group(&moved, &fixed, &self.scene.screens)
        } else {
            (0.0, 0.0)
        };
        self.moving
            .iter()
            .zip(moved)
            .map(|(&i, f)| Placement { id: self.scene.panels[i].id.clone(), frame: f.offset(sx, sy) })
            .collect()
    }
}

/// A resize (of the right and bottom edges) in progress.
pub struct Resize {
    scene: Scene,
    index: usize,
    min: (f64, f64),
    /// Panels that follow the right edge, and the bottom edge.
    right: Vec<usize>,
    bottom: Vec<usize>,
}

impl Resize {
    pub fn begin(scene: Scene, id: &str, min_w: f64, min_h: f64) -> Result<Self, String> {
        let index = scene.index(id).ok_or_else(|| format!("no panel \"{id}\""))?;
        let f = scene.panels[index].frame;
        let attached = |edge: &dyn Fn(&Rect) -> bool| -> Vec<usize> {
            let mut out: Vec<usize> = Vec::new();
            for (j, p) in scene.panels.iter().enumerate() {
                if j != index && p.visible && edge(&p.frame) && !out.contains(&j) {
                    for k in scene.chain_excluding(j, Some(index)) {
                        if !out.contains(&k) {
                            out.push(k);
                        }
                    }
                }
            }
            out
        };
        let right = attached(&|p: &Rect| (p.x - f.right()).abs() <= TOUCH && p.v_overlap(&f) > 0.0);
        let bottom = attached(&|p: &Rect| (p.y - f.bottom()).abs() <= TOUCH && p.h_overlap(&f) > 0.0);
        Ok(Self { scene, index, min: (min_w, min_h), right, bottom })
    }

    /// New frames for a size change of (dw, dh) since the resize began.
    pub fn update(&self, dw: f64, dh: f64, snap: bool) -> Vec<Placement> {
        let p = &self.scene.panels[self.index];
        let mut f = Rect { w: (p.frame.w + dw).max(self.min.0), h: (p.frame.h + dh).max(self.min.1), ..p.frame };
        if snap {
            let others: Vec<Rect> = self
                .scene
                .panels
                .iter()
                .enumerate()
                .filter(|(j, q)| q.visible && *j != self.index && !self.right.contains(j) && !self.bottom.contains(j))
                .map(|(_, q)| q.frame)
                .collect();
            let xs = others
                .iter()
                .filter(|s| f.v_overlap(s) >= -SNAP)
                .flat_map(|s| [s.x - f.right(), s.right() - f.right()])
                .chain(self.scene.screens.iter().map(|w| w.right() - f.right()));
            let ys = others
                .iter()
                .filter(|s| f.h_overlap(s) >= -SNAP)
                .flat_map(|s| [s.y - f.bottom(), s.bottom() - f.bottom()])
                .chain(self.scene.screens.iter().map(|w| w.bottom() - f.bottom()));
            let (sx, sy) = (best(xs), best(ys));
            f.w = (f.w + sx).max(self.min.0);
            f.h = (f.h + sy).max(self.min.1);
        }
        let (dx, dy) = (f.w - p.frame.w, f.h - p.frame.h);
        let mut out = vec![Placement { id: p.id.clone(), frame: f }];
        let mut shift = vec![(0.0, 0.0); self.scene.panels.len()];
        for &j in &self.right {
            shift[j].0 = dx;
        }
        for &j in &self.bottom {
            shift[j].1 = dy;
        }
        for (j, (sx, sy)) in shift.into_iter().enumerate() {
            if sx != 0.0 || sy != 0.0 {
                let q = &self.scene.panels[j];
                out.push(Placement { id: q.id.clone(), frame: q.frame.offset(sx, sy) });
            }
        }
        out
    }
}

/// The saved layout (`layout.json` in the app data folder).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct SavedLayout {
    #[serde(default)]
    pub version: u32,
    #[serde(default)]
    pub panels: Vec<Panel>,
}

pub fn load_from(path: &Path) -> Option<SavedLayout> {
    std::fs::read_to_string(path).ok().and_then(|s| serde_json::from_str(&s).ok())
}

pub fn save_to(path: &Path, layout: &SavedLayout) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("creating {}: {e}", dir.display()))?;
    }
    let json = serde_json::to_string_pretty(&SavedLayout { version: 1, ..layout.clone() }).map_err(|e| e.to_string())?;
    let temp = path.with_extension("json.tmp");
    std::fs::write(&temp, json).map_err(|e| format!("writing {}: {e}", temp.display()))?;
    std::fs::rename(&temp, path).map_err(|e| format!("saving {}: {e}", path.display()))
}

#[cfg(test)]
mod tests;
