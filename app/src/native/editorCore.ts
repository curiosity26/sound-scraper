// The track editor's native side (NativeEditor.ts), with JSON decoded.
import { isRecord } from '@/utils/isRecord'
import { parseJson } from '@/utils/parseJson'

import NativeEditor from './NativeEditor'
import type {
  DetectOptions,
  Proposal,
  SaveResult,
  TrackInfo,
  WaveformStatus,
} from './types'

type MastersUsage = { count: number; bytes: number }

const isWaveformStatus = (value: unknown): value is WaveformStatus =>
  isRecord(value) &&
  (value.state === 'loading' ||
    value.state === 'ready' ||
    value.state === 'failed')

const isTrackInfo = (value: unknown): value is TrackInfo =>
  isRecord(value) &&
  typeof value.name === 'string' &&
  typeof value.startMs === 'number' &&
  typeof value.durationMs === 'number'

const isProposal = (value: unknown): value is Proposal =>
  isRecord(value) &&
  typeof value.atMs === 'number' &&
  typeof value.gapStartMs === 'number' &&
  typeof value.gapEndMs === 'number'

const isMastersUsage = (value: unknown): value is MastersUsage =>
  isRecord(value) &&
  typeof value.count === 'number' &&
  typeof value.bytes === 'number'

const isSaveResult = (value: unknown): value is SaveResult =>
  isRecord(value) &&
  Array.isArray(value.files) &&
  value.files.every(f => typeof f === 'string')

/** A JSON list from the core; an empty answer or "null" is no items. */
const parseList = <T>(
  json: string,
  isItem: (value: unknown) => value is T,
  what: string,
): T[] =>
  parseJson(
    json || '[]',
    (value): value is T[] | null =>
      value === null || (Array.isArray(value) && value.every(isItem)),
    what,
  ) ?? []

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
    parseJson(native().status(id), isWaveformStatus, 'waveform status'),
  tracks: (id: number, editsJson: string): TrackInfo[] =>
    parseList(native().tracks(id, editsJson), isTrackInfo, 'tracks'),
  detect: (id: number, options: DetectOptions): Proposal[] =>
    parseList(
      native().detect(id, JSON.stringify(options)),
      isProposal,
      'proposals',
    ),
  mastersUsage: (): MastersUsage =>
    parseJson(native().mastersUsage(), isMastersUsage, 'masters usage'),
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
    parseJson(
      await native().save(fileName, editsJson, keepOriginal),
      isSaveResult,
      'save result',
    ),
}
