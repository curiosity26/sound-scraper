#import <Foundation/Foundation.h>

#import <SoundScraperSpec/SoundScraperSpec.h>

NS_ASSUME_NONNULL_BEGIN

/// React Native bridge to the Rust core (core/include/sound_scraper.h).
/// Marshals arguments only; all logic lives in Rust. New Architecture only.
@interface RCTSoundScraper : NativeSoundScraperSpecBase <NativeSoundScraperSpec>
@end

NS_ASSUME_NONNULL_END
