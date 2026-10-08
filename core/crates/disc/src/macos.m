// macOS CD burning through Disc Recording (docs/playlists-and-cd-burning-
// design.md §7.2), called from macos.rs. Two entry points, both JSON:
//   ssdr_devices_json()          the CD writers and what's in them
//   ssdr_burn(request, ctx, cb)  burns prepared CD audio, blocking; events
//                                go to cb as JSON, which returns 1 to cancel
// Audio comes from one raw file per track (44.1 kHz 16-bit stereo, already
// padded to whole 2352-byte sectors).

#import <DiscRecording/DiscRecording.h>
#import <Foundation/Foundation.h>

typedef int (*ssdr_event_cb)(void *ctx, const char *event_json);

static char *SSDRCopyJSON(id object)
{
  NSData *data = [NSJSONSerialization dataWithJSONObject:object options:0 error:nil];
  if (!data) {
    return strdup("null");
  }
  char *out = malloc(data.length + 1);
  memcpy(out, data.bytes, data.length);
  out[data.length] = 0;
  return out;
}

void ssdr_free(char *s)
{
  free(s);
}

static const double kCD1x = 176.4; // kDRDeviceBurnSpeedCD1x, KB/s
static const uint64_t kSectors74 = 74 * 60 * 75;
static const uint64_t kSectors80 = (79 * 60 + 57) * 75;

static NSString *SSDRMinutesLabel(uint64_t sectors)
{
  if (sectors >= kSectors80 - 75 * 60) {
    return @"80 min";
  }
  if (sectors >= kSectors74 - 75 * 60) {
    return @"74 min";
  }
  return [NSString stringWithFormat:@"%llu min", sectors / (75 * 60)];
}

/// What's in the drive, in the shape of sound_scraper_disc::Media.
static NSDictionary *SSDRMedia(DRDevice *device)
{
  NSDictionary *status = device.status;
  NSString *state = status[DRDeviceMediaStateKey];
  if ([state isEqual:DRDeviceMediaStateInTransition]) {
    return @{@"state" : @"none", @"kind" : NSNull.null, @"capacity" : NSNull.null, @"label" : @"Reading the disc…"};
  }
  if (![state isEqual:DRDeviceMediaStateMediaPresent]) {
    return @{@"state" : @"none", @"kind" : NSNull.null, @"capacity" : NSNull.null, @"label" : @"No disc"};
  }
  if (device.mediaIsBusy) {
    return @{@"state" : @"unusable", @"kind" : NSNull.null, @"capacity" : NSNull.null,
             @"label" : @"The disc is in use by another app"};
  }
  NSDictionary *info = status[DRDeviceMediaInfoKey];
  NSString *cls = info[DRDeviceMediaClassKey];
  NSString *type = info[DRDeviceMediaTypeKey];
  BOOL cdr = [type isEqual:DRDeviceMediaTypeCDR];
  BOOL cdrw = [type isEqual:DRDeviceMediaTypeCDRW];
  if (![cls isEqual:DRDeviceMediaClassCD]) {
    return @{@"state" : @"unusable", @"kind" : type ?: NSNull.null, @"capacity" : NSNull.null,
             @"label" : @"Not a CD: audio CDs need a CD-R or CD-RW"};
  }
  if (!cdr && !cdrw) {
    return @{@"state" : @"unusable", @"kind" : type ?: NSNull.null, @"capacity" : NSNull.null,
             @"label" : @"This CD can't be written"};
  }
  NSString *kind = cdr ? @"CD-R" : @"CD-RW";
  uint64_t free = device.mediaSpaceFree.sectors;
  if (device.mediaIsBlank) {
    return @{@"state" : @"blank", @"kind" : kind, @"capacity" : @(free),
             @"label" : [NSString stringWithFormat:@"%@ %@, blank", kind, SSDRMinutesLabel(free)]};
  }
  if (cdrw && device.mediaIsErasable) {
    uint64_t whole = free + device.mediaSpaceUsed.sectors;
    return @{@"state" : @"erasable", @"kind" : kind, @"capacity" : @(whole),
             @"label" : [NSString stringWithFormat:@"CD-RW %@, not blank (erase first)", SSDRMinutesLabel(whole)]};
  }
  return @{@"state" : @"unusable", @"kind" : kind, @"capacity" : NSNull.null,
           @"label" : @"This CD-R has been written: insert a blank one"};
}

