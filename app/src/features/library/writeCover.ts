import { safeSettings } from '@/features/recorder/safeSettings'
import { buildEdit } from '@/features/tags/buildEdit'
import type { CoverChange } from '@/features/tags/types'
import { errorText } from '@/shared/utils/errorText'

import { library } from './library'
import type { MenuContext } from './types'

export const writeCover = async (ctx: MenuContext, change: CoverChange) => {
  try {
    const v23 = safeSettings()?.id3Version === '2.3'
    await library.writeTags([...ctx.fileNames], buildEdit({}, change, v23))
    ctx.onChanged()
  } catch (e) {
    ctx.report({ text: `Couldn't save: ${errorText(e)}`, isError: true })
  }
}
