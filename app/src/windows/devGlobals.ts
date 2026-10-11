// Lets the debugger drive the panels in dev builds (see also
// native/SoundScraper.ts). Imported by index.ts for this side effect.
import { selection } from '@/library/selection'
import { addToDevConsole } from '@/native/addToDevConsole'
import { windows } from '@/skin/windows'

addToDevConsole({ selection, windows })
