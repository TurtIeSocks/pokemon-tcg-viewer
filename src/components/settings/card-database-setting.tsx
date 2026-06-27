import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { GlassPanel } from "@/components/ui/glass";
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
	const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
	const min = Math.round((Date.now() - ms) / 60000);
	if (min < 60) return rtf.format(-min, "minute");
	const hr = Math.round(min / 60);
	if (hr < 24) return rtf.format(-hr, "hour");
	return rtf.format(-Math.round(hr / 24), "day");
}

/** Settings card for the offline card-detail database (L1). */
export function CardDatabaseSetting() {
	// S3: per-field selectors.
	const status = useDetailRuntime((s) => s.status);
	const syncedAt = useDetailRuntime((s) => s.syncedAt);
	// Staleness check on mount (this is L1's check, moved off the dropdown).
	useEffect(() => {
		void checkStale();
	}, []);

	const busy = status === "downloading" || status === "loading";
	return (
		<GlassPanel className="flex flex-col gap-3 p-5">
			<div className="flex flex-col gap-1">
				<h2 className="font-display text-lg">Card database</h2>
				<p className="font-mono text-[12px] text-(--ink-muted)">
					{status === "ready" && syncedAt
						? `Saved on this device. Synced ${relativeTime(syncedAt)}.`
						: status === "stale"
							? "Card data updated. Re-sync to refresh."
							: status === "error"
								? "Download failed."
								: `Battle data, rules, and flavor text for instant, offline card views (${SIZE}).`}
				</p>
			</div>
			<div className="flex flex-wrap gap-2">
				{status === "off" || status === "error" ? (
					<Button onClick={() => void enableOffline()} disabled={busy}>
						{status === "error" ? "Retry download" : `Download (${SIZE})`}
					</Button>
				) : null}
				{busy ? <Button disabled>Downloading...</Button> : null}
				{status === "stale" ? (
					<Button onClick={() => void syncDetail()}>Re-sync ({SIZE})</Button>
				) : null}
				{(status === "ready" || status === "stale") && (
					<Button variant="ghost" onClick={() => void disableOffline()}>
						Remove
					</Button>
				)}
			</div>
		</GlassPanel>
	);
}
