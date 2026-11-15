import { describe, expect, test } from 'vite-plus/test'
import { makeFlacHeader, makeWav } from '@/audio/testing/fixtures'
import { readHeaderChannelCount } from './index'

describe('readHeaderChannelCount', () => {
  test('recognises a WAV by its magic bytes', () => {
    expect(readHeaderChannelCount(makeWav({ channels: 3, sampleRate: 44100, seconds: 0.01 }))).toBe(
      3,
    )
  })

  test('recognises a FLAC by its magic bytes', () => {
    expect(readHeaderChannelCount(makeFlacHeader({ channels: 2, sampleRate: 44100 }))).toBe(2)
  })

  test('is unknown for any other format', () => {
    expect(readHeaderChannelCount(new TextEncoder().encode('ID3\u0004\u0000 mp3 data'))).toBe(
      'unknown',
    )
    expect(readHeaderChannelCount(new Uint8Array(0))).toBe('unknown')
  })
})
