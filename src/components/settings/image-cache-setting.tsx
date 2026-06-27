import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { GlassPanel } from "@/components/ui/glass";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	clearImages,
	refreshStats,
	setThumbCap,
	useImageCache,
} from "@/store/offline-images/images-runtime";

const PRESETS = [
	{ cap: 0, label: "Off" },
	{ cap: 500, label: "500 thumbnails (~12 MB)" },
	{ cap: 1000, label: "1000 thumbnails (~25 MB)" },
	{ cap: 2000, label: "2000 thumbnails (~50 MB)" },
	{ cap: 4000, label: "4000 thumbnails (~100 MB)" },
];

function mb(bytes: number): string {
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Settings card for the always-on browse image cache (L3). */
export function ImageCacheSetting() {
	// S3: per-field selectors in this consuming component.
	const thumbCap = useImageCache((s) => s.thumbCap);
	const thumbs = useImageCache((s) => s.thumbs);
	const hires = useImageCache((s) => s.hires);
	const bytes = useImageCache((s) => s.bytes);
	const status = useImageCache((s) => s.status);

	useEffect(() => {
		// refreshStats() touches Cache Storage, which is absent in non-browser envs
		// (SSR, happy-dom tests). Swallow the error; pre-seeded state is fine.
		void refreshStats().catch(() => undefined);
	}, []);

	const clearing = status === "clearing";

	return (
		<GlassPanel className="flex flex-col gap-3 p-5">
			<div className="flex flex-col gap-1">
				<h2 className="font-display text-lg">Image cache</h2>
				<p className="font-mono text-[12px] text-(--ink-muted)">
					{clearing
						? "Clearing cache..."
						: `Cards you view are kept on this device so they load instantly and work offline. ${thumbs} thumbnails and ${hires} full images cached (${mb(bytes)}).`}
				</p>
			</div>
			<div className="flex flex-wrap items-center gap-3">
				<Select
					value={String(thumbCap)}
					onValueChange={(v) => void setThumbCap(Number(v))}
					disabled={clearing}
				>
					<SelectTrigger className="w-64">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{PRESETS.map((p) => (
							<SelectItem key={p.cap} value={String(p.cap)}>
								{p.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Button
					variant="ghost"
					onClick={() => void clearImages()}
					disabled={clearing}
				>
					Clear cache
				</Button>
			</div>
		</GlassPanel>
	);
}
