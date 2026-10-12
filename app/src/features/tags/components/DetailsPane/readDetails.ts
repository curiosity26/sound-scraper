import { library } from '@/features/library/library'

import type { RecordingDetails } from './types'

/** Reads the tags of each recording, and their library entries. */
export const readDetails = async (
  fileNames: readonly string[],
): Promise<RecordingDetails> => {
  const [tags, all] = await Promise.all([
    Promise.all(fileNames.map(n => library.readTags(n))),
    library.list(),
  ])
  return { tags, recordings: all.filter(r => fileNames.includes(r.fileName)) }
}
