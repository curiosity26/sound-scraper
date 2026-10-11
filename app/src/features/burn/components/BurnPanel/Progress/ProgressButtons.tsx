import { type FC, useState } from 'react'
import { Platform, View } from 'react-native'

import { Button } from '@/features/burn/components/BurnPanel/Button'
import { commonStyles } from '@/features/burn/components/BurnPanel/commonStyles'
import { Modal } from '@/features/burn/components/BurnPanel/Modal'

import { useBurnProgress } from './useBurnProgress'

const REVEAL = Platform.OS === 'windows' ? 'Show in Explorer' : 'Show in Finder'

/**
 * Cancel while it runs (asking before stopping a CD-R part way), then
 * reveal, again, save the log and close.
 */
export const ProgressButtons: FC = () => {
  const {
    status,
    running,
    image,
    output,
    close,
    again,
    saveLog,
    cancel,
    reveal,
  } = useBurnProgress()
  // Asking before stopping a CD-R part way.
  const [confirm, setConfirm] = useState(false)
  const stop = () => {
    setConfirm(false)
    cancel()
  }
  // A fragment: the modal covers the whole panel, not just the buttons.
  return (
    <>
      <View style={commonStyles.buttons}>
        {running ? (
          <Button
            label="Cancel"
            onPress={() => {
              if (image || status?.state === 'preparing') {
                stop()
              } else {
                setConfirm(true)
              }
            }}
            testID="burn-cancel"
          />
        ) : (
          <>
            {output ? <Button label={REVEAL} onPress={reveal} /> : null}
            {status?.state === 'done' && !image && (
              <Button label="Burn Another Copy" onPress={again} />
            )}
            {(status?.state === 'failed' || status?.state === 'cancelled') && (
              <Button label="Try Again" onPress={again} />
            )}
            <Button label="Save Log…" onPress={saveLog} />
            <Button label="Close" accent onPress={close} testID="burn-close" />
          </>
        )}
      </View>
      {confirm && (
        <Modal
          title="Stop burning?"
          body="A CD-R stopped part way can't be used again."
          action="Stop"
          onCancel={() => {
            setConfirm(false)
          }}
          onConfirm={stop}
        />
      )}
    </>
  )
}
