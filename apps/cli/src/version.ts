// Build-time version string. `scripts/build-local-binary.sh` bakes the real
// release tag in via `bun build --define '__MAPLE_VERSION__="v1.2.3"'`, so a
// compiled `maple --version` reports exactly the release it was built from.
//
// `typeof` guards the reference so an un-defined identifier (the dev path,
// `bun run src/bin.ts`, where no --define is passed) reports "dev" instead of
// throwing a ReferenceError.
declare const __MAPLE_VERSION__: string | undefined

const raw = typeof __MAPLE_VERSION__ !== "undefined" ? __MAPLE_VERSION__ : "dev"

// The CLI framework prints "<name> v<version>", so strip a leading "v" from
// release tags like "v0.5.0" to avoid a doubled "vv0.5.0".
export const MAPLE_VERSION: string = raw.replace(/^v/, "")
