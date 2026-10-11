import React, { type FC } from 'react'

import { ToolButton } from '@/windows/EditorApp/EditorPanel/ToolButton'
import { useEditor } from '@/windows/EditorApp/EditorPanel/useEditor'

/** Clear All and Save…, at the toolbar's end. */
export const SaveTools: FC = () => {
  const { core, history, commands, saveFlow } = useEditor()
  return (
    <>
      <ToolButton
        label="Clear All"
        onPress={commands.clearAll}
        disabled={!history.hasEdits}
      />
      <ToolButton
        label="Save…"
        onPress={saveFlow.ask}
        disabled={!core.ready || !history.hasEdits}
        accent
      />
    </>
  )
}
