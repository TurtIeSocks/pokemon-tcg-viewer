import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GlassPanel } from "@/components/ui/glass";
import type { Region } from "@/lib/languages";
import { loadCorpus } from "@/store/corpus/corpus-runtime";
import { useCorpusRuntime } from "@/store/corpus/corpus-runtime-store";
import { clearCorpus } from "@/store/corpus/corpus-store";

/**
 * Settings card: force a re-download of the local card database (the corpus
 * blob of battle data, names, and set metadata) for whatever region(s) are
 * currently loaded.
 *
 * HONEST CAVEAT (surfaced in the helper copy): this is a revalidation, not a
 * guaranteed content change. It wipes the local IndexedDB copy and re-fetches
 * with a fresh conditional GET; if the server copy is unchanged, the SAME data
 * is simply re-adopted. It is the fix for a corrupted local copy, and it pulls a
 * newer catalog when one has shipped.
 *
 * The refresh reads the runtime imperatively (getState) rather than
 * subscribing, so there is no re-render coupling; local `busy` state drives the
 * button across the clear -> reset -> refetch span.
 */
export function CorpusDatabaseSetting() {
	const [busy, setBusy] = useState(false);

	async function refresh(): Promise<void> {
		setBusy(true);
		try {
			const runtime = useCorpusRuntime.getState();
			// Refresh every region currently held in memory; fall back to the active
			// region on a cold visit where nothing has loaded yet.
			const loaded = Object.keys(runtime.indices) as Region[];
			const regions = loaded.length > 0 ? loaded : [runtime.activeRegion];
			// 1. Wipe each region's IndexedDB blob + meta.
			await Promise.all(regions.map((region) => clearCorpus(region)));
			// 2. Drop the in-memory indices so loadCorpus won't early-return.
			runtime.reset();
			// 3. Re-fetch each region (conditional GET; adopts any newer build).
			await Promise.all(regions.map((region) => loadCorpus(region)));
		} finally {
			setBusy(false);
		}
	}

	return (
		<GlassPanel className="flex flex-col gap-3 p-5">
			<div className="flex flex-col gap-1">
				<h2 className="font-display text-lg">Refresh card database</h2>
				<p className="font-mono text-[12px] text-(--ink-muted)">
					{busy
						? "Refreshing card database..."
						: "Forces a re-download and revalidation of the local card database. If the server copy is unchanged, the same data is re-adopted. Use this to clear local corruption or pull a newer catalog."}
				</p>
			</div>
			<div className="flex flex-wrap gap-2">
				<Button variant="ghost" onClick={() => void refresh()} disabled={busy}>
					{busy ? "Refreshing..." : "Refresh"}
				</Button>
			</div>
		</GlassPanel>
	);
}