static NSString *SSDRName(DRDevice *device)
{
  NSDictionary *info = device.info;
  NSString *vendor = [info[DRDeviceVendorNameKey] ?: @"" stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceCharacterSet];
  NSString *product = [info[DRDeviceProductNameKey] ?: @"" stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceCharacterSet];
  NSString *name = [[NSString stringWithFormat:@"%@ %@", vendor, product]
      stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceCharacterSet];
  return name.length ? name : (device.displayName ?: @"CD recorder");
}

static NSDictionary *SSDRDevice(DRDevice *device)
{
  NSDictionary *caps = device.info[DRDeviceWriteCapabilitiesKey];
  NSMutableArray *speeds = [NSMutableArray array];
  for (NSNumber *kbs in device.status[DRDeviceBurnSpeedsKey]) {
    NSNumber *x = @((int)lround(kbs.doubleValue / kCD1x));
    if (x.intValue > 0 && ![speeds containsObject:x]) {
      [speeds addObject:x];
    }
  }
  [speeds sortUsingSelector:@selector(compare:)];
  return @{
    @"id" : device.ioRegistryEntryPath ?: SSDRName(device),
    @"name" : SSDRName(device),
    @"kind" : @"drive",
    @"media" : SSDRMedia(device),
    @"speeds" : speeds,
    @"canTest" : @([caps[DRDeviceCanTestWriteCDKey] boolValue]),
    @"gapless" : @([caps[DRDeviceCanWriteCDSAOKey] boolValue]),
    @"cdText" : @([caps[DRDeviceCanWriteCDTextKey] boolValue] && [caps[DRDeviceCanWriteCDSAOKey] boolValue]),
  };
}

/// The CD writers, as JSON (an array of sound_scraper_disc::Device).
char *ssdr_devices_json(void)
{
  @autoreleasepool {
    NSMutableArray *out = [NSMutableArray array];
    for (DRDevice *device in [DRDevice devices]) {
      if (device.isValid && device.writesCD) {
        [out addObject:SSDRDevice(device)];
      }
    }
    return SSDRCopyJSON(out);
  }
}

// ------------------------------------------------------------ burning

/// Feeds one track's raw CD audio from its file, counting what was taken.
@interface SSDRProducer : NSObject
@property(nonatomic, copy) NSString *path;
@property(nonatomic) uint64_t sectors;
@property(nonatomic) BOOL swapBytes;
/// Sectors handed to the engine so far (read from other threads).
@property(atomic) uint64_t produced;
@end

@implementation SSDRProducer {
  NSFileHandle *_file;
}

- (BOOL)prepareTrack:(DRTrack *)track forBurn:(DRBurn *)burn toMedia:(NSDictionary *)mediaInfo
{
  _file = [NSFileHandle fileHandleForReadingAtPath:self.path];
  self.produced = 0;
  return _file != nil;
}

- (void)cleanupTrackAfterBurn:(DRTrack *)track
{
  [_file closeFile];
  _file = nil;
}

- (uint64_t)estimateLengthOfTrack:(DRTrack *)track
{
  return self.sectors;
}

- (uint32_t)producePreGapForTrack:(DRTrack *)track
                       intoBuffer:(char *)buffer
                           length:(uint32_t)bufferLength
                        atAddress:(uint64_t)address
                        blockSize:(uint32_t)blockSize
                          ioFlags:(uint32_t *)flags
{
  memset(buffer, 0, bufferLength);
  return bufferLength;
}

