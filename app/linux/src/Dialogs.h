// The desktop's file chooser (GtkFileDialog, through the file chooser portal
// where there is one) for the native modules' pickers. Call from any
// thread: the dialog opens on the main thread, over the active window, and
// `done` gets the chosen path, or nullopt when cancelled (on the main
// thread).
#pragma once

#include <functional>
#include <optional>
#include <string>
#include <utility>
#include <vector>

namespace soundscraper::dialogs {

using Done = std::function<void(std::optional<std::string>)>;

/// A filter: its name and glob patterns ("*.png").
using Filter = std::pair<std::string, std::vector<std::string>>;

void openFile(std::string title, std::string acceptLabel, std::vector<Filter> filters, Done done);
void selectFolder(std::string title, std::string acceptLabel, Done done);
/// `extension` without the dot; added to the chosen name if it lacks it.
void saveFile(std::string title, std::string acceptLabel, std::string initialName,
              std::string extension, std::string filterName, Done done);

}  // namespace soundscraper::dialogs
