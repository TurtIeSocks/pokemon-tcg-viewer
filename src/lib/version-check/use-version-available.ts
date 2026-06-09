import { useCallback, useEffect, useRef, useState } from "react";

export interface UseVersionAvailableOptions {
	/** Endpoint serving `{ version }`. Default `/version.json`. */
	url?: string;
	/** Foreground poll interval in ms. Default 60_000. */
	intervalMs?: number;
	/** Master switch. Default: on outside dev. */
	enabled?: boolean;
}

export interface VersionAvailable {
	updateReady: boolean;
	latestVersion: string | null;
	dismiss: () => void;
}

function bootVersion(): string {
	// Vite replaces the bare token at build; guard for non-Vite runtimes (tests).
	return typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
}

export function useVersionAvailable(
	options: UseVersionAvailableOptions = {},
): VersionAvailable {
	const {
		url = "/version.json",
		intervalMs = 60_000,
		enabled = !import.meta.env.DEV,
	} = options;

	const boot = useRef(bootVersion());
	const dismissed = useRef<string | null>(null);
	const latest = useRef<string | null>(null);
	const [updateReady, setUpdateReady] = useState(false);
	const [latestVersion, setLatestVersion] = useState<string | null>(null);

	const check = useCallback(
		async (signal: AbortSignal) => {
			try {
				const res = await fetch(`${url}?t=${Date.now()}`, {
					cache: "no-store",
					signal,
				});
				if (!res.ok) return;
				const data = (await res.json()) as { version?: unknown };
				const version = typeof data.version === "string" ? data.version : null;
				if (version === null || signal.aborted) return;
				latest.current = version;
				setLatestVersion(version);
				setUpdateReady(
					version !== boot.current && version !== dismissed.current,
				);
			} catch {
				// offline / aborted / parse failure → never surface as an update
			}
		},
		[url],
	);

	useEffect(() => {
		if (!enabled) return;

		let controller: AbortController | null = null;
		const run = () => {
			controller?.abort();
			controller = new AbortController();
			void check(controller.signal);
		};

		let timer: ReturnType<typeof setInterval> | null = null;
		const startTimer = () => {
			if (timer === null) timer = setInterval(run, intervalMs);
		};
		const stopTimer = () => {
			if (timer !== null) {
				clearInterval(timer);
				timer = null;
			}
		};

		const onVisibility = () => {
			if (document.visibilityState === "visible") {
				run();
				startTimer();
			} else {
				stopTimer();
			}
		};

		run();
		if (document.visibilityState === "visible") startTimer();
		window.addEventListener("focus", run);
		document.addEventListener("visibilitychange", onVisibility);

		return () => {
			controller?.abort();
			stopTimer();
			window.removeEventListener("focus", run);
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, [enabled, intervalMs, check]);

	const dismiss = useCallback(() => {
		dismissed.current = latest.current;
		setUpdateReady(false);
	}, []);

	return { updateReady, latestVersion, dismiss };
}
