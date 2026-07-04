import { create } from "zustand";
import { apiBase } from "../../lib/api-base-client";
import type { HistoryPoint, SetHistory } from "../../lib/corpus/price-history";
import { clearHistory, readHistoryGz, writeHistory } from "./history-store";

export type HistoryStatus =
	| "idle" // not loaded yet
	| "loading" // hydrating from IDB / downloading
	| "ready" // set's history in memory
	| "unavailable" // server has no history for this set yet (503) — expected pre-accrual
	| "error";

interface HistoryRuntimeState {
	/** setId → per-card history, once loaded. Sets with no history simply have no entry. */
	bySet: Map<string, SetHistory>;
	/** setId → load status, for sets that have been requested at least once. */
	statusBySet: Map<string, HistoryStatus>;
}

// Non-persisted, like the corpus + i18n + prices runtimes.
export const useHistoryRuntime = create<HistoryRuntimeState>(() => ({
	bySet: new Map(),
	statusBySet: new Map(),
}));

/** Thrown when the server has no history for this set yet (503) — expected before accrual. */
class HistoryUnavailable extends Error {}

function isUnavailable(e: unknown): boolean {
	return (
		e instanceof HistoryUnavailable ||
		(e instanceof Response && e.status === 503) ||
		(typeof e === "object" &&
			e !== null &&
			"status" in e &&
			(e as { status: unknown }).status === 503)
	);
}

// Injectable network seam so tests never hit the wire (mirrors i18n/prices-runtime).
let fetchHistory = async (setId: string): Promise<ArrayBuffer> => {
	const res = await fetch(`${apiBase()}/corpus-prices/history/${setId}`);
	if (res.status === 503) throw new HistoryUnavailable();
	if (!res.ok) throw new Error(`history ${setId} ${res.status}`);
	return res.arrayBuffer();
};

export function setHistoryFetchersForTests(f: {
	fetchHistory: typeof fetchHistory;
}): void {
	fetchHistory = f.fetchHistory;
}

async function gunzip(buf: ArrayBuffer): Promise<string> {
	const ds = new DecompressionStream("gzip");
	const stream = new Blob([buf]).stream().pipeThrough(ds);
	return await new Response(stream).text();
}

function setStatus(setId: string, status: HistoryStatus): void {
	useHistoryRuntime.setState((s) => {
		const statusBySet = new Map(s.statusBySet);
		statusBySet.set(setId, status);
		return { statusBySet };
	});
}

function commit(setId: string, history: SetHistory): void {
	useHistoryRuntime.setState((s) => {
		const bySet = new Map(s.bySet);
		bySet.set(setId, history);
		const statusBySet = new Map(s.statusBySet);
		statusBySet.set(setId, "ready");
		return { bySet, statusBySet };
	});
}

// De-dupe concurrent loads of the same set (e.g. two components mounting at once).
const inFlight = new Map<string, Promise<void>>();

/**
 * Load `setId`'s price history: IDB-first (no network), download once when
 * nothing is stored. Idempotent per set — a second call while ready or
 * in-flight is a no-op. A 503 (no history built yet for this set) resolves to
 * the set being absent from `bySet` — never a thrown error.
 */
export function loadSetHistory(setId: string): Promise<void> {
	const status = useHistoryRuntime.getState().statusBySet.get(setId);
	if (status === "ready" || status === "loading") return Promise.resolve();

	const existing = inFlight.get(setId);
	if (existing) return existing;

	const task = (async () => {
		setStatus(setId, "loading");
		const gz = await readHistoryGz(setId);
		if (gz) {
			const history = JSON.parse(await gunzip(gz)) as SetHistory;
			commit(setId, history);
			return;
		}
		try {
			const fetched = await fetchHistory(setId);
			const history = JSON.parse(await gunzip(fetched)) as SetHistory;
			await writeHistory(setId, fetched);
			commit(setId, history);
		} catch (e) {
			setStatus(setId, isUnavailable(e) ? "unavailable" : "error");
		}
	})().finally(() => {
		inFlight.delete(setId);
	});
	inFlight.set(setId, task);
	return task;
}

/** A single card's history points within `setId`; null before load or when absent. */
export function useCardHistory(
	cardId: string,
	setId: string,
): HistoryPoint[] | null {
	return useHistoryRuntime((s) => s.bySet.get(setId)?.[cardId] ?? null);
}

export async function resetHistoryRuntimeForTests(
	setIds: readonly string[] = ["base1", "nope"],
): Promise<void> {
	for (const setId of setIds) await clearHistory(setId);
	inFlight.clear();
	useHistoryRuntime.setState({ bySet: new Map(), statusBySet: new Map() });
}
