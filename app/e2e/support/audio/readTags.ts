import {
  isBoolean,
  isNullable,
  isNumber,
  isOneOf,
  isShape,
  isString,
} from '@/shared/utils/guards'

import { probe } from './probe'

/** An MP3's ID3 tag, as core/crates/probe reads it from the file. */
export type Tags = {
  readonly version: '2.2' | '2.3' | '2.4'
  readonly title: string | null
  readonly artist: string | null
  readonly album: string | null
  readonly albumArtist: string | null
  readonly year: string | null
  readonly track: number | null
  readonly genre: string | null
  readonly comment: string | null
  readonly hasCover: boolean
}

const isTags = isShape<Tags>({
  version: isOneOf('2.2', '2.3', '2.4'),
  title: isNullable(isString),
  artist: isNullable(isString),
  album: isNullable(isString),
  albumArtist: isNullable(isString),
  year: isNullable(isString),
  track: isNullable(isNumber),
  genre: isNullable(isString),
  comment: isNullable(isString),
  hasCover: isBoolean,
})

/** Reads the ID3 tag of the MP3 at `path`. */
export const readTags = async (path: string): Promise<Tags> => {
  const output = await probe('tags', path)
  const tags = [JSON.parse(output)].find(isTags)
  if (!tags) {
    throw new TypeError(`Unexpected probe output: ${output}`)
  }
  return tags
}
