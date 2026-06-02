import {
	ClientOnly,
	createFileRoute,
	Link,
	notFound,
	Outlet,
	stripSearchParams,
	useNavigate,
} from "@tanstack/react-router";
import { Package } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { CardGridIsland } from "../../../components/islands/card-grid-island";
import { PackDialog } from "../../../components/islands/pack-dialog";
import { SearchControls } from "../../../components/islands/search-controls";
import { BulkAddMenu } from "../../../components/vault/bulk-add-menu";
import { cardModalLinkPropsFor } from "../../../lib/card-route";
import { buildSetCardSlugs } from "../../../lib/card-slugs";
import {
	LIST_SEARCH_DEFAULTS,
	listSearchToUrl,
	validateListSearch,
} from "../../../lib/list-search";
import { getSetCardsFn } from "../../../server/corpus-server";
import { findSet, getNavTreeFn } from "../../../server/nav-tree";
import { deriveFacets } from "../../../server/set-facets";

export const Route = createFileRoute("/$series/$set/")({
	validateSearch: validateListSearch,
	search: { middlewares: [stripSearchParams(LIST_SEARCH_DEFAULTS)] },
	loader: async ({ params }) => {
		const tree = await getNavTreeFn();
		const set = findSet(tree, params.series, params.set);
		if (!set) throw notFound();

		const all = await getSetCardsFn({ data: set.id });
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
		<div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden px-4 py-5">
			<div className="mb-3 flex items-center gap-3">
				<h1 className="text-xl font-bold">{set.name}</h1>
				<span className="text-sm text-muted-foreground">
					{cards.length} cards
				</span>
				<ClientOnly fallback={null}>
					<div className="ml-auto flex items-center gap-2">
						<BulkAddMenu
							cardIds={cards.map((c) => c.id)}
							goalTarget={{ kind: "set", setId: set.id }}
						/>
						<Button
							variant="outline"
							size="sm"
							onClick={() => setPackOpen(true)}
						>
							<Package className="size-4 sm:mr-2" />
							<span className="hidden sm:inline">Open Packs</span>
						</Button>
					</div>
				</ClientOnly>
			</div>
			<ClientOnly fallback={null}>
				<div className="mb-4 shrink-0">
					<SearchControls
						value={search}
						options={facets}
						onChange={onChange}
						placeholder={`Search ${set.name} cards`}
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
						key={set.id}
						search={search}
						context={{ setId: set.id }}
						seedCards={cards}
						seedTotal={cards.length}
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
