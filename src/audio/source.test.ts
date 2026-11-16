import { describe, expect, test, vi } from 'vite-plus/test'
import { createSourceStore } from './source'
import type { DecodedAudio } from './source'

function decoded(channels: number[][], duration: number): DecodedAudio {
  return {
    numberOfChannels: channels.length,
    length: channels[0]!.length,
    duration,
    getChannelData: (ch) => Float32Array.from(channels[ch]!),
  }
}

describe('SourceStore', () => {
  test('starts empty', () => {
    expect(createSourceStore().getSnapshot()).toBeNull()
  })

  test('holds each Channel on its own SharedArrayBuffer with the samples copied', () => {
    const store = createSourceStore()
    const source = store.load(
      'piece.wav',
      decoded(
        [
          [0.5, -0.25, 1],
          [0, 0.125, -1],
        ],
        2.5,
      ),
    )

    expect(store.getSnapshot()).toBe(source)
    expect(source.fileName).toBe('piece.wav')
    expect(source.duration).toBe(2.5)
    expect(source.sampleRate).toBe(48000)
    expect(source.channels).toHaveLength(2)
    for (const channel of source.channels) {
      expect(channel).toBeInstanceOf(Float32Array)
      expect(channel.buffer).toBeInstanceOf(SharedArrayBuffer)
    }
    expect(source.channels[0]!.buffer).not.toBe(source.channels[1]!.buffer)
    expect(Array.from(source.channels[0]!)).toEqual([0.5, -0.25, 1])
    expect(Array.from(source.channels[1]!)).toEqual([0, 0.125, -1])
  })

  test('does not expose the original sample rate', () => {
    const store = createSourceStore()
    const source = store.load('a.wav', { ...decoded([[0]], 1), sampleRate: 44100 } as DecodedAudio)
    expect(Object.keys(source).sort()).toEqual(['channels', 'duration', 'fileName', 'sampleRate'])
  })

  test('the snapshot is stable until the Source changes, and listeners are notified', () => {
    const store = createSourceStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    store.load('a.wav', decoded([[0]], 1))
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot()).toBe(store.getSnapshot())

    store.release()
    expect(listener).toHaveBeenCalledTimes(2)
    expect(store.getSnapshot()).toBeNull()

    unsubscribe()
    store.load('b.wav', decoded([[0]], 1))
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
