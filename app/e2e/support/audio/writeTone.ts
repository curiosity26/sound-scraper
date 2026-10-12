import { probe } from './probe'

/** Writes a WAV of a `hz` sine lasting `seconds` (48 kHz stereo, -6 dBFS). */
export const writeTone = async (
  path: string,
  hz: number,
  seconds: number,
): Promise<void> => {
  await probe('tone', path, String(hz), String(seconds))
}
