// Sound Scraper's Linux entry point: the stage ("SoundScraper"), one
// borderless, transparent GTK4 window, maximized (PanelChrome), holding the
// main panel, library, settings and other panels as views
// (src/features/skins/stage).
//
// Debug builds load the JS from Metro (npx react-native start); Release
// builds load index.bundle.js next to the executable. See
// rngtk/App.h for the command-line options (--smoke, --bundle, ...).
// Skins (.sskin files or skin folders) on the command line are offered for
// installing, as when opened from the file manager on the other platforms.
#include <fontconfig/fontconfig.h>
#include <rngtk/App.h>
#include <rngtk/Autolinking.h>

#include <filesystem>

#include "src/SoundScraperPackage.h"

namespace {

// The icon font the editor's transport uses (assets/fonts), installed next
// to the executable, added to fontconfig before GTK sets up its fonts.
void registerIconFont() {
  std::error_code error;
  auto dir = std::filesystem::read_symlink("/proc/self/exe", error).parent_path();
  auto font = (dir / "MaterialIcons-Regular.ttf").string();
  FcConfigAppFontAddFile(FcConfigGetCurrent(),
                         reinterpret_cast<const FcChar8 *>(font.c_str()));
}

} // namespace

int main(int argc, char **argv) {
  registerIconFont();
  rngtk::AppOptions options;
  options.appId = "com.alexboyce.soundscraper";
  options.title = "Sound Scraper";
  options.moduleName = "SoundScraper";
  // Before it's maximized.
  options.width = 960;
  options.height = 640;
  // The skin draws the whole panel, its title bar and buttons included.
  options.titleBar = rngtk::TitleBar::None;
  options.transparent = true;
  // Native modules and components of the app's libraries (autolinked by
  // run-linux), and the app's own.
  options.packages = rngtk::autolinkedPackages();
  options.packages.push_back(soundscraper::soundScraperPackage());
  std::vector<char *> args = soundscraper::takeSkinArguments(argc, argv);
  int count = static_cast<int>(args.size());
  args.push_back(nullptr);
  return rngtk::runApp(count, args.data(), options);
}
