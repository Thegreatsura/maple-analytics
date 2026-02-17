import { useAuth } from "@clerk/clerk-react"
import { Navigate, Outlet, createRootRouteWithContext, redirect, useRouterState } from "@tanstack/react-router"
import { Toaster } from "@/components/ui/sonner"
import { isClerkAuthEnabled } from "@/lib/services/common/auth-mode"
import type { RouterAuthContext } from "@/router"

const PUBLIC_PATHS = new Set(["/sign-in", "/sign-up", "/org-required"])

export const Route = createRootRouteWithContext<{ auth: RouterAuthContext }>()({
  beforeLoad: ({ context, location }) => {
    if (PUBLIC_PATHS.has(location.pathname)) return

    if (!context.auth?.isAuthenticated) {
      throw redirect({ to: "/sign-in" })
    }

    if (!context.auth.orgId) {
      throw redirect({ to: "/org-required" })
    }
  },
  component: RootComponent,
})

function AppFrame() {
  return (
    <>
      <Outlet />
      <Toaster />
    </>
  )
}

function ClerkReverseRedirects() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const { isSignedIn, orgId } = useAuth()

  if (isSignedIn && (pathname === "/sign-in" || pathname === "/sign-up")) {
    return <Navigate to="/" replace />
  }

  if (isSignedIn && orgId && pathname === "/org-required") {
    return <Navigate to="/" replace />
  }

  return <AppFrame />
}

function RootComponent() {
  if (!isClerkAuthEnabled) {
    return <AppFrame />
  }

  return <ClerkReverseRedirects />
}
