#import "RCTSoundScraper.h"

#include "sound_scraper.h"

@implementation RCTSoundScraper

RCT_EXPORT_MODULE(SoundScraper)

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(getVersion)
{
  return [NSString stringWithUTF8String:ss_version()];
}

#ifdef RCT_NEW_ARCH_ENABLED
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeSoundScraperSpecJSI>(params);
}
#endif

@end
