import { Button } from '@/components/ui/button'
import { importShortcutLabel } from '@/lib/import-shortcut'
import { isMac } from '@/lib/platform'

export function EmptyState({
  errorMessage,
  onChoose,
}: {
  errorMessage?: string
  onChoose: () => void
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      {errorMessage ? (
        <>
          <p role="alert" className="max-w-prose text-sm text-destructive">
            {errorMessage}
          </p>
          <Button variant="outline" onClick={onChoose}>
            Choose another file
          </Button>
        </>
      ) : (
        <>
          <h1 className="text-lg font-semibold">No Source loaded</h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            Drop an audio file here or import one ({importShortcutLabel(isMac)}).
          </p>
          <Button onClick={onChoose}>Import audio file</Button>
        </>
      )}
    </div>
  )
}
