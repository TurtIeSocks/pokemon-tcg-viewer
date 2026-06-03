// import-dialog.test.tsx
import { beforeEach, expect, spyOn, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
		schemaVersion: 1,
		exportedAt: now,
		collection: Array.from({ length: collectionLen }, (_, i) => ({
			id: `item-${i}`,
			cardId: `card-${i}`,
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

let repos = createIdbRepos();

beforeEach(async () => {
	repos = createIdbRepos();
	await repos.collection.clear();
	await repos.binders.clear();
	setUserlandRepos(repos);
	resetUserlandForTests();
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
		const el = screen.getByText((_, node) =>
			node?.nodeName === "P" &&
			(node?.textContent ?? "").replace(/\s+/g, " ").includes("3 cards · 2 binders"),
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
		const el = screen.getByText((_, node) =>
			node?.nodeName === "P" &&
			(node?.textContent ?? "").replace(/\s+/g, " ").includes("2 cards · 1 binders"),
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
		const el = screen.getByText((_, node) =>
			node?.nodeName === "P" &&
			(node?.textContent ?? "").replace(/\s+/g, " ").includes("2 cards · 1 binders"),
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
