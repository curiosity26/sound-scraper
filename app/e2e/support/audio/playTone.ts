import { spawn } from 'node:child_process'
import { once } from 'node:events'

/** A player playing a test tone. */
export type TonePlayer = {
  readonly stop: () => Promise<void>
}

/**
 * Plays the WAV at `path` once through the default output, as an app the
 * sound server (and so Sound Scraper's source menu) calls `name`.
 */
export const playTone = (path: string, name: string): TonePlayer => {
  if (process.platform !== 'linux') {
    throw new Error(`no tone player for ${process.platform} yet`)
  }
  const player = spawn('paplay', ['--client-name', name, path], {
    stdio: 'inherit',
  })
  return {
    stop: async () => {
      if (player.exitCode === null && player.signalCode === null) {
        player.kill('SIGTERM')
        await once(player, 'exit')
      }
    },
  }
}
