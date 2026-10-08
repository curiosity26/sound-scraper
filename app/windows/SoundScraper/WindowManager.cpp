#include "pch.h"

#include "WindowManager.h"

#include <commctrl.h>
#include <shellapi.h>
#include <dwmapi.h>
#include <winrt/Windows.Data.Json.h>

#include <cmath>

#include "Shared.h"
#include "resource.h"
#include "sound_scraper.h"

#pragma comment(lib, "comctl32.lib")
#pragma comment(lib, "dwmapi.lib")

using namespace winrt;
using namespace winrt::Microsoft::UI::Windowing;
using winrt::Windows::Data::Json::JsonArray;
using winrt::Windows::Data::Json::JsonObject;
using winrt::Windows::Data::Json::JsonValue;

namespace SoundScraper {

namespace {

constexpr char kMain[] = "main";

struct PanelSpec {
  const wchar_t *module;
  const wchar_t *title;
  /// Default size in DIPs.
  double width, height;
};

const std::map<std::string, PanelSpec> &Specs() {
  static const std::map<std::string, PanelSpec> specs{
      {"library", {L"SoundScraperLibrary", L"Library", 840, 420}},
      {"settings", {L"SoundScraperSettings", L"Settings", 460, 560}},
      {"details", {L"SoundScraperDetails", L"Details", 300, 480}},
      {"editor", {L"SoundScraperEditor", L"Editor", 860, 340}},
      {"burn", {L"SoundScraperBurn", L"Burn CD", 520, 480}},
  };
  return specs;
}

/// Takes a JSON string from the core (freeing it).
std::optional<JsonValue> TakeJson(char *s) noexcept {
  if (!s) {
    return std::nullopt;
  }
  std::string text(s);
  ss_string_free(s);
  JsonValue value{nullptr};
  if (!JsonValue::TryParse(winrt::to_hstring(text), value)) {
    return std::nullopt;
  }
  return value;
}

double Number(JsonObject const &o, wchar_t const *key, double fallback = 0) noexcept {
  return o.HasKey(key) && o.GetNamedValue(key).ValueType() == winrt::Windows::Data::Json::JsonValueType::Number
      ? o.GetNamedNumber(key)
      : fallback;
}

} // namespace

WindowManager &WindowManager::Get() noexcept {
  static WindowManager manager;
  return manager;
}

void WindowManager::Init(winrt::Microsoft::ReactNative::ReactNativeWin32App const &app) {
  m_host = app.ReactNativeHost();
  // Creates the compositor (and the UI dispatcher) on first access.
  auto rnWindow = app.ReactNativeWindow();
  m_compositor = winrt::Microsoft::ReactNative::Composition::CompositionUIService::GetCompositor(
      m_host.InstanceSettings().Properties());

  // The saved layout: {"panels": [{"id", "x", "y", "w", "h", "visible"}], "scale"}.
  if (auto layout = TakeJson(ss_layout_load()); layout && layout->ValueType() == winrt::Windows::Data::Json::JsonValueType::Object) {
    auto o = layout->GetObject();
    if (o.HasKey(L"scale")) {
      m_mainScale = Number(o, L"scale", 1);
    }
    if (o.HasKey(L"panels")) {
      for (auto const &v : o.GetNamedArray(L"panels")) {
        auto p = v.GetObject();
        auto &entry = m_saved[winrt::to_string(p.GetNamedString(L"id", L""))];
        for (auto key : {L"x", L"y", L"w", L"h"}) {
          entry[winrt::to_string(key)] = Number(p, key);
        }
        entry["visible"] = p.HasKey(L"visible") && p.GetNamedBoolean(L"visible", false) ? 1 : 0;
      }
    }
  }

  Panel main;
  main.id = kMain;
  main.window = app.AppWindow();
  main.rnWindow = rnWindow;
  main.hwnd = winrt::Microsoft::UI::GetWindowFromWindowId(main.window.Id());
  Style(main);
  m_panels.push_back(std::move(main));
  auto &m = m_panels.front();
  m.window.Title(L"Sound Scraper");
  if (auto it = m_saved.find(kMain); it != m_saved.end()) {
    auto &s = it->second;
    m.window.MoveAndResize({static_cast<int>(s["x"]), static_cast<int>(s["y"]),
                            std::max(1, static_cast<int>(s["w"])), std::max(1, static_cast<int>(s["h"]))});
  } else {
    double dpi = Dpi(m);
    m.window.Resize({static_cast<int>(420 * dpi), static_cast<int>(150 * dpi)});
  }

  // Closing the main panel quits (handled by ReactNativeWin32App); remember
  // the layout first.
  m.window.Closing([this](auto const &, auto const &) { SaveLayout(); });

  m_ui = winrt::Microsoft::UI::Dispatching::DispatcherQueue::GetForCurrentThread();
  HookKeys(m.rnWindow, m.hwnd);

  // Details shows the selection, the editor a recording and the burn panel
  // a playlist, none kept between launches.
  auto dispatcher = winrt::Microsoft::UI::Dispatching::DispatcherQueue::GetForCurrentThread();
  dispatcher.TryEnqueue([this]() {
    Guarded("restore panels", [&] {
      for (auto const &[name, spec] : Specs()) {
        if (name != "details" && name != "editor" && name != "burn" && m_saved.count(name) &&
            m_saved[name]["visible"] == 1) {
          SetPanel(name, true);
        }
      }
      ConstrainToScreens();
    });
  });
}

WindowManager::Panel *WindowManager::Find(std::string const &id) noexcept {
  for (auto &p : m_panels) {
    if (p.id == id) {
      return &p;
    }
  }
  return nullptr;
}

namespace {

/// Lets a panel be as small as its skin says (the shade strip is shorter
/// than Windows' minimum window height).
/// Skins dropped from Explorer onto a panel (its window, or the React
/// Native island's child window that covers it).
LRESULT CALLBACK SkinDropProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam, UINT_PTR, DWORD_PTR) {
  if (msg == WM_DROPFILES) {
    auto drop = reinterpret_cast<HDROP>(wParam);
    std::vector<std::string> paths;
    UINT count = DragQueryFileW(drop, 0xFFFFFFFF, nullptr, 0);
    for (UINT i = 0; i < count; i++) {
      std::wstring path(DragQueryFileW(drop, i, nullptr, 0) + 1, L'\0');
      path.resize(DragQueryFileW(drop, i, path.data(), static_cast<UINT>(path.size())));
      if (WindowManager::IsSkinFile(path)) {
        paths.push_back(winrt::to_string(path));
      }
    }
    DragFinish(drop);
    if (!paths.empty()) {
      Guarded("drop skins", [&] { WindowManager::Get().OpenSkinFiles(paths); });
    }
    return 0;
  }
  return DefSubclassProc(hwnd, msg, wParam, lParam);
}

void AcceptSkinDrops(HWND hwnd) {
  DragAcceptFiles(hwnd, TRUE);
  SetWindowSubclass(hwnd, SkinDropProc, 2, 0);
}

LRESULT CALLBACK SkinSizeProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam, UINT_PTR, DWORD_PTR) {
  if (msg == WM_GETMINMAXINFO) {
    LRESULT result = DefSubclassProc(hwnd, msg, wParam, lParam);
    auto info = reinterpret_cast<MINMAXINFO *>(lParam);
    info->ptMinTrackSize = {1, 1};
    return result;
  }
  return DefSubclassProc(hwnd, msg, wParam, lParam);
}

} // namespace

