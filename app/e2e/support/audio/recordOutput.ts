import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { writeFile } from 'node:fs/promises'

/** A recording of what the speakers play, until `stop`. */
export type OutputRecording = {
  /** Stops recording and writes the WAV. */
  readonly stop: () => Promise<void>
}

const RATE = 48_000
const CHANNELS = 2
const BYTES_PER_SAMPLE = 2

/** A 16-bit PCM WAV of `pcm`. */
const wavOf = (pcm: Buffer) => {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(CHANNELS, 22)
  header.writeUInt32LE(RATE, 24)
  header.writeUInt32LE(RATE * CHANNELS * BYTES_PER_SAMPLE, 28)
  header.writeUInt16LE(CHANNELS * BYTES_PER_SAMPLE, 32)
  header.writeUInt16LE(BYTES_PER_SAMPLE * 8, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

/**
 * Records the default output (what a listener would hear) to a WAV at
 * `path`, independently of the app.
 */
export const recordOutput = (path: string): OutputRecording => {
  if (process.platform !== 'linux') {
    throw new Error(`no output recorder for ${process.platform} yet`)
  }
  // Raw PCM on stdout: parec's own WAV writer loses what it buffered when
  // it's stopped.
  const recorder = spawn(
    'parec',
    [
      '--device=@DEFAULT_MONITOR@',
      '--raw',
      '--format=s16le',
      `--rate=${RATE}`,
      `--channels=${CHANNELS}`,
      '--latency-msec=20',
    ],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  )
  const chunks: Buffer[] = []
  recorder.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
  return {
    stop: async () => {
      if (recorder.exitCode === null && recorder.signalCode === null) {
        recorder.kill('SIGINT')
        await once(recorder, 'close')
      }
      await writeFile(path, wavOf(Buffer.concat(chunks)))
    },
  }
}
