
/*
 * This file is auto-generated from a NativeModule spec file in js.
 *
 * This is a C++ Spec class that should be used with MakeTurboModuleProvider to register native modules
 * in a way that also verifies at compile time that the native module matches the interface required
 * by the TurboModule JS spec.
 */
#pragma once
// clang-format off

// #include "NativeSkinsDataTypes.g.h" before this file to use the generated type definition
#include <NativeModules.h>
#include <tuple>

namespace SoundScraperCodegen {

inline winrt::Microsoft::ReactNative::FieldMap GetStructInfo(SkinsSpec_WindowEvent*) noexcept {
    winrt::Microsoft::ReactNative::FieldMap fieldMap {
        {L"window", &SkinsSpec_WindowEvent::window},
        {L"event", &SkinsSpec_WindowEvent::event},
    };
    return fieldMap;
}

struct SkinsSpec : winrt::Microsoft::ReactNative::TurboModuleSpec {
  static constexpr auto methods = std::tuple{
      Method<void(std::string, Promise<std::string>) noexcept>{0, L"loadSkin"},
      Method<void(Promise<std::string>) noexcept>{1, L"loadCurrentSkin"},
      Method<void(Promise<std::string>) noexcept>{2, L"listSkins"},
      Method<void(std::string, Promise<std::string>) noexcept>{3, L"installSkin"},
      Method<void(std::string, Promise<void>) noexcept>{4, L"removeSkin"},
      Method<void(Promise<std::optional<std::string>>) noexcept>{5, L"pickSkinArchive"},
      Method<void(Promise<std::optional<std::string>>) noexcept>{6, L"pickSkinFolder"},
      Method<void(std::string, std::string, Promise<std::optional<std::string>>) noexcept>{7, L"pickFolder"},
      Method<void(std::string, Promise<std::optional<std::string>>) noexcept>{8, L"pickSkinSaveLocation"},
      Method<void(std::string, Promise<std::string>) noexcept>{9, L"inspectSkin"},
      Method<void(std::string, Promise<std::string>) noexcept>{10, L"skinPreview"},
      Method<void(std::string, std::string, Promise<std::string>) noexcept>{11, L"packageSkin"},
      Method<void(std::string, std::string, Promise<std::string>) noexcept>{12, L"createSkin"},
      Method<void(std::string, Promise<std::string>) noexcept>{13, L"skinFolderStamp"},
      SyncMethod<std::vector<std::string>() noexcept>{14, L"takeOpenedSkinFiles"},
      Method<void(std::string, double, double, std::vector<double>, std::vector<double>, std::vector<double>, double, double, double) noexcept>{15, L"setPanelLayout"},
      Method<void(std::string) noexcept>{16, L"windowAction"},
      Method<void(std::string, std::string) noexcept>{17, L"beginGesture"},
      Method<void(std::string, bool) noexcept>{18, L"setPanelVisible"},
      SyncMethod<bool(std::string) noexcept>{19, L"isPanelVisible"},
      Method<void(std::string, std::vector<std::string>, double, double, double, Promise<double>) noexcept>{20, L"showMenu"},
      EventEmitter<void(SkinsSpec_WindowEvent)>{21, L"onWindowEvent"},
  };

