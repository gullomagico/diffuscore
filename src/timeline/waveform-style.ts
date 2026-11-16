// How the Mirrored waveform is drawn. A display setting, in memory only (like the theme).

export type WaveformStyle = 'peak' | 'peak-rms' | 'rms' | 'smoothed-peak'

export const WAVEFORM_STYLES: readonly { readonly value: WaveformStyle; readonly label: string }[] =
  [
    { value: 'peak', label: 'Peak' },
    { value: 'peak-rms', label: 'Peak + RMS' },
    { value: 'rms', label: 'RMS' },
    { value: 'smoothed-peak', label: 'Smoothed peak' },
  ]

export const DEFAULT_WAVEFORM_STYLE: WaveformStyle = 'peak-rms'

export interface WaveformStyleStore {
  getSnapshot(): WaveformStyle
  subscribe(listener: () => void): () => void
  /** Notifies only when the style really changes. */
  set(style: WaveformStyle): void
}

export function createWaveformStyleStore(): WaveformStyleStore {
  let current = DEFAULT_WAVEFORM_STYLE
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => current,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set(style) {
      if (style === current) return
      current = style
      for (const listener of [...listeners]) listener()
    },
  }
}

export const waveformStyleStore: WaveformStyleStore = createWaveformStyleStore()
