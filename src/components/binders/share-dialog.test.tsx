import { beforeEach, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PokemonSet } from "../../server/card-mappers";
import { useStore } from "../../store";
import type { Binder, Stack } from "../../store/userland/types";
import { useUserland } from "../../store/userland/userland-store";
import {
	makeBinder,
	makeCorpusCard,
	makeStack,
	seedCorpus,
	setupUserlandTest,
} from "../../test-utils";
import { ShareDialog } from "./share-dialog";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const oneSet: PokemonSet = {
	id: "base1",
	name: "Base Set",
	series: "Base",
	releaseDate: "1999/01/09",
	total: 2,
	images: { symbol: "", logo: "" },
};

const cards = [
	makeCorpusCard({ id: "base1-1", name: "Bulbasaur" }),
	makeCorpusCard({ id: "base1-2", name: "Ivysaur" }),
];

function makeItem(id: string, cardId: string): Stack {
	return makeStack({
		id,
		cardId,
		acquiredAt: 1000,
		createdAt: 1000,
		condition: "NM",
		isPrimary: true,
	});
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
	await setupUserlandTest();

	// Seed corpus
	seedCorpus(cards);
	// Seed sets
	useStore.setState({ sets: [oneSet] });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedStore(binder: Binder, items: Stack[] = []) {
	const itemsMap: Record<string, Stack> = {};
	for (const item of items) itemsMap[item.id] = item;
	useUserland.setState((s) => ({
		binders: { ...s.binders, [binder.id]: binder },
		items: { ...s.items, ...itemsMap },
	}));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("scope control renders all three options", () => {
	const binder = makeBinder({ includeCardIds: ["base1-1", "base1-2"] });
	seedStore(binder);
	render(<ShareDialog open={true} onOpenChange={() => {}} binder={binder} />);

	expect(screen.getByRole("radio", { name: /all/i })).toBeTruthy();
	expect(screen.getByRole("radio", { name: /owned/i })).toBeTruthy();
	expect(screen.getByRole("radio", { name: /needed/i })).toBeTruthy();
});

test("include grades toggle renders and is checked by default", () => {
	const binder = makeBinder({ includeCardIds: ["base1-1", "base1-2"] });
	seedStore(binder);
	render(<ShareDialog open={true} onOpenChange={() => {}} binder={binder} />);

	const toggle = screen.getByRole("switch");
	expect(toggle).toBeTruthy();
	// Default is ON (true)
	expect((toggle as HTMLButtonElement).getAttribute("data-state")).toBe(
		"checked",
	);
});

test("generated link contains /vault/shared#b=", async () => {
	const binder = makeBinder({ includeCardIds: ["base1-1", "base1-2"] });
	const items = [makeItem("i1", "base1-1"), makeItem("i2", "base1-2")];
	seedStore(binder, items);

	render(<ShareDialog open={true} onOpenChange={() => {}} binder={binder} />);

	await waitFor(() => {
		const input = screen.getByRole("textbox", {
			name: /shareable link/i,
		}) as HTMLInputElement;
		expect(input.value).toContain("/vault/shared#b=");
	});
});

test("switching scope to Owned changes the generated link", async () => {
	const binder = makeBinder({ includeCardIds: ["base1-1", "base1-2"] });
	const items = [makeItem("i1", "base1-1")]; // owns base1-1, not base1-2
	seedStore(binder, items);

	render(<ShareDialog open={true} onOpenChange={() => {}} binder={binder} />);

	// Wait for initial link
	let allLink = "";
	await waitFor(() => {
		const input = screen.getByRole("textbox", {
			name: /shareable link/i,
		}) as HTMLInputElement;
		expect(input.value).toContain("#b=");
		allLink = input.value;
	});

	// Switch scope to Owned
	const ownedRadio = screen.getByRole("radio", { name: /owned/i });
	fireEvent.click(ownedRadio);

	await waitFor(() => {
		const input = screen.getByRole("textbox", {
			name: /shareable link/i,
		}) as HTMLInputElement;
		const ownedLink = input.value;
		expect(ownedLink).toContain("#b=");
		// The encoded payload must differ (fewer cards)
		expect(ownedLink).not.toBe(allLink);
	});
});

test("clicking Copy link calls navigator.clipboard.writeText with the url", async () => {
	const binder = makeBinder({ includeCardIds: ["base1-1", "base1-2"] });
	seedStore(binder, [makeItem("i1", "base1-1")]);

	// Mock clipboard
	const writeText = mock(() => Promise.resolve());
	Object.defineProperty(navigator, "clipboard", {
		value: { writeText },
		writable: true,
		configurable: true,
	});

	render(<ShareDialog open={true} onOpenChange={() => {}} binder={binder} />);

	// Wait for link to be ready
	await waitFor(() => {
		const input = screen.getByRole("textbox", {
			name: /shareable link/i,
		}) as HTMLInputElement;
		expect(input.value).toContain("#b=");
	});

	fireEvent.click(screen.getByRole("button", { name: /copy link/i }));

	await waitFor(() => {
		expect(writeText).toHaveBeenCalledTimes(1);
		const calledWith = (writeText.mock.calls[0] as string[])[0];
		expect(calledWith).toContain("/vault/shared#b=");
	});
});

test("frozen-snapshot note is present", () => {
	const binder = makeBinder({ includeCardIds: ["base1-1", "base1-2"] });
	seedStore(binder);
	render(<ShareDialog open={true} onOpenChange={() => {}} binder={binder} />);

	expect(screen.getByText(/one-time snapshot/i)).toBeTruthy();
});
