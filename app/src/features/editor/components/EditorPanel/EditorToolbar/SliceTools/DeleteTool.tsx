import React, { type FC } from 'react'

import { ToolButton } from '@/features/editor/components/EditorPanel/ToolButton'
import { useEditor } from '@/features/editor/components/EditorPanel/useEditor'

/**
 * The Delete tool, named for what it would do: delete the selected
 * stretch, remove the slice, or restore a deleted stretch.
 */
export const DeleteTool: FC = () => {
  const { selection, commands } = useEditor()
  const onPress = commands.deleteSelected
  switch (selection.deleteTarget) {
    case 'selection':
      return <ToolButton glyph="⌫" label="Delete Selection" onPress={onPress} />
    case 'slice':
      return <ToolButton glyph="⌫" label="Remove Slice" onPress={onPress} />
    case 'region':
      return <ToolButton glyph="↺" label="Restore" onPress={onPress} />
    case null:
      return <ToolButton glyph="⌫" label="Delete" onPress={onPress} disabled />
  }
}
