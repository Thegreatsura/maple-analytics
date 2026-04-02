import type { AnyRoute, RouterConstructorOptions, RouterHistory, TrailingSlashOption } from "@tanstack/react-router"
import { createRouter } from "@tanstack/react-router"
import type { ManagedRuntime } from "effect"
import type { Atom, AtomRegistry } from "effect/unstable/reactivity"

// ---------------------------------------------------------------------------
// Internal type aliases (centralizes `any` for runtime types)
// ---------------------------------------------------------------------------

type AnyManagedRuntime = ManagedRuntime.ManagedRuntime<any, any>
type AnyAtomRuntime = Atom.AtomRuntime<any, any>

/**
 * Context added to TanStack Router's context by the Effect integration.
 * Loaders and beforeLoad hooks access the runtime through this.
 */
export interface EffectRouterContext {
  readonly effectManagedRuntime: AnyManagedRuntime
  readonly effectAtomRuntime: AnyAtomRuntime
  readonly effectRegistry: AtomRegistry.AtomRegistry
}

/**
 * Options for createEffectRouter. Extends TanStack Router's options with
 * the Effect runtime, atom runtime, and registry.
 */
export type EffectRouterOptions<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption = "never",
  TDefaultStructuralSharingOption extends boolean = false,
  TRouterHistory extends RouterHistory = RouterHistory,
  TDehydrated extends Record<string, any> = Record<string, any>,
> = Omit<
  RouterConstructorOptions<TRouteTree, TTrailingSlashOption, TDefaultStructuralSharingOption, TRouterHistory, TDehydrated>,
  "context"
> & {
  /**
   * The ManagedRuntime used to execute Effects in loaders and beforeLoad hooks.
   * Must share the same `memoMap` as the AtomRuntime for service memoization.
   *
   * @example
   * ```ts
   * const managedRuntime = ManagedRuntime.make(myLayer, { memoMap: Atom.defaultMemoMap })
   * ```
   */
  readonly managedRuntime: AnyManagedRuntime

  /**
   * The Effect AtomRuntime for creating reactive route data atoms.
   * Created via `Atom.runtime(layer)`.
   */
  readonly atomRuntime: AnyAtomRuntime

  /**
   * The AtomRegistry used for reactive state management.
   * Created via `AtomRegistry.make()`.
   */
  readonly registry: AtomRegistry.AtomRegistry

  /**
   * Additional router context merged with the Effect context.
   */
  readonly context?: Record<string, unknown>
}

/**
 * Creates a TanStack Router with deep Effect integration.
 *
 * Stores the ManagedRuntime, AtomRuntime, and AtomRegistry in the router's
 * context so that `effectLoader` and `effectBeforeLoad` can run Effects
 * through the shared runtime, and route atoms can access services.
 *
 * The ManagedRuntime and AtomRuntime should share the same `memoMap`
 * (typically `Atom.defaultMemoMap`) so that service instances are reused
 * across imperative execution and reactive atoms.
 *
 * @example
 * ```ts
 * import { Atom, AtomRegistry } from "effect/unstable/reactivity"
 *
 * const atomRuntime = Atom.runtime(myServiceLayer)
 * const managedRuntime = ManagedRuntime.make(myServiceLayer, { memoMap: Atom.defaultMemoMap })
 * const registry = AtomRegistry.make({ scheduleTask })
 * registry.mount(atomRuntime)
 *
 * const router = createEffectRouter({
 *   routeTree,
 *   managedRuntime,
 *   atomRuntime,
 *   registry,
 *   context: { auth: undefined! },
 * })
 * ```
 */
export function createEffectRouter<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption = "never",
  TDefaultStructuralSharingOption extends boolean = false,
  TRouterHistory extends RouterHistory = RouterHistory,
  TDehydrated extends Record<string, any> = Record<string, any>,
>({
  managedRuntime,
  atomRuntime,
  registry,
  context: userContext,
  ...options
}: EffectRouterOptions<TRouteTree, TTrailingSlashOption, TDefaultStructuralSharingOption, TRouterHistory, TDehydrated>) {
  const effectContext: EffectRouterContext = {
    effectManagedRuntime: managedRuntime,
    effectAtomRuntime: atomRuntime,
    effectRegistry: registry,
  }

  // Cast needed: we merge EffectRouterContext fields into the user's router
  // context. Generic TRouteTree constraints don't survive the spread, and the
  // context type is wider than what createRouter expects. The user's root route
  // should include EffectRouterContext in its context type for full type safety.
  return createRouter<TRouteTree, TTrailingSlashOption, TDefaultStructuralSharingOption, TRouterHistory, TDehydrated>({
    ...options as any,
    context: { ...userContext, ...effectContext },
  })
}
