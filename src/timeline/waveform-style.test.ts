import { describe, expect, test, vi } from 'vite-plus/test'
import {
  DEFAULT_WAVEFORM_STYLE,
  WAVEFORM_STYLES,
  createWaveformStyleStore,
  waveformStyleStore,
} from './waveform-style'

describe('waveform styles', () => {
  test('there are four, with their menu labels, and the default is Peak + RMS', () => {
    expect(WAVEFORM_STYLES).toEqual([
      { value: 'peak', label: 'Peak' },
      { value: 'peak-rms', label: 'Peak + RMS' },
      { value: 'rms', label: 'RMS' },
      { value: 'smoothed-peak', label: 'Smoothed peak' },
    ])
    expect(DEFAULT_WAVEFORM_STYLE).toBe('peak-rms')
  })
})

describe('createWaveformStyleStore', () => {
  test('starts at the default', () => {
    expect(createWaveformStyleStore().getSnapshot()).toBe('peak-rms')
  })

  test('set changes the snapshot and notifies subscribers', () => {
    const store = createWaveformStyleStore()
    const listener = vi.fn()
    store.subscribe(listener)
    store.set('rms')
    expect(store.getSnapshot()).toBe('rms')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  test('setting the current style notifies nobody', () => {
    const store = createWaveformStyleStore()
    const listener = vi.fn()
    store.subscribe(listener)
    store.set('peak-rms')
    expect(listener).not.toHaveBeenCalled()
  })

  test('an unsubscribed listener is not called', () => {
    const store = createWaveformStyleStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    unsubscribe()
    store.set('peak')
    expect(listener).not.toHaveBeenCalled()
  })

  test('stores are independent and the shared one exists', () => {
    const a = createWaveformStyleStore()
    const b = createWaveformStyleStore()
    a.set('peak')
    expect(b.getSnapshot()).toBe('peak-rms')
    expect(waveformStyleStore.getSnapshot()).toBe('peak-rms')
  })
})
