#include "PanelChrome.h"

#include <memory>

#include "SkinsModule.h"

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
  }
}

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
      if (pressRoot_) g_object_remove_weak_pointer(G_OBJECT(pressRoot_), (gpointer *)&pressRoot_);
      pressRoot_ = input.root;
      g_object_add_weak_pointer(G_OBJECT(pressRoot_), (gpointer *)&pressRoot_);
      pressX_ = input.x;
      pressY_ = input.y;
      pressButton_ = input.device == rngtk::PointerInput::Device::Touch ? 0 : input.button;
      pressTime_ = input.timeMs;
      pressed_ = true;
      movedPastThreshold_ = false;
      pending_.clear();
      break;
    case Phase::Move:
      if (pressed_ && pressRoot_ && input.root == pressRoot_ && !movedPastThreshold_ &&
          gtk_drag_check_threshold(pressRoot_, int(pressX_), int(pressY_), int(input.x),
                                   int(input.y))) {
        movedPastThreshold_ = true;
        if (!pending_.empty()) start();
      }
      break;
    case Phase::Up:
    case Phase::Cancel:
      pressed_ = false;
      pending_.clear();
      break;
    default:
      break;
  }
  return false;
}

void PanelChrome::beginGesture(const std::string &kind) {
  if (!pressed_ || !pressRoot_) return;
  pending_ = kind;
  // The pointer may have moved on before JS asked.
  if (movedPastThreshold_) start();
}

void PanelChrome::start() {
  std::string kind = std::move(pending_);
  pending_.clear();
  pressed_ = false;
  GtkWidget *root = pressRoot_;
  GtkNative *native = root ? gtk_widget_get_native(root) : nullptr;
  GdkSurface *surface = native ? gtk_native_get_surface(native) : nullptr;
  if (!surface || !GDK_IS_TOPLEVEL(surface)) return;
  // The desktop takes the press from here (the release goes to it).
  if (host_) host_->cancelTouches(root);
  graphene_point_t p{float(pressX_), float(pressY_)}, inNative;
  if (!gtk_widget_compute_point(root, GTK_WIDGET(native), &p, &inNative)) return;
  double nx = 0, ny = 0;
  gtk_native_get_surface_transform(native, &nx, &ny);
  GdkDevice *pointer = gdk_seat_get_pointer(gdk_display_get_default_seat(gdk_surface_get_display(surface)));
  if (kind == "resize") {
    gdk_toplevel_begin_resize(GDK_TOPLEVEL(surface), GDK_SURFACE_EDGE_SOUTH_EAST, pointer,
                              pressButton_, inNative.x + nx, inNative.y + ny, pressTime_);
  } else {
    gdk_toplevel_begin_move(GDK_TOPLEVEL(surface), pointer, pressButton_, inNative.x + nx,
                            inNative.y + ny, pressTime_);
  }
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
  // shows a check mark. '-' starts a new section (a separator line).
  GSimpleActionGroup *actions = g_simple_action_group_new();
  GMenu *menu = g_menu_new();
  GMenu *section = g_menu_new();
  for (size_t i = 0; i < items.size(); i++) {
    if (items[i] == "-") {
      g_menu_append_section(menu, nullptr, G_MENU_MODEL(section));
      g_object_unref(section);
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
  g_menu_append_section(menu, nullptr, G_MENU_MODEL(section));
  g_object_unref(section);

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
