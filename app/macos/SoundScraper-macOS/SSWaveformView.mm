// The track editor's waveform: a layer-backed view the Rust core draws into
// (ss_editor_render) whenever what it shows changes: the editor, the
// visible stretch, the size or the colors. While the waveform is still
// being built it polls, so it fills in when ready. Splices, regions and
// the playhead are React Native views on top.

#import <AppKit/AppKit.h>
#import <QuartzCore/QuartzCore.h>
#import <React/RCTViewManager.h>

#include <vector>

#include "sound_scraper.h"

@interface SSWaveformView : NSView
@property (nonatomic) double editorId;
/// The time at the left edge, and milliseconds per point.
@property (nonatomic) double startMs;
@property (nonatomic) double msPerPoint;
/// Colors as JSON: background, wave, rms, center.
@property (nonatomic, copy) NSString *colors;
@end

@implementation SSWaveformView {
  std::vector<uint8_t> _buffer;
  NSTimer *_poll;
  BOOL _scheduled;
}

- (instancetype)initWithFrame:(NSRect)frame
{
  if (self = [super initWithFrame:frame]) {
    self.wantsLayer = YES;
    self.layer.contentsGravity = kCAGravityResize;
  }
  return self;
}

- (void)dealloc
{
  [_poll invalidate];
}

// Mouse events go to the React views around it.
- (NSView *)hitTest:(NSPoint)point
{
  return nil;
}

- (void)setEditorId:(double)editorId
{
  _editorId = editorId;
  [self setNeedsRedraw];
}

- (void)setStartMs:(double)startMs
{
  _startMs = startMs;
  [self setNeedsRedraw];
}

- (void)setMsPerPoint:(double)msPerPoint
{
  _msPerPoint = msPerPoint;
  [self setNeedsRedraw];
}

- (void)setColors:(NSString *)colors
{
  _colors = [colors copy];
  [self setNeedsRedraw];
}

- (void)setFrameSize:(NSSize)newSize
{
  [super setFrameSize:newSize];
  [self setNeedsRedraw];
}

- (void)viewDidChangeBackingProperties
{
  [super viewDidChangeBackingProperties];
  [self setNeedsRedraw];
}

/// Coalesces prop changes made in one batch into one draw.
- (void)setNeedsRedraw
{
  if (_scheduled) {
    return;
  }
  _scheduled = YES;
  dispatch_async(dispatch_get_main_queue(), ^{
    self->_scheduled = NO;
    [self draw];
  });
}

- (void)draw
{
  if (_editorId <= 0 || _msPerPoint <= 0) {
    return;
  }
  CGFloat backing = self.window.backingScaleFactor ?: 2;
  size_t width = (size_t)llround(self.bounds.size.width * backing);
  size_t height = (size_t)llround(self.bounds.size.height * backing);
  if (width == 0 || height == 0) {
    return;
  }
  _buffer.resize(width * height * 4);
  BOOL ready = ss_editor_render((uint64_t)_editorId, _startMs, _msPerPoint / backing, (uint32_t)width, (uint32_t)height,
                                _colors.UTF8String, _buffer.data(), _buffer.size());
  // Until the waveform is built, try again shortly.
  if (!ready && !_poll) {
    _poll = [NSTimer scheduledTimerWithTimeInterval:0.25
                                            repeats:YES
                                              block:^(NSTimer *timer) {
                                                [self draw];
                                              }];
  } else if (ready && _poll) {
    [_poll invalidate];
    _poll = nil;
  }

  CFDataRef data = CFDataCreate(NULL, _buffer.data(), (CFIndex)_buffer.size());
  CGDataProviderRef provider = CGDataProviderCreateWithCFData(data);
  CGColorSpaceRef space = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
  CGImageRef image = CGImageCreate(width, height, 8, 32, width * 4, space,
                                   kCGImageAlphaPremultipliedLast | kCGBitmapByteOrderDefault, provider, NULL,
                                   false, kCGRenderingIntentDefault);
  [CATransaction begin];
  [CATransaction setDisableActions:YES];
  self.layer.contents = (__bridge id)image;
  [CATransaction commit];
  CGImageRelease(image);
  CGColorSpaceRelease(space);
  CGDataProviderRelease(provider);
  CFRelease(data);
}

- (void)viewDidMoveToWindow
{
  [super viewDidMoveToWindow];
  if (!self.window) {
    [_poll invalidate];
    _poll = nil;
  } else {
    [self setNeedsRedraw];
  }
}

@end

@interface SSWaveformViewManager : RCTViewManager
@end

@implementation SSWaveformViewManager

RCT_EXPORT_MODULE(SSWaveformView)

- (NSView *)view
{
  return [SSWaveformView new];
}

RCT_EXPORT_VIEW_PROPERTY(editorId, double)
RCT_EXPORT_VIEW_PROPERTY(startMs, double)
RCT_EXPORT_VIEW_PROPERTY(msPerPoint, double)
RCT_EXPORT_VIEW_PROPERTY(colors, NSString)

@end
