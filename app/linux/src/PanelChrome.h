// The skinned panels' window chrome on Linux: moving and resizing a
// borderless panel from its skin's drag regions and grip, the pop-up menus,
// minimize and quit. The panels themselves are windows the JS side opens
// (src/features/skins/windows.linux.ts, with react-native-gtk4's Windows).
//
// Moves and resizes go through the desktop (gdk_toplevel_begin_move /
// begin_resize), so they work on Wayland too, where a window can't place
// itself; panels don't dock or snap to each other on Linux.
//
// Main thread only, except where noted.
#pragma once

#include <gtk/gtk.h>
#include <rngtk/Extensions.h>

#include <functional>
#include <string>
#include <vector>

namespace soundscraper {

class PanelChrome {
 public:
  static PanelChrome &get();

  /// Watches the host's pointer events (rngtk::Package::setUp).
  void setUp(rngtk::Host &host);

  /// Moves ("move") or resizes ("resize", from the bottom right corner) the
  /// window of the press in progress, once the pointer moves: what the JS
  /// side asks for on a press in a drag region or the grip (DragSurface).
  void beginGesture(const std::string &kind);

  /// A pop-up menu at (x, y) in the window of the latest press (or the
  /// active one); '-' is a separator, `checked` gets a check mark. Calls
  /// `done` with the chosen index, or -1.
  void showMenu(const std::vector<std::string> &items, int checked, double x, double y,
                std::function<void(int)> done);

  /// "minimize" (every window of the app) or "quit".
  void perform(const std::string &action);

 private:
  bool onPointer(const rngtk::PointerInput &input);
  void start();
  GtkWindow *pressWindow() const;

  rngtk::Host *host_ = nullptr;
  // The latest primary press, while the button is down.
  GtkWidget *pressRoot_ = nullptr;
  double pressX_ = 0, pressY_ = 0;
  int pressButton_ = 1;
  uint32_t pressTime_ = 0;
  bool pressed_ = false;
  bool movedPastThreshold_ = false;
  // A gesture JS asked for, waiting for the pointer to move.
  std::string pending_;
  // The root of the latest press, for menus (kept after the release).
  GtkWidget *menuRoot_ = nullptr;
};

}  // namespace soundscraper
