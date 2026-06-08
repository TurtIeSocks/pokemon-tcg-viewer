import { beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { PokemonSet } from "../../server/card-mappers";
import { useStore } from "../../store/index";
import { resetUserlandForTests } from "../../store/userland/userland-store";
import {
	makeCard,
	makeCorpusCard,
	renderInRouter,
	seedCorpus,
	setupUserlandTest,
	type UserlandTestRepos,
} from "../../test-utils";
import { CollectionToggle } from "./collection-toggle";

const card = makeCard({
	id: "base1-58",
	name: "Pikachu",
	setId: "base1",
	cardNumber: "58",
});

const testSet: PokemonSet = {
	id: "base1",
	name: "Base Set",
	series: "Base",
	releaseDate: "1999-01-09",
	total: 102,
	images: { symbol: "", logo: "" },
};

let repos!: UserlandTestRepos;
beforeEach(async () => {
	repos = await setupUserlandTest();

	// Pre-seed corpus + sets so useSlugIndex resolves inside CollectionToggle.
	seedCorpus([
		makeCorpusCard({
			id: card.id,
			name: card.name,
			setId: card.setId,
			number: card.cardNumber,
		}),
	]);
	useStore.setState({ sets: [testSet] });
});

describe("<CollectionToggle />", () => {
	test("renders '+' when not owned", async () => {
		await renderInRouter(<CollectionToggle card={card} />);
		const btn = await screen.findByRole("button", {
			name: /add .* collection/i,
		});
		expect(btn.textContent).toBe("+");
	});

	test("click adds a copy, then shows '✓'", async () => {
		await renderInRouter(<CollectionToggle card={card} />);
		fireEvent.click(await screen.findByRole("button"));
		await waitFor(async () =>
			expect(
				(await repos.collection.list()).some((i) => i.cardId === card.id),
			).toBe(true),
		);
		await screen.findByRole("button", { name: /stacks|manage|collection/i });
	});

	test("owned: renders manage-stacks button (no dialog)", async () => {
		await repos.collection.add({ cardId: card.id });
		resetUserlandForTests();
		await renderInRouter(<CollectionToggle card={card} />);
		const btn = await screen.findByRole("button", {
			name: /manage stacks/i,
		});
		expect(btn).not.toBeNull();
		// Clicking must not open a dialog (no "Your stacks" text)
		fireEvent.click(btn);
		// After click the button is still present (navigate fires), no modal text
		expect(screen.queryByText(/your stacks/i)).toBeNull();
		// Collection is unchanged — button never triggered a delete
		expect(await repos.collection.list()).toHaveLength(1);
	});
});
