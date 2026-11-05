export type Os = 'mac' | 'windows' | 'linux'

export type Download = Readonly<{
  name: string
  url: string
  size: number
}>

export type WindowsArch = 'x64' | 'arm64'
export type LinuxArch = 'x86_64' | 'aarch64'

export type LinuxPackage = Download &
  Readonly<{
    arch: LinuxArch
    /** Groups the same package for both architectures, e.g. "deb:ubuntu24.04". */
    key: string
    kind: 'flatpak' | 'deb' | 'rpm' | 'tarball'
    label: string
    install: string
  }>

export type Release = Readonly<{
  tag: string
  version: string
  url: string
  publishedAt: string
  mac: Download | undefined
  windows: Readonly<Partial<Record<WindowsArch, Download>>>
  linux: readonly LinuxPackage[]
  skins: readonly Download[]
  checksums: Download | undefined
}>
