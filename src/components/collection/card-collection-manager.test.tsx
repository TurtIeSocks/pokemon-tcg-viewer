// card-collection-manager.test.tsx
import { beforeEach, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { createIdbRepos } from "../../store/userland/idb-repo";
import {
	addCopy,
	resetUserlandForTests,
	setUserlandRepos,
} from "../../store/userland/userland-store";
import { CardCollectionManager } from "./card-collection-manager";

beforeEach(async () => {
	const repos = createIdbRepos();
	await repos.collection.clear();
	await repos.binders.clear();
	setUserlandRepos(repos);
	resetUserlandForTests();
});

test("renders the card-name heading with 'Your Collection'", () => {
	render(
		<CardCollectionManager
			cardId="base1-4"
			cardName="Charizard"
			onBack={() => {}}
		/>,
	);
	expect(screen.getByText(/Your Collection/i)).toBeDefined();
	expect(screen.getByText("Charizard")).toBeDefined();
});

test("Back to Pokémon button calls onBack", () => {
	let backCalls = 0;
	render(
		<CardCollectionManager
			cardId="base1-4"
			cardName="Charizard"
			onBack={() => {
				backCalls++;
			}}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: /card details/i }));
	expect(backCalls).toBe(1);
});

test("subtitle shows set + number when provided, omitted otherwise", () => {
	const { unmount } = render(
		<CardCollectionManager
			cardId="base1-4"
			cardName="Charizard"
			setName="Base Set"
			cardNumber="4"
			onBack={() => {}}
		/>,
	);
	expect(screen.getByText(/Base Set · #4/)).toBeDefined();
	unmount();

	render(
		<CardCollectionManager
			cardId="base1-4"
			cardName="Charizard"
			onBack={() => {}}
		/>,
	);
	expect(screen.queryByText(/Base Set/)).toBeNull();
});

test("renders the CopyManager (Add copy control + a seeded copy)", async () => {
	await addCopy("base1-4");
	render(
		<CardCollectionManager
			cardId="base1-4"
			cardName="Charizard"
			onBack={() => {}}
		/>,
	);
	expect(screen.getByText(/your copies/i)).toBeDefined();
	expect(screen.getByRole("button", { name: /add copy/i })).toBeDefined();
});

test("thumbnail renders only when imageUrl is provided", () => {
	// Decorative thumbnail (alt="", aria-hidden) → query the DOM, not by role.
	const withImg = render(
		<CardCollectionManager
			cardId="base1-4"
			cardName="Charizard"
			imageUrl="https://example.com/charizard.png"
			onBack={() => {}}
		/>,
	);
	const img = withImg.container.querySelector(
		'img[src*="charizard.png"]',
	) as HTMLImageElement | null;
	expect(img).not.toBeNull();
	withImg.unmount();

	const noImg = render(
		<CardCollectionManager
			cardId="base1-4"
			cardName="Charizard"
			onBack={() => {}}
		/>,
	);
	expect(noImg.container.querySelector("img")).toBeNull();
});
