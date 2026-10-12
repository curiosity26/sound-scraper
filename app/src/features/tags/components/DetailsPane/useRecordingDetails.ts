import { useCallback, useEffect, useMemo, useState } from 'react'

import type { Recording, Tags } from '@/bridge/types'
import { chooseCover as chooseCoverFor } from '@/features/library/chooseCover'
import { displayName } from '@/features/library/displayName'
import { library } from '@/features/library/library'
import { openRecordingMenu } from '@/features/library/openRecordingMenu'
import { recordingActions } from '@/features/library/recordingActions'
import type {
  MenuAction,
  MenuContext,
  ShowMenu,
} from '@/features/library/types'
import { safeSettings } from '@/features/recorder/safeSettings'
import { buildEdit } from '@/features/tags/buildEdit'
import type {
  CoverChange,
  CoverState,
  Field,
  Merged,
} from '@/features/tags/types'
import { errorText } from '@/shared/utils/errorText'
import { onRejected } from '@/shared/utils/onRejected'

import { mergeCovers } from './mergeCovers'
import { mergeTags } from './mergeTags'
import { validateTag } from './validateTag'

export type UseRecordingDetailsOptions = {
  /** One recording, or several for a bulk edit. */
  readonly fileNames: readonly string[]
  /** Something changed on disk (tags, name, trash). */
  readonly onChanged: () => void
  /** A rename gave the recording a new file name. */
  readonly onRenamed: (oldName: string, newName: string) => void
  /** They went to the Trash. */
  readonly onTrashed: () => void
  /** The actions menu; without it (no native menus) they show as links. */
  readonly showMenu?: ShowMenu
}

export type UseRecordingDetailsResult = {
  /** Shared tag values; undefined while loading (or after a read error). */
  readonly merged: Record<Field, Merged> | undefined
  readonly cover: CoverState
  /** The library entry, when one recording is shown. */
  readonly recording: Recording | undefined
  /** A write is in progress. */
  readonly busy: boolean
  readonly error: string | undefined
  readonly notice: string | undefined
  /** Saves one field to every recording; false keeps the field editing. */
  readonly saveField: (field: Field, text: string) => Promise<boolean>
  /** Renames the single recording; false keeps the field editing. */
  readonly rename: (text: string) => Promise<boolean>
  /** Sets the cover from a dropped file's URI (PNG or JPEG only). */
  readonly dropImage: (uri: string | undefined) => void
  /** Asks for an image file and sets it as the cover. */
  readonly chooseCover: () => void
  /** The actions, shown as links when there are no native menus. */
  readonly actions: readonly MenuAction[]
  /** Opens the actions menu at (x, y) in the window. */
  readonly openMenu: (x: number, y: number) => void
}

/**
 * The selected recording(s)' tags and library entries, reloaded whenever
 * the selection changes or a write lands, with the edits the details pane
 * makes: tags, cover, rename and the actions menu.
 */
export const useRecordingDetails = (
  options: UseRecordingDetailsOptions,
): UseRecordingDetailsResult => {
  const { fileNames, onChanged } = options
  const [tags, setTags] = useState<Tags[]>()
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [busy, setBusy] = useState(false)
  const readFailed = (message: string) => {
    setError(`Couldn't read the tags: ${message}`)
  }
  const key = fileNames.join('\u0000')

  /** Reads the tags and library entries (rejects when they can't be read). */
  const load = useCallback(async () => {
    const names = key.split('\u0000').filter(Boolean)
    const [loaded, all] = await Promise.all([
      Promise.all(names.map(n => library.readTags(n))),
      library.list(),
    ])
    setTags(loaded)
    setRecordings(all.filter(r => names.includes(r.fileName)))
  }, [key])

  useEffect(() => {
    setTags(undefined)
    setError(undefined)
    setNotice(undefined)
    load().catch(onRejected(readFailed))
  }, [load])

  const merged = useMemo(() => (tags ? mergeTags(tags) : undefined), [tags])
  const cover: CoverState = useMemo(
    () => (tags ? mergeCovers(tags) : { kind: 'none' }),
    [tags],
  )

  const saveFailed = (message: string) => {
    setError(`Couldn't save: ${message}`)
  }

  /** Writes one change to every selected recording, then reloads (rejects
   * when the write fails). */
  const write = async (
    edits: Partial<Record<Field, string>>,
    coverChange: CoverChange,
  ) => {
    setBusy(true)
    setError(undefined)
    try {
      const v23 = safeSettings()?.id3Version === '2.3'
      await library.writeTags(
        [...fileNames],
        buildEdit(edits, coverChange, v23),
      )
      onChanged()
      await load().catch(onRejected(readFailed))
    } finally {
      setBusy(false)
    }
  }

  const saveField = async (field: Field, text: string) => {
    const problem = validateTag(field, text)
    if (problem) {
      setError(problem)
      return false
    }
    try {
      await write({ [field]: text }, { kind: 'keep' })
    } catch (e) {
      saveFailed(errorText(e))
    }
    return true
  }

  const rename = async (text: string) => {
    const old = fileNames[0]
    if (old === undefined) {
      return true
    }
    const recording = recordings.find(r => r.fileName === old)
    if (!text.trim() || (recording && text.trim() === displayName(recording))) {
      return true
    }
    try {
      const renamed = await library.rename(old, text)
      onChanged()
      options.onRenamed(old, renamed)
      return true
    } catch (e) {
      setError(`Couldn't rename: ${errorText(e)}`)
      return false
    }
  }

  const dropImage = (uri: string | undefined) => {
    const path = uri ? decodeURI(uri.replace(/^file:\/\//, '')) : undefined
    if (path && /\.(png|jpe?g)$/i.test(path)) {
      write({}, { kind: 'set', path }).catch(onRejected(saveFailed))
    } else if (path) {
      setError('Drop a PNG or JPEG image.')
    }
  }

  const menuContext: MenuContext = {
    fileNames,
    recordings,
    hasCover: cover.kind !== 'none',
    showMenu: options.showMenu,
    onChanged: () => {
      onChanged()
      load().catch(onRejected(readFailed))
    },
    onTrashed: options.onTrashed,
    report: m => {
      setError(m.isError ? m.text : undefined)
      setNotice(m.isError ? undefined : m.text)
    },
  }

  return {
    merged,
    cover,
    recording: fileNames.length === 1 ? recordings[0] : undefined,
    busy,
    error,
    notice,
    saveField,
    rename,
    dropImage,
    chooseCover: () => {
      chooseCoverFor(menuContext)
    },
    actions: recordingActions(menuContext),
    openMenu: (x, y) => {
      openRecordingMenu(menuContext, x, y)
    },
  }
}
