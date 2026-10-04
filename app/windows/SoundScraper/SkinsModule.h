#pragma once

// Skins (the Rust core's ss_skin_* functions) and the skinned windows
// (WindowManager) for React Native. Mirrors
// app/macos/SoundScraper-macOS/RCTSoundScraperSkins.mm.

#include <NativeModules.h>

#include <shobjidl.h>

#include <memory>
#include <thread>

#include "codegen/NativeSkinsDataTypes.g.h"
#include "codegen/NativeSkinsSpec.g.h"
#include "Shared.h"
#include "WindowManager.h"
#include "sound_scraper.h"

namespace SoundScraper {

REACT_TURBO_MODULE(SkinsModule, L"SoundScraperSkins")
struct SkinsModule {
  using ModuleSpec = SoundScraperCodegen::SkinsSpec;
  using WindowEvent = SoundScraperCodegen::SkinsSpec_WindowEvent;

  REACT_EVENT(onWindowEvent)
  std::function<void(WindowEvent)> onWindowEvent;

  REACT_INIT(Initialize)
  void Initialize(winrt::Microsoft::ReactNative::ReactContext const &context) noexcept {
    m_js = JsThread{context.CallInvoker()};
    m_ui = context.UIDispatcher();
    m_alive = std::make_shared<SkinsModule *>(this);
    std::weak_ptr<SkinsModule *> weak = m_alive;
    auto js = m_js;
    m_ui.Post([weak, js]() {
      WindowManager::Get().onEvent = [weak, js](std::string window, std::string event) {
        js.Post([weak, window, event]() {
          if (auto self = weak.lock(); self && (*self)->onWindowEvent) {
            (*self)->onWindowEvent(WindowEvent{window, event});
          }
        });
      };
    });
  }

  REACT_METHOD(loadSkin)
  void loadSkin(std::string idOrPath, ::React::ReactPromise<std::string> &&result) noexcept {
    ResolveString([idOrPath]() { return ss_skin_load(idOrPath.c_str()); }, std::move(result));
  }

  REACT_METHOD(loadCurrentSkin)
  void loadCurrentSkin(::React::ReactPromise<std::string> &&result) noexcept {
    ResolveString([]() { return ss_skin_load_current(); }, std::move(result));
  }

  REACT_METHOD(listSkins)
  void listSkins(::React::ReactPromise<std::string> &&result) noexcept {
    ResolveString([]() { return ss_skins_list(); }, std::move(result));
  }

  REACT_METHOD(installSkin)
  void installSkin(std::string archivePath, ::React::ReactPromise<std::string> &&result) noexcept {
    ResolveString([archivePath]() { return ss_skin_install(archivePath.c_str()); }, std::move(result));
  }

  REACT_METHOD(removeSkin)
  void removeSkin(std::string id, ::React::ReactPromise<void> &&result) noexcept {
    std::thread([js = m_js, id, result]() {
      if (ss_skin_remove(id.c_str()) != SS_STATUS_OK) {
        js.Post([result, message = std::string(ss_last_error_message())]() { result.Reject(message.c_str()); });
        return;
      }
      js.Post([result]() { result.Resolve(); });
    }).detach();
  }

  REACT_METHOD(pickSkinArchive)
  void pickSkinArchive(::React::ReactPromise<std::optional<std::string>> &&result) noexcept {
    Pick(L"Install a skin", false, std::move(result));
  }

  REACT_METHOD(pickSkinFolder)
  void pickSkinFolder(::React::ReactPromise<std::optional<std::string>> &&result) noexcept {
    Pick(L"Use an unpacked skin folder", true, std::move(result));
  }

  REACT_METHOD(setPanelLayout)
  void setPanelLayout(std::string panel, double width, double height, std::vector<double> const &dragRegions,
                      std::vector<double> const &holes, std::vector<double> const &grip, double minWidth,
                      double minHeight, double scale) noexcept {
    // Drag regions and holes are handled by the React views on Windows
    // (DragSurface.tsx); the grip only tells whether the panel resizes.
    (void)dragRegions;
    (void)holes;
    bool resizable = grip.size() >= 4;
    m_ui.Post([=]() {
      Guarded("setPanelLayout", [&] {
        WindowManager::Get().SetPanelLayout(panel, width, height, minWidth, minHeight, scale, resizable);
      });
    });
  }

