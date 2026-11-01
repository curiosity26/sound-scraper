// Turbo Module spec for the track editor (the Rust core's ss_editor_* and
// ss_edits_* functions), on macOS, Windows and Linux; where it's missing,
// TurboModuleRegistry.get returns null and the editor isn't offered.
import { type TurboModule, TurboModuleRegistry } from 'react-native'

export interface Spec extends TurboModule {
  /** Opens a recording and starts building its waveform; returns the editor id. */
  open(path: string): number
  close(id: number): void
  /** Waveform status JSON (ss_editor_status). */
  status(id: number): string
  /** The tracks an edit list (JSON) makes, as JSON (ss_editor_tracks). */
  tracks(id: number, editsJson: string): string
  /** Find Tracks: proposed splices as JSON (ss_editor_detect). */
  detect(id: number, optionsJson: string): string
  /** Unsaved edits kept for a recording (JSON), or "null". */
  loadDraft(fileName: string): string
  saveDraft(fileName: string, editsJson: string): void
  discardDraft(fileName: string): void
  /** The lossless masters kept: `{"count":n,"bytes":n}` JSON. */
  mastersUsage(): string
  deleteAllMasters(): Promise<void>
  /**
   * Writes the tracks, then trashes the original unless keepOriginal;
   * resolves with `{"files":[…],"reencoded":n}` JSON (ss_editor_save).
   */
  save(
    fileName: string,
    editsJson: string,
    keepOriginal: boolean,
  ): Promise<string>
  /**
   * Copies a JPEG or PNG into the recording's draft folder for a track's
   * cover; resolves with its id (ss_edits_store_cover).
   */
  storeEditCover(fileName: string, imagePath: string): Promise<string>
  /** Where a track cover stored for the recording is, or "" (ss_edits_cover_path). */
  editCoverPath(fileName: string, coverId: string): string
  /** The now-playing markers kept for the recording, as JSON (ss_edits_markers). */
  editMarkers(fileName: string): string
}

export const NativeEditor = TurboModuleRegistry.get<Spec>('SoundScraperEditor')
