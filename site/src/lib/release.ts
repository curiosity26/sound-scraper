import { REPO } from '@/lib/constants'
import type {
  Download,
  LinuxArch,
  LinuxPackage,
  Release,
  WindowsArch,
} from '@/lib/types'

type ApiAsset = Readonly<{
  name: string
  size: number
  browser_download_url: string
}>

type ApiRelease = Readonly<{
  tag_name: string
  html_url: string
  published_at: string
  assets: readonly ApiAsset[]
}>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isApiAsset = (value: unknown): value is ApiAsset =>
  isRecord(value) &&
  typeof value['name'] === 'string' &&
  typeof value['size'] === 'number' &&
  typeof value['browser_download_url'] === 'string'

const isApiRelease = (value: unknown): value is ApiRelease =>
  isRecord(value) &&
  typeof value['tag_name'] === 'string' &&
  typeof value['html_url'] === 'string' &&
  typeof value['published_at'] === 'string' &&
  Array.isArray(value['assets']) &&
  value['assets'].every(isApiAsset)

const toDownload = (asset: ApiAsset): Download => ({
  name: asset.name,
  url: asset.browser_download_url,
  size: asset.size,
})

const linuxArch = (arch: string): LinuxArch | undefined => {
  switch (arch) {
    case 'x86_64':
    case 'amd64':
      return 'x86_64'
    case 'aarch64':
    case 'arm64':
      return 'aarch64'
    default:
      return undefined
  }
}

// Package names come from the release workflow, e.g.
// sound-scraper_0.4.1-1_ubuntu24.04_amd64.deb or sound-scraper-0.4.1-1.fc44.x86_64.rpm.
const DEB = /^sound-scraper_[^_]+_([a-z]+)([\d.]+)_(amd64|arm64)\.deb$/
const RPM = /^sound-scraper-.+\.(fc|el)(\d+)\.(x86_64|aarch64)\.rpm$/
const FLATPAK = /^SoundScraper-.+-(x86_64|aarch64)\.flatpak$/
const TARBALL = /^SoundScraper-(.+)-linux-(x86_64|aarch64)\.tar\.gz$/

const debLabel = (distro: string, version: string): string => {
  if (distro === 'ubuntu') {
    // Mint's major tracks Ubuntu's LTS (Mint 22 is Ubuntu 24.04).
    const mint = Number.parseInt(version, 10) - 2
    return `Ubuntu ${version}, Linux Mint ${String(mint)}`
  }
  if (distro === 'debian') {
    return `Debian ${version}`
  }
  return `${distro} ${version}`
}

const rpmLabel = (family: string, version: string): string =>
  family === 'fc'
    ? `Fedora ${version}`
    : `RHEL, CentOS Stream, AlmaLinux or Rocky ${version}`

const KIND_ORDER: Readonly<Record<LinuxPackage['kind'], number>> = {
  flatpak: 0,
  deb: 1,
  rpm: 2,
  tarball: 3,
}

const linuxPackage = (asset: ApiAsset): LinuxPackage | undefined => {
  const download = toDownload(asset)
  const deb = DEB.exec(asset.name)
  if (deb !== null) {
    const [, distro = '', version = '', arch = ''] = deb
    const a = linuxArch(arch)
    return a === undefined
      ? undefined
      : {
          ...download,
          arch: a,
          key: `deb:${distro}${version}`,
          kind: 'deb',
          label: debLabel(distro, version),
          install: `sudo apt install ./${asset.name}`,
        }
  }
  const rpm = RPM.exec(asset.name)
  if (rpm !== null) {
    const [, family = '', version = '', arch = ''] = rpm
    const a = linuxArch(arch)
    return a === undefined
      ? undefined
      : {
          ...download,
          arch: a,
          key: `rpm:${family}${version}`,
          kind: 'rpm',
          label: rpmLabel(family, version),
          install: `sudo dnf install ./${asset.name}`,
        }
  }
  const flatpak = FLATPAK.exec(asset.name)
  if (flatpak !== null) {
    const a = linuxArch(flatpak[1] ?? '')
    return a === undefined
      ? undefined
      : {
          ...download,
          arch: a,
          key: 'flatpak',
          kind: 'flatpak',
          label: 'Any distribution (Flatpak)',
          install: `flatpak install --user ./${asset.name}`,
        }
  }
  const tarball = TARBALL.exec(asset.name)
  if (tarball !== null) {
    const [, version = '', arch = ''] = tarball
    const a = linuxArch(arch)
    return a === undefined
      ? undefined
      : {
          ...download,
          arch: a,
          key: 'tarball',
          kind: 'tarball',
          label: 'Anything else (GTK 4.14 or newer)',
          install: `tar xzf ${asset.name} && ./SoundScraper-${version}-${arch}/install.sh`,
        }
  }
  return undefined
}

const windowsArch = (name: string): WindowsArch | undefined => {
  if (/-x64\.msix$/i.test(name)) {
    return 'x64'
  }
  if (/-arm64\.msix$/i.test(name)) {
    return 'arm64'
  }
  return undefined
}

const parse = (release: ApiRelease): Release => {
  const assets = release.assets
  const windows: Partial<Record<WindowsArch, Download>> = {}
  for (const asset of assets) {
    const arch = windowsArch(asset.name)
    if (arch !== undefined) {
      windows[arch] = toDownload(asset)
    }
  }
  const mac = assets.find(asset => asset.name.endsWith('.dmg'))
  const checksums = assets.find(asset => asset.name === 'SHA256SUMS.txt')
  return {
    tag: release.tag_name,
    version: release.tag_name.replace(/^v/, ''),
    url: release.html_url,
    publishedAt: release.published_at,
    mac: mac === undefined ? undefined : toDownload(mac),
    windows,
    linux: assets
      .map(linuxPackage)
      .filter(pkg => pkg !== undefined)
      .toSorted(
        (a, b) =>
          KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
          b.key.localeCompare(a.key, 'en', { numeric: true }),
      ),
    skins: assets
      .filter(asset => asset.name.endsWith('.sskin'))
      .map(toDownload),
    checksums: checksums === undefined ? undefined : toDownload(checksums),
  }
}

const fetchLatest = async (): Promise<Release> => {
  const token = process.env['GITHUB_TOKEN']
  const response = await fetch(
    `https://api.github.com/repos/${REPO}/releases/latest`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(token === undefined || token === ''
          ? {}
          : { Authorization: `Bearer ${token}` }),
      },
    },
  )
  if (!response.ok) {
    throw new Error(
      `GitHub answered ${String(response.status)} for the latest release`,
    )
  }
  const body: unknown = await response.json()
  if (!isApiRelease(body)) {
    throw new Error('The latest release has an unexpected shape')
  }
  return parse(body)
}

const load = async (): Promise<Release | undefined> => {
  try {
    return await fetchLatest()
  } catch (error) {
    if (process.env['REQUIRE_RELEASE'] === '1') {
      throw error
    }
    console.warn(`[site] no release data: ${String(error)}`)
    return undefined
  }
}

/**
 * The latest stable release (GitHub's "latest" skips pre-releases), read
 * once per build. Without network access the site still builds, with links
 * to the releases page instead of direct downloads; CI sets
 * REQUIRE_RELEASE=1 so a deploy never ships without them.
 */
export const latestRelease: Release | undefined = await load()
