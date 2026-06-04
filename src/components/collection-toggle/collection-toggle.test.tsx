import { beforeEach, describe, expect, test } from "bun:test";
import {
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PokemonSet } from "../../server/card-mappers";
import { buildIndex } from "../../store/corpus/corpus-engine";
import { useCorpusRuntime } from "../../store/corpus/corpus-runtime";
import { useStore } from "../../store/index";
import { createIdbRepos } from "../../store/userland/idb-repo";
import {
	resetUserlandForTests,
	setUserlandRepos,
} from "../../store/userland/userland-store";
import type { HoloCardData } from "../holo-card";
import { CollectionToggle } from "./collection-toggle";

const card: HoloCardData = {
	id: "base1-58",
	imageUrl: "https://example.invalid/p.png",
	name: "Pikachu",
	setId: "base1",
	setName: "Base",
	setSeries: "Base",
	cardNumber: "58",
};

const testSet: PokemonSet = {
	id: "base1",
	name: "Base Set",
	series: "Base",
	releaseDate: "1999-01-09",
	total: 102,
	images: { symbol: "", logo: "" },
};

async function renderInRouter(ui: React.ReactNode) {
	const rootRoute = createRootRoute({ component: () => <>{ui}</> });
	const router = createRouter({ routeTree: rootRoute });
	await router.load();
	return render(<RouterProvider router={router} />);
}

let repos = createIdbRepos();
beforeEach(async () => {
	repos = createIdbRepos();
	await repos.collection.clear();
	await repos.binders.clear();
	setUserlandRepos(repos);
	resetUserlandForTests();

	// Pre-seed corpus + sets so useSlugIndex resolves inside CollectionToggle.
	useCorpusRuntime.setState({
		index: buildIndex([
			{
				id: card.id,
				name: card.name,
				imageUrl: card.imageUrl,
				imageUrlSmall: card.imageUrl,
				supertype: card.supertype ?? "Pokémon",
				setId: card.setId,
				number: card.cardNumber,
			},
		]),
	});
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
