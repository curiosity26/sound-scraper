import { isUnionOf } from '@/native/guards/isUnionOf'
import type { SkinWindowEvent, WindowEventKind, WindowName } from '@/skin/types'
import { isShape } from '@/utils/guards'

/**
 * A window event the UI knows. The codegen spec types both fields as
 * strings; the native sides send only these.
 */
export const isSkinWindowEvent = isShape<SkinWindowEvent>({
  window: isUnionOf<WindowName>()(
    'main',
    'library',
    'settings',
    'details',
    'editor',
    'burn',
  ),
  event: isUnionOf<WindowEventKind>()(
    'shown',
    'hidden',
    'toggleShade',
    'toggleDoubleSize',
    'skinFilesOpened',
  ),
})
