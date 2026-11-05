// Renders the main panel of every skin in ../skins with sample content
// (a recording in progress) into src/generated/skins/<folder>.png, using
// the app's own skin renderer (core/crates/skin, example preview_skin).
// Needs the Rust toolchain. The site builds without the pictures too; the
// skin cards then show a placeholder.
//
//   npm run previews

import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../../', import.meta.url))
const out = fileURLToPath(new URL('../src/generated/skins/', import.meta.url))
mkdirSync(out, { recursive: true })

const folders = readdirSync(`${repo}skins`, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)

for (const folder of folders) {
  const result = spawnSync(
    'cargo',
    [
      'run',
      '--quiet',
      '--manifest-path',
      `${repo}core/Cargo.toml`,
      '-p',
      'sound_scraper_skin',
      '--example',
      'preview_skin',
      '--',
      '--main-only',
      `${repo}skins/${folder}`,
      `${out}${folder}.png`,
    ],
    { stdio: 'inherit' },
  )
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}
