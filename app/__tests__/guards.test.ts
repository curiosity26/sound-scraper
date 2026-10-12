import { expect, test } from 'vitest'

import {
  isArrayOf,
  isEither,
  isNullable,
  isNumber,
  isOneOf,
  isOptional,
  isShape,
  isString,
} from '@/shared/utils/guards'

type Track = {
  title: string
  artist: string | null
  durationMs: number
  tags?: string[]
  kind: 'mp3' | 'wav'
}

const isTrack = isShape<Track>({
  title: isString,
  artist: isNullable(isString),
  durationMs: isNumber,
  tags: isOptional(isArrayOf(isString)),
  kind: isOneOf('mp3', 'wav'),
})

test('a shape guard checks every field', () => {
  const ok = { title: 'a', artist: null, durationMs: 1, kind: 'mp3' }
  expect(isTrack(ok)).toBe(true)
  expect(isTrack({ ...ok, tags: ['x'] })).toBe(true)
  expect(isTrack({ ...ok, kind: 'ogg' })).toBe(false)
  expect(isTrack({ ...ok, durationMs: '1' })).toBe(false)
  expect(isTrack({ ...ok, tags: [1] })).toBe(false)
  expect(isTrack(null)).toBe(false)
  expect(isEither(isString, isNumber)(2)).toBe(true)
})
