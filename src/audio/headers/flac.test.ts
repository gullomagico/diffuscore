import { describe, expect, test } from 'vite-plus/test'
import { makeFlacHeader } from '@/audio/testing/fixtures'
import { readFlacChannelCount } from './flac'

describe('readFlacChannelCount', () => {
  test('reads mono from STREAMINFO', () => {
    expect(readFlacChannelCount(makeFlacHeader({ channels: 1, sampleRate: 44100 }))).toBe(1)
  })

  test('reads stereo from STREAMINFO', () => {
    expect(readFlacChannelCount(makeFlacHeader({ channels: 2, sampleRate: 96000 }))).toBe(2)
  })

  test('reads more than 2 channels from STREAMINFO', () => {
    expect(readFlacChannelCount(makeFlacHeader({ channels: 6, sampleRate: 48000 }))).toBe(6)
    expect(readFlacChannelCount(makeFlacHeader({ channels: 8, sampleRate: 48000 }))).toBe(8)
  })

  test('is unknown without the fLaC marker', () => {
    expect(readFlacChannelCount(new TextEncoder().encode('RIFF....WAVE'))).toBe('unknown')
  })

  test('is unknown when STREAMINFO is missing or truncated', () => {
    const bytes = makeFlacHeader({ channels: 2, sampleRate: 44100 })
    expect(readFlacChannelCount(bytes.slice(0, 4))).toBe('unknown')
    expect(readFlacChannelCount(bytes.slice(0, 20))).toBe('unknown')
  })

  test('is unknown when the first block is not STREAMINFO', () => {
    const bytes = makeFlacHeader({ channels: 2, sampleRate: 44100 })
    bytes[4] = 0x84 // VORBIS_COMMENT
    expect(readFlacChannelCount(bytes)).toBe('unknown')
  })
})
