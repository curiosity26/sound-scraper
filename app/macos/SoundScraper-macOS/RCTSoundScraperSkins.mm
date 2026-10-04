#import "RCTSoundScraperSkins.h"

#import <AppKit/AppKit.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

// The generated Swift header refers to these AppDelegate superclasses.
#import <React-RCTAppDelegate/RCTDefaultReactNativeFactoryDelegate.h>
#import <React-RCTAppDelegate/RCTReactNativeFactory.h>
#import "SoundScraper-Swift.h"

#include "sound_scraper.h"

static NSString *SSTakeString(char *s)
{
  NSString *result = s ? [NSString stringWithUTF8String:s] : nil;
  ss_string_free(s);
  return result;
}

static NSString *SSLastErrorText(void)
{
  const char *message = ss_last_error_message();
  return message ? [NSString stringWithUTF8String:message] : @"unknown error";
}

static NSArray<NSValue *> *SSRects(NSArray<NSNumber *> *flat)
{
  NSMutableArray<NSValue *> *rects = [NSMutableArray array];
  for (NSUInteger i = 0; i + 3 < flat.count; i += 4) {
    [rects addObject:[NSValue valueWithRect:NSMakeRect(flat[i].doubleValue, flat[i + 1].doubleValue,
                                                       flat[i + 2].doubleValue, flat[i + 3].doubleValue)]];
  }
  return rects;
}

@interface RCTSoundScraperSkins () {
  dispatch_queue_t _queue;
}
@end

@implementation RCTSoundScraperSkins

RCT_EXPORT_MODULE(SoundScraperSkins)

- (instancetype)init
{
  if (self = [super init]) {
    // Loading decodes every image of a skin; keep it off the JS thread.
    _queue = dispatch_queue_create("SoundScraper.skins", DISPATCH_QUEUE_SERIAL);
  }
  return self;
}

/// Hooks the window controller's events up once JS has an emitter (React
/// Native may create instances that are never wired to JS).
- (void)setEventEmitterCallback:(EventEmitterCallbackWrapper *)eventEmitterCallbackWrapper
{
  [super setEventEmitterCallback:eventEmitterCallbackWrapper];
  __weak RCTSoundScraperSkins *weakSelf = self;
  dispatch_async(dispatch_get_main_queue(), ^{
    SSWindowController.shared.onEvent = ^(NSString *window, NSString *event) {
      [weakSelf emitOnWindowEvent:@{@"window" : window, @"event" : event}];
    };
  });
}

/// Runs `call` on the skins queue and resolves with its string, or rejects
/// with the core's error when it returns NULL.
- (void)resolveString:(char * (^)(void))call
                 code:(NSString *)code
              resolve:(RCTPromiseResolveBlock)resolve
               reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(_queue, ^{
    char *result = call();
    if (!result) {
      NSString *message = SSLastErrorText();
      reject(code, message, [NSError errorWithDomain:@"SoundScraper" code:1 userInfo:@{NSLocalizedDescriptionKey : message}]);
      return;
    }
    resolve(SSTakeString(result));
  });
}

- (void)loadSkin:(NSString *)idOrPath resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  NSString *copy = [idOrPath copy];
  [self resolveString:^char * { return ss_skin_load(copy.UTF8String); } code:@"skin_load_failed" resolve:resolve reject:reject];
}

- (void)loadCurrentSkin:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self resolveString:^char * { return ss_skin_load_current(); } code:@"skin_load_failed" resolve:resolve reject:reject];
}

- (void)listSkins:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self resolveString:^char * { return ss_skins_list(); } code:@"skin_list_failed" resolve:resolve reject:reject];
}

- (void)installSkin:(NSString *)archivePath resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  NSString *copy = [archivePath copy];
  [self resolveString:^char * { return ss_skin_install(copy.UTF8String); } code:@"skin_install_failed" resolve:resolve reject:reject];
}

- (void)removeSkin:(NSString *)skinId resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  NSString *copy = [skinId copy];
  dispatch_async(_queue, ^{
    if (ss_skin_remove(copy.UTF8String) != SS_STATUS_OK) {
      NSString *message = SSLastErrorText();
      reject(@"skin_remove_failed", message, [NSError errorWithDomain:@"SoundScraper" code:1 userInfo:@{NSLocalizedDescriptionKey : message}]);
      return;
    }
    resolve(nil);
  });
}

- (void)pickSkinArchive:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSOpenPanel *panel = [NSOpenPanel openPanel];
    panel.title = @"Install a skin";
    panel.prompt = @"Install";
    NSMutableArray<UTType *> *types = [NSMutableArray arrayWithObject:UTTypeZIP];
    UTType *sskin = [UTType typeWithFilenameExtension:@"sskin"];
    if (sskin) {
      [types addObject:sskin];
    }
    panel.allowedContentTypes = types;
    panel.allowsMultipleSelection = NO;
    panel.canChooseDirectories = NO;
    if ([panel runModal] == NSModalResponseOK && panel.URL) {
      resolve(panel.URL.path);
    } else {
      resolve([NSNull null]);
    }
  });
}

- (void)pickSkinFolder:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSOpenPanel *panel = [NSOpenPanel openPanel];
    panel.title = @"Use an unpacked skin folder";
    panel.message = @"Choose a folder that contains skin.json.";
    panel.prompt = @"Use Skin";
    panel.canChooseFiles = NO;
    panel.canChooseDirectories = YES;
    panel.allowsMultipleSelection = NO;
    if ([panel runModal] == NSModalResponseOK && panel.URL) {
      resolve(panel.URL.path);
    } else {
      resolve([NSNull null]);
    }
  });
}

