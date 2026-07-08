import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { GlassPanel } from "@/components/ui/glass";
import { bcp47 } from "@/lib/bcp47";
import type { Region } from "@/lib/languages";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { loadCorpus } from "@/store/corpus/corpus-runtime";
import { useCorpusRuntime } from "@/store/corpus/corpus-runtime-store";
import { clearCorpus } from "@/store/corpus/corpus-store";
import {
	checkStale,
	disableOffline,
	enableOffline,
	syncDetail,
	useDetailRuntime,
} from "@/store/corpus/detail-runtime";

const SIZE = "~2.1 MiB";

/** "3 days ago" / "yesterday" style label for the last sync. */
function relativeTime(ms: number): string {
	const rtf = new Intl.RelativeTimeFormat(bcp47(getLocale()), {
		numeric: "auto",
	});
	const min = Math.round((Date.now() - ms) / 60000);
	if (min < 60) return rtf.format(-min, "minute");
	const hr = Math.round(min / 60);
	if (hr < 24) return rtf.format(-hr, "hour");
	return rtf.format(-Math.round(hr / 24), "day");
}

/**
 * Settings card for the on-device card data. Unifies two caches that used to be
 * separate cards (confusingly, the old "Refresh card database" sat under "Card
 * database" but refreshed a DIFFERENT store): the always-loaded browse CATALOG
 * (the corpus) and the OPT-IN offline detail DB (L1: battle data, rules, flavor).
 *
 * - "Download for offline" toggles the detail DB (enable/disable).
 * - "Refresh" revalidates the catalog (wipe local corpus + conditional re-fetch,
 *   adopting a newer build if one shipped) AND re-syncs the detail DB when it is
 *   enabled, so one button refreshes everything this card owns. The refresh reads
 *   the corpus runtime imperatively (getState), so there is no re-render coupling.
 */
export function CardDatabaseSetting() {
	// S3: per-field selectors.
	const status = useDetailRuntime((s) => s.status);
	const syncedAt = useDetailRuntime((s) => s.syncedAt);
	const [refreshing, setRefreshing] = useState(false);

	// Staleness check on mount (this is L1's check, moved off the dropdown).
	useEffect(() => {
		void checkStale();
	}, []);

	const offlineOn = status === "ready" || status === "stale";
	const detailBusy = status === "downloading" || status === "loading";
	const busy = detailBusy || refreshing;

	async function refresh(): Promise<void> {
		setRefreshing(true);
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
			// 4. If offline details are on, re-sync those too so Refresh refreshes
			//    everything this card represents, not just the catalog.
			if (offlineOn) await syncDetail();
		} finally {
			setRefreshing(false);
		}
	}

	const description = refreshing
		? m.settings_card_database_refreshing()
		: status === "ready" && syncedAt
			? m.settings_card_database_synced({ time: relativeTime(syncedAt) })
			: status === "stale"
				? m.settings_card_database_stale()
				: status === "error"
					? m.settings_card_database_download_failed()
					: m.settings_card_database_description({ size: SIZE });

	return (
		<GlassPanel className="flex flex-col gap-3 p-5">
			<div className="flex flex-col gap-1">
				<h2 className="font-display text-lg">
					{m.settings_card_database_title()}
				</h2>
				<p className="font-mono text-[12px] text-(--ink-muted)">
					{description}
				</p>
			</div>
			<div className="flex flex-wrap gap-2">
				{status === "off" || status === "error" ? (
					<Button onClick={() => void enableOffline()} disabled={busy}>
						{status === "error"
							? m.settings_card_database_retry()
							: m.settings_card_database_download({ size: SIZE })}
					</Button>
				) : null}
				{detailBusy ? (
					<Button disabled>{m.settings_card_database_downloading()}</Button>
				) : null}
				{offlineOn ? (
					<Button
						variant="ghost"
						onClick={() => void disableOffline()}
						disabled={busy}
					>
						{m.settings_card_database_remove_offline()}
					</Button>
				) : null}
				<Button variant="ghost" onClick={() => void refresh()} disabled={busy}>
					{refreshing ? m.settings_refreshing() : m.settings_refresh()}
				</Button>
			</div>
		</GlassPanel>
	);
}
