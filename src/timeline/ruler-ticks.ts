import { formatDuration } from '@/lib/format'
import type { ViewportSnapshot } from './viewport'

export interface RulerTick {
  /** Seconds. */
  readonly time: number
  /** mm:ss, or null for an unlabelled (minor / sub-second) tick. */
  readonly label: string | null
}

/** Minimum distance between two labels, in CSS pixels. */
export const MIN_LABEL_SPACING_PX = 64

/** Whole-second label steps. Beyond the list the step keeps doubling. */
const LABEL_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600]

/** Minor ticks per label step; each minor tick is then at least ~6 px apart. */
const MINOR_PER_STEP: Readonly<Record<number, number>> = {
  1: 10,
  2: 4,
  5: 5,
  10: 5,
  15: 5,
  30: 6,
  60: 6,
  120: 4,
  300: 5,
  600: 5,
}
const DEFAULT_MINOR_PER_STEP = 4

function labelStep(pixelsPerSecond: number): number {
  for (const step of LABEL_STEPS) {
    if (step * pixelsPerSecond >= MIN_LABEL_SPACING_PX) return step
  }
  let step = LABEL_STEPS[LABEL_STEPS.length - 1]!
  while (step * pixelsPerSecond < MIN_LABEL_SPACING_PX) step *= 2
  return step
}

/** The ticks visible in the Viewport, in ascending time order. */
export function rulerTicks(viewport: ViewportSnapshot): RulerTick[] {
  const { startTime, pixelsPerSecond, width, duration } = viewport
  if (!(pixelsPerSecond > 0) || !(width > 0) || !(duration > 0)) return []

  const step = labelStep(pixelsPerSecond)
  const perStep = MINOR_PER_STEP[step] ?? DEFAULT_MINOR_PER_STEP
  const minorStep = step / perStep
  const epsilon = 1e-9

  const from = Math.max(0, startTime)
  const to = Math.min(duration, startTime + width / pixelsPerSecond)
  const first = Math.max(0, Math.ceil(from / minorStep - epsilon))
  const last = Math.floor(to / minorStep + epsilon)

  const ticks: RulerTick[] = []
  for (let index = first; index <= last; index++) {
    // Integer index, divided last: 3 * 1 / 10 is exactly 0.3.
    const time = (index * step) / perStep
    ticks.push({ time, label: index % perStep === 0 ? formatDuration(time) : null })
  }
  return ticks
}
