import type { LinkProps } from "@tanstack/react-router";
import {
	ClientOnly,
	createFileRoute,
	notFound,
	stripSearchParams,
	useNavigate,
} from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { HoloCardData } from "@/components/holo-card";
import { CardGridIsland } from "@/components/islands/card-grid-island";
import { CardSelectionProvider } from "@/components/islands/card-selection";
import { CardSortControl } from "@/components/islands/card-sort-control";
import { SearchControls } from "@/components/islands/search-controls";
import { ResultsBar } from "@/components/results-bar";
import { cardModalLinkProps } from "@/lib/card-route";
import {
	LIST_SEARCH_DEFAULTS,
	listSearchToUrl,
	validateListSearch,
} from "@/lib/list-search";
import { deriveFacets } from "@/server/set-facets";
import { useStore } from "@/store";
import {
	loadCorpus,
	useCorpusRuntime,
	useSlugIndex,
} from "@/store/corpus/corpus-runtime";
import type { CorpusCard } from "@/store/corpus/corpus-types";

/**
 * DEV-ONLY debug page: the ENTIRE corpus in one grid with the full filter set.
 * Handy for eyeballing holo treatments across every era/set on one screen.
 * `beforeLoad` 404s it in any production build (import.meta.env.DEV is statically
 * false there, so the check tree-shakes to an unconditional notFound); it is only
 * reachable under `vite dev` (`bun run dev`).
 */
export const Route = createFileRoute("/dev/cards")({
	validateSearch: validateListSearch,
	search: { middlewares: [stripSearchParams(LIST_SEARCH_DEFAULTS)] },
	beforeLoad: () => {
		if (!import.meta.env.DEV) throw notFound();
	},
	component: DevCardsPage,
});

function DevCardsPage() {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const onChange = (patch: Parameters<typeof listSearchToUrl>[0]) =>
		navigate({
			search: (prev) => ({ ...prev, ...listSearchToUrl(patch) }),
			viewTransition: false,
		});
	// The grid consumes useCardSelection() — its provider must wrap it.
	return (
		<CardSelectionProvider>
			<DevCardsInner search={search} onChange={onChange} />
		</CardSelectionProvider>
	);
}

const NO_CARDS: HoloCardData[] = [];
const NO_CORPUS: CorpusCard[] = [];

interface DevCardsInnerProps {
	search: ReturnType<typeof Route.useSearch>;
	onChange: (patch: Parameters<typeof listSearchToUrl>[0]) => void;
}

function DevCardsInner({ search, onChange }: DevCardsInnerProps) {
	// Every card in the active region's corpus (the grid queries the same index).
	const cards = useCorpusRuntime((s) => s.index?.cards) ?? NO_CORPUS;
	const slugIndex = useSlugIndex();
	const [liveTotal, setLiveTotal] = useState<number | null>(null);

	// Kick the corpus + sets loads (the grid does this too, but derive facets in
	// this parent, so ensure the index arrives here regardless of mount order).
	useEffect(() => {
		void loadCorpus();
		void useStore.getState().loadSets();
	}, []);

	// Filter options over the WHOLE corpus. No dex-name resolver client-side, so
	// Pokémon options label by the card's printed name / `#dex` — fine for debug.
	const facets = useMemo(() => deriveFacets(cards), [cards]);

	const cardHref = (card: HoloCardData): LinkProps =>
		(slugIndex ? cardModalLinkProps(slugIndex, card) : null) ?? { to: "/" };

	return (
		<div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden px-4 py-5">
			<div className="mb-2 shrink-0 font-mono text-xs tracking-wide text-(--faint) uppercase">
				Dev · all cards ({cards.length.toLocaleString()})
			</div>
			<ClientOnly fallback={null}>
				<div className="mb-3 shrink-0">
					<SearchControls
						value={search}
						options={facets}
						onChange={onChange}
						placeholder="Search all cards…"
						showCardFilter
					/>
				</div>
			</ClientOnly>
			<ResultsBar count={liveTotal ?? cards.length}>
				<ClientOnly fallback={null}>
					<CardSortControl value={search} onChange={onChange} />
				</ClientOnly>
			</ResultsBar>
			<div className="min-h-0 flex-1">
				<ClientOnly fallback={null}>
					<CardGridIsland
						search={search}
						context={{}}
						seedCards={NO_CARDS}
						seedTotal={0}
						onTotalChange={setLiveTotal}
						cardHref={cardHref}
					/>
				</ClientOnly>
			</div>
		</div>
	);
}
