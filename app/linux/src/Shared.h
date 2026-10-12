// Small pieces shared by the Linux native modules and views. Mirrors
// app/windows/SoundScraper/Shared.h.
#pragma once

#include <ReactCommon/CallInvoker.h>
#include <glib.h>
#include <react/bridging/Error.h>
#include <react/bridging/Promise.h>

#include <functional>
#include <optional>
#include <string>
#include <thread>
#include <utility>

#include "sound_scraper.h"

namespace soundscraper {

/// Logs a native failure the app survives (a panel that couldn't open, an
/// image that couldn't load) to the journal / stderr.
inline void logError(const std::string &message) {
  g_warning("Sound Scraper: %s", message.c_str());
}

/// The core's last error, for a rejected promise.
inline facebook::react::Error lastError() {
  const char *message = ss_last_error_message();
  return facebook::react::Error(message && *message ? message : "unknown error");
}

/// Takes a string the core allocated: its contents, or `fallback` for NULL.
inline std::string take(char *s, const char *fallback) {
  std::string out = s ? s : fallback;
  ss_string_free(s);
  return out;
}

inline std::optional<std::string> optional(const char *s) {
  return s ? std::optional<std::string>(s) : std::nullopt;
}

/// Runs blocking core calls off the JS thread. Promises settle from any
/// thread (AsyncPromise hops to the JS thread itself).
template <class Work>
void runOffThread(Work work) {
  std::thread(std::move(work)).detach();
}

/// Runs `fn` on GTK's main thread (GTK is only for that thread).
inline void runOnMain(std::function<void()> fn) {
  g_main_context_invoke_full(
      nullptr, G_PRIORITY_DEFAULT,
      [](gpointer data) -> gboolean {
        (*static_cast<std::function<void()> *>(data))();
        return G_SOURCE_REMOVE;
      },
      new std::function<void()>(std::move(fn)),
      [](gpointer data) { delete static_cast<std::function<void()> *>(data); });
}

/// The recorder in use, for the visualizer view; the main and JS threads
/// only read it.
inline SsRecorder *&currentRecorder() {
  static SsRecorder *recorder = nullptr;
  return recorder;
}

}  // namespace soundscraper
