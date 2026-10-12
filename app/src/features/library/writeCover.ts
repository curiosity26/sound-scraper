import { safeSettings } from '@/features/recorder/safeSettings'
import { buildEdit } from '@/features/tags/buildEdit'
import type { CoverChange } from '@/features/tags/types'
import { errorText } from '@/shared/utils/errorText'

import { library } from './library'
import type { MenuContext } from './types'

/** Sets or removes the cover of every recording in `ctx`; a failure goes to
 * `ctx.report`. */
export const writeCover = (ctx: MenuContext, change: CoverChange): void => {
  const write = async () => {
    const v23 = safeSettings()?.id3Version === '2.3'
    await library.writeTags([...ctx.fileNames], buildEdit({}, change, v23))
    ctx.onChanged()
  }
  write().catch((e: unknown) => {
    ctx.report({ text: `Couldn't save: ${errorText(e)}`, isError: true })
  })
}
