import React, { type FC } from 'react'

import { ToolButton } from '@/windows/EditorApp/EditorPanel/ToolButton'
import { useEditor } from '@/windows/EditorApp/EditorPanel/useEditor'

/** Undo and Redo. */
export const HistoryTools: FC = () => {
  const { history } = useEditor()
  return (
    <>
      <ToolButton
        glyph="↶"
        label=""
        a11yLabel="Undo"
        onPress={history.undo}
        disabled={!history.canUndo}
      />
      <ToolButton
        glyph="↷"
        label=""
        a11yLabel="Redo"
        onPress={history.redo}
        disabled={!history.canRedo}
      />
    </>
  )
}
