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

test("HomeBrowse renders an era pill per series and the newest set tiles", async () => {
	const { container, queryByText } = await renderInRouter(
		<HomeBrowse tree={TREE} />,
	);

	// One era pill per series — the card-type pills moved to the home launch pad,
	// so every soft-variant link here is now an era pill (no filtering needed).
	expect(container.textContent).toContain("Latest sets");
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

	// The catalog stat line moved to the home hero, so it is NOT rendered here.
	expect(queryByText(/always free/)).toBeNull();
	expect(queryByText(/Explore the catalog/i)).toBeNull();

	// Browse-variant set tiles (link to /$series/$set, never /vault).
	const tiles = container.querySelectorAll('a[aria-label^="Browse"]');
	expect(tiles.length).toBe(4);
	for (const t of tiles) {
		expect(t.getAttribute("href")?.startsWith("/vault")).toBe(false);
	}
});

test("Latest sets are newest-era-first even when the newest series is short", async () => {
	const { container } = await renderInRouter(<HomeBrowse tree={TREE} />);
	const tiles = [...container.querySelectorAll('a[aria-label^="Browse"]')];
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
