
/*
 * This file is auto-generated from a NativeModule spec file in js.
 *
 * This is a C++ Spec class that should be used with MakeTurboModuleProvider to register native modules
 * in a way that also verifies at compile time that the native module matches the interface required
 * by the TurboModule JS spec.
 */
#pragma once
// clang-format off

#include <string>
#include <optional>
#include <functional>
#include <vector>

namespace SoundScraperCodegen {

struct SoundScraperSpec_AudioApp {
    double pid;
    std::string name;
    std::optional<std::string> bundleId;
    bool isPlaying;
};

struct SoundScraperSpec_CaptureReport {
    std::string path;
    double frames;
    double sampleRate;
    double channels;
    double peak;
};

struct SoundScraperSpec_RecorderEvent {
    std::string kind;
    std::string state;
    double elapsedMs;
    double peak;
    double rms;
    std::optional<std::string> path;
    std::optional<std::string> message;
};

struct SoundScraperSpec_Recording {
    std::string fileName;
    std::string path;
    std::string title;
    std::optional<std::string> artist;
    std::optional<std::string> album;
    double durationMs;
    double sizeBytes;
    double recordedAtMs;
};

struct SoundScraperSpec_TagEdit {
    std::vector<std::string> fields;
    std::optional<std::string> title;
    std::optional<std::string> artist;
    std::optional<std::string> album;
    std::optional<std::string> albumArtist;
    std::optional<std::string> date;
    std::optional<std::string> genre;
    std::optional<std::string> comment;
    std::optional<double> track;
    std::string cover;
    std::optional<std::string> coverPath;
    bool id3v23;
};

struct SoundScraperSpec_Tags {
    std::optional<std::string> title;
    std::optional<std::string> artist;
    std::optional<std::string> album;
    std::optional<std::string> albumArtist;
    std::optional<std::string> date;
    std::optional<std::string> genre;
    std::optional<std::string> comment;
    std::optional<double> track;
    std::optional<std::string> coverPath;
};

} // namespace SoundScraperCodegen
