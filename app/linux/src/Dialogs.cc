#include "Dialogs.h"

#include <gtk/gtk.h>

#include "Shared.h"

namespace soundscraper::dialogs {

namespace {

enum class Kind { Open, Folder, Save };

struct Request {
  Kind kind;
  std::string title, acceptLabel, initialName, extension, filterName;
  std::vector<Filter> filters;
  Done done;
};

GtkWindow *activeWindow() {
  GApplication *app = g_application_get_default();
  return app ? gtk_application_get_active_window(GTK_APPLICATION(app)) : nullptr;
}

void finished(GObject *source, GAsyncResult *result, gpointer data) {
  std::unique_ptr<Request> request(static_cast<Request *>(data));
  GtkFileDialog *dialog = GTK_FILE_DIALOG(source);
  GError *error = nullptr;
  GFile *file = nullptr;
  switch (request->kind) {
    case Kind::Open: file = gtk_file_dialog_open_finish(dialog, result, &error); break;
    case Kind::Folder: file = gtk_file_dialog_select_folder_finish(dialog, result, &error); break;
    case Kind::Save: file = gtk_file_dialog_save_finish(dialog, result, &error); break;
  }
  std::optional<std::string> picked;
  if (file) {
    if (char *path = g_file_get_path(file)) {
      picked = path;
      g_free(path);
    }
    g_object_unref(file);
  }
  if (error) {
    if (!g_error_matches(error, GTK_DIALOG_ERROR, GTK_DIALOG_ERROR_DISMISSED)) {
      logError(std::string("file dialog: ") + error->message);
    }
    g_error_free(error);
  }
  if (picked && request->kind == Kind::Save && !request->extension.empty()) {
    std::string suffix = "." + request->extension;
    if (picked->size() < suffix.size() ||
        g_ascii_strcasecmp(picked->c_str() + picked->size() - suffix.size(), suffix.c_str()) != 0) {
      *picked += suffix;
    }
  }
  request->done(std::move(picked));
}

GtkFileFilter *makeFilter(const std::string &name, const std::vector<std::string> &patterns) {
  GtkFileFilter *filter = gtk_file_filter_new();
  gtk_file_filter_set_name(filter, name.c_str());
  for (const auto &pattern : patterns) {
    gtk_file_filter_add_pattern(filter, pattern.c_str());
  }
  return filter;
}

void show(std::unique_ptr<Request> request) {
  runOnMain([request = std::shared_ptr<Request>(std::move(request))]() mutable {
    GtkFileDialog *dialog = gtk_file_dialog_new();
    gtk_file_dialog_set_title(dialog, request->title.c_str());
    gtk_file_dialog_set_modal(dialog, TRUE);
    if (!request->acceptLabel.empty()) {
      gtk_file_dialog_set_accept_label(dialog, request->acceptLabel.c_str());
    }
    if (!request->filters.empty()) {
      GListStore *filters = g_list_store_new(GTK_TYPE_FILE_FILTER);
      for (const auto &[name, patterns] : request->filters) {
        GtkFileFilter *filter = makeFilter(name, patterns);
        g_list_store_append(filters, filter);
        g_object_unref(filter);
      }
      gtk_file_dialog_set_filters(dialog, G_LIST_MODEL(filters));
      g_object_unref(filters);
    }
    if (request->kind == Kind::Save) {
      if (!request->initialName.empty()) {
        gtk_file_dialog_set_initial_name(dialog, request->initialName.c_str());
      }
      if (!request->extension.empty()) {
        GtkFileFilter *filter =
            makeFilter(request->filterName.empty() ? "." + request->extension + " file"
                                                   : request->filterName,
                       {"*." + request->extension});
        gtk_file_dialog_set_default_filter(dialog, filter);
        g_object_unref(filter);
      }
    }
    GtkWindow *parent = activeWindow();
    Kind kind = request->kind;
    // The callback owns a copy of the request.
    auto *owned = new Request(*request);
    switch (kind) {
      case Kind::Open: gtk_file_dialog_open(dialog, parent, nullptr, finished, owned); break;
      case Kind::Folder: gtk_file_dialog_select_folder(dialog, parent, nullptr, finished, owned); break;
      case Kind::Save: gtk_file_dialog_save(dialog, parent, nullptr, finished, owned); break;
    }
    g_object_unref(dialog);
  });
}

}  // namespace

void openFile(std::string title, std::string acceptLabel, std::vector<Filter> filters, Done done) {
  show(std::make_unique<Request>(Request{Kind::Open, std::move(title), std::move(acceptLabel), "",
                                         "", "", std::move(filters), std::move(done)}));
}

void selectFolder(std::string title, std::string acceptLabel, Done done) {
  show(std::make_unique<Request>(
      Request{Kind::Folder, std::move(title), std::move(acceptLabel), "", "", "", {}, std::move(done)}));
}

void saveFile(std::string title, std::string acceptLabel, std::string initialName,
              std::string extension, std::string filterName, Done done) {
  show(std::make_unique<Request>(Request{Kind::Save, std::move(title), std::move(acceptLabel),
                                         std::move(initialName), std::move(extension),
                                         std::move(filterName), {}, std::move(done)}));
}

}  // namespace soundscraper::dialogs
