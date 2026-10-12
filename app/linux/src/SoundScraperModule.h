// React Native bridge to the Rust core (core/include/sound_scraper.h) on
// Linux: the "SoundScraper" TurboModule (spec: src/bridge/NativeSoundScraper.ts).
// Marshals arguments only; all logic lives in Rust. Mirrors
// app/windows/SoundScraper/SoundScraperModule.h.
#pragma once

#include <folly/dynamic.h>
#include <react/bridging/EventEmitter.h>
#include <react/bridging/Promise.h>
#include <rngtk/CxxModule.h>

#include <condition_variable>
#include <deque>
#include <functional>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
#include <vector>

#include "sound_scraper.h"

namespace soundscraper {

/// Runs work in order on one thread, off the JS thread (loading a file and
/// opening the output device can take a moment).
class SerialQueue {
 public:
  SerialQueue();
  ~SerialQueue();
  void post(std::function<void()> work);

 private:
  void run();
  std::mutex mutex_;
  std::condition_variable wake_;
  std::deque<std::function<void()>> work_;
  bool done_ = false;
  std::thread thread_;
};

class SoundScraperModule : public rngtk::CxxModule<SoundScraperModule> {
 public:
  static constexpr const char *kName = "SoundScraper";
  explicit SoundScraperModule(std::shared_ptr<facebook::react::CallInvoker> jsInvoker);
  ~SoundScraperModule() override;

  std::string getVersion(facebook::jsi::Runtime &rt);
  folly::dynamic listAudioApps(facebook::jsi::Runtime &rt);
  facebook::react::AsyncPromise<folly::dynamic> recordTestWav(facebook::jsi::Runtime &rt,
                                                              double appPid, double seconds);

  facebook::react::AsyncPromise<> recorderStart(facebook::jsi::Runtime &rt, double appPid);
  void recorderPause(facebook::jsi::Runtime &rt);
  void recorderResume(facebook::jsi::Runtime &rt);
  facebook::react::AsyncPromise<std::string> recorderStop(facebook::jsi::Runtime &rt);
  std::string recorderState(facebook::jsi::Runtime &rt);
  double recoverPartialRecordings(facebook::jsi::Runtime &rt);

  facebook::react::AsyncPromise<> playerLoad(facebook::jsi::Runtime &rt, std::string path);
  void playerUnload(facebook::jsi::Runtime &rt);
  facebook::react::AsyncPromise<> playerPlay(facebook::jsi::Runtime &rt);
  void playerPause(facebook::jsi::Runtime &rt);
  void playerStop(facebook::jsi::Runtime &rt);
  void playerSeek(facebook::jsi::Runtime &rt, double positionMs);
  std::string playerState(facebook::jsi::Runtime &rt);

  facebook::react::AsyncPromise<folly::dynamic> listRecordings(facebook::jsi::Runtime &rt);
  facebook::react::AsyncPromise<std::string> renameRecording(facebook::jsi::Runtime &rt,
                                                             std::string fileName,
                                                             std::string newName);
  facebook::react::AsyncPromise<> trashRecording(facebook::jsi::Runtime &rt, std::string fileName);
  void revealRecording(facebook::jsi::Runtime &rt, std::string fileName);

  facebook::react::AsyncPromise<folly::dynamic> readTags(facebook::jsi::Runtime &rt,
                                                         std::string fileName);
  facebook::react::AsyncPromise<> writeTags(facebook::jsi::Runtime &rt,
                                            std::vector<std::string> fileNames,
                                            folly::dynamic edit);
  facebook::react::AsyncPromise<std::optional<std::string>> pickImage(facebook::jsi::Runtime &rt);

  std::string getSettings(facebook::jsi::Runtime &rt);
  facebook::react::AsyncPromise<> setSettings(facebook::jsi::Runtime &rt, std::string json);
  facebook::react::AsyncPromise<std::optional<std::string>> pickFolder(facebook::jsi::Runtime &rt);

  std::string playlists(facebook::jsi::Runtime &rt, std::string requestJson);
  std::string burn(facebook::jsi::Runtime &rt, std::string requestJson);
  facebook::react::AsyncPromise<std::optional<std::string>> pickSaveFile(
      facebook::jsi::Runtime &rt, std::string title, std::string defaultName, std::string extension);

 private:
  using Emitter = facebook::react::AsyncEventEmitter<folly::dynamic>;

  // What the core's callbacks reach; reset in the destructor, which makes
  // late events no-ops.
  struct Sink {
    std::shared_ptr<Emitter> recorderEvents;
    std::shared_ptr<Emitter> libraryChanged;
  };
  static void onRecorderEvent(const SsRecorderEvent *event, void *userData);
  static void onLibraryChanged(void *userData);

  SsRecorder *recorder_ = nullptr;
  SsLibrary *library_ = nullptr;
  std::unique_ptr<SerialQueue> player_;
  std::shared_ptr<Sink> sink_;
  std::weak_ptr<Sink> *sinkRef_ = nullptr;
};

}  // namespace soundscraper
