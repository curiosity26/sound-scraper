// The app's text box: React Native's TextInput, with a workaround for
// React Native Windows, which mis-centres a single-line box's text (it lands
// in the bottom half and is clipped) but top-aligns a multiline one. There,
// single-line fields are multiline boxes limited to one line that still
// submit (and blur) on Enter (a multiline box there ignores submitBehavior
// and submits only on its submitKeyEvents). Its placeholder there is drawn
// near-black whatever the text color, so it gets the text color, faded, as
// on macOS.
// Use this instead of TextInput everywhere.
import type { FC, Ref } from 'react'
import {
  Platform,
  StyleSheet,
  TextInput,
  type TextInputProps,
} from 'react-native'

import { withAlpha } from '@/shared/utils/withAlpha'

/** React Native Windows' (and macOS's) key that submits a multiline box. */
type SubmitKeyEvent = { readonly key: string }

const windowsSingleLine: Partial<TextInputProps> & {
  readonly submitKeyEvents: readonly SubmitKeyEvent[]
} = {
  multiline: true,
  numberOfLines: 1,
  submitBehavior: 'blurAndSubmit',
  submitKeyEvents: [{ key: 'Enter' }],
}

export type TextFieldProps = TextInputProps & {
  readonly ref?: Ref<TextInput>
}

// React 19 passes `ref` as a regular prop, so no forwardRef.
export const TextField: FC<TextFieldProps> = props => {
  const windows = Platform.OS === 'windows'
  const fix = windows && !props.multiline ? windowsSingleLine : null
  const color = StyleSheet.flatten(props.style).color
  const placeholderTextColor =
    windows && typeof color === 'string' && color.startsWith('#')
      ? withAlpha(color, 0.45 * 255)
      : undefined
  return (
    <TextInput
      placeholderTextColor={placeholderTextColor}
      {...fix}
      {...props}
      {...(fix && { multiline: true })}
    />
  )
}
