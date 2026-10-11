import { shared } from './shared'

/** The playlist the burn panel burns (Burn CD… in the library). */
export const burnTarget = shared<{
  playlistId: number
  name: string
  tracks: Array<{
    path: string
    title: string
    performer: string | null
    durationMs: number
  }>
} | null>(null)
