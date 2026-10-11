import type { FC } from 'react'

import { Check } from './Check'
import { Choice } from './Choice'
import { useBurnSetup } from './useBurnSetup'

/** The speed, gaps, CD-Text, test write and eject options that apply. */
export const BurnOptions: FC = () => {
  const { options } = useBurnSetup()
  return (
    <>
      {options.speedOptions && (
        <Choice
          label="Speed"
          value={String(options.speed)}
          options={options.speedOptions}
          onChange={v => {
            options.setSpeed(Number(v))
          }}
        />
      )}
      <Choice
        label="Gaps"
        value={String(options.gap)}
        options={options.gapOptions}
        onChange={v => {
          options.setGap(Number(v))
        }}
      />
      {options.showCdText && (
        <Check
          label="CD-Text: write titles and artists"
          value={options.cdText}
          onChange={options.setCdText}
        />
      )}
      {options.showTestWrite && (
        <Check
          label="Test write: everything but the burn (laser off)"
          value={options.testWrite}
          onChange={options.setTestWrite}
        />
      )}
      {options.showEject && (
        <Check
          label="Eject the disc when done"
          value={options.eject}
          onChange={options.setEject}
        />
      )}
    </>
  )
}
