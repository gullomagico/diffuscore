export default function App() {
  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="flex items-baseline gap-4 border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
        <h1 className="text-lg font-bold">
          <span className="text-violet-600 dark:text-violet-400" aria-hidden>
            ◐
          </span>{' '}
          DiffuScore
        </h1>
        <span className="text-sm text-neutral-500">
          Sound diffusion scores for acousmatic performance
        </span>
      </header>
      <main className="flex flex-1 items-center justify-center p-8">
        <p className="max-w-prose text-center text-neutral-500">
          A visual workspace where stereo audio and graphical annotations share one timeline.
        </p>
      </main>
    </div>
  )
}