- (uint32_t)produceDataForTrack:(DRTrack *)track
                     intoBuffer:(char *)buffer
                         length:(uint32_t)bufferLength
                      atAddress:(uint64_t)address
                      blockSize:(uint32_t)blockSize
                        ioFlags:(uint32_t *)flags
{
  [_file seekToFileOffset:address * blockSize];
  NSData *data = [_file readDataOfLength:bufferLength];
  uint32_t n = (uint32_t)data.length;
  memcpy(buffer, data.bytes, n);
  if (n < bufferLength) {
    memset(buffer + n, 0, bufferLength - n);
  }
  if (self.swapBytes) {
    for (uint32_t i = 0; i + 1 < bufferLength; i += 2) {
      char t = buffer[i];
      buffer[i] = buffer[i + 1];
      buffer[i + 1] = t;
    }
  }
  self.produced = address + bufferLength / blockSize;
  return bufferLength;
}

- (BOOL)prepareTrackForVerification:(DRTrack *)track
{
  return YES;
}

- (BOOL)verifyDataForTrack:(DRTrack *)track
                  inBuffer:(const char *)buffer
                    length:(uint32_t)bufferLength
                 atAddress:(uint64_t)address
                 blockSize:(uint32_t)blockSize
                   ioFlags:(uint32_t *)flags
{
  return YES;
}

- (BOOL)cleanupTrackAfterVerification:(DRTrack *)track
{
  return YES;
}
@end

static int SSDREmit(ssdr_event_cb cb, void *ctx, NSDictionary *event)
{
  char *json = SSDRCopyJSON(event);
  int cancel = cb(ctx, json);
  free(json);
  return cancel;
}

static NSString *SSDRErrorText(NSDictionary *status)
{
  NSDictionary *e = status[DRErrorStatusKey];
  if (!e) {
    return @"The burn failed (no reason given).";
  }
  NSMutableArray *parts = [NSMutableArray array];
  if (e[DRErrorStatusErrorStringKey]) {
    [parts addObject:e[DRErrorStatusErrorStringKey]];
  }
  if (e[DRErrorStatusErrorInfoStringKey]) {
    [parts addObject:e[DRErrorStatusErrorInfoStringKey]];
  }
  if (e[DRErrorStatusSenseCodeStringKey]) {
    [parts addObject:[NSString stringWithFormat:@"sense: %@", e[DRErrorStatusSenseCodeStringKey]]];
  }
  if (e[DRErrorStatusAdditionalSenseStringKey]) {
    [parts addObject:e[DRErrorStatusAdditionalSenseStringKey]];
  }
  if (e[DRErrorStatusErrorKey]) {
    [parts addObject:[NSString stringWithFormat:@"error %@", e[DRErrorStatusErrorKey]]];
  }
  return [parts componentsJoinedByString:@"; "];
}

/// Erases a CD-RW (quickly), reporting progress; NO if cancelled or failed.
static BOOL SSDRErase(DRDevice *device, ssdr_event_cb cb, void *ctx, NSString **error)
{
  DRErase *erase = [DRErase eraseForDevice:device];
  erase.eraseType = DREraseTypeQuick;
  SSDREmit(cb, ctx, @{@"phase" : @"Erasing the CD-RW"});
  [erase start];
  while (YES) {
    [NSThread sleepForTimeInterval:0.25];
    NSDictionary *s = erase.status;
    NSString *state = s[DRStatusStateKey];
    if ([state isEqual:DRStatusStateDone]) {
      SSDREmit(cb, ctx, @{@"log" : @"Erased the CD-RW"});
      return YES;
    }
    if ([state isEqual:DRStatusStateFailed]) {
      *error = [@"Couldn't erase the CD-RW: " stringByAppendingString:SSDRErrorText(s)];
      return NO;
    }
  }
}

