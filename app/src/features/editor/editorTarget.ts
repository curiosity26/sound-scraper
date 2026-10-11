import { shared } from '@/features/skins/shared'

/** The recording open in the track editor (its window shows it). */
export const editorTarget = shared<{
  fileName: string
  path: string
  title: string
  durationMs: number
} | null>(null)