- (void)pickFolder:(NSString *)title
            prompt:(NSString *)prompt
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject
{
  NSString *titleCopy = [title copy];
  NSString *promptCopy = [prompt copy];
  dispatch_async(dispatch_get_main_queue(), ^{
    NSOpenPanel *panel = [NSOpenPanel openPanel];
    panel.title = titleCopy;
    panel.prompt = promptCopy;
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

- (void)pickSkinSaveLocation:(NSString *)defaultName
                     resolve:(RCTPromiseResolveBlock)resolve
                      reject:(RCTPromiseRejectBlock)reject
{
  NSString *name = [defaultName copy];
  dispatch_async(dispatch_get_main_queue(), ^{
    NSSavePanel *panel = [NSSavePanel savePanel];
    panel.title = @"Package skin";
    panel.prompt = @"Package";
    panel.nameFieldStringValue = name;
    UTType *sskin = [UTType typeWithFilenameExtension:@"sskin"];
    if (sskin) {
      panel.allowedContentTypes = @[ sskin ];
    }
    if ([panel runModal] == NSModalResponseOK && panel.URL) {
      resolve(panel.URL.path);
    } else {
      resolve([NSNull null]);
    }
  });
}

- (void)inspectSkin:(NSString *)archivePath resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  NSString *copy = [archivePath copy];
  [self resolveString:^char * { return ss_skin_inspect(copy.UTF8String); } code:@"skin_inspect_failed" resolve:resolve reject:reject];
}

- (void)skinPreview:(NSString *)idOrPath resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  NSString *copy = [idOrPath copy];
  [self resolveString:^char * { return ss_skin_preview(copy.UTF8String); } code:@"skin_preview_failed" resolve:resolve reject:reject];
}

- (void)packageSkin:(NSString *)dir
            outPath:(NSString *)outPath
            resolve:(RCTPromiseResolveBlock)resolve
             reject:(RCTPromiseRejectBlock)reject
{
  NSString *dirCopy = [dir copy];
  NSString *outCopy = [outPath copy];
  [self resolveString:^char * { return ss_skin_package(dirCopy.UTF8String, outCopy.UTF8String); }
                 code:@"skin_package_failed"
              resolve:resolve
               reject:reject];
}

- (void)createSkin:(NSString *)parent
              name:(NSString *)name
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject
{
  NSString *parentCopy = [parent copy];
  NSString *nameCopy = [name copy];
  [self resolveString:^char * { return ss_skin_create(parentCopy.UTF8String, nameCopy.UTF8String); }
                 code:@"skin_create_failed"
              resolve:resolve
               reject:reject];
}

- (void)skinFolderStamp:(NSString *)dir resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  NSString *copy = [dir copy];
  [self resolveString:^char * { return ss_skin_folder_stamp(copy.UTF8String); } code:@"skin_stamp_failed" resolve:resolve reject:reject];
}

- (NSArray<NSString *> *)takeOpenedSkinFiles
{
  __block NSArray<NSString *> *files = @[];
  void (^take)(void) = ^{
    files = [SSWindowController.shared takeOpenedSkinFiles];
  };
  if (NSThread.isMainThread) {
    take();
  } else {
    dispatch_sync(dispatch_get_main_queue(), take);
  }
  return files;
}

- (void)setPanelLayout:(NSString *)panel
                 width:(double)width
                height:(double)height
           dragRegions:(NSArray *)dragRegions
                 holes:(NSArray *)holes
                  grip:(NSArray *)grip
              minWidth:(double)minWidth
             minHeight:(double)minHeight
                 scale:(double)scale
{
  NSString *name = [panel copy];
  NSArray<NSValue *> *drag = SSRects(dragRegions);
  NSArray<NSValue *> *holeRects = SSRects(holes);
  NSArray<NSValue *> *gripRects = SSRects(grip);
  dispatch_async(dispatch_get_main_queue(), ^{
    [SSWindowController.shared setPanelLayout:name
                                        width:width
                                       height:height
                                  dragRegions:drag
                                        holes:holeRects
                                         grip:gripRects
                                     minWidth:minWidth
                                    minHeight:minHeight
                                        scale:scale];
  });
}

- (void)windowAction:(NSString *)action
{
  NSString *copy = [action copy];
  dispatch_async(dispatch_get_main_queue(), ^{
    [SSWindowController.shared perform:copy];
  });
}

// Drag regions and grips are handled by SkinPanelWindow on macOS.
- (void)beginGesture:(NSString *)panel kind:(NSString *)kind
{
}

- (void)setPanelVisible:(NSString *)panel visible:(BOOL)visible
{
  NSString *copy = [panel copy];
  dispatch_async(dispatch_get_main_queue(), ^{
    [SSWindowController.shared setPanel:copy visible:visible];
  });
}

- (NSNumber *)isPanelVisible:(NSString *)panel
{
  __block BOOL visible = NO;
  void (^check)(void) = ^{
    visible = [SSWindowController.shared isPanelVisible:panel];
  };
  if (NSThread.isMainThread) {
    check();
  } else {
    dispatch_sync(dispatch_get_main_queue(), check);
  }
  return @(visible);
}

- (void)showMenu:(NSString *)panel
           items:(NSArray *)items
         checked:(double)checked
               x:(double)x
               y:(double)y
         resolve:(RCTPromiseResolveBlock)resolve
          reject:(RCTPromiseRejectBlock)reject
{
  NSArray<NSString *> *titles = [items copy];
  NSString *name = [panel copy];
  dispatch_async(dispatch_get_main_queue(), ^{
    NSInteger chosen = [SSWindowController.shared showMenuIn:name items:titles checked:(NSInteger)checked x:x y:y];
    resolve(@(chosen));
  });
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeSkinsSpecJSI>(params);
}

@end
