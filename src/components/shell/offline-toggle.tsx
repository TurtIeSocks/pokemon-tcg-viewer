import { Check, CloudDownload, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
	disableOffline,
	enableOffline,
	syncDetail,
	useDetailRuntime,
} from "@/store/corpus/detail-runtime";

const SIZE = "~2.1 MiB";

/** Sidebar menu control for the optional offline card-detail blob. */
export function OfflineToggle() {
	// S3: per-field selectors in the consuming component.
	const status = useDetailRuntime((s) => s.status);
	const syncedAt = useDetailRuntime((s) => s.syncedAt);

	if (status === "downloading" || status === "loading") {
		return (
			<DropdownMenuItem disabled>
				<Loader2 className="animate-spin motion-reduce:animate-none" />
				Downloading card details...
			</DropdownMenuItem>
		);
	}

	if (status === "stale") {
		return (
			<DropdownMenuItem
				onSelect={(e) => {
					e.preventDefault();
					void syncDetail();
				}}
			>
				<RefreshCw />
				Card details updated. Re-sync ({SIZE}).
			</DropdownMenuItem>
		);
	}

	if (status === "ready") {
		const savedLabel = syncedAt ? `Card details saved.` : "Card details saved.";
		return (
			<>
				<DropdownMenuItem disabled>
					<Check className="text-(--success)" />
					{savedLabel}
				</DropdownMenuItem>
				<DropdownMenuItem
					onSelect={(e) => {
						e.preventDefault();
						void disableOffline();
					}}
				>
					<Trash2 />
					Remove offline data
				</DropdownMenuItem>
			</>
		);
	}

	// off | error
	return (
		<DropdownMenuItem
			onSelect={(e) => {
				e.preventDefault();
				void enableOffline();
			}}
		>
			<CloudDownload />
			{status === "error"
				? "Download failed. Retry."
				: `Download card details (${SIZE})`}
		</DropdownMenuItem>
	);
}