void WindowManager::Style(Panel &panel) {
  SetWindowSubclass(panel.hwnd, SkinSizeProc, 1, 0);
  auto presenter = OverlappedPresenter::Create();
  presenter.SetBorderAndTitleBar(false, false);
  presenter.IsResizable(false); // resizes come from the skin's grip
  presenter.IsMaximizable(false); // also turns off Snap Layouts
  presenter.IsMinimizable(panel.id == kMain);
  panel.window.SetPresenter(presenter);
  // The zombie in the taskbar preview and Alt+Tab (AppWindow otherwise shows
  // a generic icon).
  static HICON icon = LoadIconW(GetModuleHandleW(nullptr), MAKEINTRESOURCEW(IDI_ICON1));
  panel.window.SetIcon(winrt::Microsoft::UI::GetIconIdFromIcon(icon));
  // Pixel-art skins: square corners, no system border.
  DWM_WINDOW_CORNER_PREFERENCE corners = DWMWCP_DONOTROUND;
  DwmSetWindowAttribute(panel.hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, &corners, sizeof(corners));
  COLORREF none = DWMWA_COLOR_NONE;
  DwmSetWindowAttribute(panel.hwnd, DWMWA_BORDER_COLOR, &none, sizeof(none));
}

WindowManager::Panel *WindowManager::EnsurePanel(std::string const &name) {
  if (auto p = Find(name)) {
    return p;
  }
  auto spec = Specs().find(name);
  if (spec == Specs().end() || m_panels.empty()) {
    return nullptr;
  }
  auto &main = m_panels.front();
  Panel panel;
  panel.id = name;
  // Owned by the main panel: no taskbar button, above it, minimized with it.
  panel.window = AppWindow::Create(OverlappedPresenter::Create(), main.window.Id());
  panel.window.Title(spec->second.title);
  panel.window.IsShownInSwitchers(false);
  panel.hwnd = winrt::Microsoft::UI::GetWindowFromWindowId(panel.window.Id());
  Style(panel);
  panel.rnWindow = winrt::Microsoft::ReactNative::ReactNativeWindow::CreateFromWindow(panel.window, m_compositor);
  panel.rnWindow.ResizePolicy(winrt::Microsoft::ReactNative::ContentSizePolicy::ResizeContentToParentWindow);
  winrt::Microsoft::ReactNative::ReactViewOptions options;
  options.ComponentName(spec->second.module);
  panel.rnWindow.ReactNativeIsland().ReactViewHost(
      winrt::Microsoft::ReactNative::ReactCoreInjection::MakeViewHost(m_host, options));
  // Alt+F4 on a panel hides it.
  panel.window.Closing([this, name](AppWindow const &, AppWindowClosingEventArgs const &args) {
    args.Cancel(true);
    SetPanel(name, false);
  });

  double dpi = Dpi(main);
  if (auto it = m_saved.find(name); it != m_saved.end() && it->second["w"] > 0) {
    auto &s = it->second;
    panel.window.MoveAndResize({static_cast<int>(s["x"]), static_cast<int>(s["y"]), static_cast<int>(s["w"]),
                                static_cast<int>(s["h"])});
  } else {
    // First time: the library below the main panel, details beside the
    // library, settings beside the main panel.
    RECT m = Frame(main);
    int w = static_cast<int>(spec->second.width * dpi), h = static_cast<int>(spec->second.height * dpi);
    winrt::Windows::Graphics::RectInt32 r{m.right, m.top, w, h};
    if (name == "library") {
      r = {m.left, m.bottom, w, h};
    } else if (name == "details") {
      if (auto library = Find("library"); library && Visible(*library)) {
        RECT l = Frame(*library);
        r = {l.right, l.top, w, l.bottom - l.top};
      }
    } else if (name == "editor") {
      // Below the library, or the main panel.
      RECT above = m;
      if (auto library = Find("library"); library && Visible(*library)) {
        above = Frame(*library);
      }
      r = {above.left, above.bottom, w, h};
    } else if (name == "burn") {
      // Beside the library, or the main panel.
      RECT left = m;
      if (auto library = Find("library"); library && Visible(*library)) {
        left = Frame(*library);
      }
      r = {left.right, left.top, w, h};
    }
    panel.window.MoveAndResize(r);
  }
  HookKeys(panel.rnWindow, panel.hwnd);
  m_panels.push_back(std::move(panel));
  return &m_panels.back();
}

