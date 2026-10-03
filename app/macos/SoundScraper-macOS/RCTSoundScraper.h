#import <Foundation/Foundation.h>

#ifdef RCT_NEW_ARCH_ENABLED
#import <SoundScraperSpec/SoundScraperSpec.h>
#else
#import <React/RCTBridgeModule.h>
#endif

NS_ASSUME_NONNULL_BEGIN

/// React Native bridge to the Rust core (core/include/sound_scraper.h).
/// Marshals arguments only; all logic lives in Rust.
#ifdef RCT_NEW_ARCH_ENABLED
@interface RCTSoundScraper : NSObject <NativeSoundScraperSpec>
#else
@interface RCTSoundScraper : NSObject <RCTBridgeModule>
#endif
@end

NS_ASSUME_NONNULL_END
