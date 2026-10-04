import AppKit
import React
import React_RCTAppDelegate

/// A borderless, transparent window drawn by the skin: the main panel, the
/// library or the settings. Mouse-downs in the skin's drag regions (but not
/// over interactive elements) move it, and in the grip resize it, through
/// the window manager so panels dock and snap.
final class SkinPanelWindow: NSWindow {
  let panelID: String
  /// In points from the content's top left.
  var dragRegions: [NSRect] = []
  var holes: [NSRect] = []
  var grip: NSRect?
  weak var manager: WindowController?

  init(panelID: String, size: NSSize) {
    self.panelID = panelID
    super.init(
      contentRect: NSRect(origin: .zero, size: size),
      styleMask: [.borderless, .miniaturizable],
      backing: .buffered,
      defer: false)
    isOpaque = false
    backgroundColor = .clear
    hasShadow = true
    isReleasedWhenClosed = false
    collectionBehavior = [.fullScreenNone]
    // Only the main panel shows in the Dock and Window menu.
    isExcludedFromWindowsMenu = panelID != WindowController.main
  }

  override var canBecomeKey: Bool { true }
  override var canBecomeMain: Bool { true }

  /// Installs a React Native root view with nothing painted behind the
  /// skin, so the art's transparent corners stay see-through.
  func setRootView(_ view: NSView) {
    view.wantsLayer = true
    view.layer?.backgroundColor = NSColor.clear.cgColor
    if view.responds(to: NSSelectorFromString("setBackgroundColor:")) {
      view.setValue(NSColor.clear, forKey: "backgroundColor")
    }
    contentView = view
    invalidateShadow()
  }

  override func sendEvent(_ event: NSEvent) {
    if event.type == .leftMouseDown, let content = contentView, let manager {
      manager.raiseGroup(activating: self)
      let p = event.locationInWindow
      let point = NSPoint(x: p.x, y: content.bounds.height - p.y)
      if let grip, grip.contains(point) {
        manager.trackResize(of: self, event: event)
        return
      }
      if dragRegions.contains(where: { $0.contains(point) }) && !holes.contains(where: { $0.contains(point) }) {
        if event.clickCount == 2 && panelID == WindowController.main {
          manager.onEvent?(WindowController.main, "toggleShade")
        } else {
          manager.trackDrag(of: self, event: event)
        }
        return
      }
    }
    super.sendEvent(event)
  }
}

/// Owns the panel windows (each a React Native root on the shared JS
/// runtime) and their layout: docking, snapping and resizing come from the
/// Rust core (core/crates/layout); this class applies them to AppKit.
///
/// Docked panels are child windows of the main panel, so they move and
/// order with it. Clicking any panel raises the group, and minimizing the
/// main panel takes every panel with it.
@objc(SSWindowController)
final class WindowController: NSObject, NSWindowDelegate {
  @objc static let shared = WindowController()
  static let main = "main"

  var factory: RCTReactNativeFactory?
  private(set) var main: SkinPanelWindow?
  private var panels: [String: SkinPanelWindow] = [:]
  /// (window, event), e.g. ("library", "hidden"); set by the native module.
  @objc var onEvent: ((String, String) -> Void)?
  private var minSizes: [String: NSSize] = [:]
  /// Panels hidden because the main panel was minimized.
  private var hiddenForMinimize: [SkinPanelWindow] = []
  private var saved: [String: [String: Any]] = [:]

  private static let panelSpecs: [String: (module: String, title: String, size: NSSize)] = [
    "library": ("SoundScraperLibrary", "Library", NSSize(width: 840, height: 420)),
    "settings": ("SoundScraperSettings", "Settings", NSSize(width: 460, height: 560)),
  ]

  // MARK: Windows

