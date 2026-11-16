// The Lane's tunable look, in one place: colours, modes and sizes that a human visual review (#12)
// adjusts by eye. Pure data, no DOM, no logic: nothing here changes how the Lane behaves, only how
// it looks. Waveform colours, label sizes and the Lane background join the spectrogram entries below.

/** How a spectrogram finer than its overview (zoomed in past 10 columns per second) is stretched. */
export type SpectrogramStretch = 'nearest'

/** 'nearest': blocky, no smoothing. */
export const SPECTROGRAM_STRETCH: SpectrogramStretch = 'nearest'

/** Colour stops of the spectrogram's table, from the floor (quantised 0) to the ceiling (255), evenly spaced. Magma-like. */
export const SPECTROGRAM_COLOR_STOPS: readonly string[] = [
  '#000004',
  '#140e36',
  '#3b0f70',
  '#641a80',
  '#8c2981',
  '#b73779',
  '#de4968',
  '#f7705c',
  '#fe9f6d',
  '#fecf92',
  '#fcfdbf',
]
