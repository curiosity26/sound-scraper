// The track editor's native side (NativeEditor.ts), with JSON decoded.
import NativeEditor from './NativeEditor'
import type {
  DetectOptions,
  Proposal,
  SaveResult,
  TrackInfo,
  WaveformStatus,
} from './types'

function native() {
  if (!NativeEditor) {
    throw new Error('The track editor is not available on this platform yet')
  }
  return NativeEditor
}

export const editorCore = {
  open: (path: string): number => native().open(path),
  close: (id: number): void => {
    native().close(id)
  },
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
  saveDraft: (fileName: string, editsJson: string): void => {
    native().saveDraft(fileName, editsJson)
  },
  discardDraft: (fileName: string): void => {
    native().discardDraft(fileName)
  },
  save: async (
    fileName: string,
    editsJson: string,
    keepOriginal: boolean,
  ): Promise<SaveResult> =>
    JSON.parse(await native().save(fileName, editsJson, keepOriginal)),
}
