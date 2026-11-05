import type { ImageMetadata } from 'astro'

import { latestRelease } from '@/lib/release'
import type { Download } from '@/lib/types'

export type Skin = Readonly<{
  folder: string
  id: string
  name: string
  author: string
  version: string
  description: string
  builtIn: boolean
  /** The .sskin attached to the latest release; undefined for the built-in skin. */
  download: Download | undefined
  preview: ImageMetadata | undefined
}>

type Manifest = Readonly<{
  id: string
  name: string
  author: string
  version: string
  description: string
}>

const manifests = import.meta.glob<Manifest>('../../../skins/*/skin.json', {
  eager: true,
  import: 'default',
})

// Rendered by scripts/render-skin-previews.ts.
const previews = import.meta.glob<ImageMetadata>('../generated/skins/*.png', {
  eager: true,
  import: 'default',
})

const folderOf = (path: string): string => path.split('/').at(-2) ?? ''

// The release workflow names each skin's package after the skin, keeping
// letters and digits only ("Hi-Fi '74" -> HiFi74.sskin).
const assetName = (name: string): string =>
  `${name.replace(/[^\p{L}\p{N}]/gu, '')}.sskin`

const all: readonly Skin[] = Object.entries(manifests).map(
  ([path, manifest]) => {
    const folder = folderOf(path)
    return {
      folder,
      id: manifest.id,
      name: manifest.name,
      author: manifest.author,
      version: manifest.version,
      description: manifest.description,
      builtIn: folder === 'default',
      download: latestRelease?.skins.find(
        skin => skin.name === assetName(manifest.name),
      ),
      preview: previews[`../generated/skins/${folder}.png`],
    }
  },
)

/**
 * The built-in skin first, then every skin the latest release ships (all of
 * them when the release couldn't be read, linking to the releases page).
 */
export const skins: readonly Skin[] = all
  .filter(
    skin =>
      skin.builtIn ||
      latestRelease === undefined ||
      skin.download !== undefined,
  )
  .toSorted(
    (a, b) =>
      Number(b.builtIn) - Number(a.builtIn) || a.name.localeCompare(b.name),
  )
