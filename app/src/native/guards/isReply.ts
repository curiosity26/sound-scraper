import type { Reply } from '@/native/bridge'
import { type Guard, isEither, isShape, isString } from '@/utils/guards'

/** The `ss_playlists`/`ss_burn` envelope around an answer `isOk` accepts. */
export const isReply = <T>(isOk: Guard<T>): Guard<Reply<T>> =>
  isEither(
    isShape<{ error: string }>({ error: isString }),
    isShape<{ ok: T }>({ ok: isOk }),
  )
