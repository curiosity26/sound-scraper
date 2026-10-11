import type {
  SkinWindowEvent,
  WindowEventKind,
  WindowName,
} from '@/features/skins/types'
import { isShape } from '@/shared/utils/guards'
import { isUnionOf } from '@/shared/utils/guards/isUnionOf'

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
