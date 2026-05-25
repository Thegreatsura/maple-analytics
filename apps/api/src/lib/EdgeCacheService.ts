import { Clock, Context, Deferred, Effect, Layer, Option, Schema } from "effect"

export class EdgeCacheIOError extends Schema.TaggedErrorClass<EdgeCacheIOError>()(
	"@maple/api/EdgeCacheIOError",
	{
		op: Schema.Literals(["get", "put"]),
		bucket: Schema.String,
		key: Schema.String,
		cause: Schema.String,
	},
) {}

export interface EdgeCacheGetOrComputeOptions<A = unknown, I = unknown> {
	readonly bucket: string
	readonly key: string
	readonly ttlSeconds: number
	/**
	 * Optional codec used to (a) encode the value into a JSON-safe form before
	 * `backend.put`, and (b) decode the cached bytes back into the original
	 * shape on `backend.get`. Required when the cached value is a
	 * `Schema.Class` instance or contains branded/transformed fields, since the
	 * Workers cache backend round-trips through `JSON.stringify` /
	 * `response.json()` and would otherwise return a plain object that fails
	 * downstream schema-typed boundaries (e.g. HTTP success encoding).
	 *
	 * Decode failures are treated as a cache miss (recompute + overwrite) so
	 * that a deploy with an incompatible schema change cannot poison reads.
	 * Encode failures fail loud — they indicate a programmer bug.
	 */
	readonly schema?: Schema.Codec<A, I, never, never>
}

export interface EdgeCacheResult<A> {
	readonly value: A
	readonly hit: boolean
}

interface DeferredAwaiter<A = unknown, E = unknown> {
	readonly await: Effect.Effect<A, E>
}

export interface EdgeCacheServiceShape {
	readonly getOrCompute: <A, E, R, I = unknown>(
		options: EdgeCacheGetOrComputeOptions<A, I>,
		compute: Effect.Effect<A, E, R>,
	) => Effect.Effect<EdgeCacheResult<A>, E, R>
	readonly rawGet: <A>(bucket: string, key: string) => Effect.Effect<Option.Option<A>, EdgeCacheIOError>
	readonly rawPut: (
		bucket: string,
		key: string,
		value: unknown,
		ttlSeconds: number,
	) => Effect.Effect<void, EdgeCacheIOError>
}

/**
 * Internal storage interface; exported for tests so they can inject a fake
 * backend that simulates the Workers cache JSON-roundtrip behaviour.
 */
export interface EdgeCacheBackend {
	readonly get: (bucket: string, hash: string, nowMs: number) => Promise<unknown | undefined>
	readonly put: (
		bucket: string,
		hash: string,
		value: unknown,
		ttlSeconds: number,
		nowMs: number,
	) => Promise<void>
}

const SYNTHETIC_HOST = "https://maple-api.internal"

const buildCacheUrl = (bucket: string, hash: string): string => `${SYNTHETIC_HOST}/cache/${bucket}/${hash}`

const sha256Hex = async (input: string): Promise<string> => {
	const bytes = new TextEncoder().encode(input)
	const digest = await crypto.subtle.digest("SHA-256", bytes)
	const view = new Uint8Array(digest)
	let out = ""
	for (let i = 0; i < view.length; i++) {
		out += view[i]!.toString(16).padStart(2, "0")
	}
	return out
}

const detectWorkersCache = (): Cache | null => {
	try {
		const g = globalThis as { caches?: { default?: Cache } }
		return g.caches?.default ?? null
	} catch {
		return null
	}
}

const makeWorkersBackend = (cache: Cache): EdgeCacheBackend => ({
	get: async (bucket, hash) => {
		const response = await cache.match(buildCacheUrl(bucket, hash))
		if (!response) return undefined
		try {
			return (await response.json()) as unknown
		} catch {
			return undefined
		}
	},
	put: async (bucket, hash, value, ttlSeconds) => {
		const body = JSON.stringify(value)
		const response = new Response(body, {
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": `max-age=${ttlSeconds}`,
			},
		})
		await cache.put(buildCacheUrl(bucket, hash), response)
	},
})

interface MemoryEntry {
	readonly value: unknown
	readonly expiresAt: number
}

const makeMemoryBackend = (): EdgeCacheBackend => {
	const store = new Map<string, MemoryEntry>()
	const composite = (bucket: string, hash: string) => `${bucket}:${hash}`

	return {
		get: async (bucket, hash, nowMs) => {
			const entry = store.get(composite(bucket, hash))
			if (!entry) return undefined
			if (entry.expiresAt <= nowMs) {
				store.delete(composite(bucket, hash))
				return undefined
			}
			return entry.value
		},
		put: async (bucket, hash, value, ttlSeconds, nowMs) => {
			store.set(composite(bucket, hash), {
				value,
				expiresAt: nowMs + ttlSeconds * 1000,
			})
		},
	}
}

/**
 * Build an `EdgeCacheServiceShape` against a specific backend. Exported for
 * tests so they can substitute a fake backend (e.g. a JSON-roundtripping one)
 * without going through `detectWorkersCache`.
 */
