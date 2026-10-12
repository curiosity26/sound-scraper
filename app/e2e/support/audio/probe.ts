import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const exe = process.platform === 'win32' ? '.exe' : ''

/**
 * core/crates/probe, built with
 * `cargo build --release -p sound_scraper_probe`; E2E_PROBE points at
 * another build.
 */
const PROBE =
  process.env.E2E_PROBE ??
  fileURLToPath(
    new URL(
      `../../../../core/target/release/sound-scraper-probe${exe}`,
      import.meta.url,
    ),
  )

/** Runs the probe and returns what it printed. */
export const probe = async (...args: readonly string[]): Promise<string> =>
  (await promisify(execFile)(PROBE, args)).stdout
