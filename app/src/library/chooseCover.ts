import { library } from '@/native/library'
import { errorText } from '@/utils/errorText'

import type { MenuContext } from './types'
import { writeCover } from './writeCover'

export const chooseCover = async (ctx: MenuContext) => {
  try {
    const path = await library.pickImage()
    if (path) {
      await writeCover(ctx, { kind: 'set', path })
    }
  } catch (e) {
    ctx.report({ text: errorText(e), isError: true })
  }
}
