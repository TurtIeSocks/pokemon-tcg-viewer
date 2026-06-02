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
			className="booster-pack"
			aria-label={`Browse ${set.name}`}
		>
			<span className="booster-pack-foil" aria-hidden="true" />
			<span className="booster-pack-art">
				<img className="booster-pack-logo" src={set.logo} alt="" />
				<strong className="booster-pack-name">{set.name}</strong>
			</span>
			<img
				className="booster-pack-symbol"
				src={set.symbol}
				alt=""
				aria-hidden="true"
			/>
			{showCount && (
				<>
					<span className="absolute right-2 top-2 z-10 rounded-md bg-black/65 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-white">
						{ownedCount}/{set.total}
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
