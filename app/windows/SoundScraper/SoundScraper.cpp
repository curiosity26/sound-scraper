// SoundScraper.cpp : Defines the entry point for the application.
//

#include "pch.h"
#include "SoundScraper.h"

#include "AutolinkedNativeModules.g.h"

#include "NativeModules.h"

#include "FileImageProvider.h"
#include "Shared.h"
#include "VisualizerView.h"
#include "WindowManager.h"

// A PackageProvider containing any turbo modules you define within this app project
struct CompReactPackageProvider
    : winrt::implements<CompReactPackageProvider, winrt::Microsoft::ReactNative::IReactPackageProvider> {
 public: // IReactPackageProvider
  void CreatePackage(winrt::Microsoft::ReactNative::IReactPackageBuilder const &packageBuilder) noexcept {
    AddAttributedModules(packageBuilder, true);
    SoundScraper::RegisterVisualizerView(packageBuilder);
    SoundScraper::RegisterFileImageProvider(packageBuilder);
  }
};

// The entry point of the Win32 application
_Use_decl_annotations_ int CALLBACK WinMain(HINSTANCE instance, HINSTANCE, PSTR /* commandLine */, int showCmd) {
  // Packaged (MSIX), %APPDATA% writes are redirected, and the image loader
  // can't open the redirected paths the core would report for skin images:
  // keep skins in the package's real LocalState folder instead.
  try {
    auto local = winrt::Windows::Storage::ApplicationData::Current().LocalFolder().Path();
    SetEnvironmentVariableW(L"SOUND_SCRAPER_SKINS_DIR", (std::wstring(local) + L"\\Skins").c_str());
  } catch (...) {
    // Not packaged: the default location works.
  }
  std::set_terminate([]() {
    try {
      if (auto e = std::current_exception()) {
        std::rethrow_exception(e);
      }
    } catch (winrt::hresult_error const &e) {
      SoundScraper::LogError(("terminate: " + winrt::to_string(e.message())).c_str());
    } catch (std::exception const &e) {
      SoundScraper::LogError((std::string("terminate: ") + e.what()).c_str());
    } catch (...) {
      SoundScraper::LogError("terminate");
    }
    abort();
  });
  // Initialize WinRT
  winrt::init_apartment(winrt::apartment_type::single_threaded);

  // Enable per monitor DPI scaling
  SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

  // Find the path hosting the app exe file
  WCHAR appDirectory[MAX_PATH];
  GetModuleFileNameW(NULL, appDirectory, MAX_PATH);
  PathCchRemoveFileSpec(appDirectory, MAX_PATH);

  // Create a ReactNativeWin32App with the ReactNativeAppBuilder
  auto reactNativeWin32App{winrt::Microsoft::ReactNative::ReactNativeAppBuilder().Build()};

  // Configure the initial InstanceSettings for the app's ReactNativeHost
  auto settings{reactNativeWin32App.ReactNativeHost().InstanceSettings()};
  // Register any autolinked native modules
  RegisterAutolinkedNativeModulePackages(settings.PackageProviders());
  // Register any native modules defined within this app project
  settings.PackageProviders().Append(winrt::make<CompReactPackageProvider>());

#if BUNDLE
  // Load the JS bundle from a file (not Metro):
  // Set the path (on disk) where the .bundle file is located
  settings.BundleRootPath(std::wstring(L"file://").append(appDirectory).append(L"\\Bundle\\").c_str());
  // Set the name of the bundle file (without the .bundle extension)
  settings.JavaScriptBundleFile(L"index.windows");
  // Disable hot reload
  settings.UseFastRefresh(false);
#else
  // Load the JS bundle from Metro
  settings.JavaScriptBundleFile(L"index");
  // Enable hot reload
  settings.UseFastRefresh(true);
#endif
#if _DEBUG
  // For Debug builds
  // Enable Direct Debugging of JS
  settings.UseDirectDebugger(true);
  // Enable the Developer Menu
  settings.UseDeveloperSupport(true);
#else
  // For Release builds:
  // Disable Direct Debugging of JS
  settings.UseDirectDebugger(false);
  // Disable the Developer Menu
  settings.UseDeveloperSupport(false);
#endif

  // The main window is the skinned panel: borderless, sized by the skin,
  // with the library, details and settings panels owned by it.
  try {
    SoundScraper::WindowManager::Get().Init(reactNativeWin32App);
  } catch (winrt::hresult_error const &e) {
    // Keep running with the default window; note why.
    SoundScraper::LogError(("window manager: " + winrt::to_string(e.message())).c_str());
  }

  // Get the ReactViewOptions so we can set the initial RN component to load
  auto viewOptions{reactNativeWin32App.ReactViewOptions()};
  viewOptions.ComponentName(L"SoundScraper");

  // Start the app
  reactNativeWin32App.Start();
}
