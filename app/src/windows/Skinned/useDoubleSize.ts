import { useEffect, useState } from 'react'

import { doubleSizeStore } from '@/skin/doubleSizeStore'

export type UseDoubleSizeResult = {
  readonly double: boolean
}

/** Double size (⌘D), shared by every window. */
export const useDoubleSize = (): UseDoubleSizeResult => {
  const [double, setDouble] = useState(doubleSizeStore.get)
  useEffect(() => doubleSizeStore.subscribe(setDouble), [])
  return { double }
}
