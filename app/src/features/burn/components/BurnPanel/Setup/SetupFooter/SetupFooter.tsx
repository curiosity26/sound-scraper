import type { FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { Button } from '@/features/burn/components/BurnPanel/Button'
import { commonStyles } from '@/features/burn/components/BurnPanel/commonStyles'
import { Modal } from '@/features/burn/components/BurnPanel/Modal'
import { useBurnSetup } from '@/features/burn/components/BurnPanel/Setup/useBurnSetup'
import { useBurnTheme } from '@/features/burn/components/BurnPanel/useBurnTheme'

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
          <Text style={[commonStyles.small, { color: th.text }]}>
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
