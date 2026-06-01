import {
	ClientOnly,
	createFileRoute,
	Link,
	notFound,
	Outlet,
	useNavigate,
} from "@tanstack/react-router";
import type { HoloCardData } from "../../../components/holo-card";
import { CardGridIsland } from "../../../components/islands/card-grid-island";
import { SearchControls } from "../../../components/islands/search-controls";
import { listSearchToUrl, validateListSearch } from "../../../lib/list-search";
import { fetchCards } from "../../../server/card-data";
import { buildSetCardSlugs } from "../../../server/card-resolve";
import { findSet, getNavTreeFn } from "../../../server/nav-tree";
import { deriveFacets } from "../../../server/set-facets";

export const Route = createFileRoute("/$series/$set/")({
	validateSearch: validateListSearch,
	loader: async ({ params }) => {
		const tree = await getNavTreeFn();
		const set = findSet(tree, params.series, params.set);
		if (!set) throw notFound();

		// Fetch the whole set so facets are accurate and all cards are crawlable.
		// Use fetchCards directly (not getCardsBySetFn) to avoid the RPC hop when
		// called server-side from a route loader.
		const all: HoloCardData[] = [];
		let page = 1;
		let total = Number.POSITIVE_INFINITY;
		while (all.length < total && page <= 10) {
			const res = await fetchCards(`set.id:${set.id}`, page, 250, "number");
			all.push(...res.cards);
			total = res.totalCount;
			if (res.cards.length === 0) break;
			page++;
		}
		// TODO(Plan 05): setResponseHeaders Cache-Control via server fn — import protection
		// blocks @tanstack/react-start/server from client-bundled route files.
		const slugs = buildSetCardSlugs(all);
		const cards = all.map((c) => ({
			...c,
			slug: slugs.slugById.get(c.id) ?? c.id,
		}));
		return { set, cards, facets: deriveFacets(all) };
	},
	head: ({ loaderData }) => ({
		meta: [
			{ title: `${loaderData?.set.name ?? "Set"} — Pokémon TCG cards` },
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
		navigate({ search: (prev) => ({ ...prev, ...listSearchToUrl(patch) }) });

	return (
		<div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden px-4 py-5">
			<div className="mb-3 flex items-center gap-3">
				<h1 className="text-xl font-bold">{set.name}</h1>
				<span className="text-sm text-muted-foreground">
					{cards.length} cards
				</span>
			</div>
			<ClientOnly fallback={null}>
				<div className="mb-4 shrink-0">
					<SearchControls
						value={search}
						options={facets}
						showScope
						onChange={onChange}
					/>
				</div>
			</ClientOnly>
			<div className="min-h-0 flex-1">
				<ClientOnly
					fallback={
						<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
							{cards.map((card) => (
								<li key={card.id} className="flex flex-col items-center gap-1">
									<Link
										to="/$series/$set/$card"
										params={{
											series: params.series,
											set: params.set,
											card: card.slug,
										}}
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
						search={search}
						context={{ setId: set.id }}
						seedCards={cards}
						seedTotal={cards.length}
						cardHref={(card) => ({
							to: "/$series/$set/$card",
							params: {
								series: params.series,
								set: params.set,
								card: cards.find((c) => c.id === card.id)?.slug ?? card.id,
							},
						})}
					/>
				</ClientOnly>
			</div>
			<Outlet />
		</div>
	);
}
