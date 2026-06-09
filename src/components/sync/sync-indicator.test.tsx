// src/components/sync/sync-indicator.test.tsx
//
// Tests for SyncIndicator: all 4 statuses render their label.
// Uses statusOverride to bypass the real auth session (no network).
//
// NOTE: we use `spyOn` (restored in afterEach), NOT `mock.module` — module
// mocks leak across test files under Bun and would poison later suites (e.g.
// `client.test.ts`'s real `isCloudEnabled`).

import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import * as authMod from "@/components/auth/use-auth-session";
import * as clientMod from "@/lib/supabase/client";
import type { SyncStatus } from "@/store/userland/sync/sync-status";
import { SyncIndicator } from "./sync-indicator";

let cloudSpy: ReturnType<typeof spyOn>;
let authSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
	// Cloud enabled + a signed-in session so the component renders.
	cloudSpy = spyOn(clientMod, "isCloudEnabled").mockReturnValue(true);
	authSpy = spyOn(authMod, "useAuthSession").mockReturnValue({
		session: { user: { id: "u1" } },
		email: "test@example.com",
		ready: true,
	} as unknown as ReturnType<typeof authMod.useAuthSession>);
});

afterEach(() => {
	cloudSpy.mockRestore();
	authSpy.mockRestore();
});

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

test("renders nothing when cloud is not enabled", () => {
	cloudSpy.mockReturnValue(false);
	const { container } = render(<SyncIndicator statusOverride="synced" />);
	expect(container.firstChild).toBeNull();
});
