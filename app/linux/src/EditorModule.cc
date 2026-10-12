#include "EditorModule.h"

#include <utility>

#include "Shared.h"

using namespace facebook;
using namespace facebook::react;

namespace soundscraper {

EditorModule::EditorModule(std::shared_ptr<CallInvoker> jsInvoker)
    : CxxModule(kName, std::move(jsInvoker)) {
  method<&EditorModule::open>("open");
  method<&EditorModule::close>("close");
  method<&EditorModule::status>("status");
  method<&EditorModule::tracks>("tracks");
  method<&EditorModule::detect>("detect");
  method<&EditorModule::loadDraft>("loadDraft");
  method<&EditorModule::saveDraft>("saveDraft");
  method<&EditorModule::discardDraft>("discardDraft");
  method<&EditorModule::mastersUsage>("mastersUsage");
  method<&EditorModule::deleteAllMasters>("deleteAllMasters");
  method<&EditorModule::save>("save");
}

// A save in progress keeps the saver (and its library) alive.
EditorModule::~EditorModule() = default;

double EditorModule::open(jsi::Runtime &, std::string path) {
  return double(ss_editor_open(path.c_str()));
}

void EditorModule::close(jsi::Runtime &, double id) {
  ss_editor_close(uint64_t(id));
}

std::string EditorModule::status(jsi::Runtime &, double id) {
  return take(ss_editor_status(uint64_t(id)), R"({"state":"failed","message":"The editor is closed."})");
}

std::string EditorModule::tracks(jsi::Runtime &, double id, std::string editsJson) {
  return take(ss_editor_tracks(uint64_t(id), editsJson.c_str()), "[]");
}

std::string EditorModule::detect(jsi::Runtime &, double id, std::string optionsJson) {
  return take(ss_editor_detect(uint64_t(id), optionsJson.c_str()), "[]");
}

std::string EditorModule::loadDraft(jsi::Runtime &, std::string fileName) {
  return take(ss_edits_load_draft(fileName.c_str()), "null");
}

void EditorModule::saveDraft(jsi::Runtime &, std::string fileName, std::string editsJson) {
  if (ss_edits_save_draft(fileName.c_str(), editsJson.c_str()) != SS_STATUS_OK) {
    logError(std::string("saving editor draft: ") + ss_last_error_message());
  }
}

void EditorModule::discardDraft(jsi::Runtime &, std::string fileName) {
  ss_edits_discard_draft(fileName.c_str());
}

std::string EditorModule::mastersUsage(jsi::Runtime &) {
  return take(ss_masters_usage(), R"({"count":0,"bytes":0})");
}

AsyncPromise<> EditorModule::deleteAllMasters(jsi::Runtime &rt) {
  AsyncPromise<> promise(rt, jsInvoker_);
  runOffThread([promise]() mutable {
    if (ss_masters_delete_all() != SS_STATUS_OK) {
      promise.reject(lastError());
      return;
    }
    promise.resolve();
  });
  return promise;
}

AsyncPromise<std::string> EditorModule::save(jsi::Runtime &rt, std::string fileName,
                                             std::string editsJson, bool keepOriginal) {
  AsyncPromise<std::string> promise(rt, jsInvoker_);
  // Writes the tracks (blocking, so off the JS thread), then trashes the
  // original unless keepOriginal.
  runOffThread([saver = saver_, fileName = std::move(fileName), editsJson = std::move(editsJson),
                keepOriginal, promise]() mutable {
    char *json = nullptr;
    std::string error;
    {
      std::lock_guard lock(saver->mutex);
      if (!saver->library) saver->library = ss_library_open();
      json = saver->library
                 ? ss_editor_save(saver->library, fileName.c_str(), editsJson.c_str(), keepOriginal)
                 : nullptr;
      if (!json) error = ss_last_error_message();
    }
    if (!json) {
      promise.reject(Error(error));
      return;
    }
    promise.resolve(take(json, ""));
  });
  return promise;
}

}  // namespace soundscraper
