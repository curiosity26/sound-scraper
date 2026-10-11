import { type FC, useSyncExternalStore } from 'react'

import { pendingInstall } from '@/features/skins/pendingInstall'

import { InstallCard } from './InstallCard'
import { OpenErrorCard } from './OpenErrorCard'

/** The .sskin being opened: its install card, or why it couldn't be read. */
export const PendingInstall: FC = () => {
  const pending = useSyncExternalStore(
    pendingInstall.subscribe,
    pendingInstall.get,
  )
  if (!pending) {
    return null
  }
  return 'inspection' in pending ? (
    <InstallCard inspection={pending.inspection} />
  ) : (
    <OpenErrorCard path={pending.path} error={pending.error} />
  )
}
