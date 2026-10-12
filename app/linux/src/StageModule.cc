#include "StageModule.h"

#include <mutex>
#include <utility>
#include <vector>

#include "PanelChrome.h"
#include "Shared.h"

using namespace facebook;
using namespace facebook::react;

namespace soundscraper {

namespace {

// The live module's emitter (weak: a reload replaces the module).
std::mutex eventsMutex;
std::weak_ptr<AsyncEventEmitter<folly::dynamic>> liveEvents;

}  // namespace

void StageModule::emit(folly::dynamic event) {
  std::shared_ptr<AsyncEventEmitter<folly::dynamic>> events;
  {
    std::lock_guard lock(eventsMutex);
    events = liveEvents.lock();
  }
  if (events) events->emit(std::move(event));
}

StageModule::StageModule(std::shared_ptr<CallInvoker> jsInvoker)
    : CxxModule(kName, std::move(jsInvoker)),
      events_(std::make_shared<AsyncEventEmitter<folly::dynamic>>()) {
  method<&StageModule::load>("load");
  method<&StageModule::save>("save");
  method<&StageModule::place>("place");
  method<&StageModule::analyze>("analyze");
  method<&StageModule::scale>("scale");
  method<&StageModule::resize>("resize");
  method<&StageModule::beginGesture>("beginGesture");
  method<&StageModule::setInputRegion>("setInputRegion");
  method<&StageModule::moveToNextMonitor>("moveToNextMonitor");
  eventEmitterMap_["onStageEvent"] = events_;
  std::lock_guard lock(eventsMutex);
  liveEvents = events_;
}

std::string StageModule::load(jsi::Runtime &) { return take(ss_layout_load(), "null"); }

void StageModule::save(jsi::Runtime &, std::string json) {
  if (ss_layout_save(json.c_str()) != SS_STATUS_OK) {
    const char *message = ss_last_error_message();
    logError(std::string("couldn't save the panel layout: ") + (message ? message : ""));
  }
}

std::string StageModule::place(jsi::Runtime &, std::string scene, std::string id, double x,
                               double y, double w, double h) {
  return take(ss_layout_place(scene.c_str(), id.c_str(), x, y, w, h), "null");
}

std::string StageModule::analyze(jsi::Runtime &, std::string scene) {
  return take(ss_layout_analyze(scene.c_str()), "null");
}

std::string StageModule::scale(jsi::Runtime &, std::string scene, double ratio) {
  return take(ss_layout_scale(scene.c_str(), ratio), "[]");
}

std::string StageModule::resize(jsi::Runtime &, std::string scene, std::string id, double dw,
                                double dh) {
  SsLayoutGesture *gesture = ss_layout_resize_begin(scene.c_str(), id.c_str(), 1, 1);
  if (!gesture) return "[]";
  std::string out = take(ss_layout_gesture_update(gesture, dw, dh, false), "[]");
  ss_layout_gesture_end(gesture);
  return out;
}

void StageModule::beginGesture(jsi::Runtime &, std::string scene, std::string id,
                               std::string kind, double minWidth, double minHeight) {
  SsLayoutGesture *gesture =
      kind == "resize"
          ? ss_layout_resize_begin(scene.c_str(), id.c_str(), minWidth, minHeight)
          : ss_layout_drag_begin(scene.c_str(), id.c_str());
  if (!gesture) return;
  runOnMain([gesture]() { PanelChrome::get().beginStageGesture(gesture); });
}

void StageModule::setInputRegion(jsi::Runtime &, folly::dynamic rects) {
  std::vector<double> flat;
  if (rects.isArray()) {
    for (const auto &v : rects) flat.push_back(v.isNumber() ? v.asDouble() : 0);
  }
  runOnMain([flat = std::move(flat)]() { PanelChrome::get().setInputRegion(flat); });
}

void StageModule::moveToNextMonitor(jsi::Runtime &) {
  runOnMain([]() { PanelChrome::get().moveToNextMonitor(); });
}

}  // namespace soundscraper
