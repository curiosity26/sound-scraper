use super::*;

fn panel(id: &str, x: f64, y: f64, w: f64, h: f64) -> Panel {
    Panel { id: id.into(), frame: Rect::new(x, y, w, h), visible: true }
}

/// Main at (100,100) 420×150; library docked below it; settings docked to
/// its right; one big screen.
fn scene() -> Scene {
    Scene {
        panels: vec![
            panel("main", 100.0, 100.0, 420.0, 150.0),
            panel("library", 100.0, 250.0, 420.0, 300.0),
            panel("settings", 520.0, 100.0, 300.0, 400.0),
        ],
        screens: vec![Rect::new(0.0, 25.0, 1920.0, 1000.0)],
    }
}

fn frame(out: &[Placement], id: &str) -> Rect {
    out.iter().find(|p| p.id == id).unwrap_or_else(|| panic!("{id} not placed: {out:?}")).frame
}

#[test]
fn docked_chain_follows_touching_edges() {
    let s = scene();
    assert_eq!(s.docked_to_main(), ["library", "settings"]);
    let mut apart = s.clone();
    apart.panels[2].frame.x += 5.0;
    assert_eq!(apart.docked_to_main(), ["library"]);
    // Hidden panels don't dock; chains are transitive.
    let mut chain = s.clone();
    chain.panels[1].visible = false;
    chain.panels[2].frame = Rect::new(100.0, 550.0, 300.0, 100.0);
    assert!(chain.docked_to_main().is_empty());
    chain.panels[1].visible = true;
    assert_eq!(chain.docked_to_main(), ["library", "settings"]);
    // Corners alone don't count.
    assert!(!touching(&Rect::new(0.0, 0.0, 10.0, 10.0), &Rect::new(10.0, 10.0, 10.0, 10.0)));
}

#[test]
fn dragging_main_moves_the_docked_chain() {
    let drag = Drag::begin(scene(), "main").unwrap();
    let out = drag.update(300.0, 200.0, true);
    assert_eq!(out.len(), 3);
    assert_eq!(frame(&out, "main"), Rect::new(400.0, 300.0, 420.0, 150.0));
    assert_eq!(frame(&out, "library"), Rect::new(400.0, 450.0, 420.0, 300.0));
    assert_eq!(frame(&out, "settings"), Rect::new(820.0, 300.0, 300.0, 400.0));
}

#[test]
fn dragging_a_side_panel_detaches_it() {
    let drag = Drag::begin(scene(), "library").unwrap();
    let out = drag.update(0.0, 100.0, true);
    assert_eq!(out.len(), 1);
    assert_eq!(frame(&out, "library").y, 350.0);
}

#[test]
fn panels_snap_to_dock_and_align() {
    let mut s = scene();
    s.panels[1].frame = Rect::new(700.0, 600.0, 420.0, 300.0); // library far away
    s.panels[2].visible = false;
    let drag = Drag::begin(s, "library").unwrap();
    // Dropped 6 points below main and 4 to the right: docks under it, left
    // edges aligned.
    let out = drag.update(100.0 - 700.0 + 4.0, 256.0 - 600.0, true);
    assert_eq!(frame(&out, "library"), Rect::new(100.0, 250.0, 420.0, 300.0));
    // Option held: no snapping.
    let out = drag.update(100.0 - 700.0 + 4.0, 256.0 - 600.0, false);
    assert_eq!(frame(&out, "library"), Rect::new(104.0, 256.0, 420.0, 300.0));
    // Far away: no snapping either.
    let out = drag.update(-300.0, -100.0, true);
    assert_eq!(frame(&out, "library"), Rect::new(400.0, 500.0, 420.0, 300.0));
}

#[test]
fn panels_snap_side_by_side() {
    let mut s = scene();
    s.panels[2].frame = Rect::new(900.0, 400.0, 300.0, 400.0);
    let drag = Drag::begin(s, "settings").unwrap();
    // 7 points right of main, 3 below its top: docks to its right edge with
    // tops aligned.
    let out = drag.update(527.0 - 900.0, 103.0 - 400.0, true);
    assert_eq!(frame(&out, "settings"), Rect::new(520.0, 100.0, 300.0, 400.0));
}

