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
		goals: Array.from({ length: goalsLen }, (_, i) => ({
			id: `goal-${i}`,
			name: `Goal ${i}`,
			description: null,
			targets: [],
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
	await repos.goals.clear();
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

test("valid snapshot → summary shown; Merge → store gains items and goals", async () => {
	const snap = makeSnapshot(3, 2);
	const onOpenChange = () => {};

	render(<ImportDialog open onOpenChange={onOpenChange} />);

	const input = document.querySelector(
		'input[type="file"]',
	) as HTMLInputElement;
	const file = makeFile(JSON.stringify(snap));
	fireEvent.change(input, { target: { files: [file] } });

	// Summary appears
	await waitFor(() => {
		expect(screen.getByText(/3 cards · 2 goals/i)).toBeDefined();
	});

	// Click Merge
	const mergeBtn = screen.getByRole("button", { name: /merge/i });
	fireEvent.click(mergeBtn);

	await waitFor(() => {
		const state = useUserland.getState();
		expect(Object.keys(state.items)).toHaveLength(3);
		expect(Object.keys(state.goals)).toHaveLength(2);
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
		expect(screen.getByText(/2 cards · 1 goals/i)).toBeDefined();
	});

	const replaceBtn = screen.getByRole("button", { name: /replace/i });
	fireEvent.click(replaceBtn);

	await waitFor(() => {
		const state = useUserland.getState();
		expect(Object.keys(state.items)).toHaveLength(2);
		expect(Object.keys(state.goals)).toHaveLength(1);
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
		expect(screen.getByText(/2 cards · 1 goals/i)).toBeDefined();
	});

	const replaceBtn = screen.getByRole("button", { name: /replace/i });
	fireEvent.click(replaceBtn);

	// Give time for any async work
	await new Promise((r) => setTimeout(r, 50));

	const state = useUserland.getState();
	expect(Object.keys(state.items)).toHaveLength(0);
});
