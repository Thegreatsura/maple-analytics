import { ManagedRuntime } from "effect"
import { Atom } from "effect/unstable/reactivity"
import { MapleApiAtomClient } from "./atom-client"

export const runtimeLayer = MapleApiAtomClient.layer

export const runtime = ManagedRuntime.make(runtimeLayer, { memoMap: Atom.defaultMemoMap })
