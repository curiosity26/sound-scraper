// The stage on Linux: the "SoundScraperStage" TurboModule (Linux only, spec:
// src/features/skins/stage/stageNative.ts). The main window is one
// borderless, transparent, maximized window, and the panels are views in
// it that src/features/skins/stage places; this gives that code the Rust
// core's panel layout (ss_layout_*: snapping, docking, placing, saving),
// window drags and resizes (with PanelChrome), and the window's input
// region (the panels; clicks elsewhere go to the windows below).
#pragma once

#include <folly/dynamic.h>
#include <react/bridging/EventEmitter.h>
#include <rngtk/CxxModule.h>

#include <memory>
#include <string>

namespace soundscraper {

class StageModule : public rngtk::CxxModule<StageModule> {
 public:
  static constexpr const char *kName = "SoundScraperStage";
  explicit StageModule(std::shared_ptr<facebook::react::CallInvoker> jsInvoker);

  /// The saved layout JSON (ss_layout_load), "null" if none.
  std::string load(facebook::jsi::Runtime &rt);
  void save(facebook::jsi::Runtime &rt, std::string json);
  /// ss_layout_place: where panel `id` opens, as {"x", "y", "w", "h"}.
  std::string place(facebook::jsi::Runtime &rt, std::string scene, std::string id, double x,
                    double y, double w, double h);
  /// ss_layout_analyze: {"docked", "constrain", "tidy"}.
  std::string analyze(facebook::jsi::Runtime &rt, std::string scene);
  /// ss_layout_scale: placements for a double-size change by `ratio`.
  std::string scale(facebook::jsi::Runtime &rt, std::string scene, double ratio);
  /// Placements for panel `id` resized by (dw, dh), keeping the panels
  /// docked on its right and bottom edges attached.
  std::string resize(facebook::jsi::Runtime &rt, std::string scene, std::string id, double dw,
                     double dh);
  /// Moves ("move") or resizes ("resize") panel `id` with the press in
  /// progress, once the pointer moves; the new frames come as onStageEvent
  /// {"frames": JSON placements}, then {"end": true}.
  void beginGesture(facebook::jsi::Runtime &rt, std::string scene, std::string id,
                    std::string kind, double minWidth, double minHeight);
  /// The window's input region: flat [x, y, w, h, ...] in points.
  void setInputRegion(facebook::jsi::Runtime &rt, folly::dynamic rects);
  /// Moves the stage to the next monitor (Ctrl+Shift+M).
  void moveToNextMonitor(facebook::jsi::Runtime &rt);

  /// An event to JS (onStageEvent). Any thread.
  static void emit(folly::dynamic event);

 private:
  std::shared_ptr<facebook::react::AsyncEventEmitter<folly::dynamic>> events_;
};

}  // namespace soundscraper
