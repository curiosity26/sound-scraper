import { describe, expect, it } from 'vitest'

import {
  addSplice,
  adjacentSplice,
  applyProposals,
  clampZoom,
  deletedAt,
  deleteRegion,
  editsFromList,
  type Edits,
  editsToJson,
  emptyEdits,
  formatTime,
  hasEdits,
  history,
  moveSplice,
  removeSplice,
  renameSplice,
  restoreRegion,
  rulerSteps,
  snap,
  zoomScroll,
} from '@/features/editor/components/EditorPanel/model'

const spliceTimes = (e: Edits) => e.splices.map(s => s.atMs)

describe("the track editor's edit list", () => {
  describe('given a recording with no edits', () => {
    const start = emptyEdits('Album')

    it('has no edits', () => {
      expect(hasEdits(start)).toBe(false)
    })

    describe('when a splice is added', () => {
      it('names the track it starts "Track 2"', () => {
        expect(addSplice(start, 5000).edits.splices[0]?.name).toBe('Track 2')
      })

      it('has edits', () => {
        expect(hasEdits(addSplice(start, 5000).edits)).toBe(true)
      })
    })

    describe('when a splice is added with a name', () => {
      it('keeps that name', () => {
        expect(addSplice(start, 5000, 'Intro').edits.splices[0]?.name).toBe(
          'Intro',
        )
      })
    })
  })

  describe('given a splice at 0:05', () => {
    const { edits: oneSplice, id } = addSplice(emptyEdits('Album'), 5000)

    describe('when a splice is added before it', () => {
      const { edits } = addSplice(oneSplice, 2000)

      it('keeps the splices in time order', () => {
        expect(spliceTimes(edits)).toEqual([2000, 5000])
      })

      it('names the new one after the track it starts', () => {
        expect(edits.splices[0]?.name).toBe('Track 2')
      })
    })

    describe('when a splice is added after it', () => {
      it('names the new one after the track it starts', () => {
        expect(addSplice(oneSplice, 9000).edits.splices[1]?.name).toBe(
          'Track 3',
        )
      })
    })

    describe('when it is renamed', () => {
      it('takes the new name', () => {
        expect(renameSplice(oneSplice, id, 'Song').splices[0]?.name).toBe(
          'Song',
        )
      })
    })

    describe('when it is removed', () => {
      it('leaves no splices', () => {
        expect(removeSplice(oneSplice, id).splices).toEqual([])
      })
    })
  })

  describe('given splices at 0:02 and 0:05', () => {
    const first = addSplice(emptyEdits('Album'), 2000)
    const { edits } = addSplice(first.edits, 5000)

    describe('when the first is moved past the second', () => {
      it('keeps the splices in time order', () => {
        expect(spliceTimes(moveSplice(edits, first.id, 9000))).toEqual([
          5000, 9000,
        ])
      })
    })

    describe('when looking for the next splice from between them', () => {
      it('finds the later one', () => {
        expect(adjacentSplice(edits, 3000, 1)?.atMs).toBe(5000)
      })
    })

    describe('when looking for the previous splice from between them', () => {
      it('finds the earlier one', () => {
        expect(adjacentSplice(edits, 3000, -1)?.atMs).toBe(2000)
      })
    })

    describe('when looking for the next splice from the last one', () => {
      it('finds none', () => {
        expect(adjacentSplice(edits, 5000, 1)).toBeUndefined()
      })
    })
  })

  describe('given stretches deleted that overlap', () => {
    const edits = deleteRegion(
      deleteRegion(deleteRegion(emptyEdits('x'), 3000, 1000), 5000, 6000),
      2500,
      5500,
    )

    it('merges them into one deleted stretch', () => {
      expect(edits.deleted.map(r => [r.startMs, r.endMs])).toEqual([
        [1000, 6000],
      ])
    })

    describe('when asking about a time inside the stretch', () => {
      it('finds it deleted', () => {
        expect(deletedAt(edits, 4000)).toBeDefined()
      })
    })

    describe('when asking about the time the stretch ends', () => {
      it('finds it kept', () => {
        expect(deletedAt(edits, 6000)).toBeUndefined()
      })
    })

    describe('when the stretch is restored', () => {
      it('leaves nothing deleted', () => {
        const id = edits.deleted[0]?.id ?? -1
        expect(restoreRegion(edits, id).deleted).toEqual([])
      })
    })
  })

  describe('given a saved edit list', () => {
    const saved = {
      firstName: 'A',
      splices: [{ atMs: 10, name: 'B' }],
      deleted: [{ startMs: 1, endMs: 2 }],
    }

    describe('when it is loaded and saved again', () => {
      it('saves the same splices and deletions', () => {
        expect(editsToJson(editsFromList(saved, 'ignored'))).toBe(
          JSON.stringify(saved),
        )
      })
    })

    describe('when its first track has no name', () => {
      it("names it after the recording's title", () => {
        expect(
          editsFromList({ ...saved, firstName: ' ' }, 'Album').firstName,
        ).toBe('Album')
      })
    })
  })

  describe('given no saved edit list', () => {
    describe('when it is loaded', () => {
      it('starts with no edits, the first track named for the recording', () => {
        expect(editsFromList(null, 'T')).toEqual(emptyEdits('T'))
      })
    })
  })

  describe('given Find Tracks proposals and a splice already at 1:00', () => {
    const start = addSplice(emptyEdits('A'), 60_000, 'Kept').edits
    const proposals = [
      { atMs: 30_000, delete: null },
      { atMs: 61_000, delete: null },
      { atMs: 90_000, delete: null },
    ]

    describe('when the proposals are applied', () => {
      it('adds splices, skipping the one near the existing splice', () => {
        expect(
          applyProposals(start, proposals).splices.map(s => [s.atMs, s.name]),
        ).toEqual([
          [30_000, 'Track 2'],
          [60_000, 'Kept'],
          [90_000, 'Track 4'],
        ])
      })
    })

    describe('when a proposal comes with a gap to delete', () => {
      it('deletes the gap', () => {
        expect(
          applyProposals(start, [
            { atMs: 30_000, delete: [29_000, 29_800] },
          ]).deleted.map(r => [r.startMs, r.endMs]),
        ).toEqual([[29_000, 29_800]])
      })
    })
  })
})

