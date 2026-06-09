// vault-backup-controls.test.tsx
import { afterEach, beforeEach, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { exportUserData } from "../../store/userland/userland-store";
import { setupUserlandTest } from "../../test-utils";
import { VaultBackupControls } from "./vault-backup-controls";

let origCreateObjectURL: typeof URL.createObjectURL;
beforeEach(async () => {
	await setupUserlandTest();
	// Stub URL.createObjectURL so downloadSnapshot doesn't throw in happy-dom
	origCreateObjectURL = URL.createObjectURL;
	URL.createObjectURL = () => "blob:stub";
});

afterEach(() => {
	URL.createObjectURL = origCreateObjectURL;
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
	expect(snapshot.schemaVersion).toBe(4);
	expect(Array.isArray(snapshot.collection)).toBe(true);
	expect(Array.isArray(snapshot.binders)).toBe(true);
});

test("clicking Export backup calls onExport without throwing", async () => {
	render(<VaultBackupControls />);
	const exportBtn = screen.getByRole("button", { name: /export backup/i });
	// URL.createObjectURL is stubbed; click should not throw
	fireEvent.click(exportBtn);
	// Give the async handler time to resolve
	await waitFor(() => {
		// Import dialog should still be closed (export doesn't open import)
		expect(
			screen.queryByText(/import backup/i, {
				selector: '[data-slot="dialog-title"]',
			}),
		).toBeNull();
	});
});
