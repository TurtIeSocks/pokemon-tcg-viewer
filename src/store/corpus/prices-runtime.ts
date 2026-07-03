import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { apiBase } from "../../lib/api-base-client";
import type { CardPriceEntry, PricesBlob } from "../../lib/corpus/price-types";
import {
	clearPrices,
	readPricesGz,
	readPricesMeta,
	writePrices,
} from "./prices-store";

export type PricesStatus =
	| "idle" // not loaded yet
	| "loading" // hydrating from IDB
	| "downloading" // fetching over the network
	| "ready" // blob in memory
	| "unavailable" // server has no blob yet (503) — expected before first build
	| "error";

/** In-memory blob meta (everything except the per-card map). */
export interface PricesMetaState {
	date: string;
	sources: { tp: string | null; cm: string | null };
	fx: PricesBlob["fx"];
}

interface PricesRuntimeState {
	/** cardId → price entry; null before load. */
	byId: Map<string, CardPriceEntry> | null;
	meta: PricesMetaState | null;
	status: PricesStatus;
}

// Non-persisted, like the corpus + i18n runtimes. One global blob.
export const usePricesRuntime = create<PricesRuntimeState>(() => ({
	byId: null,
	meta: null,
	status: "idle",
}));

interface VersionMeta {
	date: string;
	count: number;
	builtAt: string;
}

/** Thrown when the server has no blob yet (503) — an expected pre-launch state. */
class PricesUnavailable extends Error {}

function isUnavailable(e: unknown): boolean {
	return (
		e instanceof PricesUnavailable ||
		(typeof e === "object" &&
			e !== null &&
			"status" in e &&
			(e as { status: unknown }).status === 503)
	);
}

// Injectable network seams so tests never hit the wire (mirrors i18n-runtime).
let fetchVersion = async (): Promise<VersionMeta> => {
	const res = await fetch(`${apiBase()}/corpus-prices/version`, {
		cache: "no-store",
	});
	if (res.status === 503) throw new PricesUnavailable();
	if (!res.ok) throw new Error(`prices version ${res.status}`);
	return (await res.json()) as VersionMeta;
};
let fetchBlob = async (): Promise<ArrayBuffer> => {
	const res = await fetch(`${apiBase()}/corpus-prices`);
	if (res.status === 503) throw new PricesUnavailable();
	if (!res.ok) throw new Error(`prices ${res.status}`);
	return res.arrayBuffer();
};

export function setPricesFetchersForTests(f: {
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

function commit(blob: PricesBlob): void {
	usePricesRuntime.setState({
		byId: new Map(Object.entries(blob.cards)),
		meta: { date: blob.date, sources: blob.sources, fx: blob.fx },
		status: "ready",
	});
}

// De-dupe concurrent downloads (e.g. two tabs mounting at once).
let inFlight: Promise<void> | null = null;

/** Hydrate IDB-first (no network); download once when nothing is stored. Idempotent. */
export async function loadPrices(): Promise<void> {
	const s = usePricesRuntime.getState();
	if (
		s.status === "ready" ||
		s.status === "loading" ||
		s.status === "downloading"
	)
		return;
	usePricesRuntime.setState({ status: "loading" });
	const meta = await readPricesMeta();
	const gz = meta ? await readPricesGz() : undefined;
	if (meta && gz) {
		commit(JSON.parse(await gunzip(gz)) as PricesBlob);
		return;
	}
	await downloadPrices();
}

/** Download the blob, persist it, commit to memory. Deduped. */
export async function downloadPrices(): Promise<void> {
	if (inFlight) return inFlight;
	const task = (async () => {
		usePricesRuntime.setState({ status: "downloading" });
		try {
			const [{ date, count }, gz] = await Promise.all([
				fetchVersion(),
				fetchBlob(),
			]);
			const blob = JSON.parse(await gunzip(gz)) as PricesBlob;
			await writePrices(gz, { date, syncedAt: Date.now(), count });
			commit(blob);
		} catch (e) {
			usePricesRuntime.setState({
				status: isUnavailable(e) ? "unavailable" : "error",
			});
		}
	})().finally(() => {
		inFlight = null;
	});
	inFlight = task;
	return task;
}

/** Re-download only when the server's blob date differs from the stored one. */
export async function syncPrices(): Promise<void> {
	try {
		const { date } = await fetchVersion();
		const stored = await readPricesMeta();
		if (stored && stored.date === date) {
			if (usePricesRuntime.getState().status !== "ready") await loadPrices();
			return;
		}
		await downloadPrices();
	} catch (e) {
		if (isUnavailable(e)) usePricesRuntime.setState({ status: "unavailable" });
	}
}

/** Per-card price entry. Stable `Map.get` reference → cheap S3 subscription. */
export function useCardPriceEntry(cardId: string): CardPriceEntry | null {
	return usePricesRuntime((s) => s.byId?.get(cardId) ?? null);
}

/** The two source dates for line timestamps — narrow fixed slice. */
export function usePriceSourceDates(): {
	tpDate: string | null;
	cmDate: string | null;
} {
	return usePricesRuntime(
		useShallow((s) => ({
			tpDate: s.meta?.sources.tp ?? null,
			cmDate: s.meta?.sources.cm ?? null,
		})),
	);
}

export async function resetPricesRuntimeForTests(): Promise<void> {
	await clearPrices();
	inFlight = null;
	usePricesRuntime.setState({ byId: null, meta: null, status: "idle" });
}
