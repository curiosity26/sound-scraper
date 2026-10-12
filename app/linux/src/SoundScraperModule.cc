#include "SoundScraperModule.h"

#include <react/bridging/Dynamic.h>

#include <utility>

#include "Dialogs.h"
#include "Shared.h"

using namespace facebook;
using namespace facebook::react;

namespace soundscraper {

SerialQueue::SerialQueue() : thread_([this] { run(); }) {}

SerialQueue::~SerialQueue() {
  {
    std::lock_guard lock(mutex_);
    done_ = true;
  }
  wake_.notify_one();
  thread_.join();
}

void SerialQueue::post(std::function<void()> work) {
  {
    std::lock_guard lock(mutex_);
    work_.push_back(std::move(work));
  }
  wake_.notify_one();
}

void SerialQueue::run() {
  for (;;) {
    std::function<void()> work;
    {
      std::unique_lock lock(mutex_);
      wake_.wait(lock, [this] { return done_ || !work_.empty(); });
      if (work_.empty()) return;
      work = std::move(work_.front());
      work_.pop_front();
    }
    work();
  }
}

namespace {

const char *stateName(SsRecorderState state) {
  switch (state) {
    case SS_RECORDER_STATE_RECORDING: return "recording";
    case SS_RECORDER_STATE_PAUSED: return "paused";
    case SS_RECORDER_STATE_FINALIZING: return "finalizing";
    default: return "idle";
  }
}

const char *playerStateName(SsPlayerState state) {
  switch (state) {
    case SS_PLAYER_STATE_STOPPED: return "stopped";
    case SS_PLAYER_STATE_PLAYING: return "playing";
    case SS_PLAYER_STATE_PAUSED: return "paused";
    default: return "empty";
  }
}

const char *kindName(SsRecorderEventKind kind) {
  switch (kind) {
    case SS_RECORDER_EVENT_KIND_PLAYER_STATE_CHANGED: return "playerState";
    case SS_RECORDER_EVENT_KIND_PLAYER_PROGRESS: return "playerProgress";
    case SS_RECORDER_EVENT_KIND_PLAYER_ERROR: return "playerError";
    case SS_RECORDER_EVENT_KIND_PROGRESS: return "progress";
    case SS_RECORDER_EVENT_KIND_FINISHED: return "finished";
    case SS_RECORDER_EVENT_KIND_ERROR: return "error";
    default: return "state";
  }
}

folly::dynamic orNull(const char *s) {
  return s ? folly::dynamic(s) : folly::dynamic(nullptr);
}

/// A string field of a JS object, or NULL when missing or null.
const char *field(const folly::dynamic &object, const char *name) {
  auto it = object.find(name);
  return it != object.items().end() && it->second.isString() ? it->second.c_str() : nullptr;
}

template <class T>
void rejectWithLastError(T &promise) {
  promise.reject(lastError());
}

}  // namespace

SoundScraperModule::SoundScraperModule(std::shared_ptr<CallInvoker> jsInvoker)
    : CxxModule(kName, std::move(jsInvoker)), player_(std::make_unique<SerialQueue>()) {
  method<&SoundScraperModule::getVersion>("getVersion");
  method<&SoundScraperModule::listAudioApps>("listAudioApps");
  method<&SoundScraperModule::recordTestWav>("recordTestWav");
  method<&SoundScraperModule::recorderStart>("recorderStart");
  method<&SoundScraperModule::recorderPause>("recorderPause");
  method<&SoundScraperModule::recorderResume>("recorderResume");
  method<&SoundScraperModule::recorderStop>("recorderStop");
  method<&SoundScraperModule::recorderState>("recorderState");
  method<&SoundScraperModule::recoverPartialRecordings>("recoverPartialRecordings");
  method<&SoundScraperModule::playerLoad>("playerLoad");
  method<&SoundScraperModule::playerUnload>("playerUnload");
  method<&SoundScraperModule::playerPlay>("playerPlay");
  method<&SoundScraperModule::playerPause>("playerPause");
  method<&SoundScraperModule::playerStop>("playerStop");
  method<&SoundScraperModule::playerSeek>("playerSeek");
  method<&SoundScraperModule::playerState>("playerState");
  method<&SoundScraperModule::listRecordings>("listRecordings");
  method<&SoundScraperModule::renameRecording>("renameRecording");
  method<&SoundScraperModule::trashRecording>("trashRecording");
  method<&SoundScraperModule::revealRecording>("revealRecording");
  method<&SoundScraperModule::readTags>("readTags");
  method<&SoundScraperModule::writeTags>("writeTags");
  method<&SoundScraperModule::pickImage>("pickImage");
  method<&SoundScraperModule::getSettings>("getSettings");
  method<&SoundScraperModule::setSettings>("setSettings");
  method<&SoundScraperModule::pickFolder>("pickFolder");
  method<&SoundScraperModule::playlists>("playlists");
  method<&SoundScraperModule::burn>("burn");
  method<&SoundScraperModule::pickSaveFile>("pickSaveFile");

  sink_ = std::make_shared<Sink>(Sink{std::make_shared<Emitter>(), std::make_shared<Emitter>()});
  // The spec's EventEmitter properties (codegen's Cxx specs do the same).
  eventEmitterMap_["onRecorderEvent"] = sink_->recorderEvents;
  eventEmitterMap_["onLibraryChanged"] = sink_->libraryChanged;

  recorder_ = ss_recorder_create();
  currentRecorder() = recorder_;
  // The core keeps this pointer for its callbacks; freed in the destructor.
  sinkRef_ = new std::weak_ptr<Sink>(sink_);
  ss_recorder_set_callback(recorder_, &SoundScraperModule::onRecorderEvent, sinkRef_);
  library_ = ss_library_open();  // NULL if unavailable; calls then report an error
  if (library_) {
    ss_library_set_callback(library_, &SoundScraperModule::onLibraryChanged, sinkRef_);
  }
}

SoundScraperModule::~SoundScraperModule() {
  if (currentRecorder() == recorder_) currentRecorder() = nullptr;
  sink_.reset();    // late events become no-ops
  player_.reset();  // finishes queued player commands
  ss_recorder_destroy(recorder_);  // finalizes an in-progress recording
  ss_library_destroy(library_);
  delete sinkRef_;
}

void SoundScraperModule::onRecorderEvent(const SsRecorderEvent *event, void *userData) {
  auto sink = static_cast<std::weak_ptr<Sink> *>(userData)->lock();
  if (!sink) return;
  // Copy everything now: the event's strings only live during this call.
  folly::dynamic out = folly::dynamic::object("kind", kindName(event->kind))(
      "state", stateName(event->state))("elapsedMs", double(event->elapsed_ms))(
      "peak", event->peak)("rms", event->rms)("peakLeft", event->peak_left)(
      "peakRight", event->peak_right)("rmsLeft", event->rms_left)("rmsRight", event->rms_right)(
      "path", orNull(event->path))("message", orNull(event->message))(
      "playerState", playerStateName(event->player_state))(
      "positionMs", double(event->position_ms))("durationMs", double(event->duration_ms));
  sink->recorderEvents->emit(std::move(out));
}

void SoundScraperModule::onLibraryChanged(void *userData) {
  if (auto sink = static_cast<std::weak_ptr<Sink> *>(userData)->lock()) {
    sink->libraryChanged->emit(folly::dynamic("changed"));
  }
}

std::string SoundScraperModule::getVersion(jsi::Runtime &) {
  return ss_version();
}

folly::dynamic SoundScraperModule::listAudioApps(jsi::Runtime &) {
  folly::dynamic apps = folly::dynamic::array;
  SsAudioAppList *list = ss_audio_apps_list();
  for (size_t i = 0, n = ss_audio_app_list_len(list); i < n; i++) {
    const SsAudioApp *app = ss_audio_app_list_get(list, i);
    apps.push_back(folly::dynamic::object("pid", double(app->pid))("name", app->name)(
        "bundleId", orNull(app->bundle_id))("isPlaying", app->is_playing));
  }
  ss_audio_app_list_free(list);
  return apps;
}

AsyncPromise<folly::dynamic> SoundScraperModule::recordTestWav(jsi::Runtime &rt, double appPid,
                                                               double seconds) {
  AsyncPromise<folly::dynamic> promise(rt, jsInvoker_);
  // ss_capture_test_wav blocks for the whole recording.
  runOffThread([promise, appPid, seconds]() mutable {
    SsCaptureReport report{};
    if (ss_capture_test_wav(uint32_t(appPid), seconds, &report) != SS_STATUS_OK) {
      rejectWithLastError(promise);
      return;
    }
    folly::dynamic out = folly::dynamic::object("path", report.path ? report.path : "")(
        "frames", double(report.frames))("sampleRate", double(report.sample_rate))(
        "channels", double(report.channels))("peak", report.peak);
    ss_capture_report_free(&report);
    promise.resolve(std::move(out));
  });
  return promise;
}

AsyncPromise<> SoundScraperModule::recorderStart(jsi::Runtime &rt, double appPid) {
  AsyncPromise<> promise(rt, jsInvoker_);
  runOffThread([recorder = recorder_, appPid, promise]() mutable {
    if (ss_recorder_start(recorder, uint32_t(appPid)) != SS_STATUS_OK) {
      rejectWithLastError(promise);
      return;
    }
    promise.resolve();
  });
  return promise;
}

void SoundScraperModule::recorderPause(jsi::Runtime &) {
  ss_recorder_pause(recorder_);
}

void SoundScraperModule::recorderResume(jsi::Runtime &) {
  ss_recorder_resume(recorder_);
}

AsyncPromise<std::string> SoundScraperModule::recorderStop(jsi::Runtime &rt) {
  AsyncPromise<std::string> promise(rt, jsInvoker_);
  runOffThread([recorder = recorder_, promise]() mutable {
    char *path = nullptr;
    if (ss_recorder_stop(recorder, &path) != SS_STATUS_OK) {
      rejectWithLastError(promise);
      return;
    }
    promise.resolve(take(path, ""));
  });
  return promise;
}

std::string SoundScraperModule::recorderState(jsi::Runtime &) {
  return stateName(ss_recorder_state(recorder_));
}

double SoundScraperModule::recoverPartialRecordings(jsi::Runtime &) {
  return double(ss_recover_partial_recordings());
}

AsyncPromise<> SoundScraperModule::playerLoad(jsi::Runtime &rt, std::string path) {
  AsyncPromise<> promise(rt, jsInvoker_);
  player_->post([recorder = recorder_, path = std::move(path), promise]() mutable {
    if (ss_player_load(recorder, path.c_str()) != SS_STATUS_OK) {
      rejectWithLastError(promise);
      return;
    }
    promise.resolve();
  });
  return promise;
}

void SoundScraperModule::playerUnload(jsi::Runtime &) {
  player_->post([recorder = recorder_]() { ss_player_unload(recorder); });
}

AsyncPromise<> SoundScraperModule::playerPlay(jsi::Runtime &rt) {
  AsyncPromise<> promise(rt, jsInvoker_);
  player_->post([recorder = recorder_, promise]() mutable {
    if (ss_player_play(recorder) != SS_STATUS_OK) {
      rejectWithLastError(promise);
      return;
    }
    promise.resolve();
  });
  return promise;
}

void SoundScraperModule::playerPause(jsi::Runtime &) {
  player_->post([recorder = recorder_]() { ss_player_pause(recorder); });
}

void SoundScraperModule::playerStop(jsi::Runtime &) {
  player_->post([recorder = recorder_]() { ss_player_stop(recorder); });
}

void SoundScraperModule::playerSeek(jsi::Runtime &, double positionMs) {
  auto at = uint64_t(positionMs > 0 ? positionMs : 0);
  player_->post([recorder = recorder_, at]() { ss_player_seek(recorder, at); });
}

std::string SoundScraperModule::playerState(jsi::Runtime &) {
  return playerStateName(ss_player_state(recorder_));
}

AsyncPromise<folly::dynamic> SoundScraperModule::listRecordings(jsi::Runtime &rt) {
  AsyncPromise<folly::dynamic> promise(rt, jsInvoker_);
  runOffThread([library = library_, promise]() mutable {
    SsRecordingList *list = library ? ss_library_list(library) : nullptr;
    if (!list) {
      promise.reject(library ? lastError() : Error("library unavailable"));
      return;
    }
    folly::dynamic items = folly::dynamic::array;
    for (size_t i = 0, n = ss_recording_list_len(list); i < n; i++) {
      const SsRecording *r = ss_recording_list_get(list, i);
      items.push_back(folly::dynamic::object("fileName", r->file_name)("path", r->path)(
          "title", r->title)("artist", orNull(r->artist))("album", orNull(r->album))(
          "durationMs", double(r->duration_ms))("sizeBytes", double(r->size_bytes))(
          "recordedAtMs", double(r->recorded_at_ms)));
    }
    ss_recording_list_free(list);
    promise.resolve(std::move(items));
  });
  return promise;
}

AsyncPromise<std::string> SoundScraperModule::renameRecording(jsi::Runtime &rt,
                                                              std::string fileName,
                                                              std::string newName) {
  AsyncPromise<std::string> promise(rt, jsInvoker_);
  runOffThread([library = library_, fileName = std::move(fileName), newName = std::move(newName),
                promise]() mutable {
    char *renamed = nullptr;
    if (ss_library_rename(library, fileName.c_str(), newName.c_str(), &renamed) != SS_STATUS_OK) {
      rejectWithLastError(promise);
      return;
    }
    promise.resolve(take(renamed, ""));
  });
  return promise;
}

AsyncPromise<> SoundScraperModule::trashRecording(jsi::Runtime &rt, std::string fileName) {
  AsyncPromise<> promise(rt, jsInvoker_);
  runOffThread([library = library_, fileName = std::move(fileName), promise]() mutable {
    if (ss_library_trash(library, fileName.c_str()) != SS_STATUS_OK) {
      rejectWithLastError(promise);
      return;
    }
    promise.resolve();
  });
  return promise;
}

void SoundScraperModule::revealRecording(jsi::Runtime &, std::string fileName) {
  // Starts the file manager: off the JS thread.
  runOffThread([library = library_, fileName = std::move(fileName)]() {
    if (ss_library_reveal(library, fileName.c_str()) != SS_STATUS_OK) {
      logError(std::string("showing a recording: ") + ss_last_error_message());
    }
  });
}

AsyncPromise<folly::dynamic> SoundScraperModule::readTags(jsi::Runtime &rt, std::string fileName) {
  AsyncPromise<folly::dynamic> promise(rt, jsInvoker_);
  runOffThread([library = library_, fileName = std::move(fileName), promise]() mutable {
    const SsTags *t = library ? ss_library_read_tags(library, fileName.c_str()) : nullptr;
    if (!t) {
      promise.reject(library ? lastError() : Error("library unavailable"));
      return;
    }
    folly::dynamic out = folly::dynamic::object("title", orNull(t->title))(
        "artist", orNull(t->artist))("album", orNull(t->album))(
        "albumArtist", orNull(t->album_artist))("date", orNull(t->date))(
        "genre", orNull(t->genre))("comment", orNull(t->comment))(
        "track", t->track > 0 ? folly::dynamic(double(t->track)) : folly::dynamic(nullptr))(
        "coverPath", orNull(t->cover_path));
    ss_tags_free(t);
    promise.resolve(std::move(out));
  });
  return promise;
}

AsyncPromise<> SoundScraperModule::writeTags(jsi::Runtime &rt, std::vector<std::string> fileNames,
                                             folly::dynamic edit) {
  AsyncPromise<> promise(rt, jsInvoker_);
  runOffThread([library = library_, fileNames = std::move(fileNames), edit = std::move(edit),
                promise]() mutable {
    static const std::pair<const char *, uint32_t> bits[] = {
        {"title", SS_TAG_TITLE},   {"artist", SS_TAG_ARTIST},
        {"album", SS_TAG_ALBUM},   {"albumArtist", SS_TAG_ALBUM_ARTIST},
        {"date", SS_TAG_DATE},     {"track", SS_TAG_TRACK},
        {"genre", SS_TAG_GENRE},   {"comment", SS_TAG_COMMENT}};
    SsTagEdit e{};
    if (auto fields = edit.find("fields"); fields != edit.items().end() && fields->second.isArray()) {
      for (const auto &f : fields->second) {
        for (const auto &[name, bit] : bits) {
          if (f.isString() && f.getString() == name) e.set_mask |= bit;
        }
      }
    }
    e.title = field(edit, "title");
    e.artist = field(edit, "artist");
    e.album = field(edit, "album");
    e.album_artist = field(edit, "albumArtist");
    e.date = field(edit, "date");
    e.genre = field(edit, "genre");
    e.comment = field(edit, "comment");
    auto track = edit.find("track");
    e.track = track != edit.items().end() && track->second.isNumber() && track->second.asDouble() > 0
                  ? uint32_t(track->second.asDouble())
                  : 0;
    const char *cover = field(edit, "cover");
    std::string coverEdit = cover ? cover : "keep";
    e.cover = coverEdit == "set"      ? SS_COVER_EDIT_SET
              : coverEdit == "remove" ? SS_COVER_EDIT_REMOVE
                                      : SS_COVER_EDIT_KEEP;
    e.cover_path = field(edit, "coverPath");
    auto v23 = edit.find("id3v23");
    e.version = v23 != edit.items().end() && v23->second.isBool() && v23->second.getBool()
                    ? SS_TAG_VERSION_ID3V23
                    : SS_TAG_VERSION_ID3V24;
    std::vector<const char *> names;
    for (const auto &n : fileNames) names.push_back(n.c_str());
    if (ss_library_write_tags(library, names.data(), names.size(), &e) != SS_STATUS_OK) {
      rejectWithLastError(promise);
      return;
    }
    promise.resolve();
  });
  return promise;
}

AsyncPromise<std::optional<std::string>> SoundScraperModule::pickImage(jsi::Runtime &rt) {
  AsyncPromise<std::optional<std::string>> promise(rt, jsInvoker_);
  dialogs::openFile("Choose cover art", "Choose",
                    {{"Images", {"*.jpg", "*.jpeg", "*.png", "*.JPG", "*.JPEG", "*.PNG"}}},
                    [promise](std::optional<std::string> picked) mutable {
                      promise.resolve(std::move(picked));
                    });
  return promise;
}

std::string SoundScraperModule::getSettings(jsi::Runtime &) {
  return take(ss_settings_get(), "{}");
}

AsyncPromise<> SoundScraperModule::setSettings(jsi::Runtime &rt, std::string json) {
  AsyncPromise<> promise(rt, jsInvoker_);
  runOffThread([library = library_, json = std::move(json), promise]() mutable {
    if (ss_settings_set(json.c_str()) != SS_STATUS_OK ||
        (library && ss_library_apply_settings(library) != SS_STATUS_OK)) {
      rejectWithLastError(promise);
      return;
    }
    promise.resolve();
  });
  return promise;
}

AsyncPromise<std::optional<std::string>> SoundScraperModule::pickFolder(jsi::Runtime &rt) {
  AsyncPromise<std::optional<std::string>> promise(rt, jsInvoker_);
  dialogs::selectFolder("Choose the recordings folder", "Choose",
                        [promise](std::optional<std::string> picked) mutable {
                          promise.resolve(std::move(picked));
                        });
  return promise;
}

std::string SoundScraperModule::playlists(jsi::Runtime &, std::string requestJson) {
  return take(ss_playlists(requestJson.c_str()), R"({"error":"no answer"})");
}

std::string SoundScraperModule::burn(jsi::Runtime &, std::string requestJson) {
  return take(ss_burn(requestJson.c_str()), R"({"error":"no answer"})");
}

AsyncPromise<std::optional<std::string>> SoundScraperModule::pickSaveFile(jsi::Runtime &rt,
                                                                          std::string title,
                                                                          std::string defaultName,
                                                                          std::string extension) {
  AsyncPromise<std::optional<std::string>> promise(rt, jsInvoker_);
  dialogs::saveFile(std::move(title), "Save", std::move(defaultName), std::move(extension), "",
                    [promise](std::optional<std::string> picked) mutable {
                      promise.resolve(std::move(picked));
                    });
  return promise;
}

}  // namespace soundscraper
