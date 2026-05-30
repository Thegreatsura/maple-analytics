#!/usr/bin/env bun
import { BunRuntime } from "@effect/platform-bun"
import * as BunServices from "@effect/platform-bun/BunServices"
import { Effect, Layer } from "effect"
import * as Command from "effect/unstable/cli/Command"
import { cli } from "./cli"
import { MapleConfig } from "./core/config"
import { Mode } from "./core/mode"
import { WarehouseExecutorFromMode } from "./core/warehouse"
import { MAPLE_VERSION } from "./version"

// WarehouseExecutorFromMode needs Mode (which needs MapleConfig). provideMerge
// keeps Mode + MapleConfig in the output context too, so the login/logout/whoami
// commands can read them directly. The executor's backend is resolved lazily on
// first query, so commands that never query work even with no backend configured.
const MainLayer = WarehouseExecutorFromMode.pipe(
	Layer.provideMerge(Mode.layer),
	Layer.provideMerge(MapleConfig.layer),
	Layer.provideMerge(BunServices.layer),
)

Command.run(cli, { version: MAPLE_VERSION }).pipe(Effect.provide(MainLayer), BunRuntime.runMain)
