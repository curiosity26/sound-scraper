import type { Guard } from '@/shared/utils/guards'

import type { BurnRequest, PlaylistsRequest, Reply } from './generated'
import { isReply } from './guards/isReply'
import { parseNative } from './parseNative'

/**
 * Sends a request to an `ss_playlists`/`ss_burn` style entry point and
 * returns its answer, which must match `isOk`. Throws the core's message
 * when the answer is `{"error": …}`.
 */
export const requestReply = <T>(
  send: (requestJson: string) => string,
  request: PlaylistsRequest | BurnRequest,
  isOk: Guard<T>,
  what: string,
): T => {
  const reply: Reply<T> = parseNative(
    send(JSON.stringify(request)),
    isReply(isOk),
    what,
  )
  if ('error' in reply) {
    throw new Error(reply.error)
  }
  return reply.ok
}
