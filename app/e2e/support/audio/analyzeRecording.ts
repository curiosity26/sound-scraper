import { isNumber, isShape } from '@/shared/utils/guards'

import { probe } from './probe'

/** What a recording holds (see core/crates/probe). */
export type RecordingAnalysis = {
  readonly durationMs: number
  /** The audio's average bitrate (an MP3's, less its tag). */
  readonly bitrateKbps: number
  readonly sampleRate: number
  readonly rmsDbfs: number
  /** How much of it is louder than -40 dBFS. */
  readonly audibleMs: number
  /** The share of the audible part's energy at the tone (1 = all of it). */
  readonly toneRatio: number
}

const isRecordingAnalysis = isShape<RecordingAnalysis>({
  durationMs: isNumber,
  bitrateKbps: isNumber,
  sampleRate: isNumber,
  rmsDbfs: isNumber,
  audibleMs: isNumber,
  toneRatio: isNumber,
})

/** Decodes the MP3 (or WAV) at `path` and measures it against a `hz` tone. */
export const analyzeRecording = async (
  path: string,
  hz: number,
): Promise<RecordingAnalysis> => {
  const output = await probe('analyze', path, String(hz))
  const analysis = [JSON.parse(output)].find(isRecordingAnalysis)
  if (!analysis) {
    throw new TypeError(`Unexpected probe output: ${output}`)
  }
  return analysis
}