/// Burns the request (JSON: deviceId, tracks [{path, sectors, pregap, title,
/// performer}], title, performer, speed, test, cdText, eject, erase,
/// swapBytes). Returns 0 when done, 1 when cancelled, 2 on failure with a
/// message in *error_out (free with ssdr_free).
int ssdr_burn(const char *request_json, void *ctx, ssdr_event_cb cb, char **error_out)
{
  @autoreleasepool {
    NSString *error = nil;
    int result = 2;
    NSData *data = [NSData dataWithBytes:request_json length:strlen(request_json)];
    NSDictionary *req = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
    DRDevice *device = req ? [DRDevice deviceForIORegistryEntryPath:req[@"deviceId"]] : nil;
    if (!device) {
      device = nil;
      for (DRDevice *d in [DRDevice devices]) {
        if ([SSDRName(d) isEqual:req[@"deviceId"]]) {
          device = d;
        }
      }
    }
    if (!device || !device.isValid) {
      error = @"The CD recorder isn't connected any more.";
    } else {
      NSDictionary *caps = device.info[DRDeviceWriteCapabilitiesKey];
      NSDictionary *media = SSDRMedia(device);
      SSDREmit(cb, ctx, @{@"log" : [NSString stringWithFormat:@"Drive: %@ (%@); disc: %@; SAO %@, CD-Text %@, test write %@",
                                                              SSDRName(device), device.info[DRDevicePhysicalInterconnectKey] ?: @"?",
                                                              media[@"label"],
                                                              [caps[DRDeviceCanWriteCDSAOKey] boolValue] ? @"yes" : @"no",
                                                              [caps[DRDeviceCanWriteCDTextKey] boolValue] ? @"yes" : @"no",
                                                              [caps[DRDeviceCanTestWriteCDKey] boolValue] ? @"yes" : @"no"]});
      BOOL ok = YES;
      if ([req[@"erase"] boolValue] && [media[@"state"] isEqual:@"erasable"]) {
        ok = SSDRErase(device, cb, ctx, &error);
      }
      if (ok) {
        // The layout: one audio track per file, each with its pregap.
        NSMutableArray<DRTrack *> *tracks = [NSMutableArray array];
        NSMutableArray<SSDRProducer *> *producers = [NSMutableArray array];
        NSMutableArray<NSNumber *> *starts = [NSMutableArray array];
        NSMutableArray *textTracks = [NSMutableArray array];
        BOOL swap = [req[@"swapBytes"] boolValue];
        NSMutableDictionary *disc = [NSMutableDictionary dictionary];
        disc[DRCDTextTitleKey] = req[@"title"] ?: @"";
        if ([req[@"performer"] isKindOfClass:NSString.class]) {
          disc[DRCDTextPerformerKey] = req[@"performer"];
        }
        [textTracks addObject:disc];
        uint64_t at = 0;
        for (NSDictionary *t in req[@"tracks"]) {
          SSDRProducer *producer = [SSDRProducer new];
          producer.path = t[@"path"];
          producer.sectors = [t[@"sectors"] unsignedLongLongValue];
          producer.swapBytes = swap;
          uint32_t pregap = [t[@"pregap"] unsignedIntValue];
          DRTrack *track = [[DRTrack alloc] initWithProducer:producer];
          track.properties = @{
            DRTrackLengthKey : [DRMSF msfWithFrames:(UInt32)producer.sectors],
            DRBlockSizeKey : @(kDRBlockSizeAudio),
            DRBlockTypeKey : @(kDRBlockTypeAudio),
            DRDataFormKey : @(kDRDataFormAudio),
            DRSessionFormatKey : @(kDRSessionFormatAudio),
            DRTrackModeKey : @(kDRTrackModeAudio),
            DRPreGapLengthKey : [DRMSF msfWithFrames:pregap],
            DRPreGapIsRequiredKey : @(pregap != 150),
          };
          // Program sectors (after track 1's pregap) where this track's audio starts.
          if (tracks.count > 0) {
            at += pregap;
          }
          [starts addObject:@(at)];
          at += producer.sectors;
          [tracks addObject:track];
          [producers addObject:producer];
          NSMutableDictionary *text = [NSMutableDictionary dictionary];
          text[DRCDTextTitleKey] = t[@"title"] ?: @"";
          if ([t[@"performer"] isKindOfClass:NSString.class]) {
            text[DRCDTextPerformerKey] = t[@"performer"];
          }
          [textTracks addObject:text];
        }

        DRBurn *burn = [DRBurn burnForDevice:device];
        NSMutableDictionary *props = [burn.properties mutableCopy];
        double speed = [req[@"speed"] doubleValue];
        props[DRBurnRequestedSpeedKey] = @(speed > 0 ? speed * kCD1x : DRDeviceBurnSpeedMax);
        props[DRBurnAppendableKey] = @NO;
        props[DRBurnVerifyDiscKey] = @NO;
        props[DRBurnUnderrunProtectionKey] = @YES;
        props[DRBurnTestingKey] = @([req[@"test"] boolValue]);
        props[DRBurnCompletionActionKey] = [req[@"eject"] boolValue] ? DRBurnCompletionActionEject : DRBurnCompletionActionMount;
        props[DRBurnFailureActionKey] = DRBurnFailureActionNone;
        props[DRBurnStrategyKey] = @[ DRBurnStrategyCDSAO, DRBurnStrategyCDTAO ];
        props[DRBurnStrategyIsRequiredKey] = @NO;
        if ([req[@"cdText"] boolValue]) {
          DRCDTextBlock *block = [DRCDTextBlock cdTextBlockWithLanguage:@"en" encoding:NSISOLatin1StringEncoding];
          [block setTrackDictionaries:textTracks];
          props[DRCDTextKey] = block;
        }
        burn.properties = props;
        SSDREmit(cb, ctx, @{@"log" : [NSString stringWithFormat:@"Requested %@, Session-at-Once preferred, %@%@", speed > 0 ? [NSString stringWithFormat:@"%.0fx", speed] : @"maximum speed",
                                                                [req[@"cdText"] boolValue] ? @"CD-Text on" : @"CD-Text off",
                                                                [req[@"test"] boolValue] ? @", test write (laser off)" : @""]});
        [burn writeLayout:tracks];

        NSString *lastState = nil;
        BOOL cancelled = NO;
        BOOL aborted = NO;
        while (YES) {
          [NSThread sleepForTimeInterval:0.2];
          NSDictionary *s = burn.status;
          NSString *state = s[DRStatusStateKey];
          if (![state isEqual:lastState]) {
            lastState = state;
            NSString *phase = [state isEqual:DRStatusStatePreparing]      ? @"Preparing the drive"
                              : [state isEqual:DRStatusStateSessionOpen]  ? @"Writing lead-in"
                              : [state isEqual:DRStatusStateSessionClose] ? @"Writing lead-out"
                              : [state isEqual:DRStatusStateFinishing]    ? @"Closing the disc"
                              : [state isEqual:DRStatusStateVerifying]    ? @"Verifying"
                                                                          : nil;
            if (phase && SSDREmit(cb, ctx, @{@"phase" : phase})) {
              cancelled = YES;
            }
          }
          if ([state isEqual:DRStatusStateDone]) {
            result = cancelled ? 1 : 0;
            break;
          }
          if ([state isEqual:DRStatusStateFailed]) {
            if (cancelled) {
              result = 1;
            } else {
              error = SSDRErrorText(s);
            }
            break;
          }
          // Progress: the current track's start plus what it has produced.
          NSInteger current = [s[DRStatusCurrentTrackKey] integerValue];
          if (current >= 1 && current <= (NSInteger)producers.count) {
            uint64_t written = starts[current - 1].unsignedLongLongValue + producers[current - 1].produced;
            NSNumber *x = s[DRStatusProgressInfoKey][DRStatusProgressCurrentXFactor];
            NSMutableDictionary *event = [@{@"written" : @(written)} mutableCopy];
            if (x) {
              event[@"speed"] = x;
            }
            if (SSDREmit(cb, ctx, event) && !cancelled) {
              cancelled = YES;
            }
          } else if (SSDREmit(cb, ctx, @{@"tick" : @YES}) && !cancelled) {
            cancelled = YES;
          }
          if (cancelled && !aborted) {
            aborted = YES;
            SSDREmit(cb, ctx, @{@"log" : @"Stopping the burn"});
            [burn abort];
          }
        }
      }
    }
    if (result == 2 && error_out) {
      *error_out = strdup((error ?: @"The burn failed.").UTF8String);
    }
    return result;
  }
}
