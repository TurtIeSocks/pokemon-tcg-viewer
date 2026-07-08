import {
	ClientOnly,
	createFileRoute,
	Link,
	notFound,
	Outlet,
	stripSearchParams,
	useNavigate,
} from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { HoloCardData } from "../../../components/holo-card";
import { CardGridIsland } from "../../../components/islands/card-grid-island";
import { CardSelectionProvider } from "../../../components/islands/card-selection";
import { CardSortControl } from "../../../components/islands/card-sort-control";
import { PackDialog } from "../../../components/islands/pack-dialog";
import { SearchControls } from "../../../components/islands/search-controls";
import { ResultsBar } from "../../../components/results-bar";
import { SelectAndBulkAdd } from "../../../components/vault/select-and-bulk-add";
import { cardModalLinkPropsFor } from "../../../lib/card-route";
import { buildSetCardSlugs } from "../../../lib/card-slugs";
import {
	REGION_BASE_LANGUAGE,
	regionForLanguage,
} from "../../../lib/languages";
import {
	LIST_SEARCH_DEFAULTS,
	listSearchToUrl,
	validateListSearch,
} from "../../../lib/list-search";
import { loaderRegion } from "../../../lib/loader-region";
import { toSerializedQuery } from "../../../lib/serialized-query";
import { getPokemonListFn } from "../../../server/card-data";
import { getSetCardsFn } from "../../../server/corpus-server";
import {
	findSet,
	getNavTreeFn,
	getPreferredRegionFn,
	resolveSetRegion,
} from "../../../server/nav-tree";
import { nameByDex } from "../../../server/pokemon-dex";
import { deriveFacets } from "../../../server/set-facets";

export const Route = createFileRoute("/$series/$set/")({
	validateSearch: validateListSearch,
	search: { middlewares: [stripSearchParams(LIST_SEARCH_DEFAULTS)] },
	loaderDeps: ({ search }) => ({ lang: search.lang }),
	loader: async ({ params, deps }) => {
		// Preferred region: from `?lang` when present (shared/cold link), else the
		// active client region (an in-app sidebar/tile click carries no `?lang`).
		// On an SSR cold-load with no `?lang` there is no client store, so
		// loaderRegion can only hard-default `west`; recover the viewer's real
		// preference from the locale cookie (set on every language change).
		let preferred = loaderRegion(deps.lang);
		if (!deps.lang && typeof window === "undefined") {
			preferred = await getPreferredRegionFn();
		}
		// Safety net: a set's region is intrinsic and slugs are globally unique, so
		// if the set isn't in the preferred region, try the other before giving up.
		// This is what stops the post-refresh crash even when the cookie is stale or
		// absent. The asia tree loads lazily — only on a preferred-region miss.
		const resolved = await resolveSetRegion(preferred, async (region) => {
			const tree = await getNavTreeFn({ data: { region } });
			return findSet(tree, params.series, params.set);
		});
		if (!resolved) throw notFound();
		const { region, set } = resolved;
		// Language must match the RESOLVED region so the card fetch reads the right
		// catalog. Keep the explicit `?lang` only when it belongs to that region;
		// otherwise fall back to the region's base language.
		const lang =
			deps.lang && regionForLanguage(deps.lang) === region
				? deps.lang
				: REGION_BASE_LANGUAGE[region];

		// Species list runs in parallel with the set cards; it labels the Pokémon
		// filter options (dex number → species name).
		const [all, list] = await Promise.all([
			getSetCardsFn({ data: { setId: set.id, lang } }),
			getPokemonListFn(),
		]);
		const slugs = buildSetCardSlugs(all);
		const cards = all.map((c) => ({
			...c,
			slug: slugs.slugById.get(c.id) ?? c.id,
		}));
		return {
			set,
			cards,
			facets: deriveFacets(all, (dex) => nameByDex(list, dex)),
		};
	},
	head: ({ loaderData }) => ({
		meta: [
			{ title: `${loaderData?.set.name ?? "Set"} · Pokémon TCG cards` },
			{
				name: "description",
				content: `All ${loaderData?.cards.length ?? 0} cards in ${loaderData?.set.name ?? ""}.`,
			},
		],
	}),
	component: SetPage,
});

