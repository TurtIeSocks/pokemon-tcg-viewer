import { expect, test } from "bun:test";
import type { NavSet, NavTree } from "../../lib/nav-tree";
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

/** SetTiles and EraTiles both aria-label "Browse …"; the era cards live in the
 * #browse-by-era section, so filter them out to count the Latest-sets tiles. */
function setTilesOf(container: HTMLElement) {
	return [...container.querySelectorAll('a[aria-label^="Browse"]')].filter(
		(a) => !a.closest("#browse-by-era"),
	);
}

test("HomeBrowse renders a glass era card per series and the newest set tiles", async () => {
	const { container, queryByText } = await renderInRouter(
		<HomeBrowse tree={TREE} />,
	);

	// Latest sets is now the first section (moved above Browse by era).
	expect(container.textContent).toContain("Latest sets");

	// Browse by era — one glass EraTile per series (pills → SetTile-style cards),
	// in the anchored section the launch pad's "Browse by era" card scrolls to.
	const eraSection = container.querySelector("#browse-by-era");
	expect(eraSection).toBeTruthy();
	expect(eraSection?.textContent).toContain("Browse by era");
	const eraCards = [...(eraSection?.querySelectorAll("a") ?? [])];
	expect(eraCards.length).toBe(3);
	// Each era card links to its era index page (209e5aa); the series name is the
	// a11y name. The test router has no /$series route, so the default search
	// params aren't stripped from the href — allow a ?query after the path.
	expect(eraCards[0].getAttribute("href")).toMatch(/^\/base(\?|$)/);
	expect(eraCards[0].getAttribute("aria-label")).toBe("Browse Base");
	// The full series name + year + set count are shown (no monogram badge).
	expect(eraCards[0].textContent).toContain("Base");
	expect(eraCards[0].textContent).toContain("1999");

	// The card-type pills are gone; the era cards never link to /pokemon etc.
	expect(queryByText("Browse by card type")).toBeNull();
	expect(container.querySelector('a[href^="/pokemon"]')).toBeNull();
	expect(container.querySelector('a[href^="/trainer"]')).toBeNull();
	expect(container.querySelector('a[href^="/energy"]')).toBeNull();

	// The catalog stat line moved to the home hero, so it is NOT rendered here.
	expect(queryByText(/always free/)).toBeNull();
	expect(queryByText(/Explore the catalog/i)).toBeNull();

	// Browse-variant Latest-set tiles (link to /$series/$set, never /vault).
	const tiles = setTilesOf(container);
	expect(tiles.length).toBe(4);
	for (const t of tiles) {
		expect(t.getAttribute("href")?.startsWith("/vault")).toBe(false);
	}
});

test("Latest sets are newest-era-first even when the newest series is short", async () => {
	const { container } = await renderInRouter(<HomeBrowse tree={TREE} />);
	const tiles = setTilesOf(container);
	// Sorted by series year desc: the 2023 SV sets come before the 1999/2000 ones.
	expect(tiles[0].getAttribute("aria-label")).toMatch(/SV Base|Paldea/);
});

test("non-core series (TCG Pocket) are hidden from Latest sets but kept in Browse-by-era", async () => {
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

	// Era card for TCG Pocket is still present (browsable from the era grid),
	// found by its accessible name (the card shows the monogram, not the name).
	expect(
		container.querySelector(
			'#browse-by-era a[aria-label="Browse Pokémon TCG Pocket"]',
		),
	).toBeTruthy();

	// ...but its set has no tile in Latest sets, while the core set does.
	expect(
		container.querySelector('a[aria-label="Browse Genetic Apex"]'),
	).toBeNull();
	expect(
		container.querySelector('a[aria-label="Browse Base Set"]'),
	).toBeTruthy();
});
