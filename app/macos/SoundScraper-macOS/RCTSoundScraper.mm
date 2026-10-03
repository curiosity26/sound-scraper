#import "RCTSoundScraper.h"

#include "sound_scraper.h"

static NSString *SSString(const char *s)
{
  return s ? [NSString stringWithUTF8String:s] : nil;
}

static NSString *SSStateName(SsRecorderState state)
{
  switch (state) {
    case SS_RECORDER_STATE_RECORDING: return @"recording";
    case SS_RECORDER_STATE_PAUSED: return @"paused";
    case SS_RECORDER_STATE_FINALIZING: return @"finalizing";
    case SS_RECORDER_STATE_IDLE: break;
  }
  return @"idle";
}

static NSString *SSEventKindName(SsRecorderEventKind kind)
{
  switch (kind) {
    case SS_RECORDER_EVENT_KIND_PROGRESS: return @"progress";
    case SS_RECORDER_EVENT_KIND_FINISHED: return @"finished";
    case SS_RECORDER_EVENT_KIND_ERROR: return @"error";
    case SS_RECORDER_EVENT_KIND_STATE_CHANGED: break;
  }
  return @"state";
}

/// Handed to Rust as the callback's user_data. Holds the module weakly so an
/// event arriving during teardown is simply dropped.
struct SSEventTarget {
  __weak RCTSoundScraper *module;
};

@interface RCTSoundScraper () {
  SsRecorder *_recorder;
  SSEventTarget *_eventTarget;
}
@end

static void SSOnRecorderEvent(const SsRecorderEvent *event, void *userData)
{
  // Copy everything now: the event's strings only live during this call.
  NSDictionary *body = @{
    @"kind" : SSEventKindName(event->kind),
    @"state" : SSStateName(event->state),
    @"elapsedMs" : @(event->elapsed_ms),
    @"peak" : @(event->peak),
    @"rms" : @(event->rms),
    @"path" : SSString(event->path) ?: (id)[NSNull null],
    @"message" : SSString(event->message) ?: (id)[NSNull null],
  };
  RCTSoundScraper *module = static_cast<SSEventTarget *>(userData)->module;
  dispatch_async(dispatch_get_main_queue(), ^{
    [module emitOnRecorderEvent:body];
  });
}

@implementation RCTSoundScraper

RCT_EXPORT_MODULE(SoundScraper)

- (instancetype)init
{
  if (self = [super init]) {
    _recorder = ss_recorder_create();
    _eventTarget = new SSEventTarget{self};
    ss_recorder_set_callback(_recorder, SSOnRecorderEvent, _eventTarget);
  }
  return self;
}

- (void)dealloc
{
  // Finalizes an in-progress recording; late events see a nil module.
  ss_recorder_destroy(_recorder);
  delete _eventTarget;
}

- (NSString *)getVersion
{
  return SSString(ss_version());
}

- (NSArray<NSDictionary *> *)listAudioApps
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

- (void)recordTestWav:(double)appPid
              seconds:(double)seconds
              resolve:(RCTPromiseResolveBlock)resolve
               reject:(RCTPromiseRejectBlock)reject
{
  // Blocks for the whole recording.
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

- (void)recorderStart:(double)appPid resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  // May block on the macOS permission prompt.
  SsRecorder *recorder = _recorder;
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    if (ss_recorder_start(recorder, (uint32_t)appPid) != SS_STATUS_OK) {
      reject(@"start_failed", SSString(ss_last_error_message()), nil);
      return;
    }
    resolve(nil);
  });
}

- (void)recorderPause
{
  ss_recorder_pause(_recorder);
}

- (void)recorderResume
{
  ss_recorder_resume(_recorder);
}

- (void)recorderStop:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  SsRecorder *recorder = _recorder;
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    char *path = NULL;
    if (ss_recorder_stop(recorder, &path) != SS_STATUS_OK) {
      reject(@"stop_failed", SSString(ss_last_error_message()), nil);
      return;
    }
    NSString *result = SSString(path);
    ss_string_free(path);
    resolve(result);
  });
}

- (NSString *)recorderState
{
  return SSStateName(ss_recorder_state(_recorder));
}

- (NSNumber *)recoverPartialRecordings
{
  return @(ss_recover_partial_recordings());
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeSoundScraperSpecJSI>(params);
}

@end
