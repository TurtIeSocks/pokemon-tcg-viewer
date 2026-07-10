import { beforeEach, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import type { PokemonSet } from "../../server/card-mappers";
import { useStore } from "../../store/index";
import {
	makeBinder,
	makeCard,
	makeCorpusCard,
	renderInRouter,
	seedCorpus,
	setupUserlandTest,
} from "../../test-utils";
import { OwnedMissingGrid } from "./owned-missing-grid";

const cardA = makeCard({
	id: "base1-1",
	name: "Bulbasaur",
	setId: "base1",
	cardNumber: "1",
});
const cardB = makeCard({
	id: "base1-2",
	name: "Ivysaur",
	setId: "base1",
	cardNumber: "2",
});

const testSet: PokemonSet = {
	id: "base1",
	name: "Base Set",
	series: "Base",
	releaseDate: "1999-01-09",
	total: 102,
	images: { symbol: "", logo: "" },
};

// "base1-1" owned; "base1-2" missing
const ownedSet = new Set(["base1-1"]);

beforeEach(async () => {
	await setupUserlandTest();
	// Seed corpus + sets so the mini-nav + per-card modal link resolve, and
	// loadCorpus() early-returns (no network).
	seedCorpus([
		makeCorpusCard({
			id: "base1-1",
			name: "Bulbasaur",
			setId: "base1",
			number: "1",
		}),
		makeCorpusCard({
			id: "base1-2",
			name: "Ivysaur",
			setId: "base1",
			number: "2",
		}),
	]);
	useStore.setState({ sets: [testSet] });
});

test("owned card renders in full color (holo-card--owned); missing card does not", async () => {
	await renderInRouter(
		<OwnedMissingGrid cards={[cardA, cardB]} ownedCardIds={ownedSet} />,
	);
	const ownedCard = await screen.findByRole("button", { name: "Bulbasaur" });
	const missingCard = await screen.findByRole("button", { name: "Ivysaur" });
	// Grayscale-when-unowned is driven by the `.holo-card--owned` class (CSS
	// desaturates grid tiles that lack it).
	expect(ownedCard.className).toContain("holo-card--owned");
	expect(missingCard.className).not.toContain("holo-card--owned");
});

test("every card exposes the unified mini-nav (expand button)", async () => {
	await renderInRouter(
		<OwnedMissingGrid cards={[cardA, cardB]} ownedCardIds={ownedSet} />,
	);
	const expandButtons = await screen.findAllByRole("button", {
		name: /expand/i,
	});
	expect(expandButtons).toHaveLength(2);
});

test("a missing card's mini-nav offers to add it to the collection", async () => {
	await renderInRouter(
		<OwnedMissingGrid cards={[cardB]} ownedCardIds={ownedSet} />,
	);
	expect(
		await screen.findByRole("button", { name: /add ivysaur to collection/i }),
	).toBeDefined();
});

test("each visible card links to its detail modal", async () => {
	await renderInRouter(
		<OwnedMissingGrid cards={[cardA, cardB]} ownedCardIds={ownedSet} />,
	);
	await screen.findByRole("button", { name: "Bulbasaur" });
	expect(screen.getAllByRole("link")).toHaveLength(2);
});

test("mode=owned hides missing cards", async () => {
	await renderInRouter(
		<OwnedMissingGrid
			cards={[cardA, cardB]}
			ownedCardIds={ownedSet}
			mode="owned"
		/>,
	);
	expect(
		await screen.findByRole("button", { name: "Bulbasaur" }),
	).toBeDefined();
	expect(screen.queryByRole("button", { name: "Ivysaur" })).toBeNull();
});

test("mode=missing hides owned cards", async () => {
	await renderInRouter(
		<OwnedMissingGrid
			cards={[cardA, cardB]}
			ownedCardIds={ownedSet}
			mode="missing"
		/>,
	);
	expect(await screen.findByRole("button", { name: "Ivysaur" })).toBeDefined();
	expect(screen.queryByRole("button", { name: "Bulbasaur" })).toBeNull();
});

test("empty owned state shows the friendly message", async () => {
	await renderInRouter(
		<OwnedMissingGrid cards={[cardB]} ownedCardIds={new Set()} mode="owned" />,
	);
	expect(screen.getByText(/don't own any cards/i)).toBeDefined();
});

test("no binderId: cells render no source badge (default, unchanged)", async () => {
	await renderInRouter(
		<OwnedMissingGrid cards={[cardA, cardB]} ownedCardIds={ownedSet} />,
	);
	await screen.findByRole("button", { name: "Bulbasaur" });
	expect(screen.queryByText(/via rule|added/i)).toBeNull();
});

test("binder-aware: manual member shows 'Added', rule member shows 'via rule'", async () => {
	// cardA is a manual include; cardB is not (so it's a rule match).
	const binder = makeBinder({ id: "b1", includeCardIds: ["base1-1"] });
	await renderInRouter(
		<OwnedMissingGrid
			cards={[cardA, cardB]}
			ownedCardIds={ownedSet}
			binderId="b1"
			binder={binder}
		/>,
	);
	await screen.findByRole("button", { name: "Bulbasaur" });
	expect(screen.getByText(/^added$/i)).toBeDefined();
	expect(screen.getByText(/via rule/i)).toBeDefined();
});
