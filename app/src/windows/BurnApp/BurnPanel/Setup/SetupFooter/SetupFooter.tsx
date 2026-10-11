import type { FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { Button } from '@/windows/BurnApp/BurnPanel/Button'
import { commonStyles } from '@/windows/BurnApp/BurnPanel/commonStyles'
import { Modal } from '@/windows/BurnApp/BurnPanel/Modal'
import { useBurnSetup } from '@/windows/BurnApp/BurnPanel/Setup/useBurnSetup'
import { useBurnTheme } from '@/windows/BurnApp/BurnPanel/useBurnTheme'

import { useBurnStart } from './useBurnStart'

/**
 * Whether it fits, why it can't start (or the error), the burn button, and
 * the question whether to erase a CD-RW.
 */
export const SetupFooter: FC = () => {
  const th = useBurnTheme()
  const { options, error } = useBurnSetup()
  const { ready } = options
  const { burn, confirmingErase, confirmErase, cancelErase } = useBurnStart()
  // A fragment: the modal covers the whole setup, not just the footer.
  return (
    <>
      <View style={[styles.footer, { borderColor: th.border }]}>
        <View style={commonStyles.flex}>
          <Text
            style={[commonStyles.small, { color: th.text }]}
            testID="burn-fit"
          >
            {options.fit}
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
          label={options.action}
          accent
          disabled={!ready.ok}
          onPress={burn}
          testID="burn-start"
        />
      </View>
      {confirmingErase && (
        <Modal
          title="Erase the CD-RW?"
          body="Everything on it is erased before burning."
          action="Erase and Burn"
          onCancel={cancelErase}
          onConfirm={confirmErase}
        />
      )}
    </>
  )
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    paddingTop: 8,
  },
})
