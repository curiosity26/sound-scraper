import AppKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

// AppKit lifecycle (rather than a SwiftUI scene) so the main window can be
// the borderless, transparent skinned panel; see SkinWindows.swift.
@main
class AppDelegate: NSObject, NSApplicationDelegate {
  private let reactNativeDelegate: ReactNativeDelegate
  let reactNativeFactory: RCTReactNativeFactory

  static func main() {
    let app = NSApplication.shared
    let delegate = AppDelegate()
    app.delegate = delegate
    app.setActivationPolicy(.regular)
    app.run()
  }

  override init() {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    super.init()
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.mainMenu = makeMainMenu()
    WindowController.shared.factory = reactNativeFactory
    WindowController.shared.showMain()
    NSApp.activate(ignoringOtherApps: true)
  }

  /// .sskin files opened from Finder (or dropped on the Dock icon).
  func application(_ application: NSApplication, open urls: [URL]) {
    let skins = urls.filter(WindowController.isSkinFile).map(\.path)
    if !skins.isEmpty {
      WindowController.shared.openSkinFiles(skins)
    }
  }

  func applicationWillTerminate(_ notification: Notification) {
    WindowController.shared.saveLayout()
  }

  func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
    if let main = WindowController.shared.main {
      if main.isMiniaturized { main.deminiaturize(nil) }
      main.makeKeyAndOrderFront(nil)
    }
    return false
  }

  @objc func showSettings(_ sender: Any?) {
    WindowController.shared.setPanel("settings", visible: true)
  }

  @objc func toggleLibrary(_ sender: Any?) {
    WindowController.shared.togglePanel("library")
  }

  @objc func toggleDoubleSize(_ sender: Any?) {
    WindowController.shared.onEvent?("main", "toggleDoubleSize")
  }

  /// Minimizes the key window (the borderless main panel has no title-bar
  /// button for performMiniaturize to press).
  @objc func minimizeWindow(_ sender: Any?) {
    NSApp.keyWindow?.miniaturize(sender)
  }

  private func makeMainMenu() -> NSMenu {
    let mainMenu = NSMenu()
    let name = "Sound Scraper"

    let appMenu = NSMenu(title: name)
    appMenu.addItem(withTitle: "About \(name)", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
    appMenu.addItem(.separator())
    appMenu.addItem(withTitle: "Settings…", action: #selector(showSettings(_:)), keyEquivalent: ",")
    appMenu.addItem(.separator())
    appMenu.addItem(withTitle: "Hide \(name)", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
    let hideOthers = appMenu.addItem(withTitle: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
    hideOthers.keyEquivalentModifierMask = [.command, .option]
    appMenu.addItem(withTitle: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
    appMenu.addItem(.separator())
    appMenu.addItem(withTitle: "Quit \(name)", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

    let editMenu = NSMenu(title: "Edit")
    editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
    let redo = editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "z")
    redo.keyEquivalentModifierMask = [.command, .shift]
    editMenu.addItem(.separator())
    editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
    editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
    editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
    editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")

    let windowMenu = NSMenu(title: "Window")
    windowMenu.addItem(withTitle: "Minimize", action: #selector(minimizeWindow(_:)), keyEquivalent: "m")
    windowMenu.addItem(withTitle: "Library", action: #selector(toggleLibrary(_:)), keyEquivalent: "l")
    windowMenu.addItem(withTitle: "Double Size", action: #selector(toggleDoubleSize(_:)), keyEquivalent: "d")
    windowMenu.addItem(.separator())
    windowMenu.addItem(withTitle: "Bring All to Front", action: #selector(NSApplication.arrangeInFront(_:)), keyEquivalent: "")

    for menu in [appMenu, editMenu, windowMenu] {
      let item = NSMenuItem()
      item.submenu = menu
      mainMenu.addItem(item)
    }
    NSApp.windowsMenu = windowMenu
    return mainMenu
  }
}

// MARK: - React Native Delegate

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
