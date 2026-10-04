#pragma once

// The visualizer view (SSVisualizerView) on Windows: a Fabric component
// whose visual shows frames drawn by the Rust core (ss_vis_render) on a
// display-rate timer while a recording is live, and the idle look once
// otherwise. No JS per frame. Mirrors SSVisualizerView.mm on macOS.

namespace SoundScraper {

void RegisterVisualizerView(winrt::Microsoft::ReactNative::IReactPackageBuilder const &packageBuilder) noexcept;

} // namespace SoundScraper
