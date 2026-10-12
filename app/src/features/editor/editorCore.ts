// The track editor's native side (NativeEditor.ts), with JSON decoded.
import type {
  DetectOptions,
  EditList,
  EditorTrack,
  MastersUsage,
  Proposal,
  SavedTracks,
  WaveformStatus,
} from '@/bridge/generated'
import { NativeEditor } from '@/bridge/NativeEditor'
import { parseNative } from '@/bridge/parseNative'
import { type Guard, isArrayOf, isNullable } from '@/shared/utils/guards'

import { isEditList } from './guards/isEditList'
import { isEditorTrack } from './guards/isEditorTrack'
import { isMastersUsage } from './guards/isMastersUsage'
import { isProposal } from './guards/isProposal'
import { isSavedTracks } from './guards/isSavedTracks'
import { isWaveformStatus } from './guards/isWaveformStatus'

/** A JSON list from the core; an empty answer or "null" is no items. */
const parseList = <T>(json: string, isItem: Guard<T>, what: string): T[] =>
  parseNative(json || '[]', isNullable(isArrayOf(isItem)), what) ?? []

const native = () => {
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
  status: (id: number): WaveformStatus =>
    parseNative(native().status(id), isWaveformStatus, 'waveform status'),
  tracks: (id: number, editsJson: string): EditorTrack[] =>
    parseList(native().tracks(id, editsJson), isEditorTrack, 'tracks'),
  detect: (id: number, options: DetectOptions): Proposal[] =>
    parseList(
      native().detect(id, JSON.stringify(options)),
      isProposal,
      'proposals',
    ),
  mastersUsage: (): MastersUsage =>
    parseNative(native().mastersUsage(), isMastersUsage, 'masters usage'),
  deleteAllMasters: (): Promise<void> => native().deleteAllMasters(),
  /**
   * The saved draft, or null when there's none. A draft that doesn't read
   * (bad JSON, or not an edit list) counts as none, as it always has.
   */
  loadDraft: (fileName: string): EditList | null => {
    const json = native().loadDraft(fileName)
    try {
      return parseNative(json, isNullable(isEditList), 'draft')
    } catch {
      return null
    }
  },
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
  ): Promise<SavedTracks> =>
    parseNative(
      await native().save(fileName, editsJson, keepOriginal),
      isSavedTracks,
      'save result',
    ),
}
