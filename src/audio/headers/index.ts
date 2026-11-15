import { readFlacChannelCount } from './flac'
import type { HeaderChannelCount } from './types'
import { readWavChannelCount } from './wav'

export type { HeaderChannelCount } from './types'
export { readFlacChannelCount } from './flac'
export { readWavChannelCount } from './wav'

function startsWith(bytes: Uint8Array, text: string): boolean {
  if (bytes.length < text.length) return false
  for (let i = 0; i < text.length; i++) if (bytes[i] !== text.charCodeAt(i)) return false
  return true
}

/** Sniffs the magic bytes (never the file extension) and dispatches. */
export function readHeaderChannelCount(bytes: Uint8Array): HeaderChannelCount {
  if (startsWith(bytes, 'RIFF')) return readWavChannelCount(bytes)
  if (startsWith(bytes, 'fLaC')) return readFlacChannelCount(bytes)
  return 'unknown'
}
