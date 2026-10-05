#pragma once

// The app's windows on Windows: the skinned main panel and the library,
// details and settings panels, each a React Native island on the shared
// ReactNativeHost. Docking, snapping and resizing come from the Rust core
// (core/crates/layout, ss_layout_*); this class applies them to Win32.
// Mirrors app/macos/SoundScraper-macOS/SkinWindows.swift. UI thread only,
// except IsPanelVisible.

#include <functional>
#include <map>
#include <mutex>
#include <optional>
#include <set>
#include <string>
#include <vector>

namespace SoundScraper {

class WindowManager {
 public:
  static WindowManager &Get() noexcept;

  /// Takes over the app's main window (borderless, sized by the skin).
  void Init(winrt::Microsoft::ReactNative::ReactNativeWin32App const &app);

  /// (window, event), e.g. ("library", "hidden"); set by the skins module.
  std::function<void(std::string, std::string)> onEvent;

  /// A panel's chrome from the skin, in DIPs: its minimum size, and (main
  /// panel) its size; `scale` is the skin scale (2 in double size).
  void SetPanelLayout(std::string const &id, double width, double height, double minWidth, double minHeight,
                      double scale, bool resizable);
  void Perform(std::string const &action);
  void SetPanel(std::string const &name, bool visible);
  /// Any thread.
  bool IsPanelVisible(std::string const &name) noexcept;
  /// Follows the mouse (move or resize) until the button is released.
  void BeginGesture(std::string const &id, std::string const &kind);
  /// A pop-up menu at (x, y) DIPs in a panel; the chosen index or -1.
  int ShowMenu(std::string const &id, std::vector<std::string> const &items, int checked, double x, double y);
  void SaveLayout();
  /// Skins (.sskin paths, or skin folders) to install: opened from
  /// Explorer, passed to a second launch, or dropped on a panel. Any
  /// thread; JS is told (window event "skinFilesOpened") and takes them.
  void OpenSkinFiles(std::vector<std::string> const &paths);
  /// Any thread.
  std::vector<std::string> TakeOpenedSkinFiles();
  /// A `.sskin`/`.zip` archive, or a folder holding skin.json.
  static bool IsSkinFile(std::wstring const &path);

 private:
  struct Panel {
    std::string id;
    winrt::Microsoft::UI::Windowing::AppWindow window{nullptr};
    winrt::Microsoft::ReactNative::ReactNativeWindow rnWindow{nullptr};
    HWND hwnd{nullptr};
    /// Physical pixels.
    SIZE minSize{0, 0};
    bool resizable{false};
    std::optional<double> scale;
  };

  Panel *Find(std::string const &id) noexcept;
  Panel *EnsurePanel(std::string const &name);
  void Style(Panel &panel);
  void SetVisible(Panel &panel, bool visible);
  bool Visible(Panel const &panel) const;
  double Dpi(Panel const &panel) const noexcept;
  RECT Frame(Panel const &panel) const;
  std::string SceneJson();
  void Apply(std::string const &placementsJson);
  void ResizeKeepingDocked(Panel &panel, int width, int height);
  void EnforceMinimum(Panel &panel);
  void Tidy();
  void Unoverlap(Panel &panel);
  void ConstrainToScreens();
  void HookKeys(winrt::Microsoft::ReactNative::ReactNativeWindow const &rnWindow, HWND hwnd, int attempts = 20);
  void Emit(std::string const &window, std::string const &event) noexcept;

  winrt::Microsoft::ReactNative::ReactNativeHost m_host{nullptr};
  winrt::Microsoft::UI::Composition::Compositor m_compositor{nullptr};
  std::vector<Panel> m_panels; // main first
  std::map<std::string, std::map<std::string, double>> m_saved;
  std::optional<double> m_mainScale;
  winrt::Microsoft::UI::Dispatching::DispatcherQueueTimer m_gestureTimer{nullptr};
  std::mutex m_visibleMutex;
  std::set<std::string> m_visible;
  winrt::Microsoft::UI::Dispatching::DispatcherQueue m_ui{nullptr};
  std::mutex m_skinFilesMutex;
  std::vector<std::string> m_skinFiles;
};

} // namespace SoundScraper
