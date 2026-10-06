
/*
 * This file is auto-generated from a NativeModule spec file in js.
 *
 * This is a C++ Spec class that should be used with MakeTurboModuleProvider to register native modules
 * in a way that also verifies at compile time that the native module matches the interface required
 * by the TurboModule JS spec.
 */
#pragma once
// clang-format off


#include <NativeModules.h>
#include <tuple>

namespace SoundScraperCodegen {

struct EditorSpec : winrt::Microsoft::ReactNative::TurboModuleSpec {
  static constexpr auto methods = std::tuple{
      SyncMethod<double(std::string) noexcept>{0, L"open"},
      Method<void(double) noexcept>{1, L"close"},
      SyncMethod<std::string(double) noexcept>{2, L"status"},
      SyncMethod<std::string(double, std::string) noexcept>{3, L"tracks"},
      SyncMethod<std::string(double, std::string) noexcept>{4, L"detect"},
      SyncMethod<std::string(std::string) noexcept>{5, L"loadDraft"},
      Method<void(std::string, std::string) noexcept>{6, L"saveDraft"},
      Method<void(std::string) noexcept>{7, L"discardDraft"},
      SyncMethod<std::string() noexcept>{8, L"mastersUsage"},
      Method<void(Promise<void>) noexcept>{9, L"deleteAllMasters"},
      Method<void(std::string, std::string, bool, Promise<std::string>) noexcept>{10, L"save"},
  };

  template <class TModule>
  static constexpr void ValidateModule() noexcept {
    constexpr auto methodCheckResults = CheckMethods<TModule, EditorSpec>();

    REACT_SHOW_METHOD_SPEC_ERRORS(
          0,
          "open",
          "    REACT_SYNC_METHOD(open) double open(std::string path) noexcept { /* implementation */ }\n"
          "    REACT_SYNC_METHOD(open) static double open(std::string path) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          1,
          "close",
          "    REACT_METHOD(close) void close(double id) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(close) static void close(double id) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          2,
          "status",
          "    REACT_SYNC_METHOD(status) std::string status(double id) noexcept { /* implementation */ }\n"
          "    REACT_SYNC_METHOD(status) static std::string status(double id) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          3,
          "tracks",
          "    REACT_SYNC_METHOD(tracks) std::string tracks(double id, std::string editsJson) noexcept { /* implementation */ }\n"
          "    REACT_SYNC_METHOD(tracks) static std::string tracks(double id, std::string editsJson) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          4,
          "detect",
          "    REACT_SYNC_METHOD(detect) std::string detect(double id, std::string optionsJson) noexcept { /* implementation */ }\n"
          "    REACT_SYNC_METHOD(detect) static std::string detect(double id, std::string optionsJson) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          5,
          "loadDraft",
          "    REACT_SYNC_METHOD(loadDraft) std::string loadDraft(std::string fileName) noexcept { /* implementation */ }\n"
          "    REACT_SYNC_METHOD(loadDraft) static std::string loadDraft(std::string fileName) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          6,
          "saveDraft",
          "    REACT_METHOD(saveDraft) void saveDraft(std::string fileName, std::string editsJson) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(saveDraft) static void saveDraft(std::string fileName, std::string editsJson) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          7,
          "discardDraft",
          "    REACT_METHOD(discardDraft) void discardDraft(std::string fileName) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(discardDraft) static void discardDraft(std::string fileName) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          8,
          "mastersUsage",
          "    REACT_SYNC_METHOD(mastersUsage) std::string mastersUsage() noexcept { /* implementation */ }\n"
          "    REACT_SYNC_METHOD(mastersUsage) static std::string mastersUsage() noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          9,
          "deleteAllMasters",
          "    REACT_METHOD(deleteAllMasters) void deleteAllMasters(::React::ReactPromise<void> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(deleteAllMasters) static void deleteAllMasters(::React::ReactPromise<void> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          10,
          "save",
          "    REACT_METHOD(save) void save(std::string fileName, std::string editsJson, bool keepOriginal, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(save) static void save(std::string fileName, std::string editsJson, bool keepOriginal, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
  }
};

} // namespace SoundScraperCodegen