export const makeEdgeCacheService = (backend: EdgeCacheBackend): EdgeCacheServiceShape => {
	// Heterogeneous in-flight map keyed by bucket+hash; each entry stores a
	// pre-typed awaiter Effect so callers never need to cast Deferred<any, any>.
	const inFlight = new Map<string, DeferredAwaiter<any, any>>()

	const getOrCompute = Effect.fn("EdgeCacheService.getOrCompute")(function* <A, E, R, I = unknown>(
		options: EdgeCacheGetOrComputeOptions<A, I>,
		compute: Effect.Effect<A, E, R>,
	) {
		const hash = yield* Effect.promise(() => sha256Hex(options.key))
		const composite = `${options.bucket}:${hash}`
		const nowMs = yield* Clock.currentTimeMillis

		const cached = yield* Effect.tryPromise({
			try: () => backend.get(options.bucket, hash, nowMs),
			catch: (error) => error,
		}).pipe(
			Effect.tapError((error) =>
				Effect.logWarning("Edge cache get failed; treating as miss").pipe(
					Effect.annotateLogs({
						bucket: options.bucket,
						key: options.key,
						hash,
						error: String(error),
					}),
				),
			),
			Effect.orElseSucceed(() => undefined),
		)
		if (cached !== undefined) {
			if (options.schema) {
				const decoded = yield* Schema.decodeUnknownEffect(options.schema)(cached).pipe(
					Effect.tapError((error) =>
						Effect.logWarning("Edge cache decode failed; treating as miss").pipe(
							Effect.annotateLogs({
								bucket: options.bucket,
								key: options.key,
								hash,
								error: String(error),
							}),
						),
					),
					Effect.option,
				)
				if (Option.isSome(decoded)) {
					return { value: decoded.value, hit: true }
				}
				// Fall through to recompute on decode failure (poisoned/stale entry).
			} else {
				return { value: cached as A, hit: true }
			}
		}

		const existing = inFlight.get(composite)
		if (existing) {
			const value = (yield* existing.await) as A
			return { value, hit: true }
		}

		const deferred = yield* Deferred.make<A, E>()
		inFlight.set(composite, {
			await: Deferred.await(deferred),
		})

		const writeAndPublish = Effect.fnUntraced(function* (value: A) {
			const stored: unknown = options.schema
				? yield* Schema.encodeUnknownEffect(options.schema)(value).pipe(Effect.orDie)
				: value
			const writeNowMs = yield* Clock.currentTimeMillis
			yield* Effect.tryPromise({
				try: () => backend.put(options.bucket, hash, stored, options.ttlSeconds, writeNowMs),
				catch: (error) => error,
			}).pipe(
				Effect.tapError((error) =>
					Effect.logWarning("Edge cache put failed; continuing without cache").pipe(
						Effect.annotateLogs({
							bucket: options.bucket,
							key: options.key,
							hash,
							error: String(error),
						}),
					),
				),
				Effect.ignore,
			)
			yield* Deferred.succeed(deferred, value)
		})

		const body = compute.pipe(
			Effect.tap(writeAndPublish),
			Effect.tapError((error) => Deferred.fail(deferred, error)),
			Effect.onInterrupt(() => Deferred.interrupt(deferred)),
			Effect.ensuring(
				Effect.sync(() => {
					inFlight.delete(composite)
				}),
			),
		)

		const value = yield* body
		return { value, hit: false }
	})

	const rawGet = <A>(bucket: string, key: string): Effect.Effect<Option.Option<A>, EdgeCacheIOError> =>
		Effect.gen(function* () {
			const nowMs = yield* Clock.currentTimeMillis
			return yield* Effect.tryPromise({
				try: () => backend.get(bucket, key, nowMs),
				catch: (cause) =>
					new EdgeCacheIOError({
						op: "get",
						bucket,
						key,
						cause: cause instanceof Error ? cause.message : String(cause),
					}),
			}).pipe(Effect.map((value) => (value === undefined ? Option.none<A>() : Option.some(value as A))))
		})

	const rawPut = (
		bucket: string,
		key: string,
		value: unknown,
		ttlSeconds: number,
	): Effect.Effect<void, EdgeCacheIOError> =>
		Effect.gen(function* () {
			const nowMs = yield* Clock.currentTimeMillis
			return yield* Effect.tryPromise({
				try: () => backend.put(bucket, key, value, ttlSeconds, nowMs),
				catch: (cause) =>
					new EdgeCacheIOError({
						op: "put",
						bucket,
						key,
						cause: cause instanceof Error ? cause.message : String(cause),
					}),
			})
		})

	return { getOrCompute, rawGet, rawPut } satisfies EdgeCacheServiceShape
}

export class EdgeCacheService extends Context.Service<EdgeCacheService, EdgeCacheServiceShape>()(
	"@maple/api/lib/EdgeCacheService",
) {
	static readonly layer = Layer.sync(this, () => {
		const workers = detectWorkersCache()
		return EdgeCacheService.of(
			makeEdgeCacheService(workers ? makeWorkersBackend(workers) : makeMemoryBackend()),
		)
	})
}
