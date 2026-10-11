import { StyleSheet } from 'react-native'

/** Styles the overlays share (their left and width are set inline). */
export const overlayStyles = StyleSheet.create({
  /** A full-height stretch. */
  band: { position: 'absolute', top: 0, bottom: 0 },
  /** A full-height line. */
  line: { position: 'absolute', top: 0, bottom: 0, width: 1 },
})
