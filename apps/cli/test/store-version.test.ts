import { describe, it } from "@effect/vitest"
import { ok, strictEqual } from "node:assert"
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
	isStoreDirty,
	markStoreClosed,
	markStoreOpen,
	storeOpenMarkerPath,
} from "../src/server/store-version"

// Each test gets a throwaway parent dir; the data dir is a child of it so the
// markers (written beside the data dir) land in the temp tree, not on $HOME.
const withDataDir = (run: (dataDir: string) => void): void => {
	const parent = mkdtempSync(join(tmpdir(), "maple-store-test-"))
	const dataDir = join(parent, "data")
	mkdirSync(dataDir, { recursive: true })
	try {
		run(dataDir)
	} finally {
		rmSync(parent, { recursive: true, force: true })
	}
}

/** Simulate a bootstrapped store (chDB creates `store/`). */
const seedData = (dataDir: string): void => mkdirSync(join(dataDir, "store"), { recursive: true })

describe("clean-shutdown sentinel", () => {
	it("storeOpenMarkerPath sits beside the data dir", () => {
		withDataDir((dataDir) => {
			strictEqual(storeOpenMarkerPath(dataDir), join(dataDir, "..", "maple-store-open"))
		})
	})

	it("markStoreOpen writes the marker; markStoreClosed removes it", () => {
		withDataDir((dataDir) => {
			markStoreOpen(dataDir)
			ok(existsSync(storeOpenMarkerPath(dataDir)))
			markStoreClosed(dataDir)
			ok(!existsSync(storeOpenMarkerPath(dataDir)))
		})
	})

	it("markStoreClosed is a no-op when the marker is already gone", () => {
		withDataDir((dataDir) => {
			markStoreClosed(dataDir) // must not throw
			ok(!existsSync(storeOpenMarkerPath(dataDir)))
		})
	})

	it("isStoreDirty: false for a clean store (data, no marker)", () => {
		withDataDir((dataDir) => {
			seedData(dataDir)
			strictEqual(isStoreDirty(dataDir), false)
		})
	})

	it("isStoreDirty: false for a marker over an empty store (fresh open, never persisted)", () => {
		withDataDir((dataDir) => {
			markStoreOpen(dataDir)
			strictEqual(isStoreDirty(dataDir), false)
		})
	})

	it("isStoreDirty: true only when the store has data AND was not cleanly closed", () => {
		withDataDir((dataDir) => {
			seedData(dataDir)
			markStoreOpen(dataDir)
			strictEqual(isStoreDirty(dataDir), true)
			// A clean close clears the dirty state.
			markStoreClosed(dataDir)
			strictEqual(isStoreDirty(dataDir), false)
		})
	})
})
