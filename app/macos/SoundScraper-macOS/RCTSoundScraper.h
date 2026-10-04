#import <Foundation/Foundation.h>

#import <SoundScraperSpec/SoundScraperSpec.h>

NS_ASSUME_NONNULL_BEGIN

/// React Native bridge to the Rust core (core/include/sound_scraper.h).
/// Marshals arguments only; all logic lives in Rust. New Architecture only.
@interface RCTSoundScraper : NativeSoundScraperSpecBase <NativeSoundScraperSpec>
@end

/// The recorder in use (NULL until JS first touches it); visualizer views
/// read its analysis. Main thread.
struct SsRecorder;
#ifdef __cplusplus
extern "C"
#endif
    struct SsRecorder *_Nullable SSCurrentRecorder(void);

NS_ASSUME_NONNULL_END
