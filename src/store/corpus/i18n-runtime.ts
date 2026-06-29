import { create } from "zustand";
import { apiBase } from "../../lib/api-base-client";
import { clearI18n, readI18nGz, readI18nMeta, writeI18n } from "./i18n-store";

/** One overlay entry: TCGdex card id → localized name. Matches build-i18n. */
interface I18nEntry {
	id: string;
	name: string;
}

interface I18nVersionMeta {
	version: string;
	count: number;
	builtAt: string;
}

export type I18nStatus =
	| "idle" // en (no overlay needed) — the steady state for en-only users
	| "loading" // hydrating from IDB
	| "downloading" // fetching the blob over the network
	| "ready" // overlay in memory
	| "stale" // a newer version exists on the server (cheap probe)
	| "error";

interface I18nRuntimeState {
	/** The active catalog render language. "en" means no overlay. */
	lang: string;
	/** Active overlay map for `lang`; null for "en" or before load. */
	namesById: Map<string, string> | null;
	/** Content version of the in-memory overlay (null for en/none). */
	version: string | null;
	status: I18nStatus;
}

// Non-persisted, like the corpus + detail runtimes. Holds only the ACTIVE
// language's overlay; switching languages swaps it (and lazily downloads).
export const useI18nRuntime = create<I18nRuntimeState>(() => ({
	lang: "en",
	namesById: null,
	version: null,
	status: "idle",
}));

// Injectable network seams so tests never hit the wire (mirrors detail-runtime).
let fetchVersion = async (lang: string): Promise<I18nVersionMeta> => {
	const res = await fetch(`${apiBase()}/corpus-i18n/${lang}/version`, {
		cache: "no-store",
	});
	if (!res.ok) throw new Error(`i18n version ${res.status}`);
	return (await res.json()) as I18nVersionMeta;
};
let fetchBlob = async (lang: string): Promise<ArrayBuffer> => {
	const res = await fetch(`${apiBase()}/corpus-i18n/${lang}`);
	if (!res.ok) throw new Error(`i18n ${res.status}`);
	return res.arrayBuffer();
};

export function setI18nFetchersForTests(f: {
	fetchVersion: typeof fetchVersion;
	fetchBlob: typeof fetchBlob;
}): void {
	fetchVersion = f.fetchVersion;
	fetchBlob = f.fetchBlob;
}

async function gunzip(buf: ArrayBuffer): Promise<string> {
	const ds = new DecompressionStream("gzip");
	const stream = new Blob([buf]).stream().pipeThrough(ds);
	return await new Response(stream).text();
}

function buildMap(records: I18nEntry[]): Map<string, string> {
	const m = new Map<string, string>();
	for (const { id, name } of records) m.set(id, name);
	return m;
}

/** Clear the active overlay and return to the en steady state. */
function setEnglish(): void {
	useI18nRuntime.setState({
		lang: "en",
		namesById: null,
		version: null,
		status: "idle",
	});
}

// De-dupe concurrent downloads of the same language (e.g. a switch + a sync).
const inFlight = new Map<string, Promise<void>>();

/**
 * Make `lang` the active overlay. en clears the overlay. For a non-en language,
 * hydrate IDB-first (no network) and, when nothing is stored, download once.
 * Idempotent: re-selecting the already-active language with a loaded overlay is
 * a no-op. Switching languages always swaps the active overlay.
 */
export async function loadI18n(lang: string): Promise<void> {
	if (lang === "en") {
		setEnglish();
		return;
	}
	const s = useI18nRuntime.getState();
	if (s.lang === lang && s.namesById && s.status === "ready") return;

	// Mark the active language immediately so the UI reflects the switch; the
	// overlay map follows once it loads. (lang set first, namesById cleared so a
	// stale previous-language map never renders against the new lang.)
	useI18nRuntime.setState({
		lang,
		namesById: null,
		version: null,
		status: "loading",
	});

	const meta = await readI18nMeta(lang);
	const gz = meta ? await readI18nGz(lang) : undefined;
	if (meta && gz) {
		// Guard against an interleaved switch landing first: only commit if we are
		// still the active language.
		if (useI18nRuntime.getState().lang !== lang) return;
		const records = JSON.parse(await gunzip(gz)) as I18nEntry[];
		if (useI18nRuntime.getState().lang !== lang) return;
		useI18nRuntime.setState({
			namesById: buildMap(records),
			version: meta.version,
			status: "ready",
		});
		return;
	}
	await downloadI18n(lang);
}

/** Download the overlay blob, persist it, build the map, mark ready. */
export async function downloadI18n(lang: string): Promise<void> {
	if (lang === "en") {
		setEnglish();
		return;
	}
	const existing = inFlight.get(lang);
	if (existing) return existing;

	const task = (async () => {
		// Only show "downloading" if this language is the active one.
		if (useI18nRuntime.getState().lang === lang)
			useI18nRuntime.setState({ status: "downloading" });
		try {
			const [{ version, count }, gz] = await Promise.all([
				fetchVersion(lang),
				fetchBlob(lang),
			]);
			const records = JSON.parse(await gunzip(gz)) as I18nEntry[];
			const syncedAt = Date.now();
			await writeI18n(lang, gz, { version, syncedAt, count });
			// A switch may have moved on while we were downloading — persist the
			// bytes regardless (cached for next time) but only commit to memory if
			// still active.
			if (useI18nRuntime.getState().lang === lang)
				useI18nRuntime.setState({
					namesById: buildMap(records),
					version,
					status: "ready",
				});
		} catch {
			if (useI18nRuntime.getState().lang === lang)
				useI18nRuntime.setState({ status: "error" });
		}
	})().finally(() => {
		inFlight.delete(lang);
	});
	inFlight.set(lang, task);
	return task;
}

/** Re-download `lang` only if the server version differs from the stored one. */
export async function syncI18n(lang: string): Promise<void> {
	if (lang === "en") return;
	try {
		const { version } = await fetchVersion(lang);
		const stored = await readI18nMeta(lang);
		if (stored && stored.version === version) {
			// Up to date; if it's the active language make sure it's loaded.
			if (useI18nRuntime.getState().lang === lang) await loadI18n(lang);
			return;
		}
		await downloadI18n(lang);
	} catch {
		if (useI18nRuntime.getState().lang === lang)
			useI18nRuntime.setState({ status: "error" });
	}
}

/** Cheap probe: mark the active overlay stale (no download) when the server version differs. */
export async function checkStale(lang: string): Promise<void> {
	if (lang === "en") return;
	if (useI18nRuntime.getState().lang !== lang) return;
	try {
		const { version } = await fetchVersion(lang);
		if (version !== useI18nRuntime.getState().version)
			useI18nRuntime.setState({ status: "stale" });
	} catch {
		// offline / transient: leave status as-is.
	}
}

export async function resetI18nRuntimeForTests(
	langs: readonly string[] = ["fr", "de", "es", "it", "pt"],
): Promise<void> {
	for (const lang of langs) await clearI18n(lang);
	inFlight.clear();
	setEnglish();
}
