#import "RCTSoundScraperEditor.h"

#include "sound_scraper.h"

static NSString *SSTakeEditorString(char *s)
{
  NSString *result = s ? [NSString stringWithUTF8String:s] : nil;
  ss_string_free(s);
  return result;
}

static NSString *SSEditorError(void)
{
  const char *message = ss_last_error_message();
  return message ? [NSString stringWithUTF8String:message] : @"unknown error";
}

@interface RCTSoundScraperEditor () {
  dispatch_queue_t _queue;
  SsLibrary *_library; // its own handle, for saving; opened on first save
}
@end

@implementation RCTSoundScraperEditor

RCT_EXPORT_MODULE(SoundScraperEditor)

- (instancetype)init
{
  if (self = [super init]) {
    // Saving reads and writes whole recordings; keep it off the JS thread.
    _queue = dispatch_queue_create("SoundScraper.editor", DISPATCH_QUEUE_SERIAL);
  }
  return self;
}

- (void)dealloc
{
  ss_library_destroy(_library);
}

- (NSNumber *)open:(NSString *)path
{
  return @(ss_editor_open(path.UTF8String));
}

- (void)close:(double)id
{
  ss_editor_close((uint64_t)id);
}

- (NSString *)status:(double)id
{
  return SSTakeEditorString(ss_editor_status((uint64_t)id)) ?: @"{\"state\":\"failed\",\"message\":\"The editor is closed.\"}";
}

- (NSString *)tracks:(double)id editsJson:(NSString *)editsJson
{
  return SSTakeEditorString(ss_editor_tracks((uint64_t)id, editsJson.UTF8String)) ?: @"[]";
}

- (NSString *)loadDraft:(NSString *)fileName
{
  return SSTakeEditorString(ss_edits_load_draft(fileName.UTF8String)) ?: @"null";
}

- (void)saveDraft:(NSString *)fileName editsJson:(NSString *)editsJson
{
  if (ss_edits_save_draft(fileName.UTF8String, editsJson.UTF8String) != SS_STATUS_OK) {
    NSLog(@"Saving editor draft: %@", SSEditorError());
  }
}

- (void)discardDraft:(NSString *)fileName
{
  ss_edits_discard_draft(fileName.UTF8String);
}

- (void)save:(NSString *)fileName
       editsJson:(NSString *)editsJson
    keepOriginal:(BOOL)keepOriginal
         resolve:(RCTPromiseResolveBlock)resolve
          reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(_queue, ^{
    if (!self->_library) {
      self->_library = ss_library_open();
    }
    char *result = self->_library ? ss_editor_save(self->_library, fileName.UTF8String, editsJson.UTF8String, keepOriginal)
                                  : NULL;
    if (!result) {
      NSString *message = SSEditorError();
      reject(@"save_failed", message, [NSError errorWithDomain:@"SoundScraper" code:1 userInfo:@{NSLocalizedDescriptionKey : message}]);
      return;
    }
    resolve(SSTakeEditorString(result));
  });
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeEditorSpecJSI>(params);
}

@end
