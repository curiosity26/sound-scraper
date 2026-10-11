import type { SkinInspection } from '@/bridge/generated'

import { shared } from './shared'

/** A skin waiting for the user to confirm installing it (the install card). */
export const pendingInstall = shared<
  { inspection: SkinInspection } | { path: string; error: string } | null
>(null)
