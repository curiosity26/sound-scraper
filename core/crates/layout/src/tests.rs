use super::*;

fn panel(id: &str, x: f64, y: f64, w: f64, h: f64) -> Panel {
    Panel { id: id.into(), frame: Rect::new(x, y, w, h), visible: true, resizable: false, min_w: 0.0, min_h: 0.0 }
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
fn a_column_with_main_is_locked_to_its_width() {
    // Library flush under main: only its height can change; what's below it
    // follows, and settings beside main doesn't move.
    let mut s = scene();
    s.panels.push(panel("extra", 100.0, 550.0, 420.0, 50.0));
    let resize = Resize::begin(s, "library", 300.0, 200.0).unwrap();
    let out = resize.update(50.0, 30.0, false);
    assert_eq!(frame(&out, "library"), Rect::new(100.0, 250.0, 420.0, 330.0));
    assert_eq!(frame(&out, "extra"), Rect::new(100.0, 580.0, 420.0, 50.0));
    assert!(out.iter().all(|p| p.id != "main" && p.id != "settings"), "{out:?}");
    let out = resize.update(0.0, -1000.0, false);
    assert_eq!(frame(&out, "library").h, 200.0, "minimum height");
}

#[test]
fn a_free_column_shares_its_width() {
    // Library and settings stacked flush, away from main; a panel docked to
    // the settings' right edge.
    let s = Scene {
        panels: vec![
            panel("main", 0.0, 0.0, 420.0, 150.0),
            panel("library", 600.0, 100.0, 400.0, 300.0),
            panel("settings", 600.0, 400.0, 400.0, 200.0),
            panel("side", 1000.0, 450.0, 100.0, 100.0),
        ],
        screens: vec![],
    };
    let out = Resize::begin(s, "library", 100.0, 100.0).unwrap().update(60.0, 20.0, false);
    assert_eq!(frame(&out, "library"), Rect::new(600.0, 100.0, 460.0, 320.0));
    assert_eq!(frame(&out, "settings"), Rect::new(600.0, 420.0, 460.0, 200.0));
    assert_eq!(frame(&out, "side"), Rect::new(1060.0, 470.0, 100.0, 100.0));
    assert!(out.iter().all(|p| p.id != "main"));
}

#[test]
fn nearly_aligned_panels_join_the_column_and_line_up() {
    // A library 2 points off main's left edge (and 2 narrower) is still in
    // main's column: when main changes width it lines up exactly.
    let s = Scene {
        panels: vec![panel("main", 310.0, 115.0, 840.0, 300.0), panel("library", 312.0, 415.0, 838.0, 480.0)],
        screens: vec![],
    };
    assert_eq!(s.column(0), [0, 1]);
    let out = Resize::begin(s, "main", 1.0, 1.0).unwrap().update(-420.0, -150.0, false);
    assert_eq!(frame(&out, "library"), Rect::new(310.0, 265.0, 420.0, 480.0));
}

#[test]
fn resize_snaps_edges() {
    let mut s = scene();
    s.panels[1].frame.x = 600.0; // library away from main's column
    s.panels[2].visible = false;
    s.panels.push(panel("other", 1200.0, 300.0, 100.0, 100.0));
    let resize = Resize::begin(s, "library", 100.0, 100.0).unwrap();
    // Right edge to 1194: snaps to "other"'s left edge (1200).
    let out = resize.update(1194.0 - 1020.0, 0.0, true);
    assert_eq!(frame(&out, "library").right(), 1200.0);
}

#[test]
fn double_size_scales_the_docked_group() {
    let mut s = scene();
    s.panels.push(panel("loose", 1500.0, 700.0, 200.0, 100.0));
    s.screens = vec![Rect::new(0.0, 25.0, 3000.0, 2000.0)];
    let out = s.scale(2.0);
    assert_eq!(frame(&out, "main"), Rect::new(100.0, 100.0, 840.0, 300.0));
    assert_eq!(frame(&out, "library"), Rect::new(100.0, 400.0, 840.0, 600.0));
    assert_eq!(frame(&out, "settings"), Rect::new(940.0, 100.0, 600.0, 800.0));
    // It grows in place, but settings now covers that spot, so it moves.
    let loose = frame(&out, "loose");
    assert_eq!((loose.w, loose.h), (400.0, 200.0));
    assert!(!overlaps(&loose, &frame(&out, "settings")));
    // And back.
    let back = Scene {
        panels: out.iter().map(|p| panel(&p.id, p.frame.x, p.frame.y, p.frame.w, p.frame.h)).collect(),
        screens: s.screens.clone(),
    };
    let again = back.scale(0.5);
    for p in s.panels.iter().filter(|p| p.id != "loose") {
        assert_eq!(frame(&again, &p.id), p.frame, "{}", p.id);
    }
    // Capped to the screen.
    let mut tall = scene();
    tall.panels[2].frame.h = 700.0;
    assert_eq!(frame(&tall.scale(2.0), "settings").h, 1000.0);
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
fn docked_groups_keep_their_shape_when_main_changes_size() {
    // Double size off: main shrinks 840×300 → 420×150. The library (below
    // main) and settings (right of main, and of the library) each follow
    // only the main edge they touch.
    let s = Scene {
        panels: vec![
            panel("main", 200.0, 120.0, 840.0, 300.0),
            panel("library", 200.0, 420.0, 840.0, 480.0),
            panel("settings", 1040.0, 120.0, 520.0, 640.0),
        ],
        screens: vec![],
    };
    let resize = Resize::begin(s, "main", 1.0, 1.0).unwrap();
    let out = resize.update(-420.0, -150.0, false);
    // The library was as wide as main, so it stays as wide; settings stays
    // docked to the right of both, with no overlap.
    assert_eq!(frame(&out, "library"), Rect::new(200.0, 270.0, 420.0, 480.0));
    assert_eq!(frame(&out, "settings"), Rect::new(620.0, 120.0, 520.0, 640.0));
    let (lib, set) = (frame(&out, "library"), frame(&out, "settings"));
    assert!(touching(&lib, &set) && !lib.intersects(&set));
    // And back to double size from there.
    let shrunk = Scene {
        panels: vec![
            panel("main", 200.0, 120.0, 420.0, 150.0),
            panel("library", lib.x, lib.y, lib.w, lib.h),
            panel("settings", set.x, set.y, set.w, set.h),
        ],
        screens: vec![],
    };
    let out = Resize::begin(shrunk, "main", 1.0, 1.0).unwrap().update(420.0, 150.0, false);
    assert_eq!(frame(&out, "library"), Rect::new(200.0, 420.0, 840.0, 480.0));
    assert_eq!(frame(&out, "settings"), Rect::new(1040.0, 120.0, 520.0, 640.0));
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
    let layout = SavedLayout { version: 1, panels: scene().panels, scale: Some(2.0) };
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

#[test]
fn a_panel_docked_beside_a_stack_spans_it() {
    // Main (300 tall) over the library (480): settings dropped beside them,
    // tops aligned, stretches to the stack's 780.
    let mut settings = panel("settings", 1500.0, 500.0, 520.0, 640.0);
    settings.resizable = true;
    settings.min_h = 400.0;
    let s = Scene {
        panels: vec![panel("main", 200.0, 120.0, 840.0, 300.0), panel("library", 200.0, 420.0, 840.0, 480.0), settings],
        screens: vec![],
    };
    let drag = Drag::begin(s.clone(), "settings").unwrap();
    let out = drag.update(1043.0 - 1500.0, 123.0 - 500.0, true);
    assert_eq!(frame(&out, "settings"), Rect::new(1040.0, 120.0, 520.0, 780.0));
    // Option held: no snapping, no stretching.
    assert_eq!(frame(&drag.update(1043.0 - 1500.0, 123.0 - 500.0, false), "settings").h, 640.0);
    // Not resizable: keeps its height.
    let mut fixed = s.clone();
    fixed.panels[2].resizable = false;
    let out = Drag::begin(fixed, "settings").unwrap().update(1043.0 - 1500.0, 123.0 - 500.0, true);
    assert_eq!(frame(&out, "settings").h, 640.0);
    // Way off (a stack more than twice its height): keeps its height.
    let mut small = s;
    small.panels[2].frame.h = 300.0;
    let out = Drag::begin(small, "settings").unwrap().update(1043.0 - 1500.0, 123.0 - 500.0, true);
    assert_eq!(frame(&out, "settings").h, 300.0);
}

#[test]
fn tidy_straightens_a_saved_layout() {
    // Alex's layout: the library 2 points off main's column, settings beside
    // them but 180 points taller than the stack.
    let mut settings = panel("settings", 1150.0, 115.0, 840.0, 960.0);
    settings.resizable = true;
    let s = Scene {
        panels: vec![panel("main", 310.0, 115.0, 840.0, 300.0), panel("library", 312.0, 415.0, 838.0, 480.0), settings],
        screens: vec![],
    };
    let out = s.tidy();
    assert_eq!(frame(&out, "library"), Rect::new(310.0, 415.0, 840.0, 480.0));
    assert_eq!(frame(&out, "settings"), Rect::new(1150.0, 115.0, 840.0, 780.0));
    assert!(scene().tidy().is_empty(), "a tidy layout stays put");
    // A library under main isn't stretched to the settings beside it, even
    // with their bottoms lined up; settings (a side panel) spans the stack.
    let mut lib = panel("library", 310.0, 265.0, 420.0, 240.0);
    lib.resizable = true;
    let mut set = panel("settings", 730.0, 115.0, 360.0, 300.0);
    set.resizable = true;
    let s = Scene { panels: vec![panel("main", 310.0, 115.0, 420.0, 150.0), lib, set], screens: vec![] };
    let out = s.tidy();
    assert!(out.iter().all(|p| p.id != "library"), "{out:?}");
    assert_eq!(frame(&out, "settings"), Rect::new(730.0, 115.0, 360.0, 390.0));
}

#[test]
fn resizing_snaps_the_bottom_to_a_neighbor_stack() {
    let mut s = scene();
    s.panels[2].frame = Rect::new(520.0, 100.0, 300.0, 400.0); // settings beside main+library (bottom 550)
    let out = Resize::begin(s, "settings", 100.0, 100.0).unwrap().update(0.0, 56.0, true); // bottom to 556, 6 below the stack
    assert_eq!(frame(&out, "settings").bottom(), 550.0);
}

#[test]
fn opening_a_panel_avoids_the_others() {
    // Main over the library, details docked right of the library. Settings'
    // default spot (right of main, 400 tall) would cover details.
    let s = Scene {
        panels: vec![
            panel("main", 100.0, 100.0, 420.0, 150.0),
            panel("library", 100.0, 250.0, 420.0, 240.0),
            panel("details", 520.0, 250.0, 300.0, 320.0),
            Panel { visible: false, ..panel("settings", 0.0, 0.0, 1.0, 1.0) },
        ],
        screens: vec![Rect::new(0.0, 25.0, 1920.0, 1000.0)],
    };
    let want = Rect::new(520.0, 100.0, 360.0, 400.0);
    let got = s.place("settings", want);
    assert_eq!(got, Rect::new(820.0, 100.0, 360.0, 400.0), "right of the group, top-aligned");
    // A free spot is kept.
    assert_eq!(s.place("settings", Rect::new(1200.0, 100.0, 360.0, 400.0)), Rect::new(1200.0, 100.0, 360.0, 400.0));
    // Touching edges isn't overlapping.
    assert_eq!(s.place("settings", Rect::new(520.0, 100.0, 360.0, 150.0)), Rect::new(520.0, 100.0, 360.0, 150.0));
    // No room on the screen to the right: goes elsewhere on screen.
    let mut narrow = s.clone();
    narrow.screens = vec![Rect::new(0.0, 25.0, 1000.0, 1000.0)];
    let got = narrow.place("settings", want);
    assert!(got.right() <= 1000.0 && got.y >= 25.0, "{got:?}");
    for p in &narrow.panels[..3] {
        assert!(!got.intersects(&p.frame), "{got:?} overlaps {}", p.id);
    }
}

/// Applies placements and checks no two visible panels overlap.
fn assert_overlap_free(s: &Scene, out: &[Placement]) {
    let mut scene = s.clone();
    for p in out {
        let i = scene.index(&p.id).unwrap();
        scene.panels[i].frame = p.frame;
    }
    let v: Vec<&Panel> = scene.panels.iter().filter(|p| p.visible).collect();
    for (i, a) in v.iter().enumerate() {
        for b in &v[i + 1..] {
            assert!(!overlaps(&a.frame, &b.frame), "{} overlaps {}: {:?} {:?}", a.id, b.id, a.frame, b.frame);
        }
    }
}

#[test]
fn the_app_never_creates_overlaps() {
    let mut set = panel("settings", 520.0, 100.0, 300.0, 400.0);
    set.resizable = true;
    let mut det = panel("details", 820.0, 100.0, 300.0, 320.0);
    det.resizable = true;
    let base = Scene {
        panels: vec![panel("main", 100.0, 100.0, 420.0, 150.0), panel("library", 100.0, 250.0, 420.0, 240.0), set, det],
        screens: vec![Rect::new(0.0, 25.0, 1920.0, 1000.0)],
    };
    // Double size and back.
    assert_overlap_free(&base, &base.scale(2.0));
    // A loose panel the group grows into moves to a free spot.
    let mut loose = base.clone();
    loose.panels.push(panel("loose", 600.0, 700.0, 200.0, 100.0));
    loose.screens = vec![Rect::new(0.0, 25.0, 3000.0, 2000.0)];
    let out = loose.scale(2.0);
    assert_overlap_free(&loose, &out);
    assert_ne!(frame(&out, "loose"), Rect::new(600.0, 700.0, 400.0, 200.0));
    // Tidy: settings spans the stack only if nothing is in the way.
    assert_overlap_free(&base, &base.tidy());
    let mut blocked = base.clone();
    blocked.panels[2].frame = Rect::new(520.0, 100.0, 300.0, 200.0);
    blocked.panels[2].resizable = true;
    blocked.panels.push(panel("below", 520.0, 300.0, 300.0, 100.0));
    assert!(blocked.tidy().iter().all(|p| p.id != "settings"), "can't span over 'below'");
    // Opening details, then settings, in either order.
    for (first, second) in [("details", "settings"), ("settings", "details")] {
        let mut s = base.clone();
        s.panels[2].visible = false;
        s.panels[3].visible = false;
        let a = s.index(first).unwrap();
        s.panels[a].frame = s.place(first, Rect::new(520.0, 100.0, 300.0, 400.0));
        s.panels[a].visible = true;
        let spot = s.place(second, Rect::new(520.0, 100.0, 300.0, 400.0));
        assert_overlap_free(&s, &[Placement { id: second.into(), frame: spot }]);
    }
    // The user may overlap panels: a resize into a neighbor stays as asked.
    let mut apart = base.clone();
    apart.panels[3].frame.x = 900.0; // details not docked to settings
    let out = Resize::begin(apart, "settings", 100.0, 100.0).unwrap().update(200.0, 0.0, false);
    assert_eq!(frame(&out, "settings").w, 500.0);
    assert!(out.iter().all(|p| p.id != "details"), "details isn't pushed");
}

#[test]
fn placing_on_a_crowded_screen_shrinks_or_overlaps_least() {
    // Double size on a laptop: main+library 840 wide, details 480 to the
    // left; settings (920×780) can't fit anywhere at its size.
    let mut settings = panel("settings", -163.0, 326.0, 920.0, 780.0);
    settings.visible = false;
    settings.resizable = true;
    settings.min_w = 280.0;
    settings.min_h = 280.0;
    let s = Scene {
        panels: vec![
            panel("main", 757.0, 326.0, 840.0, 300.0),
            panel("library", 757.0, 626.0, 840.0, 480.0),
            panel("details", 277.0, 326.0, 480.0, 640.0),
            settings,
        ],
        screens: vec![Rect::new(0.0, 33.0, 1728.0, 1084.0)],
    };
    let got = s.place("settings", Rect::new(-163.0, 326.0, 920.0, 780.0));
    assert!(got.x >= 0.0 && got.right() <= 1728.0 && got.y >= 33.0, "on screen: {got:?}");
    for p in &s.panels[..3] {
        assert!(!overlaps(&got, &p.frame), "{got:?} covers {}", p.id);
    }
    // Not resizable: on screen, as little overlap as possible.
    let mut fixed = s.clone();
    fixed.panels[3].resizable = false;
    let got = fixed.place("settings", Rect::new(-163.0, 326.0, 920.0, 780.0));
    assert!(got.x >= 0.0 && got.right() <= 1728.0, "on screen: {got:?}");
}
