#include "SoundScraperPackage.h"

#include <rngtk/Extensions.h>

#include <cstring>

#include "EditorModule.h"
#include "PanelChrome.h"
#include "SkinsModule.h"
#include "SoundScraperModule.h"
#include "StageModule.h"
#include "Views.h"

using namespace facebook::react;

namespace soundscraper {

std::shared_ptr<const rngtk::Package> soundScraperPackage() {
  auto package = std::make_shared<rngtk::Package>();
  package->name = "sound-scraper";
  package->turboModules.push_back(
      [](const std::string &name, const std::shared_ptr<CallInvoker> &js) -> std::shared_ptr<TurboModule> {
        if (name == SoundScraperModule::kName) return std::make_shared<SoundScraperModule>(js);
        if (name == SkinsModule::kName) return std::make_shared<SkinsModule>(js);
        if (name == EditorModule::kName) return std::make_shared<EditorModule>(js);
        if (name == StageModule::kName) return std::make_shared<StageModule>(js);
        return nullptr;
      });
  package->components.push_back(visualizerViewComponent());
  package->components.push_back(waveformViewComponent());
  package->setUp = [](rngtk::Host &host) { PanelChrome::get().setUp(host); };
  return package;
}

namespace {

bool endsWith(const char *s, const char *suffix) {
  size_t n = std::strlen(s), m = std::strlen(suffix);
  return n >= m && g_ascii_strcasecmp(s + n - m, suffix) == 0;
}

/// A .sskin archive, or a folder holding skin.json.
bool isSkin(const char *arg) {
  if (arg[0] == '-') return false;
  if (endsWith(arg, ".sskin")) return g_file_test(arg, G_FILE_TEST_IS_REGULAR);
  if (!g_file_test(arg, G_FILE_TEST_IS_DIR)) return false;
  char *manifest = g_build_filename(arg, "skin.json", nullptr);
  bool found = g_file_test(manifest, G_FILE_TEST_IS_REGULAR);
  g_free(manifest);
  return found;
}

}  // namespace

std::vector<char *> takeSkinArguments(int argc, char **argv) {
  std::vector<char *> rest;
  std::vector<std::string> skins;
  for (int i = 0; i < argc; i++) {
    if (i > 0 && isSkin(argv[i])) {
      char *absolute = g_canonicalize_filename(argv[i], nullptr);
      skins.emplace_back(absolute);
      g_free(absolute);
    } else {
      rest.push_back(argv[i]);
    }
  }
  SkinsModule::openSkinFiles(std::move(skins));
  return rest;
}

}  // namespace soundscraper
