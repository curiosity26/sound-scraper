import { library } from '@/native/library'
import { safeSettings } from '@/recorder/safeSettings'
import { buildEdit } from '@/tags/buildEdit'
import type { CoverChange } from '@/tags/types'
import { errorText } from '@/utils/errorText'

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
