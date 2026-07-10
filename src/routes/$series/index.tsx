import {
	ClientOnly,
	createFileRoute,
	notFound,
	stripSearchParams,
} from "@tanstack/react-router";
import { useMemo } from "react";
import { SetTile } from "../../components/shell/set-tile";
import { cardIdsInSets } from "../../components/vault/bulk-add";
import { BulkAddMenu } from "../../components/vault/bulk-add-menu";
import {
	isSupportedLanguage,
	type SupportedLanguage,
} from "../../lib/languages";
import { loaderRegion } from "../../lib/loader-region";
import { m } from "../../paraglide/messages";
import { findSeries, getNavTreeFn } from "../../server/nav-tree";
import { useCorpusRuntime } from "../../store/corpus/corpus-runtime";
import { useEnsureCorpus } from "../../store/corpus/use-ensure-corpus";

export const Route = createFileRoute("/$series/")({
	// `?lang=ja` (from the region-aware language switcher) selects the Asian
	// nav tree instead of the default Western one; absent/unsupported → null.
	validateSearch: (
		search: Record<string, unknown>,
	): { lang: SupportedLanguage | null } => ({
		lang:
			typeof search.lang === "string" && isSupportedLanguage(search.lang)
				? search.lang
				: null,
	}),
	// Drop the default `lang: null` from the URL so tile/sidebar links stay
	// clean (`/base`, not `/base?lang=null`); a real `?lang=ja` is preserved.
	search: { middlewares: [stripSearchParams({ lang: null })] },
	loaderDeps: ({ search }) => ({ lang: search.lang }),
	loader: async ({ params, deps }) => {
		// Region from `?lang`, else the active client region (sidebar/tile clicks
		// carry no `?lang`; the global picker switches region via the profile).
		const region = loaderRegion(deps.lang);
		const tree = await getNavTreeFn({ data: { region } });
		const series = findSeries(tree, params.series);
		if (!series) throw notFound();
		// Cache-Control is set inside getNavTreeFn's handler (server-only module),
		// which this loader awaits — the route file stays free of the server-only
		// header API that import-protection blocks from client-bundled routes.
		return series;
	},
	head: ({ loaderData }) => ({
		meta: [
			{
				title: m.series_meta_title({
					name: loaderData?.name ?? m.series_meta_title_fallback(),
				}),
			},
			{
				name: "description",
				content: m.series_meta_description({ name: loaderData?.name ?? "" }),
			},
		],
	}),
	component: SeriesPage,
});

function SeriesBulkMenu({ setIds }: { setIds: string[] }) {
	useEnsureCorpus();
	const index = useCorpusRuntime((s) => s.index);
	const cardIds = useMemo(
		() => (index ? cardIdsInSets(index, setIds) : []),
		[index, setIds],
	);
	if (!index) return null;
	return <BulkAddMenu cardIds={cardIds} ruleQuery={null} />;
}

function SeriesPage() {
	const series = Route.useLoaderData();
	const setIds = useMemo(() => series.sets.map((s) => s.id), [series.sets]);
	return (
		<div className="mx-auto w-full max-w-7xl overflow-y-auto px-4 py-6">
			<div className="mb-4 flex items-center gap-3">
				<h1 className="text-2xl font-bold">{series.name}</h1>
				<ClientOnly fallback={null}>
					<SeriesBulkMenu setIds={setIds} />
				</ClientOnly>
			</div>
			<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
				{series.sets.map((set) => (
					<SetTile key={set.id} seriesSlug={series.slug} set={set} />
				))}
			</div>
		</div>
	);
}
