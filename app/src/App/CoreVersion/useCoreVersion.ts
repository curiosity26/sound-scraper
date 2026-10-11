import { useMemo } from 'react'

import { getCoreVersion } from '@/native/getCoreVersion'

export type UseCoreVersionResult =
  | { readonly version: string; readonly error?: undefined }
  | { readonly version?: undefined; readonly error: string }

/** The Rust core's version, or why the bridge couldn't be reached. */
export const useCoreVersion = (): UseCoreVersionResult => {
  return useMemo(() => {
    try {
      return { version: getCoreVersion() }
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }, [])
}
