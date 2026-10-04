
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

inline winrt::Microsoft::ReactNative::FieldMap GetStructInfo(SoundScraperSpec_RecorderEvent*) noexcept {
    winrt::Microsoft::ReactNative::FieldMap fieldMap {
        {L"kind", &SoundScraperSpec_RecorderEvent::kind},
        {L"state", &SoundScraperSpec_RecorderEvent::state},
        {L"elapsedMs", &SoundScraperSpec_RecorderEvent::elapsedMs},
        {L"peak", &SoundScraperSpec_RecorderEvent::peak},
        {L"rms", &SoundScraperSpec_RecorderEvent::rms},
        {L"peakLeft", &SoundScraperSpec_RecorderEvent::peakLeft},
        {L"peakRight", &SoundScraperSpec_RecorderEvent::peakRight},
        {L"rmsLeft", &SoundScraperSpec_RecorderEvent::rmsLeft},
        {L"rmsRight", &SoundScraperSpec_RecorderEvent::rmsRight},
        {L"path", &SoundScraperSpec_RecorderEvent::path},
        {L"message", &SoundScraperSpec_RecorderEvent::message},
    };
    return fieldMap;
}

inline winrt::Microsoft::ReactNative::FieldMap GetStructInfo(SoundScraperSpec_Recording*) noexcept {
    winrt::Microsoft::ReactNative::FieldMap fieldMap {
        {L"fileName", &SoundScraperSpec_Recording::fileName},
        {L"path", &SoundScraperSpec_Recording::path},
        {L"title", &SoundScraperSpec_Recording::title},
        {L"artist", &SoundScraperSpec_Recording::artist},
        {L"album", &SoundScraperSpec_Recording::album},
        {L"durationMs", &SoundScraperSpec_Recording::durationMs},
        {L"sizeBytes", &SoundScraperSpec_Recording::sizeBytes},
        {L"recordedAtMs", &SoundScraperSpec_Recording::recordedAtMs},
    };
    return fieldMap;
}

inline winrt::Microsoft::ReactNative::FieldMap GetStructInfo(SoundScraperSpec_TagEdit*) noexcept {
    winrt::Microsoft::ReactNative::FieldMap fieldMap {
        {L"fields", &SoundScraperSpec_TagEdit::fields},
        {L"title", &SoundScraperSpec_TagEdit::title},
        {L"artist", &SoundScraperSpec_TagEdit::artist},
        {L"album", &SoundScraperSpec_TagEdit::album},
        {L"albumArtist", &SoundScraperSpec_TagEdit::albumArtist},
        {L"date", &SoundScraperSpec_TagEdit::date},
        {L"genre", &SoundScraperSpec_TagEdit::genre},
        {L"comment", &SoundScraperSpec_TagEdit::comment},
        {L"track", &SoundScraperSpec_TagEdit::track},
        {L"cover", &SoundScraperSpec_TagEdit::cover},
        {L"coverPath", &SoundScraperSpec_TagEdit::coverPath},
        {L"id3v23", &SoundScraperSpec_TagEdit::id3v23},
    };
    return fieldMap;
}

inline winrt::Microsoft::ReactNative::FieldMap GetStructInfo(SoundScraperSpec_Tags*) noexcept {
    winrt::Microsoft::ReactNative::FieldMap fieldMap {
        {L"title", &SoundScraperSpec_Tags::title},
        {L"artist", &SoundScraperSpec_Tags::artist},
        {L"album", &SoundScraperSpec_Tags::album},
        {L"albumArtist", &SoundScraperSpec_Tags::albumArtist},
        {L"date", &SoundScraperSpec_Tags::date},
        {L"genre", &SoundScraperSpec_Tags::genre},
        {L"comment", &SoundScraperSpec_Tags::comment},
        {L"track", &SoundScraperSpec_Tags::track},
        {L"coverPath", &SoundScraperSpec_Tags::coverPath},
    };
    return fieldMap;
}