bool WindowManager::Visible(Panel const &panel) const {
  return panel.window && panel.window.IsVisible();
}

double WindowManager::Dpi(Panel const &panel) const noexcept {
  UINT dpi = panel.hwnd ? GetDpiForWindow(panel.hwnd) : 96;
  return (dpi ? dpi : 96) / 96.0;
}

RECT WindowManager::Frame(Panel const &panel) const {
  auto p = panel.window.Position();
  auto s = panel.window.Size();
  return RECT{p.X, p.Y, p.X + s.Width, p.Y + s.Height};
}

void WindowManager::SetVisible(Panel &panel, bool visible) {
  if (visible) {
    panel.window.Show(true);
  } else {
    panel.window.Hide();
  }
  std::lock_guard lock(m_visibleMutex);
  if (visible) {
    m_visible.insert(panel.id);
  } else {
    m_visible.erase(panel.id);
  }
}

bool WindowManager::IsPanelVisible(std::string const &name) noexcept {
  std::lock_guard lock(m_visibleMutex);
  return m_visible.count(name) > 0;
}

void WindowManager::SetPanel(std::string const &name, bool visible) {
  if (visible) {
    auto panel = EnsurePanel(name);
    if (!panel) {
      return;
    }
    if (!Visible(*panel)) {
      // Open where it covers no other panel (its remembered spot if free).
      RECT f = Frame(*panel);
      auto spot = TakeJson(ss_layout_place(SceneJson().c_str(), name.c_str(), f.left, f.top, f.right - f.left,
                                           f.bottom - f.top));
      if (spot && spot->ValueType() == winrt::Windows::Data::Json::JsonValueType::Object) {
        auto o = spot->GetObject();
        panel->window.MoveAndResize({static_cast<int>(Number(o, L"x")), static_cast<int>(Number(o, L"y")),
                                     static_cast<int>(Number(o, L"w")), static_cast<int>(Number(o, L"h"))});
      }
    }
    SetVisible(*panel, true);
    Emit(name, "shown");
  } else if (auto panel = Find(name); panel && Visible(*panel)) {
    SetVisible(*panel, false);
    Emit(name, "hidden");
  }
  SaveLayout();
}

