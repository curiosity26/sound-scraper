import { shared } from './shared'
import type { SkinInspection } from './types'

/** A skin waiting for the user to confirm installing it (the install card). */
export const pendingInstall = shared<
  { inspection: SkinInspection } | { path: string; error: string } | null
>(null)