struct SoundScraperSpec : winrt::Microsoft::ReactNative::TurboModuleSpec {
  static constexpr auto methods = std::tuple{
      SyncMethod<std::string() noexcept>{0, L"getVersion"},
      SyncMethod<std::vector<SoundScraperSpec_AudioApp>() noexcept>{1, L"listAudioApps"},
      Method<void(double, double, Promise<SoundScraperSpec_CaptureReport>) noexcept>{2, L"recordTestWav"},
      Method<void(double, Promise<void>) noexcept>{3, L"recorderStart"},
      Method<void() noexcept>{4, L"recorderPause"},
      Method<void() noexcept>{5, L"recorderResume"},
      Method<void(Promise<std::string>) noexcept>{6, L"recorderStop"},
      SyncMethod<std::string() noexcept>{7, L"recorderState"},
      SyncMethod<double() noexcept>{8, L"recoverPartialRecordings"},
      Method<void(Promise<std::vector<SoundScraperSpec_Recording>>) noexcept>{9, L"listRecordings"},
      Method<void(std::string, std::string, Promise<std::string>) noexcept>{10, L"renameRecording"},
      Method<void(std::string, Promise<void>) noexcept>{11, L"trashRecording"},
      Method<void(std::string) noexcept>{12, L"revealRecording"},
      Method<void(std::string, Promise<SoundScraperSpec_Tags>) noexcept>{13, L"readTags"},
      Method<void(std::vector<std::string>, SoundScraperSpec_TagEdit, Promise<void>) noexcept>{14, L"writeTags"},
      Method<void(Promise<std::optional<std::string>>) noexcept>{15, L"pickImage"},
      SyncMethod<std::string() noexcept>{16, L"getSettings"},
      Method<void(std::string, Promise<void>) noexcept>{17, L"setSettings"},
      Method<void(Promise<std::optional<std::string>>) noexcept>{18, L"pickFolder"},
      EventEmitter<void(SoundScraperSpec_RecorderEvent)>{19, L"onRecorderEvent"},
      EventEmitter<void(std::string)>{20, L"onLibraryChanged"},
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
    REACT_SHOW_METHOD_SPEC_ERRORS(
          3,
          "recorderStart",
          "    REACT_METHOD(recorderStart) void recorderStart(double appPid, ::React::ReactPromise<void> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(recorderStart) static void recorderStart(double appPid, ::React::ReactPromise<void> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          4,
          "recorderPause",
          "    REACT_METHOD(recorderPause) void recorderPause() noexcept { /* implementation */ }\n"
          "    REACT_METHOD(recorderPause) static void recorderPause() noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          5,
          "recorderResume",
          "    REACT_METHOD(recorderResume) void recorderResume() noexcept { /* implementation */ }\n"
          "    REACT_METHOD(recorderResume) static void recorderResume() noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          6,
          "recorderStop",
          "    REACT_METHOD(recorderStop) void recorderStop(::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(recorderStop) static void recorderStop(::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          7,
          "recorderState",
          "    REACT_SYNC_METHOD(recorderState) std::string recorderState() noexcept { /* implementation */ }\n"
          "    REACT_SYNC_METHOD(recorderState) static std::string recorderState() noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          8,
          "recoverPartialRecordings",
          "    REACT_SYNC_METHOD(recoverPartialRecordings) double recoverPartialRecordings() noexcept { /* implementation */ }\n"
          "    REACT_SYNC_METHOD(recoverPartialRecordings) static double recoverPartialRecordings() noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          9,
          "listRecordings",
          "    REACT_METHOD(listRecordings) void listRecordings(::React::ReactPromise<std::vector<SoundScraperSpec_Recording>> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(listRecordings) static void listRecordings(::React::ReactPromise<std::vector<SoundScraperSpec_Recording>> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          10,
          "renameRecording",
          "    REACT_METHOD(renameRecording) void renameRecording(std::string fileName, std::string newName, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(renameRecording) static void renameRecording(std::string fileName, std::string newName, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          11,
          "trashRecording",
          "    REACT_METHOD(trashRecording) void trashRecording(std::string fileName, ::React::ReactPromise<void> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(trashRecording) static void trashRecording(std::string fileName, ::React::ReactPromise<void> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          12,
          "revealRecording",
          "    REACT_METHOD(revealRecording) void revealRecording(std::string fileName) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(revealRecording) static void revealRecording(std::string fileName) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          13,
          "readTags",
          "    REACT_METHOD(readTags) void readTags(std::string fileName, ::React::ReactPromise<SoundScraperSpec_Tags> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(readTags) static void readTags(std::string fileName, ::React::ReactPromise<SoundScraperSpec_Tags> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          14,
          "writeTags",
          "    REACT_METHOD(writeTags) void writeTags(std::vector<std::string> const & fileNames, SoundScraperSpec_TagEdit && edit, ::React::ReactPromise<void> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(writeTags) static void writeTags(std::vector<std::string> const & fileNames, SoundScraperSpec_TagEdit && edit, ::React::ReactPromise<void> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          15,
          "pickImage",
          "    REACT_METHOD(pickImage) void pickImage(::React::ReactPromise<std::optional<std::string>> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(pickImage) static void pickImage(::React::ReactPromise<std::optional<std::string>> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          16,
          "getSettings",
          "    REACT_SYNC_METHOD(getSettings) std::string getSettings() noexcept { /* implementation */ }\n"
          "    REACT_SYNC_METHOD(getSettings) static std::string getSettings() noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          17,
          "setSettings",
          "    REACT_METHOD(setSettings) void setSettings(std::string json, ::React::ReactPromise<void> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(setSettings) static void setSettings(std::string json, ::React::ReactPromise<void> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          18,
          "pickFolder",
          "    REACT_METHOD(pickFolder) void pickFolder(::React::ReactPromise<std::optional<std::string>> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(pickFolder) static void pickFolder(::React::ReactPromise<std::optional<std::string>> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_EVENTEMITTER_SPEC_ERRORS(
          19,
          "onRecorderEvent",
          "    REACT_EVENT(onRecorderEvent) std::function<void(SoundScraperSpec_RecorderEvent)> onRecorderEvent;\n");
    REACT_SHOW_EVENTEMITTER_SPEC_ERRORS(
          20,
          "onLibraryChanged",
          "    REACT_EVENT(onLibraryChanged) std::function<void(std::string)> onLibraryChanged;\n");
  }
};

} // namespace SoundScraperCodegen
