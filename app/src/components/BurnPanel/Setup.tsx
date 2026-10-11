import { type FC, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'

import type { BurnTheme, Target } from '@/burn/types'

import { Button } from './Button'
import { Check } from './Check'
import { Choice } from './Choice'
import { commonStyles } from './commonStyles'
import { DeviceList } from './DeviceList'
import { Label } from './Label'
import { Modal } from './Modal'
import { SimulatorSettings } from './SimulatorSettings'
import { useBurnDevices } from './useBurnDevices'
import { useBurnSetup } from './useBurnSetup'
import { useBurnStart } from './useBurnStart'

export type SetupProps = {
  readonly th: BurnTheme
  readonly target: Target
}

/** Where and how to burn `target`, and the button that starts it. */
export const Setup: FC<SetupProps> = props => {
  const { th, target } = props
  // Shown in the footer: from polling the devices or from starting.
  const [error, setError] = useState<string>()
  const { devices, deviceId, device, selectDevice, sim, changeSim } =
    useBurnDevices(setError)
  const setup = useBurnSetup(target, device)
  const { capacity, ready } = setup
  const { burn, confirmingErase, confirmErase, cancelErase } = useBurnStart({
    target,
    device,
    setup,
    setError,
  })

  const fg = { color: th.text }
  return (
    <View style={commonStyles.root}>
      <ScrollView
        style={commonStyles.flex}
        contentContainerStyle={styles.setup}
      >
        <Text style={[commonStyles.heading, fg]} numberOfLines={1}>
          “{target.name}” · {capacity.tracks}{' '}
          {capacity.tracks === 1 ? 'track' : 'tracks'}
        </Text>

        <Label th={th} text="Write to" />
        <DeviceList
          th={th}
          devices={devices}
          deviceId={deviceId}
          onSelect={selectDevice}
        />

        {device?.id === 'sim' && sim && (
          <SimulatorSettings
            th={th}
            sim={sim}
            tracks={capacity.tracks}
            onChange={changeSim}
          />
        )}

        {setup.speedOptions && (
          <Choice
            th={th}
            label="Speed"
            value={String(setup.speed)}
            options={setup.speedOptions}
            onChange={v => {
              setup.setSpeed(Number(v))
            }}
          />
        )}
        <Choice
          th={th}
          label="Gaps"
          value={String(setup.gap)}
          options={setup.gapOptions}
          onChange={v => {
            setup.setGap(Number(v))
          }}
        />
        {setup.showCdText && (
          <Check
            th={th}
            label="CD-Text: write titles and artists"
            value={setup.cdText}
            onChange={setup.setCdText}
          />
        )}
        {setup.showTestWrite && (
          <Check
            th={th}
            label="Test write: everything but the burn (laser off)"
            value={setup.testWrite}
            onChange={setup.setTestWrite}
          />
        )}
        {setup.showEject && (
          <Check
            th={th}
            label="Eject the disc when done"
            value={setup.eject}
            onChange={setup.setEject}
          />
        )}
      </ScrollView>

      <View style={[styles.footer, { borderColor: th.border }]}>
        <View style={commonStyles.flex}>
          <Text style={[commonStyles.small, fg]} testID="burn-fit">
            {setup.fit}
          </Text>
          {(error || ready.reason) && (
            <Text
              style={[
                commonStyles.small,
                error ? commonStyles.error : { color: th.dim },
              ]}
            >
              {error ?? ready.reason}
            </Text>
          )}
        </View>
        <Button
          th={th}
          label={setup.action}
          accent
          disabled={!ready.ok}
          onPress={burn}
          testID="burn-start"
        />
      </View>
      {confirmingErase && (
        <Modal
          th={th}
          title="Erase the CD-RW?"
          body="Everything on it is erased before burning."
          action="Erase and Burn"
          onCancel={cancelErase}
          onConfirm={confirmErase}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  setup: { gap: 8, paddingBottom: 8 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    paddingTop: 8,
  },
})
