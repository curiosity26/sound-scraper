/**
 * Download tracking for Google Analytics. A link or button that starts a
 * download carries `data-track-*` attributes (from `trackAttrs`), and
 * DownloadTracking pushes a `download_click` event to the data layer when
 * it's clicked. The GA4 tag in the Tag Manager container sends it on, under
 * Consent Mode like every other hit.
 */

export const DOWNLOAD_EVENT = 'download_click'

export type DownloadTrack = Readonly<{
  /** Which platform's installer, or 'any' for skins. */
  os: 'mac' | 'windows' | 'linux' | 'any'
  /** What was downloaded: an installer type, a skin, or a fallback. */
  package:
    | 'dmg'
    | 'msix'
    | 'flatpak'
    | 'deb'
    | 'rpm'
    | 'tarball'
    | 'sskin'
    | 'checksums'
    | 'github'
  /** Where on the site: the home page's button, the downloads page, a skin card. */
  source: 'home_button' | 'downloads_page' | 'skin_card'
  /** A click on a download link, or copying a Linux install command. */
  method?: 'link' | 'copy_command'
  arch?: string | undefined
  /** The Linux distribution the package is for. */
  distro?: string | undefined
  version?: string | undefined
  fileName?: string | undefined
}>

/** The data attributes for an element that starts a download. */
export const trackAttrs = (track: DownloadTrack): Record<string, string> =>
  Object.fromEntries(
    Object.entries({
      'data-track-os': track.os,
      'data-track-package': track.package,
      'data-track-source': track.source,
      'data-track-method': track.method ?? 'link',
      'data-track-arch': track.arch,
      'data-track-distro': track.distro,
      'data-track-version': track.version,
      'data-track-file': track.fileName,
    }).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
