// Lets the debugger drive the panels in dev builds (see also
// exposeDevConsole.ts). Imported by index.ts for this side effect.
import { selection } from '@/features/library/selection'
import { windows } from '@/features/skins/windows'

import { addToDevConsole } from './addToDevConsole'

addToDevConsole({ selection, windows })