  REACT_METHOD(windowAction)
  void windowAction(std::string action) noexcept {
    m_ui.Post([action]() { Guarded("windowAction", [&] { WindowManager::Get().Perform(action); }); });
  }

  REACT_METHOD(beginGesture)
  void beginGesture(std::string panel, std::string kind) noexcept {
    m_ui.Post([panel, kind]() { Guarded("beginGesture", [&] { WindowManager::Get().BeginGesture(panel, kind); }); });
  }

  REACT_METHOD(setPanelVisible)
  void setPanelVisible(std::string panel, bool visible) noexcept {
    m_ui.Post([panel, visible]() { Guarded("setPanelVisible", [&] { WindowManager::Get().SetPanel(panel, visible); }); });
  }

  REACT_SYNC_METHOD(isPanelVisible)
  bool isPanelVisible(std::string panel) noexcept {
    return WindowManager::Get().IsPanelVisible(panel);
  }

  REACT_METHOD(showMenu)
  void showMenu(std::string panel, std::vector<std::string> const &items, double checked, double x, double y,
                ::React::ReactPromise<double> &&result) noexcept {
    m_ui.Post([js = m_js, panel, items, checked, x, y, result]() {
      int chosen = -1;
      Guarded("showMenu", [&] { chosen = WindowManager::Get().ShowMenu(panel, items, static_cast<int>(checked), x, y); });
      js.Post([result, chosen]() { result.Resolve(chosen); });
    });
  }

 private:
  /// Runs a core call that returns a string (or NULL with an error) off the
  /// JS thread and settles the promise on it.
  template <class Call>
  void ResolveString(Call call, ::React::ReactPromise<std::string> &&result) noexcept {
    std::thread([js = m_js, call, result]() {
      char *s = call();
      if (!s) {
        js.Post([result, message = std::string(ss_last_error_message())]() { result.Reject(message.c_str()); });
        return;
      }
      std::string out(s);
      ss_string_free(s);
      js.Post([result, out]() { result.Resolve(out); });
    }).detach();
  }

  void Pick(const wchar_t *title, bool folder, ::React::ReactPromise<std::optional<std::string>> &&result) noexcept {
    std::thread([js = m_js, title, folder, result]() {
      CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
      std::optional<std::string> picked;
      {
        winrt::com_ptr<IFileOpenDialog> dialog;
        if (SUCCEEDED(CoCreateInstance(CLSID_FileOpenDialog, nullptr, CLSCTX_INPROC_SERVER,
                                       IID_PPV_ARGS(dialog.put())))) {
          FILEOPENDIALOGOPTIONS options{};
          dialog->GetOptions(&options);
          dialog->SetOptions(options | FOS_FORCEFILESYSTEM | (folder ? FOS_PICKFOLDERS : 0));
          dialog->SetTitle(title);
          if (!folder) {
            COMDLG_FILTERSPEC types[] = {{L"Sound Scraper skins", L"*.sskin;*.zip"}};
            dialog->SetFileTypes(1, types);
          }
          winrt::com_ptr<IShellItem> item;
          PWSTR path = nullptr;
          if (SUCCEEDED(dialog->Show(nullptr)) && SUCCEEDED(dialog->GetResult(item.put())) &&
              SUCCEEDED(item->GetDisplayName(SIGDN_FILESYSPATH, &path))) {
            picked = winrt::to_string(path);
            CoTaskMemFree(path);
          }
        }
      }
      CoUninitialize();
      js.Post([result, picked]() { result.Resolve(picked); });
    }).detach();
  }

  JsThread m_js;
  winrt::Microsoft::ReactNative::ReactDispatcher m_ui{nullptr};
  std::shared_ptr<SkinsModule *> m_alive;
};

} // namespace SoundScraper
