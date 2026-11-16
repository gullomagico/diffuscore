import { describe, expect, test } from 'vite-plus/test'
import { makeWav } from '@/audio/testing/fixtures'
import { readWavChannelCount } from './wav'

const base = { sampleRate: 44100, seconds: 0.01 }

describe('readWavChannelCount', () => {
  test('reads a canonical stereo file', () => {
    expect(readWavChannelCount(makeWav({ ...base, channels: 2 }))).toBe(2)
  })

  test('reads a mono file', () => {
    expect(readWavChannelCount(makeWav({ ...base, channels: 1 }))).toBe(1)
  })

  test('reads a 3-channel file', () => {
    expect(readWavChannelCount(makeWav({ ...base, channels: 3 }))).toBe(3)
  })

  test('walks past bext and JUNK chunks before fmt', () => {
    const bytes = makeWav({
      ...base,
      channels: 2,
      chunksBeforeFmt: [
        { id: 'JUNK', size: 28 },
        { id: 'bext', size: 602 },
      ],
    })
    expect(readWavChannelCount(bytes)).toBe(2)
  })

  test('honours the padding byte after an odd-sized chunk', () => {
    const bytes = makeWav({ ...base, channels: 2, chunksBeforeFmt: [{ id: 'LIST', size: 7 }] })
    expect(readWavChannelCount(bytes)).toBe(2)
  })

  test('reads a WAVE_FORMAT_EXTENSIBLE file', () => {
    expect(readWavChannelCount(makeWav({ ...base, channels: 2, extensible: true }))).toBe(2)
    expect(readWavChannelCount(makeWav({ ...base, channels: 6, extensible: true }))).toBe(6)
  })

  test('is unknown when the bytes are not RIFF/WAVE', () => {
    expect(readWavChannelCount(new TextEncoder().encode('not a wav file at all'))).toBe('unknown')
    expect(readWavChannelCount(new Uint8Array(0))).toBe('unknown')
  })

  test('is unknown when the header is truncated before fmt', () => {
    const bytes = makeWav({ ...base, channels: 2 })
    expect(readWavChannelCount(bytes.slice(0, 20))).toBe('unknown')
    expect(readWavChannelCount(bytes.slice(0, 23))).toBe('unknown')
  })

  test('is unknown when fmt is not within the bytes given', () => {
    const bytes = makeWav({ ...base, channels: 2, chunksBeforeFmt: [{ id: 'JUNK', size: 5000 }] })
    expect(readWavChannelCount(bytes.slice(0, 1000))).toBe('unknown')
  })

  test('is unknown for a corrupt header', () => {
    const bytes = makeWav({ ...base, channels: 3 })
    // Corrupt the fmt chunk id and zero the channel count.
    bytes.set(new TextEncoder().encode('xxxx'), 12)
    expect(readWavChannelCount(bytes)).toBe('unknown')
    const zero = makeWav({ ...base, channels: 3 })
    new DataView(zero.buffer).setUint16(22, 0, true)
    expect(readWavChannelCount(zero)).toBe('unknown')
  })

  test('is unknown when a chunk size runs past the end of the bytes', () => {
    const bytes = makeWav({ ...base, channels: 2, chunksBeforeFmt: [{ id: 'JUNK', size: 4 }] })
    new DataView(bytes.buffer).setUint32(16, 0xffffffff, true)
    expect(readWavChannelCount(bytes)).toBe('unknown')
  })
})