  template <class TModule>
  static constexpr void ValidateModule() noexcept {
    constexpr auto methodCheckResults = CheckMethods<TModule, SkinsSpec>();

    REACT_SHOW_METHOD_SPEC_ERRORS(
          0,
          "loadSkin",
          "    REACT_METHOD(loadSkin) void loadSkin(std::string idOrPath, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(loadSkin) static void loadSkin(std::string idOrPath, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          1,
          "loadCurrentSkin",
          "    REACT_METHOD(loadCurrentSkin) void loadCurrentSkin(::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(loadCurrentSkin) static void loadCurrentSkin(::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          2,
          "listSkins",
          "    REACT_METHOD(listSkins) void listSkins(::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(listSkins) static void listSkins(::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          3,
          "installSkin",
          "    REACT_METHOD(installSkin) void installSkin(std::string archivePath, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(installSkin) static void installSkin(std::string archivePath, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          4,
          "removeSkin",
          "    REACT_METHOD(removeSkin) void removeSkin(std::string id, ::React::ReactPromise<void> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(removeSkin) static void removeSkin(std::string id, ::React::ReactPromise<void> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          5,
          "pickSkinArchive",
          "    REACT_METHOD(pickSkinArchive) void pickSkinArchive(::React::ReactPromise<std::optional<std::string>> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(pickSkinArchive) static void pickSkinArchive(::React::ReactPromise<std::optional<std::string>> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          6,
          "pickSkinFolder",
          "    REACT_METHOD(pickSkinFolder) void pickSkinFolder(::React::ReactPromise<std::optional<std::string>> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(pickSkinFolder) static void pickSkinFolder(::React::ReactPromise<std::optional<std::string>> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          7,
          "pickFolder",
          "    REACT_METHOD(pickFolder) void pickFolder(std::string title, std::string prompt, ::React::ReactPromise<std::optional<std::string>> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(pickFolder) static void pickFolder(std::string title, std::string prompt, ::React::ReactPromise<std::optional<std::string>> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          8,
          "pickSkinSaveLocation",
          "    REACT_METHOD(pickSkinSaveLocation) void pickSkinSaveLocation(std::string defaultName, ::React::ReactPromise<std::optional<std::string>> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(pickSkinSaveLocation) static void pickSkinSaveLocation(std::string defaultName, ::React::ReactPromise<std::optional<std::string>> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          9,
          "inspectSkin",
          "    REACT_METHOD(inspectSkin) void inspectSkin(std::string archivePath, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(inspectSkin) static void inspectSkin(std::string archivePath, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          10,
          "skinPreview",
          "    REACT_METHOD(skinPreview) void skinPreview(std::string idOrPath, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(skinPreview) static void skinPreview(std::string idOrPath, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          11,
          "packageSkin",
          "    REACT_METHOD(packageSkin) void packageSkin(std::string dir, std::string outPath, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(packageSkin) static void packageSkin(std::string dir, std::string outPath, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          12,
          "createSkin",
          "    REACT_METHOD(createSkin) void createSkin(std::string parent, std::string name, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(createSkin) static void createSkin(std::string parent, std::string name, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          13,
          "skinFolderStamp",
          "    REACT_METHOD(skinFolderStamp) void skinFolderStamp(std::string dir, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(skinFolderStamp) static void skinFolderStamp(std::string dir, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          14,
          "takeOpenedSkinFiles",
          "    REACT_SYNC_METHOD(takeOpenedSkinFiles) std::vector<std::string> takeOpenedSkinFiles() noexcept { /* implementation */ }\n"
          "    REACT_SYNC_METHOD(takeOpenedSkinFiles) static std::vector<std::string> takeOpenedSkinFiles() noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          15,
          "setPanelLayout",
          "    REACT_METHOD(setPanelLayout) void setPanelLayout(std::string panel, double width, double height, std::vector<double> const & dragRegions, std::vector<double> const & holes, std::vector<double> const & grip, double minWidth, double minHeight, double scale) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(setPanelLayout) static void setPanelLayout(std::string panel, double width, double height, std::vector<double> const & dragRegions, std::vector<double> const & holes, std::vector<double> const & grip, double minWidth, double minHeight, double scale) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          16,
          "windowAction",
          "    REACT_METHOD(windowAction) void windowAction(std::string action) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(windowAction) static void windowAction(std::string action) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          17,
          "beginGesture",
          "    REACT_METHOD(beginGesture) void beginGesture(std::string panel, std::string kind) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(beginGesture) static void beginGesture(std::string panel, std::string kind) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          18,
          "setPanelVisible",
          "    REACT_METHOD(setPanelVisible) void setPanelVisible(std::string panel, bool visible) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(setPanelVisible) static void setPanelVisible(std::string panel, bool visible) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          19,
          "isPanelVisible",
          "    REACT_SYNC_METHOD(isPanelVisible) bool isPanelVisible(std::string panel) noexcept { /* implementation */ }\n"
          "    REACT_SYNC_METHOD(isPanelVisible) static bool isPanelVisible(std::string panel) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          20,
          "showMenu",
          "    REACT_METHOD(showMenu) void showMenu(std::string panel, std::vector<std::string> const & items, double checked, double x, double y, ::React::ReactPromise<double> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(showMenu) static void showMenu(std::string panel, std::vector<std::string> const & items, double checked, double x, double y, ::React::ReactPromise<double> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_EVENTEMITTER_SPEC_ERRORS(
          21,
          "onWindowEvent",
          "    REACT_EVENT(onWindowEvent) std::function<void(SkinsSpec_WindowEvent)> onWindowEvent;\n");
  }
};

} // namespace SoundScraperCodegen
