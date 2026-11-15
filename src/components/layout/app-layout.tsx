import { Outlet } from '@tanstack/react-router'
import { AppMenubar } from './app-menubar'

/**
 * Application shell: a fixed menubar on top and a content region that fills
 * the rest of the viewport. Routes render into the content region.
 */
export function AppLayout() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <AppMenubar />
      <main className="relative min-h-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
