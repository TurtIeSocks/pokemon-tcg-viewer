import { beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

let repos = createIdbRepos();
beforeEach(async () => {
	repos = createIdbRepos();
	await repos.collection.clear();
	await repos.goals.clear();
	setUserlandRepos(repos);
	resetUserlandForTests();
});

describe("<CollectionToggle />", () => {
	test("renders '+' when not owned", async () => {
		render(<CollectionToggle card={card} />);
		const btn = await screen.findByRole("button", {
			name: /add .* collection/i,
		});
		expect(btn.textContent).toBe("+");
	});

	test("click adds a copy, then shows '✓'", async () => {
		render(<CollectionToggle card={card} />);
		fireEvent.click(await screen.findByRole("button"));
		await waitFor(async () =>
			expect(
				(await repos.collection.list()).some((i) => i.cardId === card.id),
			).toBe(true),
		);
		await screen.findByRole("button", { name: /remove .* collection/i });
	});

	test("click when owned removes all copies", async () => {
		await repos.collection.add({ cardId: card.id });
		resetUserlandForTests();
		render(<CollectionToggle card={card} />);
		fireEvent.click(
			await screen.findByRole("button", { name: /remove .* collection/i }),
		);
		await waitFor(async () =>
			expect(await repos.collection.list()).toHaveLength(0),
		);
	});
});
