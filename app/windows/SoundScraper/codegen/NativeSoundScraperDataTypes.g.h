
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

} // namespace SoundScraperCodegen
