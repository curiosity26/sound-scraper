import {
  type Device,
  fitLine,
  formatClock,
  readiness,
  speedText,
} from '../src/burnModel'
import { discCapacity, playlistRows, SECTORS_74 } from '../src/playlistModel'

jest.mock('../src/native/NativeSoundScraper', () => ({
  __esModule: true,
  default: {},
}))

function device(
  state: string,
  capacity: number | null,
  kind = 'drive',
): Device {
  return {
    id: 'd',
    name: 'Drive',
    kind,
    media: { state, kind: 'CD-R', capacity, label: 'label' },
    speeds: [],
    canTest: true,
    gapless: true,
    cdText: true,
  }
}

const minutes = (m: number) =>
  discCapacity(
    playlistRows(
      [{ id: 1, fileName: 'a.mp3' }],
      [
        {
          fileName: 'a.mp3',
          path: '/a.mp3',
          title: 'a',
          artist: null,
          album: null,
          durationMs: m * 60_000,
          sizeBytes: 1,
          recordedAtMs: 0,
        },
      ],
    ),
  )

test('what the burn button says and when it works', () => {
  expect(readiness(device('blank', SECTORS_74), minutes(60))).toEqual({
    ok: true,
    action: 'Burn',
  })
  expect(readiness(device('erasable', SECTORS_74), minutes(60)).action).toBe(
    'Erase and Burn',
  )
  expect(readiness(device('image', 359_775, 'image'), minutes(60)).action).toBe(
    'Save Image…',
  )
  expect(readiness(device('none', null), minutes(60))).toMatchObject({
    ok: false,
    reason: 'Insert a blank CD-R or CD-RW.',
  })
  expect(readiness(device('blank', SECTORS_74), minutes(76)).reason).toBe(
    '2:02 too long for this 74-minute disc. Use an 80-minute CD-R.',
  )
  expect(readiness(undefined, minutes(1)).ok).toBe(false)
})

test('fit line, clock and speed', () => {
  expect(fitLine(device('blank', SECTORS_74), minutes(60))).toBe(
    '60:02 with gaps · fits (13:58 free)',
  )
  expect(fitLine(device('none', null), minutes(60))).toBe('60:02 with gaps')
  expect(formatClock(65_400)).toBe('1:05')
  expect(formatClock(3_725_000)).toBe('1:02:05')
  expect(speedText(24)).toBe('24x (4,234 KB/s)')
  expect(speedText(null)).toBeNull()
})
