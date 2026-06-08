// card-collection-manager.test.tsx
import { beforeEach, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { addStack } from "../../store/userland/userland-store";
import { setupUserlandTest } from "../../test-utils";
import { CardCollectionManager } from "./card-collection-manager";

beforeEach(async () => {
	await setupUserlandTest();
});

test("renders the card name in the top bar", () => {
	render(
		<CardCollectionManager
			cardId="base1-4"
			cardName="Charizard"
			onBack={() => {}}
		/>,
	);
	expect(screen.getByText("Charizard")).toBeDefined();
});

test("Back button calls onBack", () => {
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

test("back pill shows setName when provided", () => {
	render(
		<CardCollectionManager
			cardId="base1-4"
			cardName="Charizard"
			setName="Base Set"
			cardNumber="4"
			onBack={() => {}}
		/>,
	);
	// Back button contains set name
	expect(
		screen.getByRole("button", { name: /card details/i }).textContent,
	).toContain("Base Set");
});

test("back pill shows 'Back' when setName is omitted", () => {
	render(
		<CardCollectionManager
			cardId="base1-4"
			cardName="Charizard"
			onBack={() => {}}
		/>,
	);
	expect(
		screen.getByRole("button", { name: /card details/i }).textContent,
	).toContain("Back");
});

test("renders the StackManager (Add stack control + a seeded stack)", async () => {
	await addStack("base1-4");
	render(
		<CardCollectionManager
			cardId="base1-4"
			cardName="Charizard"
			onBack={() => {}}
		/>,
	);
	// Multiple "Your stacks" elements exist (panel header + StackManager h3)
	expect(screen.getAllByText(/your stacks/i).length).toBeGreaterThan(0);
	expect(screen.getByRole("button", { name: /add stack/i })).toBeDefined();
});

test("thumbnail renders only when imageUrl is provided (no full card data)", () => {
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
