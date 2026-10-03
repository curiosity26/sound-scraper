#pragma once

// React Native bridge to the Rust core (core/include/sound_scraper.h).
// Marshals arguments only; all logic lives in Rust.

#include <NativeModules.h>

#include <thread>

#include "codegen/NativeSoundScraperDataTypes.g.h"
#include "codegen/NativeSoundScraperSpec.g.h"
#include "sound_scraper.h"

namespace SoundScraper {

REACT_MODULE(SoundScraperModule, L"SoundScraper")
struct SoundScraperModule {
  // Compile-time check against the shared TS spec (src/native/NativeSoundScraper.ts).
  using ModuleSpec = SoundScraperCodegen::SoundScraperSpec;
  using AudioApp = SoundScraperCodegen::SoundScraperSpec_AudioApp;
  using CaptureReport = SoundScraperCodegen::SoundScraperSpec_CaptureReport;

  REACT_SYNC_METHOD(getVersion)
  std::string getVersion() noexcept {
    return ss_version();
  }

  REACT_SYNC_METHOD(listAudioApps)
  std::vector<AudioApp> listAudioApps() noexcept {
    std::vector<AudioApp> apps;
    SsAudioAppList *list = ss_audio_apps_list();
    for (size_t i = 0, n = ss_audio_app_list_len(list); i < n; i++) {
      const SsAudioApp *app = ss_audio_app_list_get(list, i);
      AudioApp out;
      out.pid = app->pid;
      out.name = app->name;
      if (app->bundle_id) {
        out.bundleId = app->bundle_id;
      }
      out.isPlaying = app->is_playing;
      apps.push_back(std::move(out));
    }
    ss_audio_app_list_free(list);
    return apps;
  }

  REACT_METHOD(recordTestWav)
  void recordTestWav(double appPid, double seconds, ::React::ReactPromise<CaptureReport> &&result) noexcept {
    // ss_capture_test_wav blocks for the whole recording.
    std::thread([appPid, seconds, result = std::move(result)]() mutable {
      SsCaptureReport report{};
      if (ss_capture_test_wav(static_cast<uint32_t>(appPid), seconds, &report) != SS_STATUS_OK) {
        result.Reject(ss_last_error_message());
        return;
      }
      CaptureReport out;
      out.path = report.path ? report.path : "";
      out.frames = static_cast<double>(report.frames);
      out.sampleRate = report.sample_rate;
      out.channels = report.channels;
      out.peak = report.peak;
      ss_capture_report_free(&report);
      result.Resolve(out);
    }).detach();
  }
};

} // namespace SoundScraper
