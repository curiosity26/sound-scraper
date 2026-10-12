import { errorText } from '@/shared/utils/errorText'

import { library } from './library'
import type { MenuContext } from './types'
import { writeCover } from './writeCover'

/** Asks for an image and writes it as the cover; a failure goes to
 * `ctx.report`. */
export const chooseCover = (ctx: MenuContext): void => {
  const pickAndWrite = async () => {
    const path = await library.pickImage()
    if (path) {
      writeCover(ctx, { kind: 'set', path })
    }
  }
  pickAndWrite().catch((e: unknown) => {
    ctx.report({ text: errorText(e), isError: true })
  })
}
