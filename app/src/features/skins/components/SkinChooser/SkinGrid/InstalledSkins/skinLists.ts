import type { SkinSummary } from '@/bridge/generated'
import { skins } from '@/features/skins/skins'
import { promiseCache } from '@/shared/utils/promiseCache'

/** The installed skins, read once per list revision. */
export const skinLists = promiseCache<number, SkinSummary[]>(() => skins.list())
