import { afterEach, expect, test } from "bun:test";
import type { NavSet, NavTree } from "../../lib/nav-tree";
import { buildIndex } from "../../store/corpus/corpus-engine";
import { useCorpusRuntime } from "../../store/corpus/corpus-runtime";
import { renderInRouter } from "../../test-utils";
import { HomeBrowse } from "./home-browse";

const set = (id: string, name: string): NavSet => ({
	id,
	name,
	slug: id,
	logo: "/x.png",
	symbol: "/x.png",
	total: 10,
});

const TREE: NavTree = [
	{ name: "Base", slug: "base", year: 1999, sets: [set("base", "Base Set")] },
	{ name: "Gym", slug: "gym", year: 2000, sets: [set("gym1", "Gym Heroes")] },
	{
		name: "Scarlet & Violet",
		slug: "sv",
		year: 2023,
		sets: [set("sv1", "SV Base"), set("sv2", "Paldea")],
	},
];

// The corpus runtime is a module singleton; leave it null for other test files.
afterEach(() => useCorpusRuntime.setState({ index: null }));

test("HomeBrowse renders the proof line, an era pill per series, and set tiles", async () => {
	// Pre-seed an empty corpus index so loadCorpus() early-returns (no network),
	// per the project's test-isolation gotcha.
	useCorpusRuntime.setState({ index: buildIndex([]) });

	const { container, getByText, queryByText } = await renderInRouter(
		<HomeBrowse tree={TREE} />,
	);

	// Tree-derived counts: 4 sets across 3 eras.
	expect(getByText(/4 sets/)).toBeTruthy();
	expect(getByText(/3 eras/)).toBeTruthy();
	expect(getByText(/always free/)).toBeTruthy();

	// One era pill per series — the card-type pills moved to the home launch pad,
	// so every soft-variant link here is now an era pill (no filtering needed).
	expect(getByText("Latest sets")).toBeTruthy();
	const eraPills = [...container.querySelectorAll('a[data-variant="soft"]')];
	expect(eraPills.length).toBe(3);

	// The era section is anchored so the launch pad's "Browse by era" card can
	// scroll to it, and its heading is present.
	const eraSection = container.querySelector("#browse-by-era");
	expect(eraSection).toBeTruthy();
	expect(eraSection?.textContent).toContain("Browse by era");

	// The card-type pills are gone (superseded by the home launch cards).
	expect(queryByText("Browse by card type")).toBeNull();
	expect(container.querySelector('a[href^="/pokemon"]')).toBeNull();
	expect(container.querySelector('a[href^="/trainer"]')).toBeNull();
	expect(container.querySelector('a[href^="/energy"]')).toBeNull();

	// Browse-variant set tiles (link to /$series/$set, never /vault).
	const tiles = container.querySelectorAll('a[aria-label^="Browse"]');
	expect(tiles.length).toBe(4);
	for (const t of tiles) {
		expect(t.getAttribute("href")?.startsWith("/vault")).toBe(false);
	}
});

test("Latest sets are newest-era-first even when the newest series is short", async () => {
	useCorpusRuntime.setState({ index: buildIndex([]) });
	const { container } = await renderInRouter(<HomeBrowse tree={TREE} />);
	const tiles = [...container.querySelectorAll('a[aria-label^="Browse"]')];
	// Sorted by series year desc: the 2023 SV sets come before the 1999/2000 ones.
	expect(tiles[0].getAttribute("aria-label")).toMatch(/SV Base|Paldea/);
});

test("non-core series (TCG Pocket) are hidden from Latest sets but kept in Browse-by-era", async () => {
	useCorpusRuntime.setState({ index: buildIndex([]) });
	const tree: NavTree = [
		{ name: "Base", slug: "base", year: 1999, sets: [set("base", "Base Set")] },
		{
			// Newest by year, but digital-only → must not appear in Latest sets.
			name: "Pokémon TCG Pocket",
			slug: "pokemon-tcg-pocket",
			year: 2024,
			sets: [set("A1", "Genetic Apex")],
		},
	];
	const { container } = await renderInRouter(<HomeBrowse tree={tree} />);

	// Era pill for TCG Pocket is still present (browsable from the pill cloud).
	const eraPill = [
		...container.querySelectorAll('a[data-variant="soft"]'),
	].find((a) => a.textContent === "Pokémon TCG Pocket");
	expect(eraPill).toBeTruthy();

	// ...but its set has no tile in Latest sets, while the core set does.
	expect(
		container.querySelector('a[aria-label="Browse Genetic Apex"]'),
	).toBeNull();
	expect(
		container.querySelector('a[aria-label="Browse Base Set"]'),
	).toBeTruthy();
});