void WindowManager::SetPanelLayout(std::string const &id, double width, double height, double minWidth,
                                   double minHeight, double scale, bool resizable) {
  auto panel = Find(id);
  if (!panel) {
    return;
  }
  double dpi = Dpi(*panel);
  panel->minSize = {static_cast<LONG>(std::lround(minWidth * dpi)), static_cast<LONG>(std::lround(minHeight * dpi))};
  panel->resizable = resizable;
  if (id != kMain) {
    bool first = !panel->scale;
    panel->scale = scale;
    if (first) {
      // Its minimums are known now: straighten the saved layout, and if it
      // opened over another panel before it could shrink, place it again.
      winrt::Microsoft::UI::Dispatching::DispatcherQueue::GetForCurrentThread().TryEnqueue([this, id]() {
        Guarded("tidy", [&] {
          Tidy();
          if (auto p = Find(id)) {
            Unoverlap(*p);
          }
        });
      });
    }
    // A panel's minimums for a new scale can arrive before the main
    // panel's change; the group's scaling then comes first.
    if (m_mainScale && *m_mainScale == scale) {
      EnforceMinimum(*panel);
    }
    return;
  }
  // The main panel: a double-size change scales the docked group with it;
  // anything else (shade mode, a new skin) resizes it in place.
  if (m_mainScale && *m_mainScale > 0 && *m_mainScale != scale) {
    double ratio = scale / *m_mainScale;
    m_mainScale = scale;
    if (auto out = TakeJson(ss_layout_scale(SceneJson().c_str(), ratio))) {
      Apply(winrt::to_string(out->Stringify()));
    }
    for (auto &p : m_panels) {
      if (p.id != kMain && p.scale && *p.scale == scale) {
        EnforceMinimum(p);
      }
    }
    ConstrainToScreens();
    SaveLayout();
  }
  bool first = !m_mainScale;
  m_mainScale = scale;
  for (auto &p : m_panels) {
    if (p.id != kMain && p.scale && *p.scale == scale) {
      EnforceMinimum(p);
    }
  }
  int w = std::max(1, static_cast<int>(std::lround(width * dpi)));
  int h = std::max(1, static_cast<int>(std::lround(height * dpi)));
  auto size = panel->window.Size();
  if (size.Width != w || size.Height != h) {
    ResizeKeepingDocked(*panel, w, h);
  }
  if (first) {
    SaveLayout();
  }
}

