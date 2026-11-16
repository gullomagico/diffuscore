import { Button } from '@/components/ui/button'
import type { ImportStage } from '@/audio/import'

const STAGE_LABEL: Record<ImportStage, string> = {
  reading: 'Reading',
  decoding: 'Decoding',
}

/** Animation delays, so the bars rise and fall out of step like a level meter. */
const METER_BAR_DELAYS_MS = [0, -660, -220, -880, -440]
const ELLIPSIS_DELAYS_MS = [0, 200, 400]

function Meter() {
  return (
    <div aria-hidden className="flex h-10 items-center gap-1">
      {METER_BAR_DELAYS_MS.map((delay) => (
        <span
          key={delay}
          className="h-full w-1 animate-meter rounded-full bg-primary motion-reduce:animate-none"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  )
}

function Ellipsis() {
  return (
    <span aria-hidden>
      {ELLIPSIS_DELAYS_MS.map((delay) => (
        <span
          key={delay}
          className="animate-ellipsis motion-reduce:animate-none"
          style={{ animationDelay: `${delay}ms` }}
        >
          .
        </span>
      ))}
    </span>
  )
}

export function LoadingOverlay({
  stage,
  fileName,
  onCancel,
}: {
  stage: ImportStage
  fileName: string
  onCancel: () => void
}) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 bg-background p-8">
      <Meter />
      <div className="flex max-w-full flex-col items-center gap-1.5">
        <p className="text-base font-medium">
          <span role="status" aria-live="polite">
            {STAGE_LABEL[stage]}
          </span>
          <Ellipsis />
        </p>
        <p className="max-w-md truncate text-sm text-muted-foreground">{fileName}</p>
      </div>
      <Button variant="outline" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  )
}
