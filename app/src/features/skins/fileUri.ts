import { imageRevision } from './imageRevision'

/** A file URL for a macOS (/…) or Windows (C:\…) path. */
export const fileUri = (path: string): string => {
  const slashed = path.replace(/\\/g, '/')
  const encoded = encodeURI(slashed).replace(/[?#]/g, encodeURIComponent)
  const url = slashed.startsWith('/')
    ? `file://${encoded}`
    : `file:///${encoded}`
  const revision = imageRevision.get()
  return revision ? `${url}?v=${encodeURIComponent(revision)}` : url
}
