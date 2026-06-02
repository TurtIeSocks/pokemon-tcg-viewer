import { Link } from "@tanstack/react-router";
import { LIST_SEARCH_DEFAULTS } from "../../lib/list-search";
import type { NavSet } from "../../lib/nav-tree";
import "../booster-pack/booster-pack.css";

/** Non-interactive booster-pack-styled tile that navigates to the set page. */
export function SetTile({
	seriesSlug,
	set,
	ownedCount,
}: {
	seriesSlug: string;
	set: NavSet;
	ownedCount?: number;
}) {
	const showCount = ownedCount != null;
	const pct =
		showCount && set.total > 0
			? Math.min(100, Math.round((ownedCount / set.total) * 100))
			: 0;
	return (
		<Link
			to="/$series/$set"
			params={{ series: seriesSlug, set: set.slug }}
			search={LIST_SEARCH_DEFAULTS}
			className="booster-pack w-full max-w-full"
			aria-label={`Browse ${set.name}`}
		>
			<span className="booster-pack-foil" aria-hidden="true" />
			<span className="booster-pack-art">
				<img
					className="booster-pack-logo max-w-full h-auto object-contain"
					src={set.logo}
					alt=""
				/>
				<strong className="booster-pack-name">{set.name}</strong>
			</span>
			<img
				className="booster-pack-symbol max-w-full h-auto object-contain"
				src={set.symbol}
				alt=""
				aria-hidden="true"
			/>
			{showCount && (
				<>
					<span className="absolute left-0 right-0 top-1/2 -translate-y-1/2 z-10 flex flex-col items-center gap-1 pointer-events-none">
						<span className="text-3xl font-bold tabular-nums text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]">
							{ownedCount}/{set.total}
						</span>
					</span>
					<span className="absolute inset-x-0 bottom-0 z-10 h-1 bg-black/30">
						<span
							className="block h-full bg-[var(--accent,#e0b341)]"
							style={{ width: `${pct}%` }}
						/>
					</span>
				</>
			)}
		</Link>
	);
}
