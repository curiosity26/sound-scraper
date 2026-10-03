
/*
 * This file is auto-generated from a NativeModule spec file in js.
 *
 * This is a C++ Spec class that should be used with MakeTurboModuleProvider to register native modules
 * in a way that also verifies at compile time that the native module matches the interface required
 * by the TurboModule JS spec.
 */
#pragma once
// clang-format off

// #include "NativeSoundScraperDataTypes.g.h" before this file to use the generated type definition
#include <NativeModules.h>
#include <tuple>

namespace SoundScraperCodegen {

inline winrt::Microsoft::ReactNative::FieldMap GetStructInfo(SoundScraperSpec_AudioApp*) noexcept {
    winrt::Microsoft::ReactNative::FieldMap fieldMap {
        {L"pid", &SoundScraperSpec_AudioApp::pid},
        {L"name", &SoundScraperSpec_AudioApp::name},
        {L"bundleId", &SoundScraperSpec_AudioApp::bundleId},
        {L"isPlaying", &SoundScraperSpec_AudioApp::isPlaying},
    };
    return fieldMap;
}

inline winrt::Microsoft::ReactNative::FieldMap GetStructInfo(SoundScraperSpec_CaptureReport*) noexcept {
    winrt::Microsoft::ReactNative::FieldMap fieldMap {
        {L"path", &SoundScraperSpec_CaptureReport::path},
        {L"frames", &SoundScraperSpec_CaptureReport::frames},
        {L"sampleRate", &SoundScraperSpec_CaptureReport::sampleRate},
        {L"channels", &SoundScraperSpec_CaptureReport::channels},
        {L"peak", &SoundScraperSpec_CaptureReport::peak},
    };
    return fieldMap;
}

struct SoundScraperSpec : winrt::Microsoft::ReactNative::TurboModuleSpec {
  static constexpr auto methods = std::tuple{
      SyncMethod<std::string() noexcept>{0, L"getVersion"},
      SyncMethod<std::vector<SoundScraperSpec_AudioApp>() noexcept>{1, L"listAudioApps"},
      Method<void(double, double, Promise<SoundScraperSpec_CaptureReport>) noexcept>{2, L"recordTestWav"},
  };

  template <class TModule>
  static constexpr void ValidateModule() noexcept {
    constexpr auto methodCheckResults = CheckMethods<TModule, SoundScraperSpec>();

    REACT_SHOW_METHOD_SPEC_ERRORS(
          0,
          "getVersion",
          "    REACT_SYNC_METHOD(getVersion) std::string getVersion() noexcept { /* implementation */ }\n"
          "    REACT_SYNC_METHOD(getVersion) static std::string getVersion() noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          1,
          "listAudioApps",
          "    REACT_SYNC_METHOD(listAudioApps) std::vector<SoundScraperSpec_AudioApp> listAudioApps() noexcept { /* implementation */ }\n"
          "    REACT_SYNC_METHOD(listAudioApps) static std::vector<SoundScraperSpec_AudioApp> listAudioApps() noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          2,
          "recordTestWav",
          "    REACT_METHOD(recordTestWav) void recordTestWav(double appPid, double seconds, ::React::ReactPromise<SoundScraperSpec_CaptureReport> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(recordTestWav) static void recordTestWav(double appPid, double seconds, ::React::ReactPromise<SoundScraperSpec_CaptureReport> &&result) noexcept { /* implementation */ }\n");
  }
};

} // namespace SoundScraperCodegen
