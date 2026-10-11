/** Picks the best sprite state for a button, falling back toward "normal". */
export function buttonState(
  states: Record<string, unknown>,
  flags: {
    pressed: boolean
    active: boolean
    disabled: boolean
    mode?: string
  },
): string {
  const { mode } = flags
  // A disabled button in a mode keeps the mode's look (record stays lit
  // while recording).
  const candidates = flags.disabled
    ? mode
      ? [`${mode}Disabled`, mode, 'disabled']
      : ['disabled']
    : mode && flags.pressed
    ? [`${mode}Pressed`, 'activePressed', 'pressed']
    : mode
    ? [mode, 'active']
    : flags.pressed && flags.active
    ? ['activePressed', 'pressed', 'active']
    : flags.pressed
    ? ['pressed']
    : flags.active
    ? ['active']
    : []
  return candidates.find(s => s in states) ?? 'normal'
}
