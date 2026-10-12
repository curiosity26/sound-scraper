// Sound Scraper's Linux entry point: the skinned main panel ("SoundScraper"),
// a borderless, transparent GTK4 window; the library, settings and other
// panels open as windows of their own from JS (windows.linux.ts).
//
// Debug builds load the JS from Metro (npx react-native start); Release
// builds load index.bundle.js next to the executable. See
// rngtk/App.h for the command-line options (--smoke, --bundle, ...).
// Skins (.sskin files or skin folders) on the command line are offered for
// installing, as when opened from the file manager on the other platforms.
#include <rngtk/App.h>
#include <rngtk/Autolinking.h>

#include "src/SoundScraperPackage.h"

int main(int argc, char **argv) {
  rngtk::AppOptions options;
  options.appId = "com.alexboyce.soundscraper";
  options.title = "Sound Scraper";
  options.moduleName = "SoundScraper";
  // The skin sets the real size (setMainLayout).
  options.width = 420;
  options.height = 150;
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
