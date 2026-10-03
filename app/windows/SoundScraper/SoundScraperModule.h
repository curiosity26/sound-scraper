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

REACT_TURBO_MODULE(SoundScraperModule, L"SoundScraper")
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
    m_js = JsThread{context.CallInvoker()};
    m_sink = std::make_shared<EventSink>(EventSink{m_js, this});
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
    RunOffThread([appPid, seconds, result](auto dispatcher) {
      SsCaptureReport report{};
      if (ss_capture_test_wav(static_cast<uint32_t>(appPid), seconds, &report) != SS_STATUS_OK) {
        dispatcher.Post([result, message = std::string(ss_last_error_message())]() { result.Reject(message.c_str()); });
        return;
      }
      CaptureReport out;
      out.path = report.path ? report.path : "";
      out.frames = static_cast<double>(report.frames);
      out.sampleRate = report.sample_rate;
      out.channels = report.channels;
      out.peak = report.peak;
      ss_capture_report_free(&report);
      dispatcher.Post([result, out]() { result.Resolve(out); });
    });
  }

  REACT_METHOD(recorderStart)
  void recorderStart(double appPid, ::React::ReactPromise<void> &&result) noexcept {
    RunOffThread([recorder = m_recorder, appPid, result](auto dispatcher) {
      if (ss_recorder_start(recorder, static_cast<uint32_t>(appPid)) != SS_STATUS_OK) {
        dispatcher.Post([result, message = std::string(ss_last_error_message())]() { result.Reject(message.c_str()); });
        return;
      }
      dispatcher.Post([result]() { result.Resolve(); });
    });
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
    RunOffThread([recorder = m_recorder, result](auto dispatcher) {
      char *path = nullptr;
      if (ss_recorder_stop(recorder, &path) != SS_STATUS_OK) {
        dispatcher.Post([result, message = std::string(ss_last_error_message())]() { result.Reject(message.c_str()); });
        return;
      }
      std::string out = path ? path : "";
      ss_string_free(path);
      dispatcher.Post([result, out]() { result.Resolve(out); });
    });
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
    RunOffThread([library = m_library, result](auto dispatcher) {
      SsRecordingList *list = library ? ss_library_list(library) : nullptr;
      if (!list) {
        dispatcher.Post([result, message = std::string(library ? ss_last_error_message() : "library unavailable")]() {
          result.Reject(message.c_str());
        });
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
      dispatcher.Post([result, items = std::move(items)]() { result.Resolve(items); });
    });
  }

  REACT_METHOD(renameRecording)
  void renameRecording(std::string fileName, std::string newName, ::React::ReactPromise<std::string> &&result) noexcept {
    RunOffThread([library = m_library, fileName, newName, result](auto dispatcher) {
      char *renamed = nullptr;
      if (ss_library_rename(library, fileName.c_str(), newName.c_str(), &renamed) != SS_STATUS_OK) {
        dispatcher.Post([result, message = std::string(ss_last_error_message())]() { result.Reject(message.c_str()); });
        return;
      }
      std::string out = renamed ? renamed : "";
      ss_string_free(renamed);
      dispatcher.Post([result, out]() { result.Resolve(out); });
    });
  }

  REACT_METHOD(trashRecording)
  void trashRecording(std::string fileName, ::React::ReactPromise<void> &&result) noexcept {
    RunOffThread([library = m_library, fileName, result](auto dispatcher) {
      if (ss_library_trash(library, fileName.c_str()) != SS_STATUS_OK) {
        dispatcher.Post([result, message = std::string(ss_last_error_message())]() { result.Reject(message.c_str()); });
        return;
      }
      dispatcher.Post([result]() { result.Resolve(); });
    });
  }

  REACT_METHOD(revealRecording)
  void revealRecording(std::string fileName) noexcept {
    ss_library_reveal(m_library, fileName.c_str());
  }

 private:
  // REACT_EVENT members are filled in after REACT_INIT, so events read them
  // from the live module at emit time (on the JS thread). The sink is reset
  // in the destructor, which makes late events no-ops.
  struct EventSink {
    JsThread js;
    SoundScraperModule *module;
  };

  static void OnLibraryChanged(void *userData) {
    auto sink = static_cast<std::weak_ptr<EventSink> *>(userData)->lock();
    if (sink) {
      std::weak_ptr<EventSink> weak = sink;
      sink->js.Post([weak]() {
        if (auto s = weak.lock(); s && s->module->onLibraryChanged) {
          s->module->onLibraryChanged("changed");
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
    std::weak_ptr<EventSink> weak = sink;
    sink->js.Post([weak, out = std::move(out)]() {
      if (auto s = weak.lock(); s && s->module->onRecorderEvent) {
        s->module->onRecorderEvent(out);
      }
    });
  }

  // Runs blocking core calls off the JS thread, then settles the promise on
  // the JS thread (touching the JS runtime from other threads crashes Hermes).
  template <class Work>
  void RunOffThread(Work work) noexcept {
    std::thread([js = m_js, work = std::move(work)]() mutable { work(js); }).detach();
  }

  JsThread m_js;
  SsRecorder *m_recorder{nullptr};
  SsLibrary *m_library{nullptr};
  std::shared_ptr<EventSink> m_sink;
  std::weak_ptr<EventSink> *m_sinkRef{nullptr};
};

} // namespace SoundScraper
