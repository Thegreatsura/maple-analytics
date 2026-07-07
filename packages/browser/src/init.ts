import { type MapleBrowserConfig, type ResolvedConfig, resolveConfig } from "./config"
import { buildSessionMetaRow, getSession, nextMetaVersion } from "@maple/browser-session"
import { setupTracing } from "./tracing"
import { getObservedTraceIds, publishSessionSink as publishLocalSink } from "./session-sink"
import { startRecording, type Recorder } from "./replay/record"
import { startEventCapture, type EventCapture } from "./replay/events"
import { postSessionMeta } from "./replay/transport"

export interface MapleBrowserHandle {
	readonly sessionId: string
	/** Tear down tracing + replay (flushing the final chunk). */
	readonly shutdown: () => Promise<void>
}

let active: MapleBrowserHandle | undefined
// Same object the lifecycle closures capture, so `identify()` mutations are seen
// by the ended-metadata row that `suspend()` posts.
let activeConfig: ResolvedConfig | undefined

/**
 * Initialize Maple browser telemetry: OTel tracing + (sampled) rrweb session
 * replay, both tagged with one shared session id so a trace can link to its
 * replay and vice versa. Idempotent — repeated calls return the live handle.
 */
export function init(rawConfig: MapleBrowserConfig): MapleBrowserHandle {
	if (active) return active
	if (typeof window === "undefined") {
		// SSR / non-browser: no-op handle so isomorphic apps can call init freely.
		return { sessionId: "", shutdown: () => Promise.resolve() }
	}

	const config = resolveConfig(rawConfig)
	activeConfig = config
	// One bounded session per activity window: reused across reloads (so traces
	// and replay chunks correlate), rotated once idle. `startedAt` comes from the
	// record so `duration_ms` reflects the whole session, not just this page load.
	const session = getSession()
	let currentSessionId = session.id
	let currentStartedAt = new Date(session.startedAt)

	// Publish first so external tracers (Effect client SDK) can feed trace ids
	// into this session regardless of init ordering.
	publishLocalSink(currentSessionId)

	const shutdownTracing = config.tracingEnabled ? setupTracing(config, currentSessionId) : undefined

	const recordReplay = config.replayEnabled && Math.random() < config.replaySampleRate
	let recorder: Recorder | undefined
	let events: EventCapture | undefined
	let stopped = !recordReplay

	const postMeta = (status: "active" | "ended", clickCount: number | null, keepalive = false) =>
		postSessionMeta(
			config,
			buildSessionMetaRow({
				sessionId: currentSessionId,
				startedAt: currentStartedAt,
				version: nextMetaVersion(),
				status,
				serviceName: config.serviceName,
				userId: config.userId,
				environment: config.environment,
				serviceVersion: config.serviceVersion,
				clickCount: clickCount ?? 0,
				traceIds: status === "ended" ? getObservedTraceIds() : undefined,
			}),
			keepalive,
		)

	const start = (): void => {
		recorder = startRecording(config, currentSessionId)
		// Distilled events (console/network/error/nav/clicks) ride the same
		// sampling decision as the rrweb recording.
		events = startEventCapture(config, currentSessionId)
		void postMeta("active", null)
	}

	/**
	 * Tab going away (maybe temporarily): flush everything with keepalive, post
	 * the ended row (carrying observed trace ids), and stop capture. Unlike the
	 * old one-shot `finalize`, this is re-entrant — `resume()` restarts capture
	 * when the tab becomes visible again, so a long-lived dashboard tab keeps
	 * recording across tab switches instead of going silent until a reload.
	 */
	const suspend = (): void => {
		if (!recorder || !events) return
		void recorder.flush(true)
		void events.flush(true)
		void postMeta("ended", recorder.getClickCount(), true)
		// flush() snapshots its buffer synchronously before awaiting, so stopping
		// immediately after is safe and clears the rrweb subscription + flush timer.
		recorder.stop()
		events.stop()
		recorder = undefined
		events = undefined
	}

	/**
	 * Tab visible again: re-resolve the session (it may have rotated while the
	 * tab was hidden past the idle window), republish the sink under the new id,
	 * and restart capture. The monotonic meta version means the fresh `active`
	 * row supersedes the `ended` row posted at suspend.
	 */
	const resume = (): void => {
		if (stopped || recorder) return
		const next = getSession()
		if (next.id !== currentSessionId) {
			currentSessionId = next.id
			currentStartedAt = new Date(next.startedAt)
			publishLocalSink(currentSessionId)
		}
		start()
	}

	const onVisibilityChange = (): void => {
		if (document.visibilityState === "hidden") suspend()
		else resume()
	}
	// `visibilitychange → hidden` is the reliable "leaving" signal on mobile;
	// pagehide covers desktop tab close / navigation. A bfcache restore fires
	// `visibilitychange → visible`, which resumes capture.
	const onPageHide = (): void => suspend()

	if (recordReplay) {
		start()
		document.addEventListener("visibilitychange", onVisibilityChange)
		window.addEventListener("pagehide", onPageHide)
	}

	const handle: MapleBrowserHandle = {
		sessionId: currentSessionId,
		shutdown: async () => {
			stopped = true
			document.removeEventListener("visibilitychange", onVisibilityChange)
			window.removeEventListener("pagehide", onPageHide)
			if (recorder) await recorder.flush(true)
			if (events) await events.flush(true)
			recorder?.stop()
			events?.stop()
			recorder = undefined
			events = undefined
			await shutdownTracing?.()
			active = undefined
			activeConfig = undefined
		},
	}
	active = handle
	return handle
}

/**
 * Attach (or replace) the user id on the active session. Idempotent and safe to
 * call on every render. The session's authoritative row is the latest-version
 * "ended" row posted on suspend/unload, which reads `config.userId` at that
 * moment — so an id set here before the session ends is what the session is
 * tagged with. We deliberately do not re-post the active row here (versions are
 * monotonic, but an extra row per identify() call would be pure churn).
 */
export function identify(userId: string): void {
	if (typeof window === "undefined") return
	if (!activeConfig) return
	if (!userId) return
	if (activeConfig.userId === userId) return
	activeConfig.userId = userId
}
