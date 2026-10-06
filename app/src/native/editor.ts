// The track editor's native side (NativeEditor.ts), with JSON decoded.
import NativeEditor from './NativeEditor';

export type WaveformStatus =
  | { state: 'loading'; progress: number }
  | { state: 'ready'; rate: number; durationMs: number }
  | { state: 'failed'; message: string };

/** A track an edit makes (ss_editor_tracks). */
export type TrackInfo = {
  name: string;
  /** In the original's timeline. */
  startMs: number;
  durationMs: number;
  /** Has a deleted stretch inside it, so it's re-encoded on save. */
  reencode: boolean;
};

export type SaveResult = { files: string[]; reencoded: number };

/** False where the editor isn't available yet (Windows). */
export const editorAvailable = NativeEditor != null;

function native() {
  if (!NativeEditor) {
    throw new Error('The track editor is not available on this platform yet');
  }
  return NativeEditor;
}

export const editorCore = {
  open: (path: string): number => native().open(path),
  close: (id: number): void => native().close(id),
  status: (id: number): WaveformStatus => JSON.parse(native().status(id)),
  tracks: (id: number, editsJson: string): TrackInfo[] =>
    JSON.parse(native().tracks(id, editsJson) || '[]') ?? [],
  /** The saved draft's JSON, or "null". */
  loadDraft: (fileName: string): string => native().loadDraft(fileName),
  saveDraft: (fileName: string, editsJson: string): void =>
    native().saveDraft(fileName, editsJson),
  discardDraft: (fileName: string): void => native().discardDraft(fileName),
  save: async (
    fileName: string,
    editsJson: string,
    keepOriginal: boolean,
  ): Promise<SaveResult> =>
    JSON.parse(await native().save(fileName, editsJson, keepOriginal)),
};
