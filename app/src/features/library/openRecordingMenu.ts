import { errorText } from '@/shared/utils/errorText'

import { recordingActions } from './recordingActions'
import type { MenuContext, ShowMenu } from './types'

const showAndRun = async (
  ctx: MenuContext,
  showMenu: ShowMenu,
  x: number,
  y: number,
) => {
  const actions = recordingActions(ctx)
  const last = actions.length - 1
  const lastAction = actions[last]
  if (!lastAction) {
    return
  }
  const items = [
    ...actions.slice(0, last).map(a => a.label),
    '-',
    lastAction.label,
  ]
  const chosen = await showMenu(items, x, y)
  if (chosen >= 0 && chosen < last) {
    actions[chosen]?.run(x, y)
  } else if (chosen === items.length - 1) {
    lastAction.run(x, y)
  }
}

/** Pops up the actions menu at (x, y), a separator before the last one; a
 * menu that fails to show goes to `ctx.report`. */
export const openRecordingMenu = (
  ctx: MenuContext,
  x: number,
  y: number,
): void => {
  if (!ctx.showMenu) {
    return
  }
  showAndRun(ctx, ctx.showMenu, x, y).catch((e: unknown) => {
    ctx.report({ text: errorText(e), isError: true })
  })
}
