#import "RCTSoundScraper.h"

#include "sound_scraper.h"

static NSString *SSString(const char *s)
{
  return s ? [NSString stringWithUTF8String:s] : nil;
}

@implementation RCTSoundScraper

RCT_EXPORT_MODULE(SoundScraper)

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(getVersion)
{
  return SSString(ss_version());
}

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(listAudioApps)
{
  SsAudioAppList *list = ss_audio_apps_list();
  size_t count = ss_audio_app_list_len(list);
  NSMutableArray<NSDictionary *> *apps = [NSMutableArray arrayWithCapacity:count];
  for (size_t i = 0; i < count; i++) {
    const SsAudioApp *app = ss_audio_app_list_get(list, i);
    [apps addObject:@{
      @"pid" : @(app->pid),
      @"name" : SSString(app->name) ?: @"",
      @"bundleId" : SSString(app->bundle_id) ?: (id)[NSNull null],
      @"isPlaying" : @(app->is_playing),
    }];
  }
  ss_audio_app_list_free(list);
  return apps;
}

RCT_EXPORT_METHOD(recordTestWav
                  : (double)appPid seconds
                  : (double)seconds resolve
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  // ss_capture_test_wav blocks for the whole recording.
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    SsCaptureReport report = {};
    if (ss_capture_test_wav((uint32_t)appPid, seconds, &report) != SS_STATUS_OK) {
      reject(@"capture_failed", SSString(ss_last_error_message()), nil);
      return;
    }
    NSDictionary *result = @{
      @"path" : SSString(report.path) ?: @"",
      @"frames" : @(report.frames),
      @"sampleRate" : @(report.sample_rate),
      @"channels" : @(report.channels),
      @"peak" : @(report.peak),
    };
    ss_capture_report_free(&report);
    resolve(result);
  });
}

#ifdef RCT_NEW_ARCH_ENABLED
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeSoundScraperSpecJSI>(params);
}
#endif

@end
