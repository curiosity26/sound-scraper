// Shared Turbo Module spec. Codegen turns this into the Objective-C++
// protocol (macOS) and the C++ spec header (Windows) that both native
// modules implement, which keeps the two platforms in sync.
import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';

export interface Spec extends TurboModule {
  /** Rust core version, from `ss_version()` in sound_scraper.h. */
  getVersion(): string;
}

export default TurboModuleRegistry.getEnforcing<Spec>('SoundScraper');
