import { useEffect, useState } from 'react'

import type { Message } from '@/recorder/types'

export type UseShownMessageResult = {
  /** The message, until it has shown for a while or is dismissed. */
  readonly shownMessage: Message | undefined
  readonly dismissMessage: () => void
}

/**
 * The latest message for as long as it shows in the source display: 6
 * seconds, or 12 for an error.
 */
export const useShownMessage = (
  message: Message | undefined,
): UseShownMessageResult => {
  const [shownMessage, setShownMessage] = useState<Message>()

  // Messages show in the source display for a while.
  useEffect(() => {
    if (!message) {
      return
    }
    setShownMessage(message)
    const timer = setTimeout(
      () => {
        setShownMessage(undefined)
      },
      message.isError ? 12000 : 6000,
    )
    return () => {
      clearTimeout(timer)
    }
  }, [message])

  return {
    shownMessage,
    dismissMessage: () => {
      setShownMessage(undefined)
    },
  }
}
