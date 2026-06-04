// import-dialog.test.tsx
import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useStore } from "../../store";
import { buildIndex } from "../../store/corpus/corpus-engine";
import { useCorpusRuntime } from "../../store/corpus/corpus-runtime";
import type { CorpusCard } from "../../store/corpus/corpus-types";
import { createIdbRepos } from "../../store/userland/idb-repo";
import type { UserDataSnapshot } from "../../store/userland/types";
import {
	resetUserlandForTests,
	setUserlandRepos,
	useUserland,
} from "../../store/userland/userland-store";
import { ImportDialog } from "./import-dialog";

function makeSnapshot(
	collectionLen: number,
	goalsLen: number,
): UserDataSnapshot {
	const now = Date.now();
	return {
		schemaVersion: 2,
		exportedAt: now,
		collection: Array.from({ length: collectionLen }, (_, i) => ({
			id: `item-${i}`,
			cardId: `card-${i}`,
			quantity: 1,
			source: null,
			storageLocation: null,
			acquiredAt: now,
			createdAt: now,
			pricePaid: null,
			variant: null,
			notes: null,
			condition: null,
			grading: null,
		})),
		binders: Array.from({ length: goalsLen }, (_, i) => ({
			id: `binder-${i}`,
			name: `Binder ${i}`,
			description: null,
			rules: [],
			includeCardIds: [],
			excludeCardIds: [],
			createdAt: now,
			updatedAt: now,
		})),
	};
}

function makeFile(content: string): File {
	return new File([content], "backup.json", { type: "application/json" });
}

function corpusCard(id: string, setId: string, number: string): CorpusCard {
	return {
		id,
		name: id,
		imageUrl: "",
		imageUrlSmall: "",
		supertype: "Pokémon",
		setId,
		number,
	};
}

let repos = createIdbRepos();

beforeEach(async () => {
	repos = createIdbRepos();
	await repos.collection.clear();
	await repos.binders.clear();
	setUserlandRepos(repos);
	resetUserlandForTests();
});

afterEach(() => {
	useCorpusRuntime.setState({ index: null });
	useStore.setState({ sets: null });
});

