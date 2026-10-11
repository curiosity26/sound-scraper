import { use, useEffect } from 'react'

import type { SkinSummary } from '@/bridge/generated'
import { skins } from '@/features/skins/skins'
import { promiseCache } from '@/shared/utils/promiseCache'

// One read per list revision.
const skinLists = promiseCache<number, SkinSummary[]>(() => skins.list())

export type UseSkinListResult = {
  readonly list: readonly SkinSummary[]
}

/**
 * The installed skins (suspends while they load). A new `revision` reads
 * them again.
 */
export const useSkinList = (revision: number): UseSkinListResult => {
  const list = use(skinLists.get(revision))
  // Forget a revision once a newer one shows, or the chooser closes, so
  // the list is read afresh next time.
  useEffect(
    () => () => {
      skinLists.clear(revision)
    },
    [revision],
  )
  return { list }
}
