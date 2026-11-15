export function HomePage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-lg font-semibold">Sound diffusion scores for acousmatic performance</h1>
      <p className="max-w-prose text-sm text-muted-foreground">
        A visual workspace where stereo audio and graphical annotations share one timeline.
      </p>
    </div>
  )
}