  func showMain() {
    guard main == nil, let factory else { return }
    saved = loadLayout()
    let window = SkinPanelWindow(panelID: Self.main, size: NSSize(width: 420, height: 150))
    window.title = "Sound Scraper"
    window.manager = self
    window.setRootView(factory.rootViewFactory.view(withModuleName: "SoundScraper"))
    window.delegate = self
    if let s = saved[Self.main], let x = s["x"] as? Double, let y = s["y"] as? Double {
      // The saved size too (the skin sets the real one), so docked panels
      // touch it and follow when the size changes.
      let w = s["w"] as? Double ?? 420
      let h = s["h"] as? Double ?? 150
      window.setFrame(toAppKit(NSRect(x: x, y: y, width: w, height: h)), display: false)
    } else {
      window.center()
    }
    window.makeKeyAndOrderFront(nil)
    main = window
    for name in Self.panelSpecs.keys.sorted() where (saved[name]?["visible"] as? Bool) == true {
      setPanel(name, visible: true)
    }
    constrainToScreens()
    NotificationCenter.default.addObserver(
      self, selector: #selector(screensChanged), name: NSApplication.didChangeScreenParametersNotification, object: nil)
  }

  private func window(_ id: String) -> SkinPanelWindow? {
    id == Self.main ? main : panels[id]
  }

  private var allWindows: [SkinPanelWindow] {
    ([main] + Self.panelSpecs.keys.sorted().map { panels[$0] }).compactMap { $0 }
  }

  /// Sets a panel's skin chrome: drag regions, holes and grip in points from
  /// its top left, its minimum size, and (the main panel's) size. A size
  /// change keeps docked panels on the moving edges attached. `scale` (the
  /// skin scale) is informational: other panels keep the user's size.
  @objc func setPanelLayout(
    _ id: String, width: CGFloat, height: CGFloat, dragRegions: [NSValue], holes: [NSValue], grip: [NSValue],
    minWidth: CGFloat, minHeight: CGFloat, scale: CGFloat
  ) {
    guard let window = window(id) else { return }
    window.dragRegions = dragRegions.map { $0.rectValue }
    window.holes = holes.map { $0.rectValue }
    window.grip = grip.first?.rectValue
    minSizes[id] = NSSize(width: minWidth, height: minHeight)
    var size = window.frame.size
    if width > 0 && height > 0 {
      size = NSSize(width: width, height: height)
    }
    size.width = max(size.width, minWidth)
    size.height = max(size.height, minHeight)
    if size != window.frame.size {
      resize(id, to: size)
    }
    window.invalidateShadow()
  }

  @objc func perform(_ action: String) {
    switch action {
    case "minimize": main?.miniaturize(nil)
    case "quit": NSApp.terminate(nil)
    default: break
    }
  }

  @objc func setPanel(_ name: String, visible: Bool) {
    if visible {
      guard let window = panel(name) else { return }
      window.makeKeyAndOrderFront(nil)
      updateDocking()
      onEvent?(name, "shown")
    } else if let window = panels[name], window.isVisible {
      main?.removeChildWindow(window)
      window.orderOut(nil)
      updateDocking()
      onEvent?(name, "hidden")
    }
    saveLayout()
  }

  @objc func isPanelVisible(_ name: String) -> Bool {
    panels[name]?.isVisible ?? false
  }

  @objc func togglePanel(_ name: String) {
    setPanel(name, visible: !isPanelVisible(name))
  }

  private func panel(_ name: String) -> SkinPanelWindow? {
    if let window = panels[name] { return window }
    guard let spec = Self.panelSpecs[name], let factory, let main else { return nil }
    let window = SkinPanelWindow(panelID: name, size: spec.size)
    window.title = spec.title
    window.manager = self
    window.setRootView(factory.rootViewFactory.view(withModuleName: spec.module))
    window.delegate = self
    if let s = saved[name], let x = s["x"] as? Double, let y = s["y"] as? Double,
      let w = s["w"] as? Double, let h = s["h"] as? Double
    {
      window.setFrame(toAppKit(NSRect(x: x, y: y, width: w, height: h)), display: false)
    } else {
      // First time: docked below (library) or beside (settings) the main panel.
      let m = toTopLeft(main.frame)
      let origin = name == "settings" ? NSPoint(x: m.maxX, y: m.minY) : NSPoint(x: m.minX, y: m.maxY)
      window.setFrame(toAppKit(NSRect(origin: origin, size: spec.size)), display: false)
    }
    panels[name] = window
    return window
  }

  // MARK: Group behavior

  /// Brings every visible panel forward with the clicked one on top.
  func raiseGroup(activating window: SkinPanelWindow) {
    guard NSApp.isActive == false || window != NSApp.keyWindow else { return }
    for w in allWindows where w.isVisible && w !== window && w.parent == nil {
      w.orderFront(nil)
    }
    window.makeKeyAndOrderFront(nil)
  }

  /// Panels docked to the main panel become its child windows (moving and
  /// ordering with it); the others are freed.
  private func updateDocking() {
    guard let main else { return }
    let docked = Set(analyze()?["docked"] as? [String] ?? [])
    for (name, window) in panels {
      let attached = window.parent === main
      if window.isVisible && docked.contains(name) && !attached {
        main.addChildWindow(window, ordered: .above)
      } else if (!window.isVisible || !docked.contains(name)) && attached {
        main.removeChildWindow(window)
      }
    }
  }

  private func constrainToScreens() {
    if let moves = analyze()?["constrain"] as? [[String: Any]], !moves.isEmpty {
      apply(moves)
      updateDocking()
      saveLayout()
    }
  }

  @objc private func screensChanged() {
    constrainToScreens()
  }

  // MARK: Gestures

  func trackDrag(of window: SkinPanelWindow, event: NSEvent) {
    guard let gesture = ss_layout_drag_begin(sceneJSON(), window.panelID) else { return }
    track(window, gesture)
  }

  func trackResize(of window: SkinPanelWindow, event: NSEvent) {
    let min = minSizes[window.panelID] ?? NSSize(width: 100, height: 60)
    guard let gesture = ss_layout_resize_begin(sceneJSON(), window.panelID, min.width, min.height) else { return }
    track(window, gesture)
  }

  /// Follows the mouse until it's released, applying the layout's frames.
  /// Holding Option turns snapping off.
  private func track(_ window: SkinPanelWindow, _ gesture: OpaquePointer) {
    let start = NSEvent.mouseLocation
    window.trackEvents(matching: [.leftMouseDragged, .leftMouseUp], timeout: .infinity, mode: .eventTracking) {
      event, stop in
      guard let event else { return }
      if event.type == .leftMouseUp {
        stop.pointee = true
        return
      }
      let p = NSEvent.mouseLocation
      let snap = !event.modifierFlags.contains(.option)
      self.apply(takeJSON(ss_layout_gesture_update(gesture, p.x - start.x, start.y - p.y, snap)) as? [[String: Any]] ?? [])
    }
    ss_layout_gesture_end(gesture)
    updateDocking()
    saveLayout()
  }

  /// Resizes a panel programmatically (shade mode, double size), keeping
  /// docked panels attached.
  private func resize(_ id: String, to size: NSSize) {
    guard let window = window(id),
      let gesture = ss_layout_resize_begin(sceneJSON(), id, 1, 1)
    else { return }
    let old = window.frame.size
    apply(takeJSON(ss_layout_gesture_update(gesture, size.width - old.width, size.height - old.height, false)) as? [[String: Any]] ?? [])
    ss_layout_gesture_end(gesture)
    updateDocking()
    saveLayout()
  }

  /// Applies `[{"id", "x", "y", "w", "h"}]`, main panel first (its child
  /// windows follow it), then the others.
  private func apply(_ placements: [[String: Any]]) {
    let sorted = placements.sorted { ($0["id"] as? String) == Self.main && ($1["id"] as? String) != Self.main }
    for p in sorted {
      guard let id = p["id"] as? String, let window = window(id),
        let x = p["x"] as? Double, let y = p["y"] as? Double, let w = p["w"] as? Double, let h = p["h"] as? Double
      else { continue }
      window.setFrame(toAppKit(NSRect(x: x, y: y, width: w, height: h)), display: true)
    }
  }

  // MARK: Layout state

  private func sceneJSON() -> String {
    let panels = allWindows.map { w -> [String: Any] in
      let f = toTopLeft(w.frame)
      return ["id": w.panelID, "x": f.minX, "y": f.minY, "w": f.width, "h": f.height, "visible": w.isVisible]
    }
    let screens = NSScreen.screens.map { s -> [String: Any] in
      let f = toTopLeft(s.visibleFrame)
      return ["x": f.minX, "y": f.minY, "w": f.width, "h": f.height]
    }
    let data = try? JSONSerialization.data(withJSONObject: ["panels": panels, "screens": screens])
    return data.flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
  }

  private func analyze() -> [String: Any]? {
    takeJSON(ss_layout_analyze(sceneJSON())) as? [String: Any]
  }

  private func loadLayout() -> [String: [String: Any]] {
    let layout = takeJSON(ss_layout_load()) as? [String: Any]
    var byID: [String: [String: Any]] = [:]
    for p in layout?["panels"] as? [[String: Any]] ?? [] {
      if let id = p["id"] as? String { byID[id] = p }
    }
    return byID
  }

  func saveLayout() {
    guard main != nil else { return }
    let panels = allWindows.map { w -> [String: Any] in
      let f = toTopLeft(w.frame)
      return ["id": w.panelID, "x": f.minX, "y": f.minY, "w": f.width, "h": f.height, "visible": w.isVisible]
    }
    for p in panels {
      if let id = p["id"] as? String { saved[id] = p }
    }
    guard let data = try? JSONSerialization.data(withJSONObject: ["version": 1, "panels": panels]),
      let json = String(data: data, encoding: .utf8)
    else { return }
    if ss_layout_save(json) != SS_STATUS_OK {
      NSLog("Saving the window layout failed: %s", ss_last_error_message())
    }
  }

  /// Global top-left coordinates (y down from the primary screen's top).
  private func toTopLeft(_ r: NSRect) -> NSRect {
    let top = NSScreen.screens.first?.frame.maxY ?? 0
    return NSRect(x: r.minX, y: top - r.maxY, width: r.width, height: r.height)
  }

  private func toAppKit(_ r: NSRect) -> NSRect {
    let top = NSScreen.screens.first?.frame.maxY ?? 0
    return NSRect(x: r.minX, y: top - r.minY - r.height, width: r.width, height: r.height)
  }

  // MARK: Source menu

  /// Pops up a menu at a point in the main window; returns the chosen index or -1.
  @objc func showMenu(_ items: [String], checked: Int, x: CGFloat, y: CGFloat) -> Int {
    guard let content = main?.contentView else { return -1 }
    let menu = NSMenu()
    menu.autoenablesItems = false
    let target = MenuTarget()
    for (i, title) in items.enumerated() {
      if title == "-" {
        menu.addItem(.separator())
        continue
      }
      let item = NSMenuItem(title: title, action: #selector(MenuTarget.choose(_:)), keyEquivalent: "")
      item.target = target
      item.tag = i
      item.state = i == checked ? .on : .off
      menu.addItem(item)
    }
    let point = NSPoint(x: x, y: content.isFlipped ? y : content.bounds.height - y)
    menu.popUp(positioning: nil, at: point, in: content)
    return target.chosen
  }

  // MARK: NSWindowDelegate

  func windowShouldClose(_ sender: NSWindow) -> Bool {
    if let name = panels.first(where: { $0.value === sender })?.key {
      setPanel(name, visible: false)
      return false
    }
    return true
  }

  func windowWillMiniaturize(_ notification: Notification) {
    guard (notification.object as? NSWindow) === main else { return }
    // Docked panels are child windows and go with it; hide the rest too.
    hiddenForMinimize = panels.values.filter { $0.isVisible && $0.parent == nil }
    hiddenForMinimize.forEach { $0.orderOut(nil) }
  }

  func windowDidDeminiaturize(_ notification: Notification) {
    guard (notification.object as? NSWindow) === main else { return }
    hiddenForMinimize.forEach { $0.orderFront(nil) }
    hiddenForMinimize = []
  }

  func windowWillClose(_ notification: Notification) {
    if (notification.object as? NSWindow) === main {
      NSApp.terminate(nil)
    }
  }
}

/// Parses and frees a JSON string from the core.
private func takeJSON(_ s: UnsafeMutablePointer<CChar>?) -> Any? {
  guard let s else { return nil }
  defer { ss_string_free(s) }
  return try? JSONSerialization.jsonObject(with: Data(String(cString: s).utf8), options: [.fragmentsAllowed])
}

private final class MenuTarget: NSObject {
  var chosen = -1
  @objc func choose(_ sender: NSMenuItem) { chosen = sender.tag }
}
