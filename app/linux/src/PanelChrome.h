// The stage's window on Linux: the main window, borderless, transparent and
// maximized, holds every panel as a view (src/features/skins/stage), so
// panels dock and snap as on the other platforms, Wayland included (where
// separate windows can't place themselves). This keeps it maximized, sets
// its input region to the panels (clicks elsewhere go to the windows
// below), runs panel drags and resizes from the skin's drag regions and
// grip (the Rust core's ss_layout gestures, see StageModule), and shows the
// pop-up menus, minimize and quit.
//
// Main thread only, except where noted.
#pragma once

#include <gtk/gtk.h>
#include <rngtk/Extensions.h>

#include <functional>
#include <string>
#include <vector>

#include "sound_scraper.h"

namespace soundscraper {

class PanelChrome {
 public:
  static PanelChrome &get();

  /// Watches the host's pointer events (rngtk::Package::setUp).
  void setUp(rngtk::Host &host);

  /// Runs `gesture` (owned from here) with the press in progress once the
  /// pointer moves, sending its frames to JS (StageModule::emit): what the
  /// JS side asks for on a press in a drag region or the grip
  /// (DragSurface). Ended at once if there's no press.
  void beginStageGesture(SsLayoutGesture *gesture);

  /// The stage window's input region: flat [x, y, w, h, ...] in points
  /// from its top left. Kept through GTK's own updates of it.
  void setInputRegion(const std::vector<double> &rects);

  /// Moves the stage window to the next monitor (maximized there).
  void moveToNextMonitor();

  /// A pop-up menu at (x, y) in the window of the latest press (or the
  /// active one); '-' is a separator, `checked` gets a check mark. Calls
  /// `done` with the chosen index, or -1.
  void showMenu(const std::vector<std::string> &items, int checked, double x, double y,
                std::function<void(int)> done);

  /// "minimize" (every window of the app) or "quit".
  void perform(const std::string &action);

 private:
  bool onPointer(const rngtk::PointerInput &input);
  void startGesture();
  void applyInputRegion();
  void endGesture();
  GtkWindow *pressWindow() const;
  /// The stage (the main window), or null before it exists.
  GtkWindow *stageWindow() const;

  rngtk::Host *host_ = nullptr;
  // The latest primary press, while the button is down.
  GtkWidget *pressRoot_ = nullptr;
  double pressX_ = 0, pressY_ = 0;
  bool pressed_ = false;
  bool movedPastThreshold_ = false;
  // A gesture JS asked for: waiting for the pointer to move, then running.
  SsLayoutGesture *gesture_ = nullptr;
  bool gestureRunning_ = false;
  // The stage window (weak).
  GtkWidget *stage_ = nullptr;
  // Its input region (setInputRegion), and the frame clock that reapplies it.
  std::vector<double> inputRects_;
  GdkFrameClock *inputClock_ = nullptr;
  // The root of the latest press, for menus (kept after the release).
  GtkWidget *menuRoot_ = nullptr;
};

}  // namespace soundscraper
