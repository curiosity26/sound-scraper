import { recordingActions } from './recordingActions'
import type { MenuContext } from './types'

/** Pops up the actions menu at (x, y), a separator before the last one. */
export async function openRecordingMenu(
  ctx: MenuContext,
  x: number,
  y: number,
) {
  if (!ctx.showMenu) {
    return
  }
  const actions = recordingActions(ctx)
  const last = actions.length - 1
  const items = [
    ...actions.slice(0, last).map(a => a.label),
    '-',
    actions[last].label,
  ]
  const chosen = await ctx.showMenu(items, x, y)
  if (chosen >= 0 && chosen < last) {
    actions[chosen].run(x, y)
  } else if (chosen === items.length - 1) {
    actions[last].run(x, y)
  }
}
