import { describe, expect, test } from 'vite-plus/test'
import type { SourcePeaks } from '@/timeline/peaks'
import { createAnalysisStore } from './analysis'
import { createSourceStore } from './source'
import type { DecodedAudio, Source } from './source'

const decoded: DecodedAudio = {
  numberOfChannels: 1,
  length: 2,
  duration: 1,
  getChannelData: () => Float32Array.from([0.5, -0.5]),
}

const peaks = (length: number): SourcePeaks => ({
  pyramids: [{ length, levels: [] }],
})

function setup() {
  const sources = createSourceStore()
  const analysis = createAnalysisStore(sources)
  return { sources, analysis }
}

describe('analysis store', () => {
  test('starts empty', () => {
    expect(setup().analysis.getSnapshot()).toBeNull()
  })

  test('publishes the analysis of the current Source', () => {
    const t = setup()
    const source = t.sources.load('a.wav', decoded)
    const p = peaks(10)
    t.analysis.publish(source, p)

    const snapshot = t.analysis.getSnapshot()
    expect(snapshot?.source).toBe(source)
    expect(snapshot?.peaks).toBe(p)
  })

  test('ignores an analysis of a Source that is not the current one', () => {
    const t = setup()
    const stale = t.sources.load('old.wav', decoded)
    t.sources.load('new.wav', decoded)
    t.analysis.publish(stale, peaks(1))
    expect(t.analysis.getSnapshot()).toBeNull()

    const unknown = { ...stale } satisfies Source
    t.analysis.publish(unknown, peaks(1))
    expect(t.analysis.getSnapshot()).toBeNull()
  })

  test('ignores an analysis when no Source is loaded', () => {
    const t = setup()
    const source = t.sources.load('a.wav', decoded)
    t.sources.release()
    t.analysis.publish(source, peaks(1))
    expect(t.analysis.getSnapshot()).toBeNull()
  })

  test('is released with its Source', () => {
    const t = setup()
    t.analysis.publish(t.sources.load('a.wav', decoded), peaks(1))
    t.sources.release()
    expect(t.analysis.getSnapshot()).toBeNull()
  })

  test('is released when its Source is replaced', () => {
    const t = setup()
    t.analysis.publish(t.sources.load('a.wav', decoded), peaks(1))
    t.sources.load('b.wav', decoded)
    expect(t.analysis.getSnapshot()).toBeNull()
  })

  test('notifies listeners once per change', () => {
    const t = setup()
    let calls = 0
    t.analysis.subscribe(() => calls++)
    const source = t.sources.load('a.wav', decoded)
    expect(calls).toBe(0)
    t.analysis.publish(source, peaks(1))
    expect(calls).toBe(1)
    t.sources.release()
    expect(calls).toBe(2)
    t.sources.release()
    expect(calls).toBe(2)
  })

  test('the snapshot is referentially stable between changes', () => {
    const t = setup()
    t.analysis.publish(t.sources.load('a.wav', decoded), peaks(1))
    expect(t.analysis.getSnapshot()).toBe(t.analysis.getSnapshot())
  })

  test('release() clears the analysis and stops notifying unsubscribed listeners', () => {
    const t = setup()
    let calls = 0
    const unsubscribe = t.analysis.subscribe(() => calls++)
    t.analysis.publish(t.sources.load('a.wav', decoded), peaks(1))
    t.analysis.release()
    expect(t.analysis.getSnapshot()).toBeNull()
    expect(calls).toBe(2)
    unsubscribe()
    t.analysis.publish(t.sources.getSnapshot()!, peaks(2))
    expect(calls).toBe(2)
  })
})
