import { useSyncExternalStore } from 'react'

import type { EditorTarget } from '@/features/editor/components/EditorPanel'
import { editorTarget } from '@/features/editor/editorTarget'

/** The recording open in the track editor, re-rendering when it changes. */
export const useEditorTarget = (): EditorTarget | null =>
  useSyncExternalStore(editorTarget.subscribe, editorTarget.get)
