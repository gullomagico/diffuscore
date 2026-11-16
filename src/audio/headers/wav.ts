import type { HeaderChannelCount } from './types'

const CHUNK_HEADER = 8

function ascii(view: DataView, offset: number, length: number): string {
  let text = ''
  for (let i = 0; i < length; i++) text += String.fromCharCode(view.getUint8(offset + i))
  return text
}

/** Walks the RIFF chunks looking for 'fmt '. Never throws. */
export function readWavChannelCount(bytes: Uint8Array): HeaderChannelCount {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.byteLength < 12) return 'unknown'
  if (ascii(view, 0, 4) !== 'RIFF' || ascii(view, 8, 4) !== 'WAVE') return 'unknown'

  let offset = 12
  while (offset + CHUNK_HEADER <= view.byteLength) {
    const id = ascii(view, offset, 4)
    const size = view.getUint32(offset + 4, true)
    const body = offset + CHUNK_HEADER
    if (id === 'fmt ') {
      if (size < 16 || body + 4 > view.byteLength) return 'unknown'
      const channels = view.getUint16(body + 2, true)
      return channels > 0 ? channels : 'unknown'
    }
    offset = body + size + (size % 2)
  }
  return 'unknown'
}
