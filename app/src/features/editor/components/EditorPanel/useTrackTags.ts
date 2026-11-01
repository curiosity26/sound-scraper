// Each track's tags (its own over the recording's), and the tag form aimed
// at one or more tracks of the draft: what it shows, and its edits, which
// go into the edits (and so undo and the draft) like any other change.
import { useMemo, useState } from 'react'

import type { Tags } from '@/bridge/types'
import { editorCore } from '@/features/editor/editorCore'
import { library } from '@/features/library/library'
import type { UseRecordingDetailsResult } from '@/features/tags/components/DetailsPane'
import { mergeCovers } from '@/features/tags/components/DetailsPane/mergeCovers'
import { mergeTags } from '@/features/tags/components/DetailsPane/mergeTags'
import { validateTag } from '@/features/tags/components/DetailsPane/validateTag'
import type { Field } from '@/features/tags/types'
import { errorText } from '@/shared/utils/errorText'

import { effectiveTags } from './effectiveTags'
import { renameTracks, setTrackTags, type TrackOwner } from './model'
import type { TrackRow } from './types'
import type { UseEditHistoryResult } from './useEditHistory'

export type UseTrackTagsOptions = {
  readonly fileName: string
  readonly rows: readonly TrackRow[]
  /** The recording's own tags, once read. */
  readonly recording: Tags | undefined
  readonly history: UseEditHistoryResult
}

export type UseTrackTagsResult = {
  /** Each track's tags as it would be saved (by its index in the rows). */
  readonly effective: readonly Tags[]
  /** Opens the tag form on these tracks (several: a bulk edit). */
  readonly open: (indices: readonly number[]) => void
  readonly close: () => void
  /** The form's state, while it's open on tracks that are still there. */
  readonly details: UseRecordingDetailsResult | null
  /** What the form edits, e.g. "Track 2" or "3 tracks". */
  readonly heading: string
  /** The tracks the form edits, as keys (its fields start over when they change). */
  readonly keys: readonly string[]
}

const NO_ACTIONS: UseRecordingDetailsResult['actions'] = []

export const useTrackTags = (
  options: UseTrackTagsOptions,
): UseTrackTagsResult => {
  const { fileName, rows, recording, history } = options
  const [owners, setOwners] = useState<readonly TrackOwner[] | null>(null)
  const [status, setStatus] = useState<{ busy: boolean; error?: string }>({
    busy: false,
  })

  const effective = useMemo(
    () =>
      rows.map(row =>
        effectiveTags(recording, row, id => editorCore.coverPath(fileName, id)),
      ),
    [rows, recording, fileName],
  )

  /** The open tracks' places in the rows. */
  const indices = useMemo(
    () =>
      owners === null
        ? []
        : rows.flatMap((row, i) =>
            row.owner !== null && owners.includes(row.owner) ? [i] : [],
          ),
    [rows, owners],
  )
  const shown = useMemo(
    () => indices.flatMap(i => effective[i] ?? []),
    [indices, effective],
  )
  const merged = useMemo(
    () => (shown.length > 0 ? mergeTags(shown) : undefined),
    [shown],
  )
  const targets = owners ?? []

  const fail = (message: string) => {
    setStatus({ busy: false, error: message })
  }

  /** One field's override on every open track; matching the recording drops it. */
  const saveField = (field: Field, text: string): Promise<boolean> => {
    const problem = validateTag(field, text)
    const value = text.trim()
    if (problem) {
      fail(problem)
      return Promise.resolve(false)
    }
    setStatus({ busy: false })
    if (field === 'title') {
      if (!value) {
        fail('A track needs a title')
        return Promise.resolve(false)
      }
      history.commit(renameTracks(history.edits, targets, value))
    } else if (field === 'track') {
      history.commit(
        setTrackTags(history.edits, targets, t => ({
          ...t,
          track: value ? Number(value) : undefined,
        })),
      )
    } else {
      const same = value === (recording?.[field] ?? '')
      history.commit(
        setTrackTags(history.edits, targets, t => ({
          ...t,
          [field]: same ? undefined : value,
        })),
      )
    }
    return Promise.resolve(true)
  }

  /** Stores the image in the draft and makes it the open tracks' cover. */
  const setCover = (path: string) => {
    setStatus({ busy: true })
    editorCore
      .storeCover(fileName, path)
      .then(id => {
        history.commitWith(e =>
          setTrackTags(e, targets, t => ({ ...t, cover: id })),
        )
        setStatus({ busy: false })
      })
      .catch((e: unknown) => {
        fail(`Couldn't use the image: ${errorText(e)}`)
      })
  }

  const details: UseRecordingDetailsResult | null =
    indices.length === 0
      ? null
      : {
          merged,
          cover: mergeCovers(shown),
          recording: undefined,
          busy: status.busy,
          error: status.error,
          notice: undefined,
          saveField,
          rename: () => Promise.resolve(true),
          dropImage: uri => {
            const path = uri
              ? decodeURI(uri.replace(/^file:\/\//, ''))
              : undefined
            if (path && /\.(png|jpe?g)$/i.test(path)) {
              setCover(path)
            } else if (path) {
              fail('Drop a PNG or JPEG image.')
            }
          },
          chooseCover: () => {
            library
              .pickImage()
              .then(path => {
                if (path) {
                  setCover(path)
                }
              })
              .catch((e: unknown) => {
                fail(errorText(e))
              })
          },
          actions: NO_ACTIONS,
          openMenu: () => {},
        }

  const first = indices[0] === undefined ? undefined : rows[indices[0]]
  return {
    effective,
    open: picked => {
      const next = picked.flatMap(i => rows[i]?.owner ?? [])
      setStatus({ busy: false })
      setOwners(next.length > 0 ? next : null)
    },
    close: () => {
      setOwners(null)
      setStatus({ busy: false })
    },
    details,
    heading:
      indices.length === 1 && first
        ? first.number === null
          ? `Deleted track: ${first.name}`
          : `Track ${String(first.number)}`
        : `${String(indices.length)} tracks`,
    keys: indices.map(i => String(rows[i]?.owner ?? i)),
  }
}
