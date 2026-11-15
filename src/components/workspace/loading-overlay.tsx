import { Button } from '@/components/ui/button'
import type { ImportStage } from '@/audio/import'

const STAGE_LABEL: Record<ImportStage, string> = {
  reading: 'Reading',
  decoding: 'Decoding',
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
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/90">
      <p role="status" aria-live="polite" className="text-sm font-medium">
        {STAGE_LABEL[stage]}
      </p>
      <p className="max-w-prose truncate text-xs text-muted-foreground">{fileName}</p>
      <Button variant="outline" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  )
}
