// The Lane's tunable look, in one place: colours, modes and sizes that a human visual review (#12)
// adjusts by eye. Pure data, no DOM, no logic: nothing here changes how the Lane behaves, only how
// it looks: the spectrogram's stretch mode and colour stops, the Lane background, the waveform
// colours, and the label colours and sizes.

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

/**
 * The Lane background, behind the spectrogram. Dark in both app themes: only the chrome follows
 * the theme. It is the colour table's floor stop, so past the Source's end the Lane looks like a
 * silent spectrogram.
 */
export const LANE_BACKGROUND: string = SPECTROGRAM_COLOR_STOPS[0]!

/** Waveform colours, one set for every theme. Mono is drawn in the L colour. */
export const WAVEFORM_COLOR_L = 'oklch(0.80 0.12 240 / 0.8)'
export const WAVEFORM_COLOR_R = 'oklch(0.92 0.14 170 / 0.8)'
export const WAVEFORM_COLOR_MONO = WAVEFORM_COLOR_L

/** Colour of text in the Lane (the "Mono" label), readable on the dark background. */
export const LANE_TEXT_COLOR = 'oklch(0.9 0 0)'

/** Channel labels (R, L, Mono), drawn on the waveform canvas, in CSS pixels. */
export const CHANNEL_LABEL_FONT_PX = 11
export const CHANNEL_LABEL_INSET_PX = 6

/** Frequency axis labels on the Lane's right edge, in CSS pixels. */
export const FREQUENCY_LABEL_FONT_PX = 10
export const FREQUENCY_LABEL_INSET_PX = 4
export const FREQUENCY_LABEL_BACKING = 'rgb(0 0 0 / 0.5)'
