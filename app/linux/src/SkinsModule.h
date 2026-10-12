// Skins (the Rust core's ss_skin_* functions) and the skinned panels' window
// chrome on Linux: the "SoundScraperSkins" TurboModule (spec:
// src/bridge/NativeSkins.ts). Mirrors app/windows/SoundScraper/SkinsModule.h.
//
// The panels are views in one window on Linux, placed by the JS side
// (src/features/skins/stage, with StageModule), so setPanelLayout,
// beginGesture, setPanelVisible and isPanelVisible are no-ops here; menus
// and window actions are PanelChrome's.
#pragma once

#include <folly/dynamic.h>
#include <react/bridging/EventEmitter.h>
#include <react/bridging/Promise.h>
#include <rngtk/CxxModule.h>

#include <memory>
#include <optional>
#include <string>
#include <vector>

namespace soundscraper {

class SkinsModule : public rngtk::CxxModule<SkinsModule> {
 public:
  static constexpr const char *kName = "SoundScraperSkins";
  explicit SkinsModule(std::shared_ptr<facebook::react::CallInvoker> jsInvoker);

  using Path = facebook::react::AsyncPromise<std::optional<std::string>>;
  using Json = facebook::react::AsyncPromise<std::string>;

  Json loadSkin(facebook::jsi::Runtime &rt, std::string idOrPath);
  Json loadCurrentSkin(facebook::jsi::Runtime &rt);
  Json listSkins(facebook::jsi::Runtime &rt);
  Json installSkin(facebook::jsi::Runtime &rt, std::string archivePath);
  facebook::react::AsyncPromise<> removeSkin(facebook::jsi::Runtime &rt, std::string id);
  Path pickSkinArchive(facebook::jsi::Runtime &rt);
  Path pickSkinFolder(facebook::jsi::Runtime &rt);
  Path pickFolder(facebook::jsi::Runtime &rt, std::string title, std::string prompt);
  Path pickSkinSaveLocation(facebook::jsi::Runtime &rt, std::string defaultName);
  Json inspectSkin(facebook::jsi::Runtime &rt, std::string archivePath);
  Json skinPreview(facebook::jsi::Runtime &rt, std::string idOrPath);
  Json packageSkin(facebook::jsi::Runtime &rt, std::string dir, std::string outPath);
  Json createSkin(facebook::jsi::Runtime &rt, std::string parent, std::string name);
  Json skinFolderStamp(facebook::jsi::Runtime &rt, std::string dir);
  std::vector<std::string> takeOpenedSkinFiles(facebook::jsi::Runtime &rt);

  void setPanelLayout(facebook::jsi::Runtime &rt, std::string panel, double width, double height,
                      folly::dynamic dragRegions, folly::dynamic holes, folly::dynamic grip,
                      double minWidth, double minHeight, double scale);
  void windowAction(facebook::jsi::Runtime &rt, std::string action);
  void beginGesture(facebook::jsi::Runtime &rt, std::string panel, std::string kind);
  void setPanelVisible(facebook::jsi::Runtime &rt, std::string panel, bool visible);
  bool isPanelVisible(facebook::jsi::Runtime &rt, std::string panel);
  facebook::react::AsyncPromise<double> showMenu(facebook::jsi::Runtime &rt, std::string panel,
                                                 std::vector<std::string> items, double checked,
                                                 double x, double y);

  /// Skins opened from the file manager (the app's command line) or
  /// dropped on a panel; JS is told (window event "skinFilesOpened") and
  /// takes them. Any thread.
  static void openSkinFiles(std::vector<std::string> paths);

  /// A window event to JS (onWindowEvent), e.g. ("main", "toggleDoubleSize").
  /// Any thread.
  static void emitWindowEvent(const std::string &window, const std::string &event);

 private:
  template <class Call>
  Json resolveString(facebook::jsi::Runtime &rt, Call call);

  std::shared_ptr<facebook::react::AsyncEventEmitter<folly::dynamic>> windowEvents_;
};

}  // namespace soundscraper
