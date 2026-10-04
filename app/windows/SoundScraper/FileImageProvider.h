#pragma once

// Loads file:/// image URIs (skin art, cover art). React Native Windows'
// built-in handler passes the whole URI to StorageFile::GetFileFromPathAsync,
// which wants a plain path, so local images never load.

#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Storage.Streams.h>
#include <winrt/Windows.Storage.h>

#include "Shared.h"

namespace SoundScraper {

struct FileImageProvider
    : winrt::implements<FileImageProvider, winrt::Microsoft::ReactNative::Composition::IUriImageProvider> {
  bool CanLoadImageUri(winrt::Microsoft::ReactNative::IReactContext const &, winrt::Windows::Foundation::Uri const &uri) {
    return uri.SchemeName() == L"file";
  }

  winrt::Windows::Foundation::IAsyncOperation<winrt::Microsoft::ReactNative::Composition::ImageResponse>
  GetImageResponseAsync(winrt::Microsoft::ReactNative::IReactContext context,
                        winrt::Microsoft::ReactNative::Composition::ImageSource source) {
    // file:///C:/Users/a%20b/x.png -> C:\Users\a b\x.png
    std::wstring path{winrt::Windows::Foundation::Uri::UnescapeComponent(source.Uri().Path())};
    if (path.size() > 2 && path[0] == L'/' && path[2] == L':') {
      path.erase(0, 1);
    }
    for (auto &c : path) {
      if (c == L'/') {
        c = L'\\';
      }
    }
    try {
      auto file = co_await winrt::Windows::Storage::StorageFile::GetFileFromPathAsync(path);
      auto stream = co_await file.OpenReadAsync();
      co_return winrt::Microsoft::ReactNative::Composition::StreamImageResponse(stream);
    } catch (winrt::hresult_error const &e) {
      LogError(("image: " + winrt::to_string(path) + " " + winrt::to_string(e.message())).c_str());
      co_return winrt::Microsoft::ReactNative::Composition::ImageFailedResponse(e.message());
    }
  }
};

inline void RegisterFileImageProvider(winrt::Microsoft::ReactNative::IReactPackageBuilder const &packageBuilder) {
  if (auto fabric = packageBuilder.try_as<winrt::Microsoft::ReactNative::IReactPackageBuilderFabric>()) {
    fabric.AddUriImageProvider(winrt::make<FileImageProvider>());
  }
}

} // namespace SoundScraper
