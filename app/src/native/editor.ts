// The track editor's native side (NativeEditor.ts), with JSON decoded.
import NativeEditor from './NativeEditor';

export type WaveformStatus =
  | { state: 'loading'; progress: number }
  | {
      state: 'ready';
      rate: number;
      durationMs: number;
      /** The MP3 frame grid lossless cuts land on. */
      frameMs: number | null;
      frameOffsetMs: number | null;
      /** A lossless master exists: tracks are encoded from it on save. */
      master: boolean;
    }
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

export type DetectOptions = {
  thresholdDb: number;
  minGapMs: number;
  minTrackMs: number;
  removeGaps: boolean;
};

/** A splice Find Tracks proposes, in a gap. */
export type Proposal = {
  atMs: number;
  gapStartMs: number;
  gapEndMs: number;
  /** With removeGaps: the stretch to delete. */
  delete: [number, number] | null;
};

export type SaveResult = {
  files: string[];
  reencoded: number;
  fromMaster: boolean;
};

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
  detect: (id: number, options: DetectOptions): Proposal[] =>
    JSON.parse(native().detect(id, JSON.stringify(options)) || '[]') ?? [],
  mastersUsage: (): { count: number; bytes: number } =>
    JSON.parse(native().mastersUsage()),
  deleteAllMasters: (): Promise<void> => native().deleteAllMasters(),
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
