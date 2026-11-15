import type { HeaderChannelCount } from './types'

const STREAMINFO_CHANNEL_BYTE = 20
const STREAMINFO_END = 8 + 34

/** Reads the channel count from the mandatory first STREAMINFO block. Never throws. */
export function readFlacChannelCount(bytes: Uint8Array): HeaderChannelCount {
  if (bytes.length < STREAMINFO_END) return 'unknown'
  const marker = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!)
  if (marker !== 'fLaC') return 'unknown'
  if ((bytes[4]! & 0x7f) !== 0) return 'unknown'
  return ((bytes[STREAMINFO_CHANNEL_BYTE]! >> 1) & 0x07) + 1
}
