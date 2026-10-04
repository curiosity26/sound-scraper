#import "RCTSoundScraper.h"

#import <AppKit/AppKit.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

#include <string>
#include <vector>

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

// React Native may create more than one instance of this class, and only
// the one wired to JS gets an event emitter. So the recorder and library are
// opened lazily on first use, and events are dropped until JS is connected.
@interface RCTSoundScraper () {
  SsRecorder *_recorder;
  SsLibrary *_library; // NULL if the library couldn't be opened
  SSEventTarget *_eventTarget;
  dispatch_queue_t _libraryQueue;
}
- (SsRecorder *)recorder;
- (SsLibrary *)library;
- (void)emitRecorderEvent:(NSDictionary *)body;
- (void)emitLibraryChanged;
- (void)finishRecordingForQuit;
@end

static void SSOnLibraryChanged(void *userData)
{
  RCTSoundScraper *module = static_cast<SSEventTarget *>(userData)->module;
  dispatch_async(dispatch_get_main_queue(), ^{
    [module emitLibraryChanged];
  });
}

static NSError *SSLastError(void)
{
  return [NSError errorWithDomain:@"SoundScraper"
                             code:1
                         userInfo:@{NSLocalizedDescriptionKey : SSString(ss_last_error_message()) ?: @"unknown error"}];
}

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
    [module emitRecorderEvent:body];
  });
}

@implementation RCTSoundScraper

RCT_EXPORT_MODULE(SoundScraper)

- (instancetype)init
{
  if (self = [super init]) {
    _eventTarget = new SSEventTarget{self};
    // Library calls touch the disk; keep them off the JS thread, in order.
    _libraryQueue = dispatch_queue_create("SoundScraper.library", DISPATCH_QUEUE_SERIAL);
    // Quitting (including the skin's close button) finalizes a recording in
    // progress instead of leaving a .part file for crash recovery.
    __weak RCTSoundScraper *weakSelf = self;
    [[NSNotificationCenter defaultCenter] addObserverForName:NSApplicationWillTerminateNotification
                                                      object:nil
                                                       queue:nil
                                                  usingBlock:^(NSNotification *note) {
                                                    [weakSelf finishRecordingForQuit];
                                                  }];
  }
  return self;
}

- (void)dealloc
{
  // Finalizes an in-progress recording; late events see a nil module.
  ss_recorder_destroy(_recorder);
  ss_library_destroy(_library);
  delete _eventTarget;
}

- (SsRecorder *)recorder
{
  @synchronized(self) {
    if (!_recorder) {
      _recorder = ss_recorder_create();
      ss_recorder_set_callback(_recorder, SSOnRecorderEvent, _eventTarget);
    }
    return _recorder;
  }
}

- (void)finishRecordingForQuit
{
  @synchronized(self) {
    ss_recorder_destroy(_recorder);
    _recorder = NULL;
  }
}

- (SsLibrary *)library
{
  @synchronized(self) {
    if (!_library) {
      _library = ss_library_open();
      if (_library) {
        ss_library_set_callback(_library, SSOnLibraryChanged, _eventTarget);
      }
    }
    return _library;
  }
}

- (void)emitRecorderEvent:(NSDictionary *)body
{
  if (_eventEmitterCallback) {
    [self emitOnRecorderEvent:body];
  }
}

- (void)emitLibraryChanged
{
  if (_eventEmitterCallback) {
    [self emitOnLibraryChanged:@"changed"];
  }
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
  SsRecorder *recorder = [self recorder];
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
  ss_recorder_pause([self recorder]);
}

- (void)recorderResume
{
  ss_recorder_resume([self recorder]);
}

- (void)recorderStop:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  SsRecorder *recorder = [self recorder];
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
  return SSStateName(ss_recorder_state(_recorder)); // NULL reads as idle
}

- (NSNumber *)recoverPartialRecordings
{
  return @(ss_recover_partial_recordings());
}

