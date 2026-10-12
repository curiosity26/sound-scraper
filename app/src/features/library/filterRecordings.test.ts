import { describe, expect, it } from 'vitest'

import { recording } from '@test/fakes/NativeSoundScraper'

import { filterRecordings } from './filterRecordings'

const recordings = [
  recording('Morning.mp3', { title: 'Sunrise set', artist: 'Zed' }),
  recording('Evening.mp3', { album: 'Live at Home' }),
  recording('Night.mp3'),
]

const namesFor = (query: string) =>
  filterRecordings(recordings, query).map(r => r.fileName)

describe('searching recordings', () => {
  it('finds a recording by its file name', () => {
    expect(namesFor('night')).toEqual(['Night.mp3'])
  })

  it('finds a recording by its title', () => {
    expect(namesFor('sunrise')).toEqual(['Morning.mp3'])
  })

  it('finds a recording by its artist', () => {
    expect(namesFor('zed')).toEqual(['Morning.mp3'])
  })

  it('finds a recording by its album', () => {
    expect(namesFor('live')).toEqual(['Evening.mp3'])
  })

  it('ignores case', () => {
    expect(namesFor('LIVE AT')).toEqual(['Evening.mp3'])
  })

  it('ignores spaces around the search', () => {
    expect(namesFor('  zed  ')).toEqual(['Morning.mp3'])
  })

  it('finds every recording for a blank search', () => {
    expect(namesFor('   ')).toEqual(['Morning.mp3', 'Evening.mp3', 'Night.mp3'])
  })

  it('finds nothing when nothing matches', () => {
    expect(namesFor('jazz')).toEqual([])
  })
})
