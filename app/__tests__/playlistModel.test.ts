import type { Recording } from '../src/native/SoundScraper'
import {
  capacitySummary,
  capacityText,
  discCapacity,
  filterPlaylistRows,
  moveBy,
  moveItems,
  playlistRows,
  SECTORS_74,
  SECTORS_80,
  sortPlaylistRows,
  trackSectors,
} from '../src/playlistModel'

function rec(fileName: string, durationMs: number, extra = {}): Recording {
  return {
    fileName,
    path: `/r/${fileName}`,
    title: fileName,
    artist: null,
    album: null,
    durationMs,
    sizeBytes: 1,
    recordedAtMs: 0,
    ...extra,
  }
}

const minutes = (m: number) => m * 60_000

test('rows mark missing recordings and number from 1', () => {
  const rows = playlistRows(
    [
      { id: 7, fileName: 'a.mp3' },
      { id: 8, fileName: 'gone.mp3' },
      { id: 9, fileName: 'a.mp3' },
    ],
    [rec('a.mp3', 1000)],
  )
  expect(rows.map(r => [r.position, r.recording?.fileName])).toEqual([
    [1, 'a.mp3'],
    [2, undefined],
    [3, 'a.mp3'],
  ])
})

test('moving items keeps them together and in order', () => {
  const order = [1, 2, 3, 4, 5]
  expect(moveItems(order, [4], 0)).toEqual([4, 1, 2, 3, 5])
  expect(moveItems(order, [1], 5)).toEqual([2, 3, 4, 5, 1])
  expect(moveItems(order, [2, 4], 1)).toEqual([1, 2, 4, 3, 5])
  expect(moveItems(order, [4, 2], 5)).toEqual([1, 3, 5, 2, 4])
  expect(moveItems(order, [3], 3)).toEqual(order)
  expect(moveBy(order, [3], -1)).toEqual([1, 3, 2, 4, 5])
  expect(moveBy(order, [3], 1)).toEqual([1, 2, 4, 3, 5])
  expect(moveBy(order, [1], -1)).toEqual(order)
  expect(moveBy(order, [5], 1)).toEqual(order)
  expect(moveBy(order, [2, 3], 1)).toEqual([1, 4, 2, 3, 5])
})

test('search and sort leave missing rows last', () => {
  const rows = playlistRows(
    [
      { id: 1, fileName: 'b.mp3' },
      { id: 2, fileName: 'gone.mp3' },
      { id: 3, fileName: 'a.mp3' },
    ],
    [rec('a.mp3', 2000), rec('b.mp3', 1000, { artist: 'Miles' })],
  )
  const names = (rs: typeof rows) => rs.map(r => r.item.fileName)
  expect(
    names(sortPlaylistRows(rows, { key: 'position', ascending: true })),
  ).toEqual(['b.mp3', 'gone.mp3', 'a.mp3'])
  expect(
    names(sortPlaylistRows(rows, { key: 'name', ascending: true })),
  ).toEqual(['a.mp3', 'b.mp3', 'gone.mp3'])
  expect(names(filterPlaylistRows(rows, 'miles'))).toEqual(['b.mp3'])
  expect(names(filterPlaylistRows(rows, 'gone'))).toEqual(['gone.mp3'])
})

test('tracks round up to sectors and are at least 4 seconds', () => {
  expect(trackSectors(1000)).toBe(300)
  expect(trackSectors(10_000)).toBe(750)
  expect(trackSectors(10_001)).toBe(751)
})

test('capacity counts the pregap and the gaps between tracks', () => {
  const rows = playlistRows(
    [
      { id: 1, fileName: 'a.mp3' },
      { id: 2, fileName: 'b.mp3' },
    ],
    [rec('a.mp3', minutes(30)), rec('b.mp3', minutes(30))],
  )
  const c = discCapacity(rows)
  // 2 s pregap + 30 min + 2 s gap + 30 min.
  expect(c.totalSectors).toBe(150 + 135_000 + 150 + 135_000)
  expect(c.gapSectors).toBe(300)
  expect(c.fit).toBe('fits74')
  expect(capacityText(c)).toBe('Fits a 74-minute CD with 13:56 to spare')
  expect(capacitySummary(c)).toBe('2 tracks · 60:00 (+0:04 gaps)')
  expect(discCapacity(rows, 0).totalSectors).toBe(150 + 270_000)
})

test('the 74 and 80 minute edges, too long and too many', () => {
  const one = (ms: number) =>
    discCapacity(
      playlistRows([{ id: 1, fileName: 'a.mp3' }], [rec('a.mp3', ms)]),
    )
  const pregap = 150
  expect(one(((SECTORS_74 - pregap) * 1000) / 75).fit).toBe('fits74')
  expect(one(((SECTORS_74 - pregap + 1) * 1000) / 75).fit).toBe('fits80')
  expect(one(((SECTORS_80 - pregap) * 1000) / 75).fit).toBe('fits80')
  const over = one(((SECTORS_80 - pregap + 75 * 61) * 1000) / 75)
  expect(over.fit).toBe('tooLong')
  expect(over.firstOver).toBe(0)
  expect(capacityText(over)).toBe(
    '1:01 too long for a CD: remove a track or two',
  )

  const many = Array.from({ length: 100 }, (_, i) => ({
    id: i,
    fileName: 'a.mp3',
  }))
  const c = discCapacity(playlistRows(many, [rec('a.mp3', 5000)]))
  expect(c.fit).toBe('tooMany')
  expect(capacityText(c)).toBe('100 tracks: a CD holds at most 99')
})

test('the first track past 80 minutes is found; missing rows are skipped', () => {
  const rows = playlistRows(
    [
      { id: 1, fileName: 'a.mp3' },
      { id: 2, fileName: 'gone.mp3' },
      { id: 3, fileName: 'b.mp3' },
      { id: 4, fileName: 'c.mp3' },
    ],
    [
      rec('a.mp3', minutes(40)),
      rec('b.mp3', minutes(39)),
      rec('c.mp3', minutes(5)),
    ],
  )
  const c = discCapacity(rows)
  expect(c.missing).toBe(1)
  expect(c.tracks).toBe(3)
  expect(c.fit).toBe('tooLong')
  expect(c.firstOver).toBe(3)
  expect(capacitySummary(c)).toContain('1 missing')
})
