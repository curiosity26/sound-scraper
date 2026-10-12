#include "PanelChrome.h"

#include <cmath>
#include <memory>

#include "SkinsModule.h"
#include "StageModule.h"

namespace soundscraper {

namespace {

GtkApplication *application() {
  GApplication *app = g_application_get_default();
  return app ? GTK_APPLICATION(app) : nullptr;
}

}  // namespace

PanelChrome &PanelChrome::get() {
  static PanelChrome chrome;
  return chrome;
}

void PanelChrome::setUp(rngtk::Host &host) {
  host_ = &host;
  host.addPointerObserver([this](const rngtk::PointerInput &input) { return onPointer(input); });
  // Ctrl+D in any of the app's windows toggles double size, as on Windows
  // (Window › Double Size, ⌘D, on macOS).
  if (GtkApplication *app = application()) {
    GSimpleAction *action = g_simple_action_new("double-size", nullptr);
    g_signal_connect(action, "activate", G_CALLBACK(+[](GSimpleAction *, GVariant *, gpointer) {
                       SkinsModule::emitWindowEvent("main", "toggleDoubleSize");
                     }),
                     nullptr);
    g_action_map_add_action(G_ACTION_MAP(app), G_ACTION(action));
    g_object_unref(action);
    const char *accels[] = {"<Control>d", nullptr};
    gtk_application_set_accels_for_action(app, "app.double-size", accels);

    // Ctrl+Shift+M moves the stage to the next monitor.
    GSimpleAction *next = g_simple_action_new("next-monitor", nullptr);
    g_signal_connect(next, "activate", G_CALLBACK(+[](GSimpleAction *, GVariant *, gpointer) {
                       PanelChrome::get().moveToNextMonitor();
                     }),
                     nullptr);
    g_action_map_add_action(G_ACTION_MAP(app), G_ACTION(next));
    g_object_unref(next);
    const char *nextAccels[] = {"<Control><Shift>m", nullptr};
    gtk_application_set_accels_for_action(app, "app.next-monitor", nextAccels);

    // The main window (the host made it before setting up packages) is the
    // stage: maximized, so it covers the monitor's work area.
    if (GList *windows = gtk_application_get_windows(app)) {
      stage_ = GTK_WIDGET(g_list_last(windows)->data);
      g_object_add_weak_pointer(G_OBJECT(stage_), (gpointer *)&stage_);
      gtk_window_maximize(GTK_WINDOW(stage_));
    }
  }
}

GtkWindow *PanelChrome::stageWindow() const { return stage_ ? GTK_WINDOW(stage_) : nullptr; }

bool PanelChrome::onPointer(const rngtk::PointerInput &input) {
  using Phase = rngtk::PointerInput::Phase;
  bool primary = input.device == rngtk::PointerInput::Device::Touch || input.button == 1;
  switch (input.phase) {
    case Phase::Down:
      if (input.root) {
        // Weak, so a closed panel's root doesn't dangle.
        if (menuRoot_) g_object_remove_weak_pointer(G_OBJECT(menuRoot_), (gpointer *)&menuRoot_);
        menuRoot_ = input.root;
        g_object_add_weak_pointer(G_OBJECT(menuRoot_), (gpointer *)&menuRoot_);
      }
      if (!primary || !input.root) break;
      endGesture();
      if (pressRoot_) g_object_remove_weak_pointer(G_OBJECT(pressRoot_), (gpointer *)&pressRoot_);
      pressRoot_ = input.root;
      g_object_add_weak_pointer(G_OBJECT(pressRoot_), (gpointer *)&pressRoot_);
      pressX_ = input.x;
      pressY_ = input.y;
      pressed_ = true;
      movedPastThreshold_ = false;
      break;
    case Phase::Move:
      if (!pressed_ || !pressRoot_ || input.root != pressRoot_) break;
      if (!movedPastThreshold_ &&
          gtk_drag_check_threshold(pressRoot_, int(pressX_), int(pressY_), int(input.x),
                                   int(input.y))) {
        movedPastThreshold_ = true;
        if (gesture_) startGesture();
      }
      if (gestureRunning_) {
        // Alt (like Option on the Mac) turns snapping off.
        bool snap = !(input.modifiers & GDK_ALT_MASK);
        if (char *frames = ss_layout_gesture_update(gesture_, input.x - pressX_,
                                                    input.y - pressY_, snap)) {
          StageModule::emit(folly::dynamic::object("frames", std::string(frames)));
          ss_string_free(frames);
        }
        return true;
      }
      break;
    case Phase::Up:
    case Phase::Cancel: {
      bool running = gestureRunning_;
      pressed_ = false;
      endGesture();
      if (running) return true;
      break;
    }
    default:
      break;
  }
  return false;
}

void PanelChrome::beginStageGesture(SsLayoutGesture *gesture) {
  endGesture();
  if (!pressed_ || !pressRoot_) {
    ss_layout_gesture_end(gesture);
    return;
  }
  gesture_ = gesture;
  // The pointer may have moved on before JS asked.
  if (movedPastThreshold_) startGesture();
}

void PanelChrome::startGesture() {
  gestureRunning_ = true;
  // The gesture takes the press from here: the JS responder lets go.
  if (host_ && pressRoot_) host_->cancelTouches(pressRoot_);
}

void PanelChrome::endGesture() {
  if (!gesture_) return;
  ss_layout_gesture_end(gesture_);
  gesture_ = nullptr;
  if (gestureRunning_) {
    gestureRunning_ = false;
    StageModule::emit(folly::dynamic::object("end", true));
  }
}

void PanelChrome::setInputRegion(const std::vector<double> &rects) {
  inputRects_ = rects;
  applyInputRegion();
}

void PanelChrome::applyInputRegion() {
  GtkWindow *window = stageWindow();
  GdkSurface *surface = window ? gtk_native_get_surface(GTK_NATIVE(window)) : nullptr;
  if (!surface) return;
  // GtkWindow resets the input region to the whole window whenever it lays
  // itself out (client-side decorations): set it again after each layout.
  if (GdkFrameClock *clock = gdk_surface_get_frame_clock(surface); clock != inputClock_) {
    if (inputClock_) {
      g_signal_handlers_disconnect_by_data(inputClock_, this);
      g_object_remove_weak_pointer(G_OBJECT(inputClock_), (gpointer *)&inputClock_);
    }
    inputClock_ = clock;
    if (inputClock_) {
      g_object_add_weak_pointer(G_OBJECT(inputClock_), (gpointer *)&inputClock_);
      g_signal_connect_after(inputClock_, "layout", G_CALLBACK(+[](GdkFrameClock *, gpointer self) {
                               static_cast<PanelChrome *>(self)->applyInputRegion();
                             }),
                             this);
    }
  }
  // Points from the React root (the window's child) to surface coordinates.
  graphene_point_t origin{0, 0}, at{0, 0};
  if (GtkWidget *child = gtk_window_get_child(window)) {
    if (!gtk_widget_compute_point(child, GTK_WIDGET(window), &origin, &at)) at = {0, 0};
  }
  double nx = 0, ny = 0;
  gtk_native_get_surface_transform(GTK_NATIVE(window), &nx, &ny);
  cairo_region_t *region = cairo_region_create();
  for (size_t i = 0; i + 3 < inputRects_.size(); i += 4) {
    double x = inputRects_[i] + at.x + nx, y = inputRects_[i + 1] + at.y + ny;
    cairo_rectangle_int_t r{int(std::floor(x)), int(std::floor(y)),
                            int(std::ceil(x + inputRects_[i + 2]) - std::floor(x)),
                            int(std::ceil(y + inputRects_[i + 3]) - std::floor(y))};
    if (r.width > 0 && r.height > 0) cairo_region_union_rectangle(region, &r);
  }
  gdk_surface_set_input_region(surface, region);
  cairo_region_destroy(region);
}

namespace {

// Back to maximized once full screen on the new monitor (moveToNextMonitor).
void maximizeWhenFullscreen(GtkWindow *window, GParamSpec *, gpointer) {
  if (!gtk_window_is_fullscreen(window)) return;
  g_signal_handlers_disconnect_by_func(window, (gpointer)maximizeWhenFullscreen, nullptr);
  gtk_window_unfullscreen(window);
  gtk_window_maximize(window);
}

}  // namespace

void PanelChrome::moveToNextMonitor() {
  GtkWindow *window = stageWindow();
  GdkSurface *surface = window ? gtk_native_get_surface(GTK_NATIVE(window)) : nullptr;
  if (!surface) return;
  GdkDisplay *display = gdk_surface_get_display(surface);
  GListModel *monitors = gdk_display_get_monitors(display);
  guint n = g_list_model_get_n_items(monitors);
  if (n < 2) return;
  GdkMonitor *current = gdk_display_get_monitor_at_surface(display, surface);
  guint index = 0;
  for (guint i = 0; i < n; i++) {
    auto *m = GDK_MONITOR(g_list_model_get_item(monitors, i));
    if (m == current) index = i;
    g_object_unref(m);
  }
  auto *next = GDK_MONITOR(g_list_model_get_item(monitors, (index + 1) % n));
  // A window can't place itself on Wayland, but it can go full screen on a
  // monitor; maximized again from there, it stays on it.
  g_signal_handlers_disconnect_by_func(window, (gpointer)maximizeWhenFullscreen, nullptr);
  g_signal_connect(window, "notify::fullscreened", G_CALLBACK(maximizeWhenFullscreen), nullptr);
  gtk_window_fullscreen_on_monitor(window, next);
  g_object_unref(next);
}

GtkWindow *PanelChrome::pressWindow() const {
  if (menuRoot_) {
    if (GtkRoot *root = gtk_widget_get_root(menuRoot_); root && GTK_IS_WINDOW(root)) {
      return GTK_WINDOW(root);
    }
  }
  GtkApplication *app = application();
  return app ? gtk_application_get_active_window(app) : nullptr;
}

namespace {

struct MenuState {
  std::function<void(int)> done;
  int chosen = -1;
  bool finished = false;
};

void finishMenu(const std::shared_ptr<MenuState> &state) {
  if (state->finished) return;
  state->finished = true;
  state->done(state->chosen);
}

}  // namespace

void PanelChrome::showMenu(const std::vector<std::string> &items, int checked, double x, double y,
                           std::function<void(int)> done) {
  GtkWindow *window = pressWindow();
  GtkWidget *anchor = window ? gtk_window_get_child(window) : nullptr;
  if (!anchor) {
    done(-1);
    return;
  }
  auto state = std::make_shared<MenuState>();
  state->done = std::move(done);

  // One action per item ("m.i<index>"); the checked one is stateful, so it
  // shows a check mark. '-' starts a new section (a separator line); an
  // empty one (a trailing '-', say the source menu with no apps) would show
  // as a blank row, so it's left out.
  GSimpleActionGroup *actions = g_simple_action_group_new();
  GMenu *menu = g_menu_new();
  GMenu *section = g_menu_new();
  auto endSection = [&] {
    if (g_menu_model_get_n_items(G_MENU_MODEL(section)) > 0) {
      g_menu_append_section(menu, nullptr, G_MENU_MODEL(section));
    }
    g_object_unref(section);
  };
  for (size_t i = 0; i < items.size(); i++) {
    if (items[i] == "-") {
      endSection();
      section = g_menu_new();
      continue;
    }
    std::string name = "i" + std::to_string(i);
    GSimpleAction *action =
        int(i) == checked
            ? g_simple_action_new_stateful(name.c_str(), nullptr, g_variant_new_boolean(TRUE))
            : g_simple_action_new(name.c_str(), nullptr);
    auto *weak = new std::weak_ptr<MenuState>(state);
    g_object_set_data(G_OBJECT(action), "index", GINT_TO_POINTER(int(i)));
    g_signal_connect_data(
        action, "activate", G_CALLBACK(+[](GSimpleAction *a, GVariant *, gpointer data) {
          if (auto s = static_cast<std::weak_ptr<MenuState> *>(data)->lock()) {
            s->chosen = GPOINTER_TO_INT(g_object_get_data(G_OBJECT(a), "index"));
            finishMenu(s);
          }
        }),
        weak, [](gpointer data, GClosure *) { delete static_cast<std::weak_ptr<MenuState> *>(data); },
        GConnectFlags(0));
    g_action_map_add_action(G_ACTION_MAP(actions), G_ACTION(action));
    g_object_unref(action);
    std::string detailed = "m." + name;
    g_menu_append(section, items[i].c_str(), detailed.c_str());
  }
  endSection();

  GtkWidget *popover = gtk_popover_menu_new_from_model(G_MENU_MODEL(menu));
  g_object_unref(menu);
  gtk_widget_insert_action_group(popover, "m", G_ACTION_GROUP(actions));
  g_object_unref(actions);
  gtk_popover_set_has_arrow(GTK_POPOVER(popover), FALSE);
  gtk_widget_set_halign(popover, GTK_ALIGN_START);
  gtk_popover_set_position(GTK_POPOVER(popover), GTK_POS_BOTTOM);
  gtk_widget_set_parent(popover, anchor);
  GdkRectangle at{int(x), int(y), 1, 1};
  gtk_popover_set_pointing_to(GTK_POPOVER(popover), &at);

  auto *closedState = new std::shared_ptr<MenuState>(state);
  g_signal_connect_data(
      popover, "closed", G_CALLBACK(+[](GtkPopover *p, gpointer data) {
        auto s = *static_cast<std::shared_ptr<MenuState> *>(data);
        // An item's action runs after "closed": settle on the next idle.
        g_idle_add_full(
            G_PRIORITY_DEFAULT_IDLE,
            [](gpointer d) -> gboolean {
              auto *pair = static_cast<std::pair<GtkWidget *, std::shared_ptr<MenuState>> *>(d);
              finishMenu(pair->second);
              gtk_widget_unparent(pair->first);
              g_object_unref(pair->first);
              return G_SOURCE_REMOVE;
            },
            new std::pair<GtkWidget *, std::shared_ptr<MenuState>>(
                GTK_WIDGET(g_object_ref(p)), s),
            [](gpointer d) {
              delete static_cast<std::pair<GtkWidget *, std::shared_ptr<MenuState>> *>(d);
            });
      }),
      closedState,
      [](gpointer data, GClosure *) { delete static_cast<std::shared_ptr<MenuState> *>(data); },
      GConnectFlags(0));
  gtk_popover_popup(GTK_POPOVER(popover));
}

void PanelChrome::perform(const std::string &action) {
  GtkApplication *app = application();
  if (!app) return;
  if (action == "minimize") {
    for (GList *l = gtk_application_get_windows(app); l; l = l->next) {
      if (gtk_widget_get_visible(GTK_WIDGET(l->data))) gtk_window_minimize(GTK_WINDOW(l->data));
    }
  } else if (action == "quit") {
    g_application_quit(G_APPLICATION(app));
  }
}

}  // namespace soundscraper
