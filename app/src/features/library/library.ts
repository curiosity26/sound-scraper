import type { EventSubscription } from 'react-native'

import NativeSoundScraper from '@/bridge/NativeSoundScraper'
import type { Recording, TagEdit, Tags } from '@/bridge/types'

export const library = {
  /** Rescans the recordings folder; newest first. */
  list: (): Promise<Recording[]> => NativeSoundScraper.listRecordings(),
  /** Renames on disk; resolves with the new file name. */
  rename: (fileName: string, newName: string): Promise<string> =>
    NativeSoundScraper.renameRecording(fileName, newName),
  trash: (fileName: string): Promise<void> =>
    NativeSoundScraper.trashRecording(fileName),
  reveal: (fileName: string): void => {
    NativeSoundScraper.revealRecording(fileName)
  },
  onChanged: (listener: () => void): EventSubscription =>
    NativeSoundScraper.onLibraryChanged(() => {
      listener()
    }),
  readTags: (fileName: string): Promise<Tags> =>
    NativeSoundScraper.readTags(fileName),
  writeTags: (fileNames: string[], edit: TagEdit): Promise<void> =>
    NativeSoundScraper.writeTags(fileNames, edit),
  /** Native open dialog for a cover image; null if cancelled. */
  pickImage: (): Promise<string | null> => NativeSoundScraper.pickImage(),
}
