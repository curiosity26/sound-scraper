import { NativeSkins } from '@/bridge/NativeSkins'

export const native = () => {
  if (!NativeSkins) {
    throw new Error('Skins are not available on this platform yet')
  }
  return NativeSkins
}
