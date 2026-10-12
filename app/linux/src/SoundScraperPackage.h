// The app's own native modules and components for react-native-gtk4,
// handed to the host in main.cc (with the autolinked libraries' packages).
#pragma once

#include <rngtk/App.h>

#include <memory>
#include <string>
#include <vector>

namespace soundscraper {

std::shared_ptr<const rngtk::Package> soundScraperPackage();

/// Skins in the app's command line (.sskin files or skin folders opened
/// from the file manager): kept for JS, which installs them. Returns the
/// arguments left for the host.
std::vector<char *> takeSkinArguments(int argc, char **argv);

}  // namespace soundscraper