#[test]
fn panels_snap_to_screen_edges() {
    let mut s = scene();
    s.panels.truncate(1);
    let drag = Drag::begin(s, "main").unwrap();
    let out = drag.update(-95.0, -70.0, true); // to (5, 30)
    assert_eq!(frame(&out, "main"), Rect::new(0.0, 25.0, 420.0, 150.0));
    let out = drag.update(1920.0 - 520.0 - 8.0, 0.0, true); // right edge 8 from screen edge
    assert_eq!(frame(&out, "main").x, 1920.0 - 420.0);
}

#[test]
fn resizing_keeps_panels_on_moving_edges_attached() {
    // Library below main, settings docked to the library's right edge, and
    // a panel under the library.
    let mut s = scene();
    s.panels[2].frame = Rect::new(520.0, 250.0, 300.0, 200.0);
    s.panels.push(panel("extra", 100.0, 550.0, 200.0, 50.0));
    let resize = Resize::begin(s, "library", 300.0, 200.0).unwrap();
    let out = resize.update(50.0, 30.0, false);
    assert_eq!(frame(&out, "library"), Rect::new(100.0, 250.0, 470.0, 330.0));
    assert_eq!(frame(&out, "settings"), Rect::new(570.0, 250.0, 300.0, 200.0));
    assert_eq!(frame(&out, "extra"), Rect::new(100.0, 580.0, 200.0, 50.0));
    // Main (on the fixed top edge) stays put.
    assert!(out.iter().all(|p| p.id != "main"));
    // Minimum size.
    let out = resize.update(-1000.0, -1000.0, false);
    assert_eq!((frame(&out, "library").w, frame(&out, "library").h), (300.0, 200.0));
}

#[test]
fn resize_snaps_edges() {
    let mut s = scene();
    s.panels[2].visible = false;
    s.panels.push(panel("other", 700.0, 300.0, 100.0, 100.0));
    let resize = Resize::begin(s, "library", 100.0, 100.0).unwrap();
    // Right edge to 694: snaps to "other"'s left edge (700).
    let out = resize.update(694.0 - 520.0, 0.0, true);
    assert_eq!(frame(&out, "library").right(), 700.0);
}

#[test]
fn shrinking_main_pulls_docked_panels_up() {
    // Shade mode: main 150 → 18 tall; the library below follows.
    let mut s = scene();
    s.panels[2].frame.h = 150.0; // docked to main only, not the library
    let resize = Resize::begin(s, "main", 1.0, 1.0).unwrap();
    let out = resize.update(0.0, 18.0 - 150.0, false);
    assert_eq!(frame(&out, "main").h, 18.0);
    assert_eq!(frame(&out, "library").y, 118.0);
    // Settings is on main's right edge: it doesn't move vertically.
    assert!(out.iter().all(|p| p.id != "settings"));
}

#[test]
fn constrain_pulls_offscreen_panels_back() {
    let mut s = scene();
    // Main and its chain way off to the right (a disconnected display).
    for p in &mut s.panels {
        p.frame.x += 3000.0;
    }
    s.panels[2].frame.x += 2.0; // settings no longer docked
    let out = s.constrain();
    let main = frame(&out, "main");
    assert_eq!(main.right(), 1920.0);
    assert_eq!(frame(&out, "library").x, main.x, "library moves with main");
    assert_eq!(frame(&out, "settings").right(), 1920.0, "settings is pulled back on its own");
    // On-screen layouts stay put.
    assert!(scene().constrain().is_empty());
    // A panel above the screen's top comes down.
    let mut high = scene();
    high.panels.truncate(1);
    high.panels[0].frame.y = -200.0;
    assert_eq!(frame(&high.constrain(), "main").y, 25.0);
}

#[test]
fn saves_and_loads() {
    let dir = std::env::temp_dir().join(format!("ss-layout-test-{}", std::process::id()));
    let path = dir.join("layout.json");
    assert!(load_from(&path).is_none());
    let layout = SavedLayout { version: 1, panels: scene().panels };
    save_to(&path, &layout).unwrap();
    assert_eq!(load_from(&path).unwrap(), layout);
    let json = std::fs::read_to_string(&path).unwrap();
    assert!(json.contains("\"id\": \"library\"") && json.contains("\"x\": 100.0"), "{json}");
    std::fs::write(&path, "nonsense").unwrap();
    assert!(load_from(&path).is_none());
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn unknown_panels_are_errors() {
    assert!(Drag::begin(scene(), "nope").is_err());
    assert!(Resize::begin(scene(), "nope", 1.0, 1.0).is_err());
}
