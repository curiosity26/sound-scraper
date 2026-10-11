import { shared } from '@/skin/shared'

import type { BurnJob } from './types'

/**
 * The burn in progress (or last finished), kept while the panel is hidden.
 * Whether a burn is running (the main panel's status, quitting).
 */
export const burnJob = shared<BurnJob | null>(null)
