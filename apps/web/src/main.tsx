import { ClerkProvider, useAuth } from "@clerk/clerk-react"
import { AutumnProvider } from "autumn-js/react"
import { RegistryContext } from "@effect-atom/atom-react"
import { StrictMode, useCallback, useEffect, useState } from "react"
import ReactDOM from "react-dom/client"
import { RouterProvider } from "@tanstack/react-router"

import { apiBaseUrl } from "./lib/services/common/api-base-url"
import { ClerkAuthBridge } from "./lib/services/common/clerk-auth-bridge"
import { isClerkAuthEnabled } from "./lib/services/common/auth-mode"
import {
  installSelfHostedAuthHeadersProvider,
  resolveSelfHostedRouterAuth,
  subscribeSelfHostedAuthChanges,
} from "./lib/services/common/self-hosted-auth"
import { router, type RouterAuthContext } from "./router"
import { appRegistry } from "./lib/registry"
import "./styles.css"

const root = document.getElementById("app")

if (!root) {
  throw new Error("App root element not found")
}

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim()
const clerkSignInUrl = import.meta.env.VITE_CLERK_SIGN_IN_URL?.trim() || "/sign-in"
const clerkSignUpUrl = import.meta.env.VITE_CLERK_SIGN_UP_URL?.trim() || "/sign-up"

if (import.meta.env.DEV && isClerkAuthEnabled && !clerkPublishableKey) {
  throw new Error("VITE_CLERK_PUBLISHABLE_KEY is required when VITE_MAPLE_AUTH_MODE=clerk")
}

function AutumnProviderWithClerk({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth()
  return (
    <AutumnProvider
      includeCredentials={false}
      backendUrl={apiBaseUrl}
      getBearerToken={() => getToken().then((t) => t ?? "")}
    >
      {children}
    </AutumnProvider>
  )
}

function ClerkInnerApp() {
  const { isLoaded, isSignedIn, orgId } = useAuth()

  useEffect(() => {
    router.invalidate()
  }, [isSignedIn, orgId])

  if (!isLoaded) return null

  return (
    <RouterProvider
      router={router}
      context={{ auth: { isAuthenticated: !!isSignedIn, orgId } }}
    />
  )
}

function SelfHostedInnerApp() {
  const [auth, setAuth] = useState<RouterAuthContext | null>(null)

  const refreshAuth = useCallback(async () => {
    const nextAuth = await resolveSelfHostedRouterAuth(apiBaseUrl)
    setAuth(nextAuth)
  }, [])

  useEffect(() => {
    installSelfHostedAuthHeadersProvider()
    void refreshAuth()

    return subscribeSelfHostedAuthChanges(() => {
      void refreshAuth()
    })
  }, [refreshAuth])

  useEffect(() => {
    if (!auth) return
    router.invalidate()
  }, [auth])

  if (!auth) {
    return null
  }

  return (
    <RouterProvider
      router={router}
      context={{ auth }}
    />
  )
}

const app = isClerkAuthEnabled
  ? (
      <ClerkProvider
        publishableKey={clerkPublishableKey}
        signInUrl={clerkSignInUrl}
        signUpUrl={clerkSignUpUrl}
        afterSignOutUrl={clerkSignInUrl}
      >
        <ClerkAuthBridge />
        <AutumnProviderWithClerk>
          <ClerkInnerApp />
        </AutumnProviderWithClerk>
      </ClerkProvider>
    )
  : <SelfHostedInnerApp />

ReactDOM.createRoot(root).render(
  <StrictMode>
    <RegistryContext.Provider value={appRegistry}>
      {app}
    </RegistryContext.Provider>
  </StrictMode>,
)
