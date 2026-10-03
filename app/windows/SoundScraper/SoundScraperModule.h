#pragma once

// React Native bridge to the Rust core (core/include/sound_scraper.h).
// Marshals arguments only; all logic lives in Rust.

#include <NativeModules.h>

#include "codegen/NativeSoundScraperSpec.g.h"
#include "sound_scraper.h"

namespace SoundScraper {

REACT_MODULE(SoundScraperModule, L"SoundScraper")
struct SoundScraperModule {
  // Compile-time check against the shared TS spec (src/native/NativeSoundScraper.ts).
  using ModuleSpec = SoundScraperCodegen::SoundScraperSpec;

  REACT_SYNC_METHOD(getVersion)
  std::string getVersion() noexcept {
    return ss_version();
  }
};

} // namespace SoundScraper
