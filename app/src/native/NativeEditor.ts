// Turbo Module spec for the track editor (the Rust core's ss_editor_* and
// ss_edits_* functions). macOS for now; elsewhere TurboModuleRegistry.get
// returns null and the editor isn't offered.
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  /** Opens a recording and starts building its waveform; returns the editor id. */
  open(path: string): number;
  close(id: number): void;
  /** Waveform status JSON (ss_editor_status). */
  status(id: number): string;
  /** The tracks an edit list (JSON) makes, as JSON (ss_editor_tracks). */
  tracks(id: number, editsJson: string): string;
  /** Find Tracks: proposed splices as JSON (ss_editor_detect). */
  detect(id: number, optionsJson: string): string;
  /** Unsaved edits kept for a recording (JSON), or "null". */
  loadDraft(fileName: string): string;
  saveDraft(fileName: string, editsJson: string): void;
  discardDraft(fileName: string): void;
  /**
   * Writes the tracks, then trashes the original unless keepOriginal;
   * resolves with `{"files":[…],"reencoded":n}` JSON (ss_editor_save).
   */
  save(
    fileName: string,
    editsJson: string,
    keepOriginal: boolean,
  ): Promise<string>;
}

export default TurboModuleRegistry.get<Spec>('SoundScraperEditor');
