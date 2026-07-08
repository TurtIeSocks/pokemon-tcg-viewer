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
import { m } from "@/paraglide/messages";
import {
	clearImages,
	refreshStats,
	setThumbCap,
	useImageCache,
} from "@/store/offline-images/images-runtime";

/** Cap presets. `label` is a thunk (not called at module scope) so it always
 *  reads the active locale at render time. */
const PRESETS = [
	{ cap: 0, label: () => m.settings_image_cache_preset_off() },
	{ cap: 500, label: () => m.settings_image_cache_preset_500() },
	{ cap: 1000, label: () => m.settings_image_cache_preset_1000() },
	{ cap: 2000, label: () => m.settings_image_cache_preset_2000() },
	{ cap: 4000, label: () => m.settings_image_cache_preset_4000() },
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
		const poll = () => void refreshStats().catch(() => undefined);
		poll();
		// Re-poll on window focus so the count reflects images the SW cached while
		// the user was browsing away from this panel.
		window.addEventListener("focus", poll);
		return () => window.removeEventListener("focus", poll);
	}, []);

	const clearing = status === "clearing";

	return (
		<GlassPanel className="flex flex-col gap-3 p-5">
			<div className="flex flex-col gap-1">
				<h2 className="font-display text-lg">
					{m.settings_image_cache_title()}
				</h2>
				<p className="font-mono text-[12px] text-(--ink-muted)">
					{clearing
						? m.settings_image_cache_clearing()
						: m.settings_image_cache_description({
								thumbs,
								hires,
								size: mb(bytes),
							})}
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
								{p.label()}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Button
					variant="ghost"
					onClick={() => void refreshStats()}
					disabled={clearing}
				>
					{m.settings_refresh()}
				</Button>
				<Button
					variant="ghost"
					onClick={() => void clearImages()}
					disabled={clearing}
				>
					{m.settings_image_cache_clear()}
				</Button>
			</div>
		</GlassPanel>
	);
}
