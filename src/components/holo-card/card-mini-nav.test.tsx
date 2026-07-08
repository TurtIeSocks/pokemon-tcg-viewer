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
import { CardMiniNav } from "./card-mini-nav";

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

describe("<CardMiniNav />", () => {
	test("not owned: collection button shows a plus (no count) and an add label", async () => {
		await renderInRouter(<CardMiniNav card={card} />);
		const add = await screen.findByRole("button", {
			name: /add pikachu to collection/i,
		});
		// Plus state carries no owned count digits.
		expect(add.textContent?.trim()).toBe("");
	});

	test("not owned: clicking the collection button adds a copy", async () => {
		await renderInRouter(<CardMiniNav card={card} />);
		fireEvent.click(
			await screen.findByRole("button", { name: /add pikachu to collection/i }),
		);
		await waitFor(async () =>
			expect(
				(await repos.collection.list()).some((i) => i.cardId === card.id),
			).toBe(true),
		);
	});

	test("owned: collection button shows the ✓ owned count and a manage label", async () => {
		await repos.collection.add({ cardId: card.id, quantity: 3 });
		resetUserlandForTests();
		await renderInRouter(<CardMiniNav card={card} />);
		const btn = await screen.findByRole("button", {
			name: /manage stacks of pikachu/i,
		});
		expect(btn.textContent).toContain("3");
	});

	test("exposes expand + binder buttons alongside the collection toggle", async () => {
		await renderInRouter(<CardMiniNav card={card} />);
		expect(
			await screen.findByRole("button", { name: /expand pikachu/i }),
		).toBeDefined();
		expect(
			screen.getByRole("button", { name: /add pikachu to a binder/i }),
		).toBeDefined();
	});

	test("clicking the binder button opens the binder picker dialog", async () => {
		await renderInRouter(<CardMiniNav card={card} />);
		fireEvent.click(
			await screen.findByRole("button", { name: /add pikachu to a binder/i }),
		);
		// The picker dialog surfaces the "New binder" escape hatch.
		expect(await screen.findByText(/new binder/i)).toBeDefined();
	});
});
