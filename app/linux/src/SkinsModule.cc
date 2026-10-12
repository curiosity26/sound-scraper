#include "SkinsModule.h"

#include <react/bridging/Dynamic.h>

#include <mutex>
#include <utility>

#include "Dialogs.h"
#include "PanelChrome.h"
#include "Shared.h"

using namespace facebook;
using namespace facebook::react;

namespace soundscraper {

namespace {

// Skins waiting for JS, and the live module's emitter (weak: a reload
// replaces the module).
std::mutex openedMutex;
std::vector<std::string> openedSkinFiles;
std::weak_ptr<AsyncEventEmitter<folly::dynamic>> liveWindowEvents;

}  // namespace

void SkinsModule::emitWindowEvent(const std::string &window, const std::string &event) {
  std::shared_ptr<AsyncEventEmitter<folly::dynamic>> events;
  {
    std::lock_guard lock(openedMutex);
    events = liveWindowEvents.lock();
  }
  if (events) {
    events->emit(folly::dynamic::object("window", window)("event", event));
  }
}

SkinsModule::SkinsModule(std::shared_ptr<CallInvoker> jsInvoker)
    : CxxModule(kName, std::move(jsInvoker)),
      windowEvents_(std::make_shared<AsyncEventEmitter<folly::dynamic>>()) {
  method<&SkinsModule::loadSkin>("loadSkin");
  method<&SkinsModule::loadCurrentSkin>("loadCurrentSkin");
  method<&SkinsModule::listSkins>("listSkins");
  method<&SkinsModule::installSkin>("installSkin");
  method<&SkinsModule::removeSkin>("removeSkin");
  method<&SkinsModule::pickSkinArchive>("pickSkinArchive");
  method<&SkinsModule::pickSkinFolder>("pickSkinFolder");
  method<&SkinsModule::pickFolder>("pickFolder");
  method<&SkinsModule::pickSkinSaveLocation>("pickSkinSaveLocation");
  method<&SkinsModule::inspectSkin>("inspectSkin");
  method<&SkinsModule::skinPreview>("skinPreview");
  method<&SkinsModule::packageSkin>("packageSkin");
  method<&SkinsModule::createSkin>("createSkin");
  method<&SkinsModule::skinFolderStamp>("skinFolderStamp");
  method<&SkinsModule::takeOpenedSkinFiles>("takeOpenedSkinFiles");
  method<&SkinsModule::setPanelLayout>("setPanelLayout");
  method<&SkinsModule::windowAction>("windowAction");
  method<&SkinsModule::beginGesture>("beginGesture");
  method<&SkinsModule::setPanelVisible>("setPanelVisible");
  method<&SkinsModule::isPanelVisible>("isPanelVisible");
  method<&SkinsModule::showMenu>("showMenu");
  eventEmitterMap_["onWindowEvent"] = windowEvents_;
  std::lock_guard lock(openedMutex);
  liveWindowEvents = windowEvents_;
}

template <class Call>
SkinsModule::Json SkinsModule::resolveString(jsi::Runtime &rt, Call call) {
  Json promise(rt, jsInvoker_);
  runOffThread([call = std::move(call), promise]() mutable {
    char *s = call();
    if (!s) {
      promise.reject(lastError());
      return;
    }
    promise.resolve(take(s, ""));
  });
  return promise;
}

SkinsModule::Json SkinsModule::loadSkin(jsi::Runtime &rt, std::string idOrPath) {
  return resolveString(rt, [idOrPath]() { return ss_skin_load(idOrPath.c_str()); });
}

SkinsModule::Json SkinsModule::loadCurrentSkin(jsi::Runtime &rt) {
  return resolveString(rt, []() { return ss_skin_load_current(); });
}

SkinsModule::Json SkinsModule::listSkins(jsi::Runtime &rt) {
  return resolveString(rt, []() { return ss_skins_list(); });
}

SkinsModule::Json SkinsModule::installSkin(jsi::Runtime &rt, std::string archivePath) {
  return resolveString(rt, [archivePath]() { return ss_skin_install(archivePath.c_str()); });
}

AsyncPromise<> SkinsModule::removeSkin(jsi::Runtime &rt, std::string id) {
  AsyncPromise<> promise(rt, jsInvoker_);
  runOffThread([id = std::move(id), promise]() mutable {
    if (ss_skin_remove(id.c_str()) != SS_STATUS_OK) {
      promise.reject(lastError());
      return;
    }
    promise.resolve();
  });
  return promise;
}

SkinsModule::Path SkinsModule::pickSkinArchive(jsi::Runtime &rt) {
  Path promise(rt, jsInvoker_);
  dialogs::openFile("Install a skin", "Install",
                    {{"Sound Scraper skins", {"*.sskin", "*.zip"}}},
                    [promise](std::optional<std::string> p) mutable { promise.resolve(std::move(p)); });
  return promise;
}

SkinsModule::Path SkinsModule::pickSkinFolder(jsi::Runtime &rt) {
  Path promise(rt, jsInvoker_);
  dialogs::selectFolder("Use an unpacked skin folder", "Use Skin",
                        [promise](std::optional<std::string> p) mutable { promise.resolve(std::move(p)); });
  return promise;
}

SkinsModule::Path SkinsModule::pickFolder(jsi::Runtime &rt, std::string title, std::string prompt) {
  Path promise(rt, jsInvoker_);
  dialogs::selectFolder(std::move(title), std::move(prompt),
                        [promise](std::optional<std::string> p) mutable { promise.resolve(std::move(p)); });
  return promise;
}

SkinsModule::Path SkinsModule::pickSkinSaveLocation(jsi::Runtime &rt, std::string defaultName) {
  Path promise(rt, jsInvoker_);
  dialogs::saveFile("Package skin", "Package", std::move(defaultName), "sskin", "Sound Scraper skin",
                    [promise](std::optional<std::string> p) mutable { promise.resolve(std::move(p)); });
  return promise;
}

SkinsModule::Json SkinsModule::inspectSkin(jsi::Runtime &rt, std::string archivePath) {
  return resolveString(rt, [archivePath]() { return ss_skin_inspect(archivePath.c_str()); });
}

SkinsModule::Json SkinsModule::skinPreview(jsi::Runtime &rt, std::string idOrPath) {
  return resolveString(rt, [idOrPath]() { return ss_skin_preview(idOrPath.c_str()); });
}

SkinsModule::Json SkinsModule::packageSkin(jsi::Runtime &rt, std::string dir, std::string outPath) {
  return resolveString(rt, [dir, outPath]() { return ss_skin_package(dir.c_str(), outPath.c_str()); });
}

SkinsModule::Json SkinsModule::createSkin(jsi::Runtime &rt, std::string parent, std::string name) {
  return resolveString(rt, [parent, name]() { return ss_skin_create(parent.c_str(), name.c_str()); });
}

SkinsModule::Json SkinsModule::skinFolderStamp(jsi::Runtime &rt, std::string dir) {
  return resolveString(rt, [dir]() { return ss_skin_folder_stamp(dir.c_str()); });
}

std::vector<std::string> SkinsModule::takeOpenedSkinFiles(jsi::Runtime &) {
  std::lock_guard lock(openedMutex);
  return std::exchange(openedSkinFiles, {});
}

void SkinsModule::openSkinFiles(std::vector<std::string> paths) {
  if (paths.empty()) return;
  {
    std::lock_guard lock(openedMutex);
    openedSkinFiles.insert(openedSkinFiles.end(), paths.begin(), paths.end());
  }
  emitWindowEvent("main", "skinFilesOpened");
}

void SkinsModule::setPanelLayout(jsi::Runtime &, std::string, double, double, folly::dynamic,
                                 folly::dynamic, folly::dynamic, double, double, double) {
  // Linux: the panels are views the stage places (src/features/skins/stage),
  // and the drag regions and grip are React views (DragSurface).
}

void SkinsModule::windowAction(jsi::Runtime &, std::string action) {
  runOnMain([action = std::move(action)]() { PanelChrome::get().perform(action); });
}

void SkinsModule::beginGesture(jsi::Runtime &, std::string, std::string) {
  // Linux: the stage runs panel gestures (StageModule::beginGesture).
}

void SkinsModule::setPanelVisible(jsi::Runtime &, std::string, bool) {
  // Linux: the stage shows and hides the panels.
}

bool SkinsModule::isPanelVisible(jsi::Runtime &, std::string) {
  return false;  // Linux: the stage knows.
}

AsyncPromise<double> SkinsModule::showMenu(jsi::Runtime &rt, std::string, std::vector<std::string> items,
                                           double checked, double x, double y) {
  AsyncPromise<double> promise(rt, jsInvoker_);
  runOnMain([items = std::move(items), checked, x, y, promise]() mutable {
    PanelChrome::get().showMenu(items, int(checked), x, y,
                                [promise](int chosen) mutable { promise.resolve(double(chosen)); });
  });
  return promise;
}

}  // namespace soundscraper