void WindowManager::EnforceMinimum(Panel &panel) {
  auto size = panel.window.Size();
  if (size.Width < panel.minSize.cx || size.Height < panel.minSize.cy) {
    ResizeKeepingDocked(panel, std::max<int>(size.Width, panel.minSize.cx), std::max<int>(size.Height, panel.minSize.cy));
  }
}

void WindowManager::ResizeKeepingDocked(Panel &panel, int width, int height) {
  auto gesture = ss_layout_resize_begin(SceneJson().c_str(), panel.id.c_str(), 1, 1);
  if (!gesture) {
    panel.window.Resize({width, height});
    return;
  }
  auto size = panel.window.Size();
  if (auto out = TakeJson(ss_layout_gesture_update(gesture, width - size.Width, height - size.Height, false))) {
    Apply(winrt::to_string(out->Stringify()));
  }
  ss_layout_gesture_end(gesture);
  SaveLayout();
}

void WindowManager::Perform(std::string const &action) {
  if (m_panels.empty()) {
    return;
  }
  auto &main = m_panels.front();
  if (action == "minimize") {
    if (auto presenter = main.window.Presenter().try_as<OverlappedPresenter>()) {
      presenter.Minimize();
    }
  } else if (action == "quit") {
    SaveLayout();
    PostMessage(main.hwnd, WM_CLOSE, 0, 0);
  }
}

void WindowManager::BeginGesture(std::string const &id, std::string const &kind) {
  auto panel = Find(id);
  if (!panel || m_gestureTimer) {
    return;
  }
  SsLayoutGesture *gesture = kind == "resize"
      ? ss_layout_resize_begin(SceneJson().c_str(), id.c_str(), panel->minSize.cx, panel->minSize.cy)
      : ss_layout_drag_begin(SceneJson().c_str(), id.c_str());
  if (!gesture) {
    return;
  }
  POINT start{};
  GetCursorPos(&start);
  int button = GetSystemMetrics(SM_SWAPBUTTON) ? VK_RBUTTON : VK_LBUTTON;
  m_gestureTimer = winrt::Microsoft::UI::Dispatching::DispatcherQueue::GetForCurrentThread().CreateTimer();
  m_gestureTimer.Interval(std::chrono::milliseconds(8));
  m_gestureTimer.Tick([this, gesture, start, button](auto const &, auto const &) { Guarded("gesture", [&] {
    if (!(GetAsyncKeyState(button) & 0x8000)) {
      m_gestureTimer.Stop();
      m_gestureTimer = nullptr;
      ss_layout_gesture_end(gesture);
      SaveLayout();
      return;
    }
    POINT p{};
    GetCursorPos(&p);
    // Alt (like Option on the Mac) turns snapping off.
    bool snap = !(GetKeyState(VK_MENU) & 0x8000);
    if (auto out = TakeJson(ss_layout_gesture_update(gesture, p.x - start.x, p.y - start.y, snap))) {
      Apply(winrt::to_string(out->Stringify()));
    }
  }); });
  m_gestureTimer.Start();
}

