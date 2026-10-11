import { useEffect, useState } from 'react'

import { burnApi } from '@/features/burn/burnApi'

export type UseHasBurnerResult = {
  /** A CD writer is there (not just the disc-image writer). */
  readonly hasBurner: boolean
}

/** Whether a CD writer is plugged in, checked every few seconds. */
export const useHasBurner = (): UseHasBurnerResult => {
  const [hasBurner, setHasBurner] = useState(false)
  useEffect(() => {
    const check = () => {
      try {
        setHasBurner(burnApi.devices().devices.some(d => d.kind !== 'image'))
      } catch {
        setHasBurner(false)
      }
    }
    check()
    // Burners can be plugged in at any time.
    const timer = setInterval(check, 3000)
    return () => {
      clearInterval(timer)
    }
  }, [])
  return { hasBurner }
}
