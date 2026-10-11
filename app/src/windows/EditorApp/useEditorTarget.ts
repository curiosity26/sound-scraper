import { useSyncExternalStore } from 'react'

import { editorTarget } from '@/skin/editorTarget'

import type { EditorTarget } from './EditorPanel'

/** The recording open in the track editor, re-rendering when it changes. */
export const useEditorTarget = (): EditorTarget | null =>
  useSyncExternalStore(editorTarget.subscribe, editorTarget.get)
