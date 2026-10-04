import AppKit
import React
import React_RCTAppDelegate

/// Borderless, transparent window for the skinned main panel. The skin
/// decides its size and where it can be dragged; mouse-downs in a drag
/// region (but not over an interactive element) move the window.
final class SkinPanelWindow: NSWindow {
  /// In points from the content's top left.
  var dragRegions: [NSRect] = []
  var holes: [NSRect] = []
  var onDoubleClickDragRegion: (() -> Void)?

  init(size: NSSize) {
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
  }

  override var canBecomeKey: Bool { true }
  override var canBecomeMain: Bool { true }

  override func sendEvent(_ event: NSEvent) {
    if event.type == .leftMouseDown, let content = contentView {
      let p = event.locationInWindow
      let point = NSPoint(x: p.x, y: content.bounds.height - p.y)
      if dragRegions.contains(where: { $0.contains(point) }) && !holes.contains(where: { $0.contains(point) }) {
        if event.clickCount == 2 {
          onDoubleClickDragRegion?()
        } else {
          performDrag(with: event)
        }
        return
      }
    }
    super.sendEvent(event)
  }
}

/// Owns the app's windows: the skinned main panel and the library and
/// settings windows, each a React Native root of its own sharing one JS
/// runtime. Driven from JS through RCTSoundScraperSkins.
@objc(SSWindowController)
final class WindowController: NSObject, NSWindowDelegate {
  @objc static let shared = WindowController()

  var factory: RCTReactNativeFactory?
  private(set) var main: SkinPanelWindow?
  private var panels: [String: NSWindow] = [:]
  /// (window, event), e.g. ("library", "hidden"); set by the native module.
  @objc var onEvent: ((String, String) -> Void)?

  private static let panelSpecs: [String: (module: String, title: String, size: NSSize)] = [
    "library": ("SoundScraperLibrary", "Library", NSSize(width: 960, height: 560)),
    "settings": ("SoundScraperSettings", "Settings", NSSize(width: 560, height: 640)),
  ]

  func showMain() {
    guard main == nil, let factory else { return }
    let window = SkinPanelWindow(size: NSSize(width: 420, height: 150))
    window.title = "Sound Scraper"
    window.contentView = factory.rootViewFactory.view(withModuleName: "SoundScraper")
    window.delegate = self
    window.onDoubleClickDragRegion = { [weak self] in self?.onEvent?("main", "toggleShade") }
    // Only the position is restored; the skin sets the size.
    if let saved = UserDefaults.standard.string(forKey: "MainPanelTopLeft") {
      window.setFrameTopLeftPoint(NSPointFromString(saved))
    } else {
      window.center()
    }
    window.makeKeyAndOrderFront(nil)
    main = window
  }

  @objc func setMainLayout(width: CGFloat, height: CGFloat, dragRegions: [NSValue], holes: [NSValue]) {
    guard let window = main else { return }
    window.dragRegions = dragRegions.map { $0.rectValue }
    window.holes = holes.map { $0.rectValue }
    var frame = window.frame
    if frame.size != NSSize(width: width, height: height) {
      let top = frame.maxY
      frame.size = NSSize(width: width, height: height)
      frame.origin.y = top - height
      window.setFrame(frame, display: true)
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
      onEvent?(name, "shown")
    } else if let window = panels[name], window.isVisible {
      window.orderOut(nil)
      onEvent?(name, "hidden")
    }
  }

  @objc func isPanelVisible(_ name: String) -> Bool {
    panels[name]?.isVisible ?? false
  }

  @objc func togglePanel(_ name: String) {
    setPanel(name, visible: !isPanelVisible(name))
  }

  private func panel(_ name: String) -> NSWindow? {
    if let window = panels[name] { return window }
    guard let spec = Self.panelSpecs[name], let factory else { return nil }
    let window = NSWindow(
      contentRect: NSRect(origin: .zero, size: spec.size),
      styleMask: [.titled, .closable, .miniaturizable, .resizable],
      backing: .buffered,
      defer: false)
    window.title = spec.title
    window.isReleasedWhenClosed = false
    window.contentMinSize = NSSize(width: 420, height: 320)
    window.contentView = factory.rootViewFactory.view(withModuleName: spec.module)
    window.delegate = self
    if !window.setFrameUsingName("Panel-\(name)") {
      // First time: the library below the main panel, settings beside it.
      if let main {
        window.setFrameTopLeftPoint(
          name == "settings"
            ? NSPoint(x: main.frame.maxX + 8, y: main.frame.maxY)
            : NSPoint(x: main.frame.minX, y: main.frame.minY - 8))
      } else {
        window.center()
      }
    }
    window.setFrameAutosaveName("Panel-\(name)")
    panels[name] = window
    return window
  }

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

  func windowDidMove(_ notification: Notification) {
    guard let window = notification.object as? NSWindow, window === main else { return }
    let topLeft = NSPoint(x: window.frame.minX, y: window.frame.maxY)
    UserDefaults.standard.set(NSStringFromPoint(topLeft), forKey: "MainPanelTopLeft")
  }

  func windowWillClose(_ notification: Notification) {
    if (notification.object as? NSWindow) === main {
      NSApp.terminate(nil)
    }
  }
}

private final class MenuTarget: NSObject {
  var chosen = -1
  @objc func choose(_ sender: NSMenuItem) { chosen = sender.tag }
}