function SetPage() {
	const { set, cards, facets } = Route.useLoaderData();
	const params = Route.useParams();
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const onChange = (patch: Parameters<typeof listSearchToUrl>[0]) =>
		navigate({
			search: (prev) => ({ ...prev, ...listSearchToUrl(patch) }),
			// In-page filter/view change: keep it instant, don't crossfade.
			viewTransition: false,
		});
	const [packOpen, setPackOpen] = useState(false);
	// id → per-page slug, built once. The grid/pack cardHref callbacks fire per
	// card; a Map keeps them O(1) instead of a linear find over every card.
	const slugById = useMemo(
		() => new Map(cards.map((c) => [c.id, c.slug])),
		[cards],
	);

	return (
		<CardSelectionProvider>
			<SetPageInner
				set={set}
				cards={cards}
				facets={facets}
				search={search}
				params={params}
				onChange={onChange}
				slugById={slugById}
				packOpen={packOpen}
				setPackOpen={setPackOpen}
			/>
		</CardSelectionProvider>
	);
}

interface SetPageInnerProps {
	set: ReturnType<typeof Route.useLoaderData>["set"];
	cards: ReturnType<typeof Route.useLoaderData>["cards"];
	facets: ReturnType<typeof Route.useLoaderData>["facets"];
	search: ReturnType<typeof Route.useSearch>;
	params: ReturnType<typeof Route.useParams>;
	onChange: (patch: Parameters<typeof listSearchToUrl>[0]) => void;
	slugById: Map<string, string>;
	packOpen: boolean;
	setPackOpen: (open: boolean) => void;
}

function SetPageInner({
	set,
	cards,
	facets,
	search,
	params,
	onChange,
	slugById,
	packOpen,
	setPackOpen,
}: SetPageInnerProps) {
	// Live filtered total from the grid; falls back to the SSR seed count.
	const [liveTotal, setLiveTotal] = useState<number | null>(null);
	return (
		<div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden px-4 py-5">
			<ClientOnly fallback={null}>
				<div className="mb-3 shrink-0">
					<SearchControls
						value={search}
						options={facets}
						onChange={onChange}
						placeholder={`Search ${set.name} cards`}
						showCardFilter
					/>
				</div>
			</ClientOnly>
			<ResultsBar count={liveTotal ?? cards.length}>
				<ClientOnly fallback={null}>
					<SelectAndBulkAdd
						cardIds={cards.map((c: HoloCardData) => c.id)}
						ruleQuery={toSerializedQuery(search, { setId: set.id })}
						search={search}
						context={{ setId: set.id }}
					/>
					{/* <Button variant="outline" size="sm" onClick={() => setPackOpen(true)}>
						<Package className="size-4 sm:mr-2" />
						<span className="hidden sm:inline">Open Packs</span>
					</Button> */}
					<CardSortControl value={search} onChange={onChange} />
				</ClientOnly>
			</ResultsBar>
			<div className="min-h-0 flex-1">
				<ClientOnly
					fallback={
						<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
							{cards.map((card: HoloCardData & { slug: string }) => (
								<li key={card.id} className="flex flex-col items-center gap-1">
									<Link
										to="/$series/$set/$card"
										params={{
											series: params.series,
											set: params.set,
											card: card.slug,
										}}
										search={{ lang: null }}
									>
										<img
											src={card.imageUrlSmall}
											alt={card.name}
											loading="lazy"
											className="w-full rounded"
										/>
										<span className="text-center text-xs">{card.name}</span>
									</Link>
								</li>
							))}
						</ul>
					}
				>
					<CardGridIsland
						key={set.id}
						search={search}
						context={{ setId: set.id }}
						seedCards={cards}
						seedTotal={cards.length}
						onTotalChange={setLiveTotal}
						cardHref={(card) =>
							cardModalLinkPropsFor({
								series: params.series,
								set: params.set,
								card: slugById.get(card.id) ?? card.id,
							})
						}
					/>
				</ClientOnly>
			</div>
			<Outlet />
			<ClientOnly fallback={null}>
				<PackDialog
					open={packOpen}
					onOpenChange={setPackOpen}
					art={{ name: set.name, logo: set.logo, symbol: set.symbol }}
					pool={cards}
					cardHref={(card) =>
						cardModalLinkPropsFor({
							series: params.series,
							set: params.set,
							card: slugById.get(card.id) ?? card.id,
						})
					}
				/>
			</ClientOnly>
		</div>
	);
}
