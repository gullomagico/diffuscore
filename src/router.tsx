import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { AppLayout } from '@/components/layout/app-layout'
import { WorkspacePage } from '@/routes/workspace'

const rootRoute = createRootRoute({ component: AppLayout })

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: WorkspacePage,
})

const routeTree = rootRoute.addChildren([indexRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
