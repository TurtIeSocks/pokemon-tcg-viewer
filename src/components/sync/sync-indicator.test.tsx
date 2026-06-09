// src/components/sync/sync-indicator.test.tsx
//
// Tests for SyncIndicator: all 4 statuses render their label.
// Uses statusOverride to bypass the real auth session (no network).

import { expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import type { SyncStatus } from "@/store/userland/sync/sync-status";

// ---------------------------------------------------------------------------
// Mock isCloudEnabled → true and useAuthSession → signed-in so the component
// renders for all status tests.
// ---------------------------------------------------------------------------

mock.module("@/lib/supabase/client", () => ({
	isCloudEnabled: () => true,
	getBrowserClient: () => ({}),
}));

mock.module("@/components/auth/use-auth-session", () => ({
	useAuthSession: () => ({
		session: { user: { id: "u1" } },
		email: "test@example.com",
		ready: true,
	}),
}));

// Import AFTER the mock is in place.
const { SyncIndicator } = await import("./sync-indicator");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const CASES: Array<[SyncStatus, string]> = [
	["synced", "Synced"],
	["syncing", "Syncing…"],
	["offline", "Offline"],
	["error", "Sync error"],
];

for (const [status, expectedLabel] of CASES) {
	test(`renders "${expectedLabel}" for status="${status}"`, () => {
		render(<SyncIndicator statusOverride={status} />);
		expect(screen.getByText(expectedLabel)).toBeTruthy();
	});
}

test("renders nothing when cloud is not enabled", async () => {
	// Re-mock isCloudEnabled → false for this test only.
	mock.module("@/lib/supabase/client", () => ({
		isCloudEnabled: () => false,
		getBrowserClient: () => ({}),
	}));

	// Re-import the component with the new mock in effect.
	const { SyncIndicator: SyncIndicatorOff } = await import("./sync-indicator");
	const { container } = render(<SyncIndicatorOff statusOverride="synced" />);
	expect(container.firstChild).toBeNull();
});
