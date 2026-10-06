#pragma once

// The track editor (the Rust core's ss_editor_*, ss_edits_* and ss_masters_*
// functions) for React Native. Mirrors
// app/macos/SoundScraper-macOS/RCTSoundScraperEditor.mm.

#include <NativeModules.h>

#include <mutex>
#include <thread>

#include "codegen/NativeEditorSpec.g.h"
#include "Shared.h"
#include "sound_scraper.h"

namespace SoundScraper {

REACT_TURBO_MODULE(EditorModule, L"SoundScraperEditor")
struct EditorModule {
  using ModuleSpec = SoundScraperCodegen::EditorSpec;

  REACT_INIT(Initialize)
  void Initialize(winrt::Microsoft::ReactNative::ReactContext const &context) noexcept {
    m_js = JsThread{context.CallInvoker()};
  }

  ~EditorModule() {
    std::lock_guard lock(m_saving);
    ss_library_destroy(m_library);
  }

  REACT_SYNC_METHOD(open)
  double open(std::string path) noexcept {
    return static_cast<double>(ss_editor_open(path.c_str()));
  }

  REACT_METHOD(close)
  void close(double id) noexcept {
    ss_editor_close(static_cast<uint64_t>(id));
  }

  REACT_SYNC_METHOD(status)
  std::string status(double id) noexcept {
    return Take(ss_editor_status(static_cast<uint64_t>(id)),
                R"({"state":"failed","message":"The editor is closed."})");
  }

  REACT_SYNC_METHOD(tracks)
  std::string tracks(double id, std::string editsJson) noexcept {
    return Take(ss_editor_tracks(static_cast<uint64_t>(id), editsJson.c_str()), "[]");
  }

  REACT_SYNC_METHOD(detect)
  std::string detect(double id, std::string optionsJson) noexcept {
    return Take(ss_editor_detect(static_cast<uint64_t>(id), optionsJson.c_str()), "[]");
  }

  REACT_SYNC_METHOD(loadDraft)
  std::string loadDraft(std::string fileName) noexcept {
    return Take(ss_edits_load_draft(fileName.c_str()), "null");
  }

  REACT_METHOD(saveDraft)
  void saveDraft(std::string fileName, std::string editsJson) noexcept {
    if (ss_edits_save_draft(fileName.c_str(), editsJson.c_str()) != SS_STATUS_OK) {
      LogError((std::string("saving editor draft: ") + ss_last_error_message()).c_str());
    }
  }

  REACT_METHOD(discardDraft)
  void discardDraft(std::string fileName) noexcept {
    ss_edits_discard_draft(fileName.c_str());
  }

  REACT_SYNC_METHOD(mastersUsage)
  std::string mastersUsage() noexcept {
    return Take(ss_masters_usage(), R"({"count":0,"bytes":0})");
  }

  REACT_METHOD(deleteAllMasters)
  void deleteAllMasters(::React::ReactPromise<void> &&result) noexcept {
    std::thread([js = m_js, result]() {
      if (ss_masters_delete_all() != SS_STATUS_OK) {
        js.Post([result, message = std::string(ss_last_error_message())]() { result.Reject(message.c_str()); });
        return;
      }
      js.Post([result]() { result.Resolve(); });
    }).detach();
  }

  /// Writes the tracks (blocking, so off the JS thread), then trashes the
  /// original unless keepOriginal.
  REACT_METHOD(save)
  void save(std::string fileName, std::string editsJson, bool keepOriginal,
            ::React::ReactPromise<std::string> &&result) noexcept {
    std::thread([this, js = m_js, fileName, editsJson, keepOriginal, result]() {
      char *json = nullptr;
      std::string error;
      {
        std::lock_guard lock(m_saving);
        if (!m_library) {
          m_library = ss_library_open();
        }
        json = m_library ? ss_editor_save(m_library, fileName.c_str(), editsJson.c_str(), keepOriginal) : nullptr;
        if (!json) {
          error = ss_last_error_message();
        }
      }
      if (!json) {
        js.Post([result, error]() { result.Reject(error.c_str()); });
        return;
      }
      std::string out = json;
      ss_string_free(json);
      js.Post([result, out]() { result.Resolve(out); });
    }).detach();
  }

 private:
  static std::string Take(char *s, const char *fallback) noexcept {
    std::string out = s ? s : fallback;
    ss_string_free(s);
    return out;
  }

  JsThread m_js;
  std::mutex m_saving;
  SsLibrary *m_library{nullptr}; // its own handle, for saving
};

} // namespace SoundScraper
