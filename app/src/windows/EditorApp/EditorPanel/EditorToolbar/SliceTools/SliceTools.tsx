import React, { type FC } from 'react'

import { ToolButton } from '@/windows/EditorApp/EditorPanel/ToolButton'
import { useEditor } from '@/windows/EditorApp/EditorPanel/useEditor'

import { DeleteTool } from './DeleteTool'

/** Slice at the playhead, Auto Slice, and Delete. */
export const SliceTools: FC = () => {
  const { core, autoSlice, commands } = useEditor()
  // A fragment: the tools wrap with the rest of the toolbar.
  return (
    <>
      <ToolButton
        glyph="✂"
        label="Slice"
        onPress={commands.addSliceAtPlayhead}
        disabled={!core.ready}
        testID="editor-add-slice"
      />
      <ToolButton
        glyph="✶"
        label="Auto Slice"
        onPress={autoSlice.toggle}
        active={autoSlice.options !== null}
        disabled={!core.ready}
      />
      <DeleteTool />
    </>
  )
}
