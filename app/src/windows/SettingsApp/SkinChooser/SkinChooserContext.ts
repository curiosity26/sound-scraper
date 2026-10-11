import { createContext } from 'react'

import type { UseSkinActionsResult } from './useSkinActions'

export type SkinChooserState = UseSkinActionsResult & {
  readonly textStyle: object
}

/**
 * The skin actions (useSkinActions) and text style of Settings › Skin,
 * shared by its parts so each reads what it uses instead of taking it as
 * props.
 */
export const SkinChooserContext = createContext<SkinChooserState | null>(null)