int WindowManager::ShowMenu(std::string const &id, std::vector<std::string> const &items, int checked, double x,
                            double y) {
  auto panel = Find(id);
  if (!panel) {
    return -1;
  }
  HMENU menu = CreatePopupMenu();
  for (size_t i = 0; i < items.size(); i++) {
    if (items[i] == "-") {
      AppendMenuW(menu, MF_SEPARATOR, 0, nullptr);
    } else {
      UINT flags = MF_STRING | (static_cast<int>(i) == checked ? MF_CHECKED : 0);
      AppendMenuW(menu, flags, i + 1, winrt::to_hstring(items[i]).c_str());
    }
  }
  double dpi = Dpi(*panel);
  RECT f = Frame(*panel);
  POINT at{f.left + static_cast<LONG>(x * dpi), f.top + static_cast<LONG>(y * dpi)};
  SetForegroundWindow(panel->hwnd);
  int chosen = TrackPopupMenuEx(menu, TPM_RETURNCMD | TPM_NONOTIFY | TPM_LEFTALIGN | TPM_TOPALIGN, at.x, at.y,
                                panel->hwnd, nullptr);
  DestroyMenu(menu);
  return chosen > 0 ? chosen - 1 : -1;
}

std::string WindowManager::SceneJson() {
  JsonArray panels;
  for (auto const &p : m_panels) {
    RECT f = Frame(p);
    JsonObject o;
    o.SetNamedValue(L"id", JsonValue::CreateStringValue(winrt::to_hstring(p.id)));
    o.SetNamedValue(L"x", JsonValue::CreateNumberValue(f.left));
    o.SetNamedValue(L"y", JsonValue::CreateNumberValue(f.top));
    o.SetNamedValue(L"w", JsonValue::CreateNumberValue(f.right - f.left));
    o.SetNamedValue(L"h", JsonValue::CreateNumberValue(f.bottom - f.top));
    o.SetNamedValue(L"visible", JsonValue::CreateBooleanValue(Visible(p)));
    o.SetNamedValue(L"resizable", JsonValue::CreateBooleanValue(p.resizable));
    o.SetNamedValue(L"min_w", JsonValue::CreateNumberValue(p.minSize.cx));
    o.SetNamedValue(L"min_h", JsonValue::CreateNumberValue(p.minSize.cy));
    panels.Append(o);
  }
  JsonArray screens;
  EnumDisplayMonitors(
      nullptr, nullptr,
      [](HMONITOR monitor, HDC, LPRECT, LPARAM data) -> BOOL {
        MONITORINFO info{sizeof(info)};
        if (GetMonitorInfoW(monitor, &info)) {
          JsonObject o;
          o.SetNamedValue(L"x", JsonValue::CreateNumberValue(info.rcWork.left));
          o.SetNamedValue(L"y", JsonValue::CreateNumberValue(info.rcWork.top));
          o.SetNamedValue(L"w", JsonValue::CreateNumberValue(info.rcWork.right - info.rcWork.left));
          o.SetNamedValue(L"h", JsonValue::CreateNumberValue(info.rcWork.bottom - info.rcWork.top));
          reinterpret_cast<JsonArray *>(data)->Append(o);
        }
        return TRUE;
      },
      reinterpret_cast<LPARAM>(&screens));
  JsonObject scene;
  scene.SetNamedValue(L"panels", panels);
  scene.SetNamedValue(L"screens", screens);
  return winrt::to_string(scene.Stringify());
}

void WindowManager::Apply(std::string const &placementsJson) {
  JsonArray placements{nullptr};
  if (!JsonArray::TryParse(winrt::to_hstring(placementsJson), placements) || placements.Size() == 0) {
    return;
  }
  // One batch so a docked group moves together.
  HDWP batch = BeginDeferWindowPos(static_cast<int>(placements.Size()));
  for (auto const &v : placements) {
    auto o = v.GetObject();
    auto panel = Find(winrt::to_string(o.GetNamedString(L"id", L"")));
    if (!panel || !batch) {
      continue;
    }
    batch = DeferWindowPos(batch, panel->hwnd, nullptr, static_cast<int>(Number(o, L"x")),
                           static_cast<int>(Number(o, L"y")), static_cast<int>(Number(o, L"w")),
                           static_cast<int>(Number(o, L"h")), SWP_NOZORDER | SWP_NOACTIVATE);
  }
  if (batch) {
    EndDeferWindowPos(batch);
  }
}

