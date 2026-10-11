import React, { type FC } from 'react'

import { ToolButton } from './ToolButton'
import type { DeleteTarget, EditorTheme } from './types'

export type DeleteToolProps = {
  readonly th: EditorTheme
  /** What Delete would act on. */
  readonly target: DeleteTarget
  readonly onPress: () => void
}

/** The Delete tool, named for what it would do. */
export const DeleteTool: FC<DeleteToolProps> = props => {
  const { th, onPress } = props
  switch (props.target) {
    case 'selection':
      return (
        <ToolButton
          th={th}
          glyph="⌫"
          label="Delete Selection"
          onPress={onPress}
        />
      )
    case 'slice':
      return (
        <ToolButton th={th} glyph="⌫" label="Remove Slice" onPress={onPress} />
      )
    case 'region':
      return <ToolButton th={th} glyph="↺" label="Restore" onPress={onPress} />
    case null:
      return (
        <ToolButton
          th={th}
          glyph="⌫"
          label="Delete"
          onPress={onPress}
          disabled
        />
      )
  }
}
