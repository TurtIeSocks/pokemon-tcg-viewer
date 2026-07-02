import { create } from "zustand";
import { apiBase } from "../../lib/api-base-client";
import type { DetailCard } from "./corpus-types";
import {
	clearDetail,
	readDetailGz,
	readDetailMeta,
	setDetailEnabled,
	writeDetail,
} from "./detail-store";

type DetailRecord = { id: string } & DetailCard;
interface DetailVersionMeta {
	version: string;
	count: number;
	builtAt: string;
}

export type DetailStatus =
	| "off"
	| "loading"
	| "downloading"
	| "ready"
	| "stale"
	| "error";

interface DetailRuntimeState {
	detailById: Map<string, DetailCard> | null;
	enabled: boolean;
	version: string | null;
	syncedAt: number | null;
	status: DetailStatus;
}

export const useDetailRuntime = create<DetailRuntimeState>(() => ({
	detailById: null,
	enabled: false,
	version: null,
	syncedAt: null,
	status: "off",
}));

// Injectable network seam so tests never hit the wire.
let fetchVersion = async (): Promise<DetailVersionMeta> => {
	const res = await fetch(`${apiBase()}/corpus-detail/version`, {
		cache: "no-store",
	});
	if (!res.ok) throw new Error(`version ${res.status}`);
	return (await res.json()) as DetailVersionMeta;
};
let fetchBlob = async (): Promise<ArrayBuffer> => {
	const res = await fetch(`${apiBase()}/corpus-detail`);
	if (!res.ok) throw new Error(`detail ${res.status}`);
	return res.arrayBuffer();
};

export function setDetailFetchersForTests(f: {
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

function buildMap(records: DetailRecord[]): Map<string, DetailCard> {
	const m = new Map<string, DetailCard>();
	for (const { id, ...rest } of records) m.set(id, rest);
	return m;
}

/** Boot: if offline detail is enabled, hydrate the map from IDB. No network. */
export async function loadDetail(): Promise<void> {
	const meta = await readDetailMeta();
	if (!meta?.enabled) {
		useDetailRuntime.setState({ enabled: false, status: "off" });
		return;
	}
	useDetailRuntime.setState({ enabled: true, status: "loading" });
	const gz = await readDetailGz();
	if (!gz) {
		useDetailRuntime.setState({ status: "off", enabled: false });
		return;
	}
	const records = JSON.parse(await gunzip(gz)) as DetailRecord[];
	useDetailRuntime.setState({
		detailById: buildMap(records),
		version: meta.version,
		syncedAt: meta.syncedAt,
		status: "ready",
	});
}

/** Download the blob, store it, build the map, and turn the feature on. */
export async function enableOffline(): Promise<void> {
	useDetailRuntime.setState({ status: "downloading", enabled: true });
	try {
		const [{ version, count }, gz] = await Promise.all([
			fetchVersion(),
			fetchBlob(),
		]);
		const records = JSON.parse(await gunzip(gz)) as DetailRecord[];
		const syncedAt = Date.now();
		await writeDetail(gz, { version, syncedAt, count, enabled: true });
		useDetailRuntime.setState({
			detailById: buildMap(records),
			version,
			syncedAt,
			status: "ready",
		});
	} catch {
		// Nothing persisted on failure; drop the in-memory enabled flag so a retry
		// starts clean and a reload (loadDetail) sees the feature off.
		useDetailRuntime.setState({ status: "error", enabled: false });
	}
}

/** Re-download only if the server version differs from the stored one. */
export async function syncDetail(): Promise<void> {
	try {
		const { version } = await fetchVersion();
		// The user may disable the feature while the version fetch is in
		// flight; a disabled feature has no sync status to report and must
		// not be re-downloaded/re-enabled behind their back.
		if (!useDetailRuntime.getState().enabled) return;
		if (version === useDetailRuntime.getState().version) {
			useDetailRuntime.setState({ status: "ready" });
			return;
		}
		await enableOffline();
	} catch {
		useDetailRuntime.setState({ status: "error" });
	}
}

/** Cheap probe: mark stale (do not download) when the server version differs. */
export async function checkStale(): Promise<void> {
	if (!useDetailRuntime.getState().enabled) return;
	try {
		const { version } = await fetchVersion();
		if (version !== useDetailRuntime.getState().version) {
			useDetailRuntime.setState({ status: "stale" });
		}
	} catch {
		// offline / transient: leave status as-is.
	}
}

export async function disableOffline(): Promise<void> {
	await clearDetail();
	useDetailRuntime.setState({
		detailById: null,
		enabled: false,
		version: null,
		syncedAt: null,
		status: "off",
	});
}

export async function resetDetailRuntimeForTests(): Promise<void> {
	await clearDetail();
	await setDetailEnabled(false);
	useDetailRuntime.setState({
		detailById: null,
		enabled: false,
		version: null,
		syncedAt: null,
		status: "off",
	});
}
