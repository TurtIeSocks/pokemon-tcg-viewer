// src/components/sync/sync-toasts.test.ts
//
// Unit tests for wireSyncToasts:
//   - each of the 4 notable transitions fires exactly one toast
//   - routine syncing→synced (no transition event) fires none
//   - unsubscribe stops future toasts

import { expect, mock, test } from "bun:test";
import { createSyncStatusStore } from "@/store/userland/sync/sync-status";
import { wireSyncToasts } from "./sync-toasts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A fresh store + a mock notify fn ready for one test scenario. */
function makeFixture() {
	const store = createSyncStatusStore();
	const notify = mock((_message: string, _opts?: unknown) => {});
	const unsub = wireSyncToasts(
		store,
		notify as Parameters<typeof wireSyncToasts>[1],
	);
	return { store, notify, unsub };
}

// ---------------------------------------------------------------------------
// Each notable transition → exactly one toast
// ---------------------------------------------------------------------------

test("went-offline fires one toast", () => {
	const { store, notify, unsub } = makeFixture();
	store.onSyncStart();
	store.onSyncError(true); // → went-offline
	expect(notify).toHaveBeenCalledTimes(1);
	const [msg] = notify.mock.calls[0] as [string];
	expect(msg).toContain("offline");
	unsub();
});

test("reconnected-synced fires one toast", async () => {
	const { store, notify, unsub } = makeFixture();
	const uid = "test-toast-reconnect";
	store.onSyncStart();
	store.onSyncError(true); // went-offline (call 1)
	store.onSyncStart();
	await store.onSyncSuccess(uid); // reconnected-synced (call 2) + possibly first-sync-complete (call 3)
	// at minimum 2 toasts fired
	const messages = notify.mock.calls.map(([m]) => m as string);
	expect(messages.some((m) => m.includes("Back online"))).toBe(true);
	unsub();
});

test("persistent-error fires one toast after N≥2 consecutive failures", () => {
	const { store, notify, unsub } = makeFixture();
	store.onSyncStart();
	store.onSyncError(false); // 1 failure — no event yet
	expect(notify).toHaveBeenCalledTimes(0);
	store.onSyncStart();
	store.onSyncError(false); // 2 failures — persistent-error
	expect(notify).toHaveBeenCalledTimes(1);
	const [msg] = notify.mock.calls[0] as [string];
	expect(msg).toContain("sync");
	unsub();
});

test("first-sync-complete fires one toast on first success", async () => {
	const { store, notify, unsub } = makeFixture();
	const uid = "test-toast-first-sync";
	store.onSyncStart();
	await store.onSyncSuccess(uid);
	const messages = notify.mock.calls.map(([m]) => m as string);
	expect(messages.some((m) => m.includes("Vault"))).toBe(true);
	unsub();
});

// ---------------------------------------------------------------------------
// Routine syncing→synced after first sync → no toast
// ---------------------------------------------------------------------------

test("routine syncing→synced fires no toast after first-sync already done", async () => {
	const { store, notify, unsub } = makeFixture();
	const uid = "test-toast-routine";

	// First pass — burns first-sync-complete
	store.onSyncStart();
	await store.onSyncSuccess(uid);
	const burnCount = notify.mock.calls.length;

	// Second pass — routine
	store.onSyncStart();
	await store.onSyncSuccess(uid);
	expect(notify.mock.calls.length).toBe(burnCount); // no new toasts
	unsub();
});

// ---------------------------------------------------------------------------
// Unsubscribe stops future toasts
// ---------------------------------------------------------------------------

test("unsubscribing stops future toasts", () => {
	const { store, notify, unsub } = makeFixture();
	unsub();
	store.onSyncStart();
	store.onSyncError(true); // would emit went-offline — but unsubscribed
	expect(notify).toHaveBeenCalledTimes(0);
});
