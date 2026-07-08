import { beforeEach, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import type { PokemonSet } from "../../server/card-mappers";
import { useStore } from "../../store/index";
import { addStack } from "../../store/userland/userland-store";
import {
	makeCard,
	makeCorpusCard,
	renderInRouter,
	seedCorpus,
	setupUserlandTest,
} from "../../test-utils";
import { PokemonTimeline } from "./pokemon-timeline";

const ownedCard = makeCard({
	id: "base1-1",
	name: "Bulbasaur",
	setId: "base1",
	cardNumber: "1",
});
const missingCard = makeCard({
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

beforeEach(async () => {
	await setupUserlandTest();
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
	// Bulbasaur is owned; Ivysaur is not.
	await addStack("base1-1");
});

test("empty timeline shows the no-cards message", async () => {
	await renderInRouter(
		<PokemonTimeline cards={[]} cardHref={() => ({ to: "/" as const })} />,
	);
	expect(screen.getByText(/no cards match these filters/i)).toBeDefined();
});

test("each card carries the unified mini-nav; owned drives grayscale", async () => {
	await renderInRouter(
		<PokemonTimeline
			cards={[ownedCard, missingCard]}
			cardHref={() => ({ to: "/" as const })}
		/>,
	);
	const owned = await screen.findByRole("button", { name: "Bulbasaur" });
	const missing = await screen.findByRole("button", { name: "Ivysaur" });
	// Grayscale-when-unowned is driven by the `.holo-card--owned` class.
	expect(owned.className).toContain("holo-card--owned");
	expect(missing.className).not.toContain("holo-card--owned");
	// The unified glass mini-nav replaces the old top-right pill on every card.
	expect(screen.getAllByRole("button", { name: /expand/i })).toHaveLength(2);
});
