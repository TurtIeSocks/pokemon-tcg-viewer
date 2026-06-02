// owned-cards-grid.test.tsx
import { beforeEach, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { createIdbRepos } from "../../store/userland/idb-repo";
import {
	resetUserlandForTests,
	setUserlandRepos,
} from "../../store/userland/userland-store";
import { OwnedCardsGrid } from "./owned-cards-grid";

let repos = createIdbRepos();
beforeEach(async () => {
	repos = createIdbRepos();
	await repos.collection.clear();
	await repos.goals.clear();
	setUserlandRepos(repos);
	resetUserlandForTests();
});

test("renders empty state when no owned cards", async () => {
	render(<OwnedCardsGrid />);
	expect(screen.getByText(/your binder is empty/i)).toBeDefined();
});

test("renders without crashing", () => {
	const { container } = render(<OwnedCardsGrid />);
	expect(container).toBeDefined();
});