describe('undo and redo', () => {
  const blank = emptyEdits('a')
  const one = addSplice(blank, 1).edits
  const none = removeSplice(one, one.splices[0]?.id ?? -1)
  const edited = history.push(history.push(history.start(blank), one), none)

  describe('given two edits', () => {
    describe('when undone once', () => {
      it('goes back to the first edit', () => {
        expect(history.undo(edited).present).toBe(one)
      })
    })

    describe('when undone twice', () => {
      it('goes back to the start', () => {
        expect(history.undo(history.undo(edited)).present).toBe(blank)
      })
    })

    describe('when undone twice and redone once', () => {
      it('comes forward to the first edit', () => {
        const back = history.undo(history.undo(edited))
        expect(history.redo(back).present).toBe(one)
      })
    })

    describe('when the same edits are pushed again', () => {
      it('adds no undo step', () => {
        expect(history.push(edited, edited.present)).toBe(edited)
      })
    })
  })

  describe('given nothing to undo', () => {
    describe('when undone', () => {
      it('stays where it is', () => {
        const fresh = history.start(blank)
        expect(history.undo(fresh)).toBe(fresh)
      })
    })
  })
})

describe('the ruler', () => {
  describe('given a zoom of 1 s per point', () => {
    it('labels every 2 minutes with ticks every 30 s', () => {
      expect(rulerSteps(1000)).toEqual({ major: 120_000, minor: 30_000 })
    })
  })

  describe('given a zoom of 10 ms per point', () => {
    it('labels every second with ticks every 200 ms', () => {
      expect(rulerSteps(10)).toEqual({ major: 1000, minor: 200 })
    })
  })

  describe('given the deepest zoom', () => {
    it('labels every 10 ms with ticks every 2 ms', () => {
      expect(rulerSteps(0.1)).toEqual({ major: 10, minor: 2 })
    })
  })

  describe('given ticks every 200 ms', () => {
    describe('when a time is snapped', () => {
      it('moves to the nearest tick', () => {
        expect(snap(1234, 200)).toBe(1200)
      })
    })
  })
})

describe('times', () => {
  describe('given whole seconds', () => {
    it('show minutes and seconds', () => {
      expect(formatTime(65_000)).toBe('1:05')
    })

    it('round to the nearest second', () => {
      expect(formatTime(59_999)).toBe('1:00')
    })

    it('show hours past an hour', () => {
      expect(formatTime(3_725_000)).toBe('1:02:05')
    })
  })

  describe('given a step of 100 ms', () => {
    it('show tenths', () => {
      expect(formatTime(65_250, 100)).toBe('1:05.3')
    })
  })

  describe('given a step of 1 ms', () => {
    it('show milliseconds', () => {
      expect(formatTime(65_250, 1)).toBe('1:05.250')
    })
  })
})

describe('zooming', () => {
  describe('given a minute of audio 600 points wide', () => {
    describe('when zoomed out past the whole recording', () => {
      it('stops where the recording fits', () => {
        expect(clampZoom(1e9, 60_000, 600)).toBe(100)
      })
    })

    describe('when zoomed in past the deepest zoom', () => {
      it('stops at the deepest zoom', () => {
        expect(clampZoom(0.001, 60_000, 600)).toBe(0.1)
      })
    })
  })

  describe('given 0:30 is 300 points into the view', () => {
    describe('when zoomed to 50 ms per point', () => {
      it('keeps 0:30 where it was on screen', () => {
        expect(zoomScroll(30_000, 300, 50)).toBe(300)
      })
    })
  })
})