- (void)listRecordings:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(_libraryQueue, ^{
    SsLibrary *library = [self library];
    SsRecordingList *list = library ? ss_library_list(library) : NULL;
    if (!list) {
      reject(@"library_failed", SSString(ss_last_error_message()) ?: @"library unavailable", nil);
      return;
    }
    size_t count = ss_recording_list_len(list);
    NSMutableArray<NSDictionary *> *items = [NSMutableArray arrayWithCapacity:count];
    for (size_t i = 0; i < count; i++) {
      const SsRecording *r = ss_recording_list_get(list, i);
      [items addObject:@{
        @"fileName" : SSString(r->file_name) ?: @"",
        @"path" : SSString(r->path) ?: @"",
        @"title" : SSString(r->title) ?: @"",
        @"artist" : SSString(r->artist) ?: (id)[NSNull null],
        @"album" : SSString(r->album) ?: (id)[NSNull null],
        @"durationMs" : @(r->duration_ms),
        @"sizeBytes" : @(r->size_bytes),
        @"recordedAtMs" : @(r->recorded_at_ms),
      }];
    }
    ss_recording_list_free(list);
    resolve(items);
  });
}

- (void)renameRecording:(NSString *)fileName
                newName:(NSString *)newName
                resolve:(RCTPromiseResolveBlock)resolve
                 reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(_libraryQueue, ^{
    SsLibrary *library = [self library];
    char *renamed = NULL;
    if (ss_library_rename(library, fileName.UTF8String, newName.UTF8String, &renamed) != SS_STATUS_OK) {
      reject(@"rename_failed", SSString(ss_last_error_message()), SSLastError());
      return;
    }
    NSString *result = SSString(renamed);
    ss_string_free(renamed);
    resolve(result);
  });
}

- (void)trashRecording:(NSString *)fileName resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(_libraryQueue, ^{
    SsLibrary *library = [self library];
    if (ss_library_trash(library, fileName.UTF8String) != SS_STATUS_OK) {
      reject(@"trash_failed", SSString(ss_last_error_message()), SSLastError());
      return;
    }
    resolve(nil);
  });
}

- (void)revealRecording:(NSString *)fileName
{
  dispatch_async(_libraryQueue, ^{
    SsLibrary *library = [self library];
    ss_library_reveal(library, fileName.UTF8String);
  });
}

- (void)readTags:(NSString *)fileName resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(_libraryQueue, ^{
    const SsTags *t = ss_library_read_tags([self library], fileName.UTF8String);
    if (!t) {
      reject(@"tags_failed", SSString(ss_last_error_message()), SSLastError());
      return;
    }
    id null = [NSNull null];
    NSDictionary *result = @{
      @"title" : SSString(t->title) ?: null,
      @"artist" : SSString(t->artist) ?: null,
      @"album" : SSString(t->album) ?: null,
      @"albumArtist" : SSString(t->album_artist) ?: null,
      @"date" : SSString(t->date) ?: null,
      @"genre" : SSString(t->genre) ?: null,
      @"comment" : SSString(t->comment) ?: null,
      @"track" : t->track > 0 ? @(t->track) : null,
      @"coverPath" : SSString(t->cover_path) ?: null,
    };
    ss_tags_free(t);
    resolve(result);
  });
}

