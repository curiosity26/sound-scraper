// The track editor (the Rust core's ss_editor_*, ss_edits_* and ss_masters_*
// functions) on Linux: the "SoundScraperEditor" TurboModule (spec:
// src/bridge/NativeEditor.ts). Mirrors app/windows/SoundScraper/EditorModule.h.
#pragma once

#include <react/bridging/Promise.h>
#include <rngtk/CxxModule.h>

#include <memory>
#include <mutex>
#include <string>

#include "sound_scraper.h"

namespace soundscraper {

class EditorModule : public rngtk::CxxModule<EditorModule> {
 public:
  static constexpr const char *kName = "SoundScraperEditor";
  explicit EditorModule(std::shared_ptr<facebook::react::CallInvoker> jsInvoker);
  ~EditorModule() override;

  double open(facebook::jsi::Runtime &rt, std::string path);
  void close(facebook::jsi::Runtime &rt, double id);
  std::string status(facebook::jsi::Runtime &rt, double id);
  std::string tracks(facebook::jsi::Runtime &rt, double id, std::string editsJson);
  std::string detect(facebook::jsi::Runtime &rt, double id, std::string optionsJson);
  std::string loadDraft(facebook::jsi::Runtime &rt, std::string fileName);
  void saveDraft(facebook::jsi::Runtime &rt, std::string fileName, std::string editsJson);
  void discardDraft(facebook::jsi::Runtime &rt, std::string fileName);
  std::string mastersUsage(facebook::jsi::Runtime &rt);
  facebook::react::AsyncPromise<> deleteAllMasters(facebook::jsi::Runtime &rt);
  facebook::react::AsyncPromise<std::string> save(facebook::jsi::Runtime &rt, std::string fileName,
                                                  std::string editsJson, bool keepOriginal);

 private:
  // Its own library handle, for saving.
  struct Saver {
    std::mutex mutex;
    SsLibrary *library = nullptr;
    ~Saver() { ss_library_destroy(library); }
  };
  std::shared_ptr<Saver> saver_ = std::make_shared<Saver>();
};

}  // namespace soundscraper
