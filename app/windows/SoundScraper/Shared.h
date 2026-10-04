#pragma once

// Small pieces shared by the native modules and views.

#include <NativeModules.h>

#include <memory>
#include <string>

#include "sound_scraper.h"

namespace SoundScraper {

// Schedules work on the JS thread. Under the New Architecture the context's
// JSDispatcher is empty (Post silently does nothing); the CallInvoker works.
struct JsThread {
  std::shared_ptr<facebook::react::CallInvoker> invoker;

  template <class F>
  void Post(F f) const noexcept {
    if (invoker) {
      invoker->invokeAsync(std::function<void()>(std::move(f)));
    }
  }
};

/// Appends a line to %TEMP%\\SoundScraper-errors.txt: native failures the
/// app survives (a panel that couldn't open, an image that couldn't load).
inline void LogError(const char *message) noexcept {
  wchar_t path[MAX_PATH];
  GetTempPathW(MAX_PATH, path);
  wcscat_s(path, L"SoundScraper-errors.txt");
  FILE *f = nullptr;
  if (_wfopen_s(&f, path, L"a") == 0 && f) {
    fprintf(f, "%s\n", message);
    fclose(f);
  }
}

/// Runs `f`, logging (instead of crashing on) a WinRT or C++ exception.
template <class F>
void Guarded(const char *what, F &&f) noexcept {
  try {
    f();
  } catch (winrt::hresult_error const &e) {
    LogError((std::string(what) + ": " + winrt::to_string(e.message())).c_str());
  } catch (std::exception const &e) {
    LogError((std::string(what) + ": " + e.what()).c_str());
  } catch (...) {
    LogError((std::string(what) + ": unknown exception").c_str());
  }
}

/// The recorder in use, for the visualizer view (VisualizerView.h); UI and
/// JS threads only read it.
inline SsRecorder *&CurrentRecorder() noexcept {
  static SsRecorder *recorder = nullptr;
  return recorder;
}

} // namespace SoundScraper
