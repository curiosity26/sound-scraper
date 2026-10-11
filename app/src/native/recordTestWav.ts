import NativeSoundScraper from './NativeSoundScraper'
import type { AudioApp, CaptureReport } from './types'

/** Records `seconds` of audio to a WAV; `app` undefined means all system audio. */
export function recordTestWav(
  seconds: number,
  app?: AudioApp,
): Promise<CaptureReport> {
  return NativeSoundScraper.recordTestWav(app?.pid ?? 0, seconds)
}
