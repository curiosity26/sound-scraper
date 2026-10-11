// The app's text box: React Native's TextInput, with a workaround for
// React Native Windows, which mis-centres a single-line box's text (it lands
// in the bottom half and is clipped) but top-aligns a multiline one. There,
// single-line fields are multiline boxes limited to one line that still
// submit (and blur) on Enter. Use this instead of TextInput everywhere.
import type { FC, Ref } from 'react'
import { Platform, TextInput, type TextInputProps } from 'react-native'

const windowsSingleLine: Partial<TextInputProps> = {
  multiline: true,
  numberOfLines: 1,
  submitBehavior: 'blurAndSubmit',
}

export type TextFieldProps = TextInputProps & {
  readonly ref?: Ref<TextInput>
}

// React 19 passes `ref` as a regular prop, so no forwardRef.
export const TextField: FC<TextFieldProps> = props => {
  const fix =
    Platform.OS === 'windows' && !props.multiline ? windowsSingleLine : null
  return <TextInput {...fix} {...props} {...(fix && { multiline: true })} />
}
