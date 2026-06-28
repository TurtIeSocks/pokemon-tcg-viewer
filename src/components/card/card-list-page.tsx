import type { LinkProps } from "@tanstack/react-router";
import type { SetFacets } from "@/server/set-facets";
import type { ListContext, ListSearch } from "../../lib/card-query";
import type { listSearchToUrl } from "../../lib/list-search";
import type { SerializedQuery } from "../../store/userland/types";
import type { HoloCardData } from "../holo-card";
import { CardGridIsland } from "../islands/card-grid-island";
import { CardSelectionProvider } from "../islands/card-selection";
import { SearchControls } from "../islands/search-controls";
import { ViewModeToggle } from "../islands/view-mode-toggle";
import { ResultsBar } from "../results-bar";
import { SelectAndBulkAdd } from "../vault/select-and-bulk-add";

interface CardListPageProps {
	/** SSR seed (first page) for the grid. */
	cards: HoloCardData[];
	total: number;
	/** Active URL search params + the in-page change handler. */
	search: ListSearch;
	onChange: (patch: Parameters<typeof listSearchToUrl>[0]) => void;
	/** Facet options for the filter controls. */
	options: SetFacets;
	/** The entity this list is anchored to (dex / supertype / name slug). */
	context: ListContext;
	/** Per-card modal link resolver (cards span many sets). */
	cardHref: (card: HoloCardData) => LinkProps;
	/** Smart-rule query for "add rule to binder"; null hides that menu item. */
	ruleQuery?: SerializedQuery | null;
	/** Hide the Card Type dropdown when the page locks the supertype. */
	lockSupertype?: boolean;
	/** Remounts the grid (resets pagination) when the anchored entity changes. */
	gridKey: string | number;
}

/**
 * Shared cross-set card-list page: filter controls, results bar with bulk-add +
 * view toggle, and the virtualized card grid. Used by the Trainer/Energy per-name
 * and category-browse routes (mirrors the layout of `/pokemon/$name`).
 */
export function CardListPage({
	cards,
	total,
	search,
	onChange,
	options,
	context,
	cardHref,
	ruleQuery = null,
	lockSupertype = false,
	gridKey,
}: CardListPageProps) {
	return (
		<CardSelectionProvider>
			<div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden px-4 py-5">
				<div className="mb-3 shrink-0">
					<SearchControls
						value={search}
						options={options}
						onChange={onChange}
						lockSupertype={lockSupertype}
					/>
				</div>
				<ResultsBar count={total}>
					<SelectAndBulkAdd
						cardIds={cards.map((c) => c.id)}
						ruleQuery={ruleQuery}
						search={search}
						context={context}
					/>
					<ViewModeToggle
						value={search.view}
						disabled={false}
						onChange={(view) => onChange({ view })}
					/>
				</ResultsBar>
				<div className="min-h-0 flex-1">
					<CardGridIsland
						key={gridKey}
						search={search}
						context={context}
						seedCards={cards}
						seedTotal={total}
						cardHref={cardHref}
					/>
				</div>
			</div>
		</CardSelectionProvider>
	);
}
