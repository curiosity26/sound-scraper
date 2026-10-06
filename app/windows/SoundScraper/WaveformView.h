#pragma once

// The track editor's waveform (SSWaveformView) on Windows: a Fabric
// component whose visual shows what the Rust core draws (ss_editor_render)
// whenever the editor, the visible stretch, the size or the colors change,
// polling while the waveform is still being built. Mirrors
// SSWaveformView.mm on macOS.

namespace SoundScraper {

void RegisterWaveformView(winrt::Microsoft::ReactNative::IReactPackageBuilder const &packageBuilder) noexcept;

} // namespace SoundScraper
