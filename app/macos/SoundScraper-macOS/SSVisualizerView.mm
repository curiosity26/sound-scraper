// The visualizer: a layer-backed view that, on every display refresh while
// a recording is live, has the Rust core draw the latest analysis
// (ss_vis_render) and shows it as the layer's contents. No JS per frame.

#import <AppKit/AppKit.h>
#import <QuartzCore/QuartzCore.h>
#import <React/RCTViewManager.h>

#include <vector>

#import "RCTSoundScraper.h"
#include "sound_scraper.h"

@interface SSVisualizerView : NSView
/// A preset from the skin's visualizer.presets, as JSON.
@property (nonatomic, copy) NSString *preset;
/// Draw one pixel per skin point and enlarge with hard edges (LCD look).
@property (nonatomic) BOOL pixelated;
/// Points per skin point (2 in double-size mode).
@property (nonatomic) double skinScale;
@end

@implementation SSVisualizerView {
  SsVis *_vis;
  std::vector<uint8_t> _buffer;
  CADisplayLink *_link;
  NSString *_appliedPreset;
  BOOL _needsIdleDraw;
  CGSize _lastSize;
}

- (instancetype)initWithFrame:(NSRect)frame
{
  if (self = [super initWithFrame:frame]) {
    self.wantsLayer = YES;
    self.layer.contentsGravity = kCAGravityResize;
    _skinScale = 1;
    _needsIdleDraw = YES;
  }
  return self;
}

- (void)dealloc
{
  [_link invalidate];
  ss_vis_destroy(_vis);
}

// Clicks go to the React view around it (which cycles the presets).
- (NSView *)hitTest:(NSPoint)point
{
  return nil;
}

- (void)setPreset:(NSString *)preset
{
  _preset = [preset copy];
  _needsIdleDraw = YES;
}

- (void)setPixelated:(BOOL)pixelated
{
  _pixelated = pixelated;
  _needsIdleDraw = YES;
}

- (void)setSkinScale:(double)skinScale
{
  _skinScale = skinScale > 0 ? skinScale : 1;
  _needsIdleDraw = YES;
}

- (void)viewDidMoveToWindow
{
  [super viewDidMoveToWindow];
  [_link invalidate];
  _link = nil;
  if (self.window) {
    _link = [self displayLinkWithTarget:self selector:@selector(tick:)];
    [_link addToRunLoop:NSRunLoop.mainRunLoop forMode:NSRunLoopCommonModes];
    _needsIdleDraw = YES;
  }
}

- (void)tick:(CADisplayLink *)link
{
  if (!_vis) {
    SsRecorder *recorder = SSCurrentRecorder();
    if (!recorder) {
      return;
    }
    _vis = ss_vis_create(recorder);
  }
  if (_preset && ![_preset isEqualToString:_appliedPreset]) {
    if (ss_vis_set_preset(_vis, _preset.UTF8String) != SS_STATUS_OK) {
      NSLog(@"Visualizer preset: %s", ss_last_error_message());
    }
    _appliedPreset = _preset;
    _needsIdleDraw = YES;
  }
  CGSize size = self.bounds.size;
  if (!CGSizeEqualToSize(size, _lastSize)) {
    _lastSize = size;
    _needsIdleDraw = YES;
  }
  BOOL live = ss_vis_is_live(_vis);
  if (!live && !_needsIdleDraw) {
    return;
  }
  [self draw];
  _needsIdleDraw = live; // after a recording ends, draw the idle look once
}

- (void)draw
{
  CGFloat backing = self.window.backingScaleFactor ?: 2;
  double unit = _pixelated ? 1 : _skinScale * backing;
  double perPoint = _pixelated ? 1 / _skinScale : backing;
  size_t width = (size_t)llround(self.bounds.size.width * perPoint);
  size_t height = (size_t)llround(self.bounds.size.height * perPoint);
  if (width == 0 || height == 0) {
    return;
  }
  _buffer.resize(width * height * 4);
  ss_vis_render(_vis, (uint32_t)width, (uint32_t)height, (float)unit, _buffer.data(), _buffer.size());

  CFDataRef data = CFDataCreate(NULL, _buffer.data(), (CFIndex)_buffer.size());
  CGDataProviderRef provider = CGDataProviderCreateWithCFData(data);
  CGColorSpaceRef space = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
  CGImageRef image = CGImageCreate(width, height, 8, 32, width * 4, space,
                                   kCGImageAlphaPremultipliedLast | kCGBitmapByteOrderDefault, provider, NULL,
                                   false, kCGRenderingIntentDefault);
  [CATransaction begin];
  [CATransaction setDisableActions:YES];
  self.layer.magnificationFilter = _pixelated ? kCAFilterNearest : kCAFilterLinear;
  self.layer.contents = (__bridge id)image;
  [CATransaction commit];
  CGImageRelease(image);
  CGColorSpaceRelease(space);
  CGDataProviderRelease(provider);
  CFRelease(data);
}

@end

@interface SSVisualizerViewManager : RCTViewManager
@end

@implementation SSVisualizerViewManager

RCT_EXPORT_MODULE(SSVisualizerView)

- (NSView *)view
{
  return [SSVisualizerView new];
}

RCT_EXPORT_VIEW_PROPERTY(preset, NSString)
RCT_EXPORT_VIEW_PROPERTY(pixelated, BOOL)
RCT_EXPORT_VIEW_PROPERTY(skinScale, double)

@end
