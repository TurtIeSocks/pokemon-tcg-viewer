// vault-backup-controls.test.tsx
import { beforeEach, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createIdbRepos } from "../../store/userland/idb-repo";
import {
	exportUserData,
	resetUserlandForTests,
	setUserlandRepos,
} from "../../store/userland/userland-store";
import { VaultBackupControls } from "./vault-backup-controls";

let repos = createIdbRepos();
beforeEach(async () => {
	repos = createIdbRepos();
	await repos.collection.clear();
	await repos.goals.clear();
	setUserlandRepos(repos);
	resetUserlandForTests();
});

test("renders Export backup and Import backup buttons", () => {
	render(<VaultBackupControls />);
	expect(screen.getByRole("button", { name: /export backup/i })).toBeDefined();
	expect(screen.getByRole("button", { name: /import backup/i })).toBeDefined();
});

test("clicking Import backup opens the import dialog", async () => {
	render(<VaultBackupControls />);
	const importBtn = screen.getByRole("button", { name: /import backup/i });
	fireEvent.click(importBtn);
	// Dialog title should appear
	await waitFor(() => {
		expect(
			screen.getByText(/import backup/i, {
				selector: '[data-slot="dialog-title"]',
			}),
		).toBeDefined();
	});
});

test("exportUserData resolves a snapshot with correct shape", async () => {
	const snapshot = await exportUserData();
	expect(snapshot.schemaVersion).toBe(1);
	expect(Array.isArray(snapshot.collection)).toBe(true);
	expect(Array.isArray(snapshot.goals)).toBe(true);
});
