import { recordingActions } from './recordingActions'
import type { MenuContext } from './types'

/** Pops up the actions menu at (x, y), a separator before the last one. */
export const openRecordingMenu = async (
  ctx: MenuContext,
  x: number,
  y: number,
) => {
  if (!ctx.showMenu) {
    return
  }
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
  const chosen = await ctx.showMenu(items, x, y)
  if (chosen >= 0 && chosen < last) {
    actions[chosen]?.run(x, y)
  } else if (chosen === items.length - 1) {
    lastAction.run(x, y)
  }
}
