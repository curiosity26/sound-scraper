import type { FC } from 'react'

import { useDetailsPane } from '@/features/tags/components/DetailsPane/useDetailsPane'
import { TEXT_FIELDS } from '@/features/tags/constants'
import type { Field, Merged } from '@/features/tags/types'

import { InlineField } from './InlineField'

const FIELD_LABELS: Record<Field, string> = {
  title: 'Title',
  artist: 'Artist',
  album: 'Album',
  albumArtist: 'Album artist',
  date: 'Year / date',
  track: 'Track #',
  genre: 'Genre',
  comment: 'Comment',
}

export type TagFieldsProps = {
  /** The selected recordings' shared tag values. */
  readonly merged: Record<Field, Merged>
}

/** A field for each text tag, saved to every selected recording. */
export const TagFields: FC<TagFieldsProps> = props => {
  const { fileNames, saveField } = useDetailsPane()
  const key = fileNames.join('\u0000')
  return TEXT_FIELDS.map(field => {
    const m = props.merged[field]
    return (
      <InlineField
        key={`${key}-${field}`}
        label={FIELD_LABELS[field]}
        value={m.kind === 'value' ? m.text : ''}
        mixed={m.kind === 'mixed'}
        multiline={field === 'comment'}
        onCommit={text => saveField(field, text)}
      />
    )
  })
}
