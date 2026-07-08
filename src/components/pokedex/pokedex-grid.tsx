import { VirtuosoGrid } from "react-virtuoso";
import type { PokedexRow } from "../../lib/pokedex";
import { SpeciesTile } from "./species-tile";

const GRID_CLASS =
	"grid grid-cols-3 gap-3 m-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6";

// Same detection as card-grid-island: happy-dom measures 0 height so Virtuoso
// paints nothing. Render a plain grid there so the directory is assertable and
// SSR-equivalent; production with a real layout uses the virtualized path.
const isTestEnv =
	(typeof window !== "undefined" && !("ResizeObserver" in window)) ||
	(typeof process !== "undefined" && process.env.NODE_ENV === "test");

/** Virtualized national-dex grid of species tiles. */
export function PokedexGrid({ rows }: { rows: PokedexRow[] }) {
	if (rows.length === 0) {
		return (
			<p className="py-16 text-center font-sans text-sm text-(--ink-muted)">
				No species match.
			</p>
		);
	}
	if (isTestEnv) {
		return (
			<ul className={GRID_CLASS}>
				{rows.map((r) => (
					<li key={r.dex}>
						<SpeciesTile row={r} />
					</li>
				))}
			</ul>
		);
	}
	return (
		<VirtuosoGrid
			className="h-full"
			totalCount={rows.length}
			listClassName={GRID_CLASS}
			// Key by dex so a species keeps its element identity when the list
			// reorders (sort/filter), instead of index-reuse swapping props.
			computeItemKey={(index) => rows[index]?.dex ?? index}
			itemContent={(index) => {
				const r = rows[index];
				return r ? <SpeciesTile row={r} /> : null;
			}}
		/>
	);
}
