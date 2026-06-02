// copy-manager.test.tsx
import { beforeEach, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createIdbRepos } from "../../store/userland/idb-repo";
import {
	addCopy,
	resetUserlandForTests,
	setUserlandRepos,
	useUserland,
} from "../../store/userland/userland-store";
import { CopyManager } from "./copy-manager";

let repos = createIdbRepos();
beforeEach(async () => {
	repos = createIdbRepos();
	await repos.collection.clear();
	await repos.goals.clear();
	setUserlandRepos(repos);
	resetUserlandForTests();
});

test("add copy creates a row", async () => {
	await addCopy("c"); // seed 1 so manager shows
	render(<CopyManager cardId="c" />);
	fireEvent.click(screen.getByRole("button", { name: /add copy/i }));
	await waitFor(() =>
		expect(
			Object.values(useUserland.getState().items).filter(
				(i) => i.cardId === "c",
			),
		).toHaveLength(2),
	);
});

test("remove all (confirmed) empties the card's copies", async () => {
	await addCopy("c");
	await addCopy("c");
	const orig = window.confirm;
	window.confirm = () => true;
	render(<CopyManager cardId="c" />);
	fireEvent.click(screen.getByRole("button", { name: /remove all/i }));
	await waitFor(() =>
		expect(
			Object.values(useUserland.getState().items).filter(
				(i) => i.cardId === "c",
			),
		).toHaveLength(0),
	);
	window.confirm = orig;
});