test("invalid JSON file → inline error shown, no import called", async () => {
	const onOpenChange = () => {};
	render(<ImportDialog open onOpenChange={onOpenChange} />);

	const input = document.querySelector(
		'input[type="file"]',
	) as HTMLInputElement;
	expect(input).toBeDefined();

	const file = makeFile("not { json }");
	fireEvent.change(input, { target: { files: [file] } });

	await waitFor(() => {
		expect(screen.getByText(/isn't valid JSON|Unrecognized/i)).toBeDefined();
	});

	// Store should be untouched
	expect(Object.keys(useUserland.getState().items)).toHaveLength(0);
});

test("valid snapshot → summary shown; Merge → store gains items and binders", async () => {
	const snap = makeSnapshot(3, 2);
	const onOpenChange = () => {};

	render(<ImportDialog open onOpenChange={onOpenChange} />);

	const input = document.querySelector(
		'input[type="file"]',
	) as HTMLInputElement;
	const file = makeFile(JSON.stringify(snap));
	fireEvent.change(input, { target: { files: [file] } });

	// Summary appears (counts are in child spans so we match on combined textContent)
	await waitFor(() => {
		const el = screen.getByText(
			(_, node) =>
				node?.nodeName === "P" &&
				(node?.textContent ?? "")
					.replace(/\s+/g, " ")
					.includes("3 cards · 2 binders"),
		);
		expect(el).toBeDefined();
	});

	// Click Merge
	const mergeBtn = screen.getByRole("button", { name: /merge/i });
	fireEvent.click(mergeBtn);

	await waitFor(() => {
		const state = useUserland.getState();
		expect(Object.keys(state.items)).toHaveLength(3);
		expect(Object.keys(state.binders)).toHaveLength(2);
	});
});

test("valid snapshot → Replace (confirm true) → store replaced", async () => {
	// Seed an existing item that should be gone after replace
	spyOn(window, "confirm").mockImplementation(() => true);

	const snap = makeSnapshot(2, 1);
	const onOpenChange = () => {};

	render(<ImportDialog open onOpenChange={onOpenChange} />);

	const input = document.querySelector(
		'input[type="file"]',
	) as HTMLInputElement;
	const file = makeFile(JSON.stringify(snap));
	fireEvent.change(input, { target: { files: [file] } });

	await waitFor(() => {
		const el = screen.getByText(
			(_, node) =>
				node?.nodeName === "P" &&
				(node?.textContent ?? "")
					.replace(/\s+/g, " ")
					.includes("2 cards · 1 binders"),
		);
		expect(el).toBeDefined();
	});

	const replaceBtn = screen.getByRole("button", { name: /replace/i });
	fireEvent.click(replaceBtn);

	await waitFor(() => {
		const state = useUserland.getState();
		expect(Object.keys(state.items)).toHaveLength(2);
		expect(Object.keys(state.binders)).toHaveLength(1);
	});
});

test("Replace (confirm false) → no import", async () => {
	spyOn(window, "confirm").mockImplementation(() => false);

	const snap = makeSnapshot(2, 1);
	const onOpenChange = () => {};

	render(<ImportDialog open onOpenChange={onOpenChange} />);

	const input = document.querySelector(
		'input[type="file"]',
	) as HTMLInputElement;
	const file = makeFile(JSON.stringify(snap));
	fireEvent.change(input, { target: { files: [file] } });

	await waitFor(() => {
		const el = screen.getByText(
			(_, node) =>
				node?.nodeName === "P" &&
				(node?.textContent ?? "")
					.replace(/\s+/g, " ")
					.includes("2 cards · 1 binders"),
		);
		expect(el).toBeDefined();
	});

	const replaceBtn = screen.getByRole("button", { name: /replace/i });
	fireEvent.click(replaceBtn);

	// Give time for any async work
	await new Promise((r) => setTimeout(r, 50));

	const state = useUserland.getState();
	expect(Object.keys(state.items)).toHaveLength(0);
});

test("CSV import previews matched/unmatched then commits matched stacks", async () => {
	useCorpusRuntime.setState({
		index: buildIndex([corpusCard("base1-4", "base1", "4")]),
	});
	render(<ImportDialog open onOpenChange={() => {}} />);

	const input = document.querySelector(
		'input[type="file"]',
	) as HTMLInputElement;
	const csvFile = new File(
		["card_id,quantity\nbase1-4,2\nnope,1\n"],
		"collection.csv",
		{ type: "text/csv" },
	);
	fireEvent.change(input, { target: { files: [csvFile] } });

	// Preview: 1 matched, 1 unmatched
	await waitFor(() => {
		const el = screen.getByText(
			(_, node) =>
				node?.nodeName === "P" &&
				(node?.textContent ?? "")
					.replace(/\s+/g, " ")
					.includes("1 matched · 1 unmatched"),
		);
		expect(el).toBeDefined();
	});

	fireEvent.click(screen.getByRole("button", { name: /import 1 stack/i }));

	await waitFor(() => {
		const stacks = Object.values(useUserland.getState().items);
		expect(stacks).toHaveLength(1);
		expect(stacks[0].cardId).toBe("base1-4");
		expect(stacks[0].quantity).toBe(2);
	});
});

test("CSV with foreign headers imports via auto-detect + set_name matching", async () => {
	useCorpusRuntime.setState({
		index: buildIndex([corpusCard("base1-4", "base1", "4")]),
	});
	useStore.setState({
		sets: [
			{
				id: "base1",
				name: "Base",
				series: "Base",
				releaseDate: "1999-01-09",
				total: 102,
				images: { symbol: "", logo: "" },
			},
		],
	});
	render(<ImportDialog open onOpenChange={() => {}} />);

	const input = document.querySelector(
		'input[type="file"]',
	) as HTMLInputElement;
	const file = new File(
		["Name,Set,Card Number,Qty\nCharizard,Base,4,3\n"],
		"pokellector.csv",
		{ type: "text/csv" },
	);
	fireEvent.change(input, { target: { files: [file] } });

	await waitFor(() => {
		const el = screen.getByText(
			(_, n) =>
				n?.nodeName === "P" &&
				(n?.textContent ?? "")
					.replace(/\s+/g, " ")
					.includes("1 matched · 0 unmatched"),
		);
		expect(el).toBeDefined();
	});

	fireEvent.click(screen.getByRole("button", { name: /import 1 stack/i }));
	await waitFor(() => {
		const stacks = Object.values(useUserland.getState().items);
		expect(stacks[0]?.cardId).toBe("base1-4");
		expect(stacks[0]?.quantity).toBe(3);
	});
});

test("CSV set name 'Base Set' fuzzy-matches corpus set 'Base'", async () => {
	useCorpusRuntime.setState({
		index: buildIndex([corpusCard("base1-4", "base1", "4")]),
	});
	useStore.setState({
		sets: [
			{
				id: "base1",
				name: "Base",
				series: "Base",
				releaseDate: "1999-01-09",
				total: 102,
				images: { symbol: "", logo: "" },
			},
		],
	});
	render(<ImportDialog open onOpenChange={() => {}} />);
	const input = document.querySelector(
		'input[type="file"]',
	) as HTMLInputElement;
	const file = new File(
		["Name,Set,Card Number,Qty\nCharizard,Base Set,4,1\n"],
		"x.csv",
		{ type: "text/csv" },
	);
	fireEvent.change(input, { target: { files: [file] } });
	await waitFor(() => {
		const el = screen.getByText(
			(_, n) =>
				n?.nodeName === "P" &&
				(n?.textContent ?? "")
					.replace(/\s+/g, " ")
					.includes("1 matched · 0 unmatched"),
		);
		expect(el).toBeDefined();
	});
});

test("CSV import with Merge on collapses duplicate rows into one stack", async () => {
	useCorpusRuntime.setState({
		index: buildIndex([corpusCard("base1-4", "base1", "4")]),
	});
	render(<ImportDialog open onOpenChange={() => {}} />);
	const input = document.querySelector(
		'input[type="file"]',
	) as HTMLInputElement;
	const file = new File(
		["card_id,quantity\nbase1-4,2\nbase1-4,2\n"],
		"dupes.csv",
		{ type: "text/csv" },
	);
	fireEvent.change(input, { target: { files: [file] } });
	await screen.findByRole("button", { name: /import 2 stacks/i });
	fireEvent.click(screen.getByRole("button", { name: /import 2 stacks/i }));
	await waitFor(() => {
		const stacks = Object.values(useUserland.getState().items);
		expect(stacks).toHaveLength(1);
		expect(stacks[0].quantity).toBe(4);
	});
});

test("manual column-remap: fixing a missed header makes the row match + import", async () => {
	useCorpusRuntime.setState({
		index: buildIndex([corpusCard("base1-4", "base1", "4")]),
	});
	useStore.setState({
		sets: [
			{
				id: "base1",
				name: "Base",
				series: "Base",
				releaseDate: "1999-01-09",
				total: 102,
				images: { symbol: "", logo: "" },
			},
		],
	});
	render(<ImportDialog open onOpenChange={() => {}} />);
	const input = document.querySelector(
		'input[type="file"]',
	) as HTMLInputElement;
	// "Expansion Name" is not an auto-detected alias for set_name.
	const file = new File(
		["Card,Expansion Name,Number,Count\nCharizard,Base,4,2\n"],
		"weird.csv",
		{ type: "text/csv" },
	);
	fireEvent.change(input, { target: { files: [file] } });

	await waitFor(() => {
		const el = screen.getByText(
			(_, n) =>
				n?.nodeName === "P" &&
				(n?.textContent ?? "")
					.replace(/\s+/g, " ")
					.includes("0 matched · 1 unmatched"),
		);
		expect(el).toBeDefined();
	});

	// Remap set_name → "Expansion Name"; the row should now match.
	fireEvent.change(screen.getByLabelText("set_name"), {
		target: { value: "Expansion Name" },
	});
	await waitFor(() => {
		const el = screen.getByText(
			(_, n) =>
				n?.nodeName === "P" &&
				(n?.textContent ?? "")
					.replace(/\s+/g, " ")
					.includes("1 matched · 0 unmatched"),
		);
		expect(el).toBeDefined();
	});

	fireEvent.click(screen.getByRole("button", { name: /import 1 stack/i }));
	await waitFor(() => {
		const stacks = Object.values(useUserland.getState().items);
		expect(stacks[0]?.cardId).toBe("base1-4");
		expect(stacks[0]?.quantity).toBe(2);
	});
});

test("review queue: search-pick a card for an unmatched name-only row → import", async () => {
	useCorpusRuntime.setState({
		index: buildIndex([
			{
				id: "base1-4",
				name: "Charizard",
				imageUrl: "",
				imageUrlSmall: "",
				supertype: "Pokémon",
				setId: "base1",
				number: "4",
			},
		]),
	});
	useStore.setState({
		sets: [
			{
				id: "base1",
				name: "Base",
				series: "Base",
				releaseDate: "1999-01-09",
				total: 102,
				images: { symbol: "", logo: "" },
			},
		],
	});
	render(<ImportDialog open onOpenChange={() => {}} />);
	const input = document.querySelector(
		'input[type="file"]',
	) as HTMLInputElement;
	// name only → no number/set/card_id → can't auto-match
	const file = new File(["card_name\nCharizard\n"], "names.csv", {
		type: "text/csv",
	});
	fireEvent.change(input, { target: { files: [file] } });

	await waitFor(() => {
		const el = screen.getByText(
			(_, n) =>
				n?.nodeName === "P" &&
				(n?.textContent ?? "")
					.replace(/\s+/g, " ")
					.includes("0 matched · 1 unmatched"),
		);
		expect(el).toBeDefined();
	});

	// pick the candidate from the review queue
	const candidate = await screen.findByRole("button", { name: /charizard/i });
	fireEvent.click(candidate);

	await waitFor(() => {
		const el = screen.getByText(
			(_, n) =>
				n?.nodeName === "P" &&
				(n?.textContent ?? "")
					.replace(/\s+/g, " ")
					.includes("1 matched · 0 unmatched"),
		);
		expect(el).toBeDefined();
	});

	fireEvent.click(screen.getByRole("button", { name: /import 1 stack/i }));
	await waitFor(() => {
		const stacks = Object.values(useUserland.getState().items);
		expect(stacks[0]?.cardId).toBe("base1-4");
	});
});
