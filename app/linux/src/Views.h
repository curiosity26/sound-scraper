// The visualizer ("SSVisualizerView") and the track editor's waveform
// ("SSWaveformView") on Linux: Fabric components whose GTK widgets draw
// frames the Rust core renders (ss_vis_render, ss_editor_render). Their JS
// side is the codegenNativeComponent specs in src/features (shared with
// Windows). Mirrors app/windows/SoundScraper/VisualizerView.cpp and
// WaveformView.cpp.
//
// The props, event emitter and shadow node are written by hand (what
// React Native's codegen writes for iOS and Android), as react-native-gtk4's
// library template does.
#pragma once

#include <react/renderer/components/view/ConcreteViewShadowNode.h>
#include <react/renderer/components/view/ViewEventEmitter.h>
#include <react/renderer/components/view/ViewProps.h>
#include <react/renderer/core/ConcreteComponentDescriptor.h>
#include <rngtk/Extensions.h>

#include <string>

namespace soundscraper {

extern const char VisualizerViewComponentName[];
extern const char WaveformViewComponentName[];

class VisualizerViewProps final : public facebook::react::ViewProps {
 public:
  VisualizerViewProps() = default;
  VisualizerViewProps(const facebook::react::PropsParserContext &context,
                      const VisualizerViewProps &sourceProps,
                      const facebook::react::RawProps &rawProps);

  /// One of the skin's visualizer presets, as JSON.
  std::string preset{};
  bool pixelated{true};
  double skinScale{1.0};
};

class WaveformViewProps final : public facebook::react::ViewProps {
 public:
  WaveformViewProps() = default;
  WaveformViewProps(const facebook::react::PropsParserContext &context,
                    const WaveformViewProps &sourceProps, const facebook::react::RawProps &rawProps);

  /// From editorCore.open.
  double editorId{0};
  /// The time at the left edge, and milliseconds per point.
  double startMs{0};
  double msPerPoint{10};
  /// The skin's waveform colors, as JSON.
  std::string colors{};
};

using VisualizerViewShadowNode =
    facebook::react::ConcreteViewShadowNode<VisualizerViewComponentName, VisualizerViewProps,
                                            facebook::react::ViewEventEmitter>;
using VisualizerViewComponentDescriptor =
    facebook::react::ConcreteComponentDescriptor<VisualizerViewShadowNode>;

using WaveformViewShadowNode =
    facebook::react::ConcreteViewShadowNode<WaveformViewComponentName, WaveformViewProps,
                                            facebook::react::ViewEventEmitter>;
using WaveformViewComponentDescriptor =
    facebook::react::ConcreteComponentDescriptor<WaveformViewShadowNode>;

rngtk::NativeComponent visualizerViewComponent();
rngtk::NativeComponent waveformViewComponent();

}  // namespace soundscraper
