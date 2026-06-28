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

	const { container, getByText } = await renderInRouter(
		<HomeBrowse tree={TREE} />,
	);

	// Tree-derived counts: 4 sets across 3 eras.
	expect(getByText(/4 sets/)).toBeTruthy();
	expect(getByText(/3 eras/)).toBeTruthy();
	expect(getByText(/always free/)).toBeTruthy();

	// Section headings + one era pill per series (soft-variant button links).
	// Exclude the card-type pills (which are also soft-variant links).
	expect(getByText("Browse by era")).toBeTruthy();
	expect(getByText("Latest sets")).toBeTruthy();
	const softPills = [...container.querySelectorAll('a[data-variant="soft"]')];
	const eraPills = softPills.filter((a) => {
		const href = a.getAttribute("href") ?? "";
		return !href.startsWith("/trainer") && !href.startsWith("/energy");
	});
	expect(eraPills.length).toBe(3);

	// Browse-by-card-type section links to the Trainer + Energy category pages.
	expect(getByText("Browse by card type")).toBeTruthy();
	expect(container.querySelector('a[href^="/trainer"]')).toBeTruthy();
	expect(container.querySelector('a[href^="/energy"]')).toBeTruthy();

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