void WindowManager::Tidy() {
  if (auto analysis = TakeJson(ss_layout_analyze(SceneJson().c_str()));
      analysis && analysis->ValueType() == winrt::Windows::Data::Json::JsonValueType::Object) {
    auto o = analysis->GetObject();
    if (o.HasKey(L"tidy") && o.GetNamedArray(L"tidy").Size() > 0) {
      Apply(winrt::to_string(o.GetNamedArray(L"tidy").Stringify()));
      SaveLayout();
    }
  }
}

void WindowManager::ConstrainToScreens() {
  if (auto analysis = TakeJson(ss_layout_analyze(SceneJson().c_str()));
      analysis && analysis->ValueType() == winrt::Windows::Data::Json::JsonValueType::Object) {
    auto o = analysis->GetObject();
    if (o.HasKey(L"constrain") && o.GetNamedArray(L"constrain").Size() > 0) {
      Apply(winrt::to_string(o.GetNamedArray(L"constrain").Stringify()));
      SaveLayout();
    }
  }
}

void WindowManager::Unoverlap(Panel &panel) {
  if (!Visible(panel)) {
    return;
  }
  RECT f = Frame(panel);
  bool covers = false;
  for (auto const &other : m_panels) {
    if (&other == &panel || !Visible(other)) {
      continue;
    }
    RECT o = Frame(other);
    if (std::min(f.right, o.right) - std::max(f.left, o.left) > 1 &&
        std::min(f.bottom, o.bottom) - std::max(f.top, o.top) > 1) {
      covers = true;
    }
  }
  if (!covers) {
    return;
  }
  // Placed as if closed (it's excluded from the scene's open panels).
  SetVisible(panel, false);
  auto spot = TakeJson(ss_layout_place(SceneJson().c_str(), panel.id.c_str(), f.left, f.top, f.right - f.left,
                                       f.bottom - f.top));
  if (spot && spot->ValueType() == winrt::Windows::Data::Json::JsonValueType::Object) {
    auto o = spot->GetObject();
    panel.window.MoveAndResize({static_cast<int>(Number(o, L"x")), static_cast<int>(Number(o, L"y")),
                                static_cast<int>(Number(o, L"w")), static_cast<int>(Number(o, L"h"))});
  }
  SetVisible(panel, true);
  SaveLayout();
}

void WindowManager::SaveLayout() {
  if (m_panels.empty()) {
    return;
  }
  JsonArray panels;
  for (auto const &p : m_panels) {
    RECT f = Frame(p);
    JsonObject o;
    o.SetNamedValue(L"id", JsonValue::CreateStringValue(winrt::to_hstring(p.id)));
    o.SetNamedValue(L"x", JsonValue::CreateNumberValue(f.left));
    o.SetNamedValue(L"y", JsonValue::CreateNumberValue(f.top));
    o.SetNamedValue(L"w", JsonValue::CreateNumberValue(f.right - f.left));
    o.SetNamedValue(L"h", JsonValue::CreateNumberValue(f.bottom - f.top));
    o.SetNamedValue(L"visible", JsonValue::CreateBooleanValue(Visible(p)));
    panels.Append(o);
    auto &entry = m_saved[p.id];
    entry["x"] = f.left;
    entry["y"] = f.top;
    entry["w"] = f.right - f.left;
    entry["h"] = f.bottom - f.top;
    entry["visible"] = Visible(p) ? 1 : 0;
  }
  JsonObject layout;
  layout.SetNamedValue(L"version", JsonValue::CreateNumberValue(1));
  layout.SetNamedValue(L"panels", panels);
  if (m_mainScale) {
    layout.SetNamedValue(L"scale", JsonValue::CreateNumberValue(*m_mainScale));
  }
  ss_layout_save(winrt::to_string(layout.Stringify()).c_str());
}

