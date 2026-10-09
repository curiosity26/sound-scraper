import {
  applyProposals,
  stepIn,
  addSplice,
  adjacentSplice,
  clampZoom,
  deletedAt,
  deleteRegion,
  editsFromJson,
  editsToJson,
  emptyEdits,
  formatTime,
  history,
  moveSplice,
  removeSplice,
  renameSplice,
  restoreRegion,
  rulerSteps,
  snap,
  zoomScroll,
} from '../src/editorModel'

test('splices stay sorted and get default names', () => {
  let e = emptyEdits('Album')
  const a = addSplice(e, 5000)
  e = a.edits
  expect(e.splices[0].name).toBe('Track 2')
  const b = addSplice(e, 2000)
  e = b.edits
  expect(e.splices.map(s => s.atMs)).toEqual([2000, 5000])
  expect(b.edits.splices[0].name).toBe('Track 2')
  e = moveSplice(e, b.id, 9000)
  expect(e.splices.map(s => s.atMs)).toEqual([5000, 9000])
  e = renameSplice(e, a.id, 'Song')
  expect(e.splices[0].name).toBe('Song')
  expect(adjacentSplice(e, 6000, 1)?.atMs).toBe(9000)
  expect(adjacentSplice(e, 6000, -1)?.atMs).toBe(5000)
  e = removeSplice(e, a.id)
  expect(e.splices).toHaveLength(1)
})

test('deleted regions merge and restore', () => {
  let e = emptyEdits('x')
  e = deleteRegion(e, 3000, 1000)
  e = deleteRegion(e, 5000, 6000)
  e = deleteRegion(e, 2500, 5500)
  expect(e.deleted.map(r => [r.startMs, r.endMs])).toEqual([[1000, 6000]])
  expect(deletedAt(e, 4000)).toBeDefined()
  expect(deletedAt(e, 6000)).toBeUndefined()
  e = restoreRegion(e, e.deleted[0].id)
  expect(e.deleted).toEqual([])
})

test('json round trip drops ids and survives junk', () => {
  const e = addSplice(deleteRegion(emptyEdits('A'), 1, 2), 10, 'B').edits
  const back = editsFromJson(editsToJson(e), 'ignored')
  expect(JSON.parse(editsToJson(back))).toEqual(JSON.parse(editsToJson(e)))
  expect(editsFromJson('null', 'T')).toEqual(emptyEdits('T'))
  expect(editsFromJson('{bad', 'T')).toEqual(emptyEdits('T'))
})

test('undo and redo', () => {
  let h = history.start(emptyEdits('a'))
  const one = addSplice(h.present, 1).edits
  h = history.push(h, one)
  h = history.push(h, removeSplice(one, one.splices[0].id))
  h = history.undo(h)
  expect(h.present).toBe(one)
  h = history.undo(h)
  expect(h.present.splices).toHaveLength(0)
  h = history.redo(h)
  expect(h.present).toBe(one)
  expect(history.push(h, h.present)).toBe(h)
})

test('ruler steps follow the zoom', () => {
  expect(rulerSteps(1000)).toEqual({ major: 120_000, minor: 30_000 })
  expect(rulerSteps(10)).toEqual({ major: 1000, minor: 200 })
  expect(rulerSteps(0.1)).toEqual({ major: 10, minor: 2 })
  expect(snap(1234, 200)).toBe(1200)
})

test('times format to the step', () => {
  expect(formatTime(65_000)).toBe('1:05')
  expect(formatTime(65_250, 100)).toBe('1:05.3')
  expect(formatTime(65_250, 1)).toBe('1:05.250')
  expect(formatTime(3_725_000)).toBe('1:02:05')
  expect(formatTime(59_999)).toBe('1:00')
})

test('zoom limits and anchoring', () => {
  expect(clampZoom(1e9, 60_000, 600)).toBe(100)
  expect(clampZoom(0.001, 60_000, 600)).toBe(0.1)
  // 30 s was 300 pt in: zooming to 50 ms/pt keeps it there.
  expect(zoomScroll(30_000, 300, 50)).toBe(300)
})

test('proposals become splices, skipping ones near existing splices', () => {
  const start = addSplice(emptyEdits('A'), 60_000, 'Kept').edits
  const e = applyProposals(start, [
    { atMs: 30_000, delete: [29_000, 29_800] },
    { atMs: 61_000, delete: null },
    { atMs: 90_000, delete: null },
  ])
  expect(e.splices.map(s => [s.atMs, s.name])).toEqual([
    [30_000, 'Track 2'],
    [60_000, 'Kept'],
    [90_000, 'Track 4'],
  ])
  expect(e.deleted.map(r => [r.startMs, r.endMs])).toEqual([[29_000, 29_800]])
})

test('stepping through a list of values', () => {
  const list = [1, 5, 10]
  expect(stepIn(list, 5, 1)).toBe(10)
  expect(stepIn(list, 5, -1)).toBe(1)
  expect(stepIn(list, 10, 1)).toBe(10)
  expect(stepIn(list, 7, 1)).toBe(10)
  expect(stepIn(list, 7, -1)).toBe(5)
})
