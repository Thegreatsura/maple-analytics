import { scheduleTask } from "@/lib/effect-atom"
import { Atom, AtomRegistry } from "effect/unstable/reactivity"
import { runtimeLayer } from "./services/common/runtime"

export const appRegistry = AtomRegistry.make({ scheduleTask })

const sharedAtomRuntime = Atom.runtime(runtimeLayer)

appRegistry.mount(sharedAtomRuntime)
