/**
 * @format
 */

import React from 'react'
import ReactTestRenderer from 'react-test-renderer'

import { App } from '@/App'
import { formatElapsed } from '@/recorder/formatElapsed'

jest.mock('@/native/NativeSoundScraper', () => ({
  __esModule: true,
  default: {
    getVersion: () => '0.0.0-test',
    listAudioApps: () => [],
    recordTestWav: jest.fn(),
    recorderStart: jest.fn(() => Promise.resolve()),
    recorderPause: jest.fn(),
    recorderResume: jest.fn(),
    recorderStop: jest.fn(() => Promise.resolve('/tmp/x.mp3')),
    recorderState: () => 'idle',
    recoverPartialRecordings: () => 0,
    onRecorderEvent: () => ({ remove: jest.fn() }),
    onLibraryChanged: () => ({ remove: jest.fn() }),
    listRecordings: jest.fn(() => Promise.resolve([])),
    renameRecording: jest.fn(),
    trashRecording: jest.fn(),
    revealRecording: jest.fn(),
    readTags: jest.fn(),
    writeTags: jest.fn(),
    pickImage: jest.fn(),
    getSettings: () =>
      JSON.stringify({
        recordingsDir: null,
        effectiveRecordingsDir: '/tmp',
        quality: 'cbr192',
        id3Version: '2.4',
        lastSource: null,
      }),
    setSettings: jest.fn(() => Promise.resolve()),
    pickFolder: jest.fn(),
  },
}))

test('renders the core version and an idle record bar', async () => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<App />)
  })
  const version = tree!.root.findByProps({ testID: 'core-version' })
  expect(version.props.children.join('')).toBe('Rust core v0.0.0-test')
  expect(
    tree!.root.findAllByProps({ testID: 'record' }).length,
  ).toBeGreaterThan(0)
  // Unmount so list timers can't fire after the test ends (jest then
  // fails the run with "Cannot log after tests are done").
  await ReactTestRenderer.act(() => {
    tree!.unmount()
  })
})

test('formats elapsed time', () => {
  expect(formatElapsed(0)).toBe('0:00.0')
  expect(formatElapsed(65_432)).toBe('1:05.4')
  expect(formatElapsed(65_432, false)).toBe('01:05')
  expect(formatElapsed(6_065_432, false)).toBe('101:05')
})

describe('library model', () => {
  const { filterRecordings } = require('@/library/filterRecordings')
  const { sortRecordings } = require('@/library/sortRecordings')
  const { nextSort } = require('@/library/nextSort')
  const { formatDuration } = require('@/library/formatDuration')
  const { formatSize } = require('@/library/formatSize')
  const rec = (fileName: string, extra: object = {}) => ({
    fileName,
    path: `/x/${fileName}`,
    title: fileName.replace('.mp3', ''),
    artist: null,
    album: null,
    durationMs: 1000,
    sizeBytes: 1000,
    recordedAtMs: 0,
    ...extra,
  })
  const items = [
    rec('b.mp3', { durationMs: 3000, recordedAtMs: 2, artist: 'Zed' }),
    rec('A.mp3', { durationMs: 1000, recordedAtMs: 3, album: 'Live' }),
    rec('c.mp3', { durationMs: 2000, recordedAtMs: 1 }),
  ]
  const names = (xs: { fileName: string }[]) => xs.map(x => x.fileName)

  test('filters by name, artist and album', () => {
    expect(names(filterRecordings(items, 'zed'))).toEqual(['b.mp3'])
    expect(names(filterRecordings(items, 'LIVE'))).toEqual(['A.mp3'])
    expect(filterRecordings(items, '  ')).toHaveLength(3)
  })

  test('sorts by column and direction', () => {
    expect(
      names(sortRecordings(items, { key: 'date', ascending: false })),
    ).toEqual(['A.mp3', 'b.mp3', 'c.mp3'])
    expect(
      names(sortRecordings(items, { key: 'name', ascending: true })),
    ).toEqual(['A.mp3', 'b.mp3', 'c.mp3'])
    expect(
      names(sortRecordings(items, { key: 'duration', ascending: true })),
    ).toEqual(['A.mp3', 'c.mp3', 'b.mp3'])
    expect(nextSort({ key: 'date', ascending: false }, 'date')).toEqual({
      key: 'date',
      ascending: true,
    })
    expect(nextSort({ key: 'date', ascending: false }, 'name').ascending).toBe(
      true,
    )
  })

  test('formats duration and size', () => {
    expect(formatDuration(65_400)).toBe('1:05')
    expect(formatDuration(3_725_000)).toBe('1:02:05')
    expect(formatSize(2_500_000)).toBe('2.4 MB')
    expect(formatSize(300)).toBe('1 KB')
  })
})

describe('tag model', () => {
  const { mergeTags } = require('@/tags/mergeTags')
  const { mergeCovers } = require('@/tags/mergeCovers')
  const { buildEdit } = require('@/tags/buildEdit')
  const { validateTag } = require('@/tags/validateTag')
  const { coverUri } = require('@/tags/coverUri')
  const tags = (extra: object = {}) => ({
    title: null,
    artist: null,
    album: null,
    albumArtist: null,
    date: null,
    genre: null,
    comment: null,
    track: null,
    coverPath: null,
    ...extra,
  })

  test('merges shared and mixed values', () => {
    const m = mergeTags([
      tags({ title: 'A', album: 'Same', track: 1 }),
      tags({ title: 'B', album: 'Same', track: 1 }),
    ])
    expect(m.title).toEqual({ kind: 'mixed' })
    expect(m.album).toEqual({ kind: 'value', text: 'Same' })
    expect(m.track).toEqual({ kind: 'value', text: '1' })
    expect(m.artist).toEqual({ kind: 'value', text: '' })
    expect(
      mergeCovers([
        tags({ coverPath: '/c.png' }),
        tags({ coverPath: '/c.png' }),
      ]),
    ).toEqual({
      kind: 'image',
      path: '/c.png',
    })
    expect(mergeCovers([tags({ coverPath: '/c.png' }), tags()]).kind).toBe(
      'mixed',
    )
  })

  test('builds an edit for only the changed fields', () => {
    const e = buildEdit(
      { album: ' New ', artist: '', track: '7' },
      { kind: 'keep' },
      false,
    )
    expect(e.fields).toEqual(['artist', 'album', 'track'])
    expect(e.album).toBe('New')
    expect(e.artist).toBeNull()
    expect(e.track).toBe(7)
    expect(e.cover).toBe('keep')
    const c = buildEdit({}, { kind: 'set', path: 'C:\\x.png' }, true)
    expect(c.fields).toEqual([])
    expect([c.cover, c.coverPath, c.id3v23]).toEqual(['set', 'C:\\x.png', true])
  })

  test('validates track and date and builds file URIs', () => {
    expect(validateTag('track', '12')).toBeNull()
    expect(validateTag('track', 'x')).not.toBeNull()
    expect(validateTag('date', '2026-10')).toBeNull()
    expect(validateTag('date', '10/3/2026')).not.toBeNull()
    expect(coverUri('/Users/a/My Cover.png')).toBe(
      'file:///Users/a/My%20Cover.png',
    )
    expect(coverUri('C:\\covers\\a.png')).toBe('file:///C:/covers/a.png')
  })
})
