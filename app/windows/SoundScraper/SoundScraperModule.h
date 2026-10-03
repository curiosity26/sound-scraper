#pragma once

// React Native bridge to the Rust core (core/include/sound_scraper.h).
// Marshals arguments only; all logic lives in Rust.

#include <NativeModules.h>

#include <memory>
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
  using RecorderEvent = SoundScraperCodegen::SoundScraperSpec_RecorderEvent;
  using Recording = SoundScraperCodegen::SoundScraperSpec_Recording;

  REACT_EVENT(onLibraryChanged)
  std::function<void(std::string)> onLibraryChanged;

  REACT_EVENT(onRecorderEvent)
  std::function<void(RecorderEvent)> onRecorderEvent;

  REACT_INIT(Initialize)
  void Initialize(winrt::Microsoft::ReactNative::ReactContext const &context) noexcept {
    m_sink = std::make_shared<EventSink>(EventSink{context, onRecorderEvent, onLibraryChanged});
    m_recorder = ss_recorder_create();
    // Rust owns this pointer's lifetime via the callback; freed in the destructor.
    m_sinkRef = new std::weak_ptr<EventSink>(m_sink);
    ss_recorder_set_callback(m_recorder, &SoundScraperModule::OnRecorderEvent, m_sinkRef);
    m_library = ss_library_open(); // NULL if unavailable; calls then report an error
    if (m_library) {
      ss_library_set_callback(m_library, &SoundScraperModule::OnLibraryChanged, m_sinkRef);
    }
  }

  ~SoundScraperModule() {
    m_sink.reset(); // late events become no-ops
    ss_recorder_destroy(m_recorder); // finalizes an in-progress recording
    ss_library_destroy(m_library);
    delete m_sinkRef;
  }

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

  REACT_METHOD(recorderStart)
  void recorderStart(double appPid, ::React::ReactPromise<void> &&result) noexcept {
    std::thread([recorder = m_recorder, appPid, result = std::move(result)]() mutable {
      if (ss_recorder_start(recorder, static_cast<uint32_t>(appPid)) != SS_STATUS_OK) {
        result.Reject(ss_last_error_message());
        return;
      }
      result.Resolve();
    }).detach();
  }

  REACT_METHOD(recorderPause)
  void recorderPause() noexcept {
    ss_recorder_pause(m_recorder);
  }

  REACT_METHOD(recorderResume)
  void recorderResume() noexcept {
    ss_recorder_resume(m_recorder);
  }

  REACT_METHOD(recorderStop)
  void recorderStop(::React::ReactPromise<std::string> &&result) noexcept {
    std::thread([recorder = m_recorder, result = std::move(result)]() mutable {
      char *path = nullptr;
      if (ss_recorder_stop(recorder, &path) != SS_STATUS_OK) {
        result.Reject(ss_last_error_message());
        return;
      }
      std::string out = path ? path : "";
      ss_string_free(path);
      result.Resolve(out);
    }).detach();
  }

  REACT_SYNC_METHOD(recorderState)
  std::string recorderState() noexcept {
    return StateName(ss_recorder_state(m_recorder));
  }

  REACT_SYNC_METHOD(recoverPartialRecordings)
  double recoverPartialRecordings() noexcept {
    return ss_recover_partial_recordings();
  }

  REACT_METHOD(listRecordings)
  void listRecordings(::React::ReactPromise<std::vector<Recording>> &&result) noexcept {
    std::thread([library = m_library, result = std::move(result)]() mutable {
      SsRecordingList *list = library ? ss_library_list(library) : nullptr;
      if (!list) {
        result.Reject(library ? ss_last_error_message() : "library unavailable");
        return;
      }
      std::vector<Recording> items;
      for (size_t i = 0, n = ss_recording_list_len(list); i < n; i++) {
        const SsRecording *r = ss_recording_list_get(list, i);
        Recording out;
        out.fileName = r->file_name;
        out.path = r->path;
        out.title = r->title;
        if (r->artist) {
          out.artist = r->artist;
        }
        if (r->album) {
          out.album = r->album;
        }
        out.durationMs = static_cast<double>(r->duration_ms);
        out.sizeBytes = static_cast<double>(r->size_bytes);
        out.recordedAtMs = static_cast<double>(r->recorded_at_ms);
        items.push_back(std::move(out));
      }
      ss_recording_list_free(list);
      result.Resolve(items);
    }).detach();
  }

  REACT_METHOD(renameRecording)
  void renameRecording(std::string fileName, std::string newName, ::React::ReactPromise<std::string> &&result) noexcept {
    std::thread([library = m_library, fileName, newName, result = std::move(result)]() mutable {
      char *renamed = nullptr;
      if (ss_library_rename(library, fileName.c_str(), newName.c_str(), &renamed) != SS_STATUS_OK) {
        result.Reject(ss_last_error_message());
        return;
      }
      std::string out = renamed ? renamed : "";
      ss_string_free(renamed);
      result.Resolve(out);
    }).detach();
  }

  REACT_METHOD(trashRecording)
  void trashRecording(std::string fileName, ::React::ReactPromise<void> &&result) noexcept {
    std::thread([library = m_library, fileName, result = std::move(result)]() mutable {
      if (ss_library_trash(library, fileName.c_str()) != SS_STATUS_OK) {
        result.Reject(ss_last_error_message());
        return;
      }
      result.Resolve();
    }).detach();
  }

  REACT_METHOD(revealRecording)
  void revealRecording(std::string fileName) noexcept {
    ss_library_reveal(m_library, fileName.c_str());
  }

 private:
  struct EventSink {
    winrt::Microsoft::ReactNative::ReactContext context;
    std::function<void(RecorderEvent)> emit;
    std::function<void(std::string)> emitLibraryChanged;
  };

  static void OnLibraryChanged(void *userData) {
    auto sink = static_cast<std::weak_ptr<EventSink> *>(userData)->lock();
    if (sink) {
      sink->context.JSDispatcher().Post([sink]() {
        if (sink->emitLibraryChanged) {
          sink->emitLibraryChanged("changed");
        }
      });
    }
  }

  static std::string StateName(SsRecorderState state) noexcept {
    switch (state) {
      case SS_RECORDER_STATE_RECORDING: return "recording";
      case SS_RECORDER_STATE_PAUSED: return "paused";
      case SS_RECORDER_STATE_FINALIZING: return "finalizing";
      default: return "idle";
    }
  }

  static std::string KindName(SsRecorderEventKind kind) noexcept {
    switch (kind) {
      case SS_RECORDER_EVENT_KIND_PROGRESS: return "progress";
      case SS_RECORDER_EVENT_KIND_FINISHED: return "finished";
      case SS_RECORDER_EVENT_KIND_ERROR: return "error";
      default: return "state";
    }
  }

  static void OnRecorderEvent(const SsRecorderEvent *event, void *userData) {
    auto sink = static_cast<std::weak_ptr<EventSink> *>(userData)->lock();
    if (!sink) {
      return;
    }
    // Copy everything now: the event's strings only live during this call.
    RecorderEvent out;
    out.kind = KindName(event->kind);
    out.state = StateName(event->state);
    out.elapsedMs = static_cast<double>(event->elapsed_ms);
    out.peak = event->peak;
    out.rms = event->rms;
    if (event->path) {
      out.path = event->path;
    }
    if (event->message) {
      out.message = event->message;
    }
    sink->context.JSDispatcher().Post([sink, out = std::move(out)]() {
      if (sink->emit) {
        sink->emit(out);
      }
    });
  }

  SsRecorder *m_recorder{nullptr};
  SsLibrary *m_library{nullptr};
  std::shared_ptr<EventSink> m_sink;
  std::weak_ptr<EventSink> *m_sinkRef{nullptr};
};

} // namespace SoundScraper
