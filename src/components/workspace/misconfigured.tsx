export function Misconfigured() {
  return (
    <div
      role="alert"
      className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center"
    >
      <h1 className="text-lg font-semibold">Deployment misconfigured</h1>
      <p className="max-w-prose text-sm text-muted-foreground">
        This page is not cross-origin isolated, so DiffuScore cannot hold a Source in memory. The
        server must send the headers <code>Cross-Origin-Opener-Policy: same-origin</code> and{' '}
        <code>Cross-Origin-Embedder-Policy: require-corp</code>.
      </p>
    </div>
  )
}