- (void)writeTags:(NSArray *)fileNames
             edit:(JS::NativeSoundScraper::TagEdit &)edit
          resolve:(RCTPromiseResolveBlock)resolve
           reject:(RCTPromiseRejectBlock)reject
{
  // `edit` wraps a dictionary that's only valid during this call: copy it.
  static NSDictionary<NSString *, NSNumber *> *bits = @{
    @"title" : @(SS_TAG_TITLE),
    @"artist" : @(SS_TAG_ARTIST),
    @"album" : @(SS_TAG_ALBUM),
    @"albumArtist" : @(SS_TAG_ALBUM_ARTIST),
    @"date" : @(SS_TAG_DATE),
    @"track" : @(SS_TAG_TRACK),
    @"genre" : @(SS_TAG_GENRE),
    @"comment" : @(SS_TAG_COMMENT),
  };
  uint32_t mask = 0;
  for (NSString *field : edit.fields()) {
    mask |= bits[field].unsignedIntValue;
  }
  NSArray<NSString *> *values = @[
    edit.title() ?: @"", edit.artist() ?: @"", edit.album() ?: @"", edit.albumArtist() ?: @"",
    edit.date() ?: @"", edit.genre() ?: @"", edit.comment() ?: @""
  ];
  uint32_t track = edit.track().has_value() ? (uint32_t)MAX(0.0, *edit.track()) : 0;
  NSString *coverMode = edit.cover();
  NSString *coverPath = edit.coverPath();
  BOOL id3v23 = edit.id3v23();
  NSArray<NSString *> *names = [fileNames copy];

  dispatch_async(_libraryQueue, ^{
    std::vector<const char *> cNames;
    for (NSString *name in names) {
      cNames.push_back(name.UTF8String);
    }
    SsTagEdit e = {};
    e.set_mask = mask;
    e.title = values[0].UTF8String;
    e.artist = values[1].UTF8String;
    e.album = values[2].UTF8String;
    e.album_artist = values[3].UTF8String;
    e.date = values[4].UTF8String;
    e.genre = values[5].UTF8String;
    e.comment = values[6].UTF8String;
    e.track = track;
    e.cover = [coverMode isEqualToString:@"set"] ? SS_COVER_EDIT_SET
        : [coverMode isEqualToString:@"remove"]  ? SS_COVER_EDIT_REMOVE
                                                 : SS_COVER_EDIT_KEEP;
    e.cover_path = coverPath.UTF8String;
    e.version = id3v23 ? SS_TAG_VERSION_ID3V23 : SS_TAG_VERSION_ID3V24;
    if (ss_library_write_tags([self library], cNames.data(), cNames.size(), &e) != SS_STATUS_OK) {
      reject(@"tags_failed", SSString(ss_last_error_message()), SSLastError());
      return;
    }
    resolve(nil);
  });
}

- (void)pickImage:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSOpenPanel *panel = [NSOpenPanel openPanel];
    panel.title = @"Choose cover art";
    panel.allowedContentTypes = @[ UTTypePNG, UTTypeJPEG ];
    panel.allowsMultipleSelection = NO;
    panel.canChooseDirectories = NO;
    if ([panel runModal] == NSModalResponseOK && panel.URL) {
      resolve(panel.URL.path);
    } else {
      resolve([NSNull null]);
    }
  });
}

- (NSString *)getSettings
{
  char *json = ss_settings_get();
  NSString *result = SSString(json) ?: @"{}";
  ss_string_free(json);
  return result;
}

- (void)setSettings:(NSString *)json resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  NSString *copy = [json copy];
  dispatch_async(_libraryQueue, ^{
    if (ss_settings_set(copy.UTF8String) != SS_STATUS_OK) {
      reject(@"settings_failed", SSString(ss_last_error_message()), SSLastError());
      return;
    }
    SsLibrary *library = [self library];
    if (library && ss_library_apply_settings(library) != SS_STATUS_OK) {
      reject(@"settings_failed", SSString(ss_last_error_message()), SSLastError());
      return;
    }
    resolve(nil);
  });
}

- (void)pickFolder:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSOpenPanel *panel = [NSOpenPanel openPanel];
    panel.title = @"Choose the recordings folder";
    panel.prompt = @"Use Folder";
    panel.canChooseFiles = NO;
    panel.canChooseDirectories = YES;
    panel.canCreateDirectories = YES;
    panel.allowsMultipleSelection = NO;
    if ([panel runModal] == NSModalResponseOK && panel.URL) {
      resolve(panel.URL.path);
    } else {
      resolve([NSNull null]);
    }
  });
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeSoundScraperSpecJSI>(params);
}

@end