/// Ctrl+D (double size) in any panel; macOS has it in the Window menu. The
/// island exists once React has attached, so this retries until then.
void WindowManager::HookKeys(winrt::Microsoft::ReactNative::ReactNativeWindow const &rnWindow, HWND hwnd, int attempts) {
  auto island = rnWindow.ReactNativeIsland().Island();
  if (!island) {
    if (attempts > 0) {
      auto timer = winrt::Microsoft::UI::Dispatching::DispatcherQueue::GetForCurrentThread().CreateTimer();
      timer.Interval(std::chrono::milliseconds(100));
      timer.IsRepeating(false);
      timer.Tick([this, rnWindow, hwnd, attempts, timer](auto const &, auto const &) {
        Guarded("hook keys", [&] { HookKeys(rnWindow, hwnd, attempts - 1); });
      });
      timer.Start();
    }
    return;
  }
  // Dropped skins: the island's child window covers the panel, so it (and
  // the panel itself) take files.
  AcceptSkinDrops(hwnd);
  EnumChildWindows(
      hwnd,
      [](HWND child, LPARAM) -> BOOL {
        AcceptSkinDrops(child);
        return TRUE;
      },
      0);
  using namespace winrt::Microsoft::UI::Input;
  InputKeyboardSource::GetForIsland(island).KeyDown([this](InputKeyboardSource const &, winrt::Microsoft::UI::Input::KeyEventArgs const &args) {
    auto ctrl = InputKeyboardSource::GetKeyStateForCurrentThread(winrt::Windows::System::VirtualKey::Control);
    if (args.VirtualKey() == winrt::Windows::System::VirtualKey::D &&
        (ctrl & winrt::Windows::UI::Core::CoreVirtualKeyStates::Down) == winrt::Windows::UI::Core::CoreVirtualKeyStates::Down) {
      args.Handled(true);
      Emit(kMain, "toggleDoubleSize");
    }
  });
}

bool WindowManager::IsSkinFile(std::wstring const &path) {
  auto dot = path.find_last_of(L'.');
  if (dot != std::wstring::npos) {
    std::wstring ext = path.substr(dot);
    for (auto &c : ext) {
      c = static_cast<wchar_t>(towlower(c));
    }
    if (ext == L".sskin" || ext == L".zip") {
      return true;
    }
  }
  auto attributes = GetFileAttributesW(path.c_str());
  if (attributes == INVALID_FILE_ATTRIBUTES || !(attributes & FILE_ATTRIBUTE_DIRECTORY)) {
    return false;
  }
  auto manifest = GetFileAttributesW((path + L"\\skin.json").c_str());
  return manifest != INVALID_FILE_ATTRIBUTES && !(manifest & FILE_ATTRIBUTE_DIRECTORY);
}

void WindowManager::OpenSkinFiles(std::vector<std::string> const &paths) {
  {
    std::lock_guard lock(m_skinFilesMutex);
    m_skinFiles.insert(m_skinFiles.end(), paths.begin(), paths.end());
  }
  // Before Init (launched by opening a skin), JS takes them when it starts.
  if (!m_ui) {
    return;
  }
  m_ui.TryEnqueue([this]() {
    Guarded("open skins", [&] {
      if (!m_panels.empty()) {
        auto &main = m_panels.front();
        if (auto presenter = main.window.Presenter().try_as<OverlappedPresenter>();
            presenter && presenter.State() == OverlappedPresenterState::Minimized) {
          presenter.Restore();
        }
        main.window.Show(true);
        SetForegroundWindow(main.hwnd);
      }
      Emit(kMain, "skinFilesOpened");
    });
  });
}

std::vector<std::string> WindowManager::TakeOpenedSkinFiles() {
  std::lock_guard lock(m_skinFilesMutex);
  return std::exchange(m_skinFiles, {});
}

void WindowManager::Emit(std::string const &window, std::string const &event) noexcept {
  if (onEvent) {
    onEvent(window, event);
  }
}

} // namespace SoundScraper
