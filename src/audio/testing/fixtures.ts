// Dependency-free generators for test audio. Never commit binary files.

export interface ExtraChunk {
  readonly id: string
  readonly size: number
}

export interface WavOptions {
  readonly channels: number
  readonly sampleRate: number
  readonly seconds: number
  /** Peak of the 440 Hz sine, in PCM16 units (full scale is 32767). Default 3000. */
  readonly amplitude?: number
  /** The sine's level rises linearly from silence to `amplitude` over the whole file, so zooming changes the picture. */
  readonly ramp?: boolean
  /** Write a WAVE_FORMAT_EXTENSIBLE fmt chunk instead of a plain PCM one. */
  readonly extensible?: boolean
  /** Chunks (e.g. bext, JUNK) written before the fmt chunk, filled with zeros. Odd sizes are padded. */
  readonly chunksBeforeFmt?: readonly ExtraChunk[]
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
}

const PCM_SUBFORMAT_GUID = [
  0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71,
]

/** A valid, playable PCM16 WAV: a quiet 440 Hz sine on every Channel. */
export function makeWav(options: WavOptions): Uint8Array {
  const {
    channels,
    sampleRate,
    seconds,
    amplitude = 3000,
    ramp = false,
    extensible = false,
    chunksBeforeFmt = [],
  } = options
  const frames = Math.round(sampleRate * seconds)
  const dataSize = frames * channels * 2
  const fmtSize = extensible ? 40 : 16
  const extraSize = chunksBeforeFmt.reduce((sum, c) => sum + 8 + c.size + (c.size % 2), 0)
  const total = 12 + extraSize + 8 + fmtSize + 8 + dataSize + (dataSize % 2)
  const bytes = new Uint8Array(total)
  const view = new DataView(bytes.buffer)
  let o = 0

  writeAscii(view, o, 'RIFF')
  view.setUint32(o + 4, total - 8, true)
  writeAscii(view, o + 8, 'WAVE')
  o += 12

  for (const chunk of chunksBeforeFmt) {
    writeAscii(view, o, chunk.id)
    view.setUint32(o + 4, chunk.size, true)
    o += 8 + chunk.size + (chunk.size % 2)
  }

  writeAscii(view, o, 'fmt ')
  view.setUint32(o + 4, fmtSize, true)
  view.setUint16(o + 8, extensible ? 0xfffe : 1, true)
  view.setUint16(o + 10, channels, true)
  view.setUint32(o + 12, sampleRate, true)
  view.setUint32(o + 16, sampleRate * channels * 2, true)
  view.setUint16(o + 20, channels * 2, true)
  view.setUint16(o + 22, 16, true)
  if (extensible) {
    view.setUint16(o + 24, 22, true)
    view.setUint16(o + 26, 16, true)
    view.setUint32(o + 28, (1 << channels) - 1, true)
    PCM_SUBFORMAT_GUID.forEach((b, i) => view.setUint8(o + 32 + i, b))
  }
  o += 8 + fmtSize

  writeAscii(view, o, 'data')
  view.setUint32(o + 4, dataSize, true)
  o += 8
  for (let frame = 0; frame < frames; frame++) {
    const sample = Math.round(
      Math.sin((2 * Math.PI * 440 * frame) / sampleRate) * amplitude * (ramp ? frame / frames : 1),
    )
    for (let ch = 0; ch < channels; ch++)
      view.setInt16(o + (frame * channels + ch) * 2, sample, true)
  }
  return bytes
}

export interface FlacHeaderOptions {
  readonly channels: number
  readonly sampleRate: number
}

/** The 'fLaC' marker followed by a STREAMINFO block (no audio frames). */
export function makeFlacHeader(options: FlacHeaderOptions): Uint8Array {
  const { channels, sampleRate } = options
  const bytes = new Uint8Array(4 + 4 + 34)
  const view = new DataView(bytes.buffer)
  writeAscii(view, 0, 'fLaC')
  view.setUint8(4, 0x80) // last metadata block, type 0 (STREAMINFO)
  view.setUint8(5, 0)
  view.setUint16(6, 34)
  view.setUint16(8, 4096) // min block size
  view.setUint16(10, 4096) // max block size
  // 20 bits sample rate | 3 bits (channels - 1) | 5 bits (bits per sample - 1)
  view.setUint8(18, (sampleRate >> 12) & 0xff)
  view.setUint8(19, (sampleRate >> 4) & 0xff)
  view.setUint8(20, ((sampleRate & 0x0f) << 4) | (((channels - 1) & 0x07) << 1) | 0)
  view.setUint8(21, 15 << 4) // bits per sample - 1 = 15 (low 4 bits), total samples high bits 0
  return bytes
}
