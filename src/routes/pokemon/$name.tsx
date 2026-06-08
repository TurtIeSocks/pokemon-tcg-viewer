import {
	createFileRoute,
	type LinkProps,
	notFound,
	stripSearchParams,
	useNavigate,
} from "@tanstack/react-router";
import { useCallback } from "react";
import type { HoloCardData } from "../../components/holo-card";
import { CardGridIsland } from "../../components/islands/card-grid-island";
import { CardSelectionProvider } from "../../components/islands/card-selection";
import { SearchControls } from "../../components/islands/search-controls";
import { ViewModeToggle } from "../../components/islands/view-mode-toggle";
import { SelectAndBulkAdd } from "../../components/vault/select-and-bulk-add";
import { cardModalLinkProps } from "../../lib/card-route";
import {
	LIST_SEARCH_DEFAULTS,
	listSearchToUrl,
	validateListSearch,
} from "../../lib/list-search";
import { toSerializedQuery } from "../../lib/serialized-query";
import { titleCaseSlug } from "../../lib/slug";
import { getPokemonListFn } from "../../server/card-data";
import { getDexCardsFn } from "../../server/corpus-server";
import { dexByName } from "../../server/pokemon-dex";
import { deriveFacets, type SetFacets } from "../../server/set-facets";
import { useSlugIndex } from "../../store/corpus/corpus-runtime";

export const Route = createFileRoute("/pokemon/$name")({
	validateSearch: validateListSearch,
	search: { middlewares: [stripSearchParams(LIST_SEARCH_DEFAULTS)] },
	loader: async ({ params }) => {
		const list = await getPokemonListFn();
		const dex = dexByName(list, params.name);
		if (dex === null) throw notFound();
		const all = await getDexCardsFn({ data: dex });
		return {
			display: titleCaseSlug(params.name),
			dex,
			cards: all.slice(0, 60),
			total: all.length,
		};
	},
	head: ({ loaderData }) => {
		const d = loaderData?.display ?? "Pokémon";
		return {
			meta: [
				{ title: `${d} — every Pokémon TCG card` },
				{
					name: "description",
					content: `Browse all ${loaderData?.total ?? ""} ${d} cards across every set.`,
				},
				{ property: "og:title", content: `${d} — Pokémon TCG cards` },
			],
		};
	},
	component: PokemonPage,
});

function PokemonPage() {
	const { display, dex, cards, total } = Route.useLoaderData();
	const search = Route.useSearch();
	const params = Route.useParams();
	const navigate = useNavigate({ from: Route.fullPath });
	const onChange = (patch: Parameters<typeof listSearchToUrl>[0]) =>
		navigate({
			search: (prev) => ({ ...prev, ...listSearchToUrl(patch) }),
			// In-page filter/view change: keep it instant, don't crossfade.
			viewTransition: false,
		});
	const options = deriveFacets(cards);

	// Cards for one Pokémon span many sets — resolve each detail link from the
	// client corpus. Falls back to a no-op until the corpus + sets load.
	const slugIndex = useSlugIndex();
	const cardHref = useCallback(
		(card: HoloCardData): LinkProps =>
			(slugIndex ? cardModalLinkProps(slugIndex, card) : null) ?? {
				to: "/pokemon/$name",
				params: { name: params.name },
				search,
			},
		[slugIndex, params.name, search],
	);

	return (
		<CardSelectionProvider>
			<PokemonPageInner
				display={display}
				dex={dex}
				cards={cards}
				total={total}
				search={search}
				onChange={onChange}
				options={options}
				cardHref={cardHref}
			/>
		</CardSelectionProvider>
	);
}

interface PokemonPageInnerProps {
	display: string;
	dex: number;
	cards: HoloCardData[];
	total: number;
	search: ReturnType<typeof Route.useSearch>;
	onChange: (patch: Parameters<typeof listSearchToUrl>[0]) => void;
	options: SetFacets;
	cardHref: (card: HoloCardData) => LinkProps;
}

function PokemonPageInner({
	display,
	dex,
	cards,
	total,
	search,
	onChange,
	options,
	cardHref,
}: PokemonPageInnerProps) {
	return (
		<div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden px-4 py-5">
			<div className="mb-3 flex items-center gap-3">
				<h1 className="text-xl font-bold">
					{display}{" "}
					<span className="ml-2 text-sm text-muted-foreground">
						{total} cards
					</span>
				</h1>
				<div className="ml-auto flex items-center gap-2">
					<SelectAndBulkAdd
						cardIds={cards.map((c) => c.id)}
						ruleQuery={toSerializedQuery(search, { dexNumber: dex })}
					/>
					<ViewModeToggle
						value={search.view}
						disabled={false}
						onChange={(view) => onChange({ view })}
					/>
				</div>
			</div>
			<div className="mb-4 shrink-0">
				<SearchControls value={search} options={options} onChange={onChange} />
			</div>
			<div className="min-h-0 flex-1">
				<CardGridIsland
					key={dex}
					search={search}
					context={{ dexNumber: dex }}
					seedCards={cards}
					seedTotal={total}
					cardHref={cardHref}
				/>
			</div>
		</div>
	);
}
