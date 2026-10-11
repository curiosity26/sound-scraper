import type { FC } from 'react'

import { useSettingsPanel } from '@/features/settings/components/SettingsPanel/useSettingsPanel'
import { stepIn as step } from '@/shared/utils/stepIn'

import { AGES_DAYS, BUDGETS_GB, MIN_MINUTES } from './constants'
import { StepRow } from './StepRow'

/** Which recordings get a master, and how much space and time they keep. */
export const MasterLimits: FC = () => {
  const { current, save } = useSettingsPanel()
  const keep = current.keepMasters
  const minutes = current.masterMinMinutes
  const budget = current.masterBudgetGb
  const age = current.masterMaxAgeDays
  return (
    <>
      <StepRow
        label="Longer than"
        value={minutes ? `${minutes} min` : 'any length'}
        onStep={dir => {
          void save({ masterMinMinutes: step(MIN_MINUTES, minutes, dir) })
        }}
        disabled={!keep}
      />
      <StepRow
        label="Use at most"
        value={`${budget} GB`}
        onStep={dir => {
          void save({ masterBudgetGb: step(BUDGETS_GB, budget, dir) })
        }}
        disabled={!keep}
      />
      <StepRow
        label="Keep for"
        value={`${age} days`}
        onStep={dir => {
          void save({ masterMaxAgeDays: step(AGES_DAYS, age, dir) })
        }}
        disabled={!keep}
      />
    </>
  )
}
