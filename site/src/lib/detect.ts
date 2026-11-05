// Runs in the browser: which installer to offer this visitor.

import type { LinuxArch, Os, WindowsArch } from '@/lib/types'

type UaData = Readonly<{
  platform: string
  mobile: boolean
  getHighEntropyValues: (
    hints: readonly string[],
  ) => Promise<Readonly<{ architecture?: string }>>
}>

const isUaData = (value: unknown): value is UaData =>
  typeof value === 'object' &&
  value !== null &&
  'platform' in value &&
  'getHighEntropyValues' in value

const uaData = (): UaData | undefined => {
  const data: unknown = Reflect.get(navigator, 'userAgentData')
  return isUaData(data) ? data : undefined
}

/** The visitor's desktop OS, or undefined on a phone, tablet or anything else. */
export const detectOs = (): Os | undefined => {
  const data = uaData()
  const ua = navigator.userAgent.toLowerCase()
  if (data?.mobile === true || /iphone|ipad|ipod|android/.test(ua)) {
    return undefined
  }
  const platform = (data?.platform ?? '').toLowerCase()
  if (platform.startsWith('mac') || ua.includes('mac os x')) {
    // iPads ask for the desktop site as a Mac.
    return navigator.maxTouchPoints > 1 ? undefined : 'mac'
  }
  if (platform.startsWith('win') || ua.includes('windows')) {
    return 'windows'
  }
  if (
    platform.includes('linux') ||
    ua.includes('linux') ||
    ua.includes('x11')
  ) {
    return 'linux'
  }
  return undefined
}

/** Chromium browsers say whether Windows runs on ARM; others don't, so x64. */
export const detectWindowsArch = async (): Promise<WindowsArch> => {
  if (/arm64|aarch64/i.test(navigator.userAgent)) {
    return 'arm64'
  }
  const data = uaData()
  if (data === undefined) {
    return 'x64'
  }
  try {
    const { architecture } = await data.getHighEntropyValues(['architecture'])
    return architecture === 'arm' ? 'arm64' : 'x64'
  } catch {
    return 'x64'
  }
}

export const detectLinuxArch = (): LinuxArch =>
  /aarch64|arm64|armv8/i.test(navigator.userAgent) ? 'aarch64' : 'x86_64'
