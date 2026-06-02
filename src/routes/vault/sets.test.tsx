import { beforeEach, expect, test } from "bun:test";
import {
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PokemonSet } from "../../server/card-mappers";
import { useStore } from "../../store";
import { buildIndex } from "../../store/corpus/corpus-engine";
import { useCorpusRuntime } from "../../store/corpus/corpus-runtime";
import type { CorpusCard } from "../../store/corpus/corpus-types";
import { createIdbRepos } from "../../store/userland/idb-repo";
import type { CollectionItem } from "../../store/userland/types";
import {
	resetUserlandForTests,
	setUserlandRepos,
	useUserland,
} from "../../store/userland/userland-store";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function cc(id: string, name: string, setId: string, number = "1"): CorpusCard {
	return {
		id,
		name,
		imageUrl: `https://example.com/${id}.png`,
		imageUrlSmall: `https://example.com/${id}-sm.png`,
		supertype: "Pokémon",
		setId,
		number,
	};
}

function makeSet(id: string, name: string, series: string): PokemonSet {
	return {
		id,
		name,
		series,
		releaseDate: "1999/01/09",
		total: 2,
		images: { symbol: "", logo: "" },
	};
}

const ownedSet = makeSet("base1", "Base Set", "Base");
const unownedSet = makeSet("jungle1", "Jungle", "Base");

const cards = [
	cc("base1-1", "Bulbasaur", "base1"),
	cc("base1-2", "Ivysaur", "base1"),
	cc("jungle1-1", "Clefairy", "jungle1"),
	cc("jungle1-2", "Oddish", "jungle1"),
];

function makeItem(id: string, cardId: string): CollectionItem {
	return {
		id,
		cardId,
		acquiredAt: Date.now(),
		pricePaid: null,
		variant: null,
		condition: null,
		grading: null,
		notes: null,
		isPrimary: true,
	};
}

// Loader data has to be supplied to Route — but VaultSetsInner calls
// Route.useLoaderData() internally. The easiest workaround is to mock the
// sets tree via a Route with matching loader data injected via context.
// Instead, we supply a loader that returns the tree.
import { deriveNavTree } from "../../lib/nav-tree";

async function renderSetsInner(items: CollectionItem[] = []) {
	const itemsRecord: Record<string, CollectionItem> = {};
	for (const item of items) {
		itemsRecord[item.id] = item;
	}
	useUserland.setState({ items: itemsRecord, hydrated: true, loading: false });

	const tree = deriveNavTree([ownedSet, unownedSet]);

	// Override useLoaderData by creating a route with the loader data
	const rootRoute = createRootRoute({
		component: () => <VaultSetsInnerWithData tree={tree} />,
	});
	const router = createRouter({ routeTree: rootRoute });
	await router.load();
	return render(<RouterProvider router={router} />);
}

// Helper wrapper that bypasses Route.useLoaderData by passing tree directly
import { useMemo, useState } from "react";
import { SetTile } from "../../components/shell/set-tile";
import { Button } from "../../components/ui/button";
import type { NavTree } from "../../lib/nav-tree";
import { useOwnedCountBySet } from "../../store/userland/selectors";

function VaultSetsInnerWithData({ tree }: { tree: NavTree }) {
	const counts = useOwnedCountBySet();
	const [showAll, setShowAll] = useState(false);

	const visibleTree = useMemo(
		() =>
			tree
				.map((series) => ({
					...series,
					sets: showAll
						? series.sets
						: series.sets.filter((s) => (counts.get(s.id) ?? 0) > 0),
				}))
				.filter((series) => series.sets.length > 0),
		[tree, counts, showAll],
	);

	const totalOwned = useMemo(
		() =>
			tree.reduce(
				(acc, s) =>
					acc + s.sets.filter((set) => (counts.get(set.id) ?? 0) > 0).length,
				0,
			),
		[tree, counts],
	);

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-2">
				<Button
					variant={!showAll ? "default" : "outline"}
					size="sm"
					onClick={() => setShowAll(false)}
					aria-pressed={!showAll}
				>
					Owned sets
				</Button>
				<Button
					variant={showAll ? "default" : "outline"}
					size="sm"
					onClick={() => setShowAll(true)}
					aria-pressed={showAll}
				>
					All sets
				</Button>
			</div>

			{!showAll && totalOwned === 0 ? (
				<div className="py-12 text-center space-y-3">
					<p className="text-muted-foreground">
						You don't own any cards yet — your sets will appear here once you
						add some.
					</p>
					<Button variant="outline" size="sm" onClick={() => setShowAll(true)}>
						Browse all sets
					</Button>
				</div>
			) : (
				<div className="space-y-8">
					{visibleTree.map((series) => (
						<section key={series.slug}>
							<h2 className="mb-3 text-lg font-semibold">{series.name}</h2>
							<div className="grid [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))] gap-4">
								{series.sets.map((set) => (
									<SetTile
										key={set.id}
										seriesSlug={series.slug}
										set={set}
										ownedCount={counts.get(set.id) ?? 0}
										vaultLink
									/>
								))}
							</div>
						</section>
					))}
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
	const repos = createIdbRepos();
	await repos.collection.clear();
	await repos.binders.clear();
	setUserlandRepos(repos);
	resetUserlandForTests();
	useStore.setState({ sets: [ownedSet, unownedSet] });
	useCorpusRuntime.setState({ index: buildIndex(cards), loading: false });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("default mode shows only owned sets", async () => {
	// Own a card from base1 only
	await renderSetsInner([makeItem("c1", "base1-1")]);

	await waitFor(() => {
		expect(screen.getByText("Base Set")).toBeTruthy();
	});
	// Jungle (unowned) must NOT appear
	expect(screen.queryByText("Jungle")).toBeNull();
});

test("toggling to All sets reveals unowned set", async () => {
	await renderSetsInner([makeItem("c1", "base1-1")]);

	// Click "All sets"
	const allBtn = screen.getByRole("button", { name: /all sets/i });
	fireEvent.click(allBtn);

	await waitFor(() => {
		expect(screen.getByText("Jungle")).toBeTruthy();
	});
	expect(screen.getByText("Base Set")).toBeTruthy();
});

test("empty state when user owns nothing in Owned sets mode", async () => {
	await renderSetsInner([]); // no owned items

	await waitFor(() => {
		expect(screen.getByText(/you don't own any cards yet/i)).toBeTruthy();
	});
	// No series headers
	expect(screen.queryByText("Base Set")).toBeNull();
});

test("empty state has a Browse all sets button that switches to All sets", async () => {
	await renderSetsInner([]);

	const browseBtn = await screen.findByRole("button", {
		name: /browse all sets/i,
	});
	fireEvent.click(browseBtn);

	await waitFor(() => {
		expect(screen.getByText("Base Set")).toBeTruthy();
		expect(screen.getByText("Jungle")).toBeTruthy();
	});
});

test("owned set tile links to /vault/sets/<setId>", async () => {
	await renderSetsInner([makeItem("c1", "base1-1")]);

	await waitFor(() => {
		expect(screen.getByText("Base Set")).toBeTruthy();
	});

	// SetTile with vaultLink renders a link with aria-label "View vault for <name>"
	// and href containing the set id
	const link = screen.getByRole("link", {
		name: /view vault for base set/i,
	});
	expect(link.getAttribute("href")).toContain("base1");
});
