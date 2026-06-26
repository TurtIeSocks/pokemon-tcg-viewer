// src/store/userland/sync/sync-status.test.ts
//
// Unit tests for the sync status store (Task 5).
// Covers all 4 transition events + "no event on routine syncing→synced".
// No network, no IDB (fake-indexeddb pre-loaded via bunfig.toml).

import { describe, expect, test } from "bun:test";
import { createSyncStatusStore, type SyncTransitionEvent } from "./sync-status";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Capture all emitted events during a callback sequence. */
function captureEvents(
	store: ReturnType<typeof createSyncStatusStore>,
	fn: (store: ReturnType<typeof createSyncStatusStore>) => Promise<void> | void,
): Promise<SyncTransitionEvent[]> {
	const events: SyncTransitionEvent[] = [];
	const unsub = store.subscribe((evt) => events.push(evt));
	const result = fn(store);
	const run =
		result instanceof Promise
			? result.then(() => {
					unsub();
					return events;
				})
			: Promise.resolve(events).then((e) => {
					unsub();
					return e;
				});
	return run;
}

// Each test uses a unique uid to avoid persistent-flag collisions in fake-IDB
let uidCounter = 0;
function nextUid() {
	return `test-status-uid-${++uidCounter}`;
}

// ---------------------------------------------------------------------------
// Status state tests
// ---------------------------------------------------------------------------

describe("SyncStatusStore — status state", () => {
	test("initial status is synced", () => {
		const store = createSyncStatusStore();
		expect(store.status).toBe("synced");
	});

	test("onSyncStart → status = syncing", () => {
		const store = createSyncStatusStore();
		store.onSyncStart();
		expect(store.status).toBe("syncing");
	});

	test("onSyncSuccess → status = synced", async () => {
		const store = createSyncStatusStore();
		const uid = nextUid();
		store.onSyncStart();
		await store.onSyncSuccess(uid);
		expect(store.status).toBe("synced");
	});

	test("onSyncError (offline=false) → status = error", () => {
		const store = createSyncStatusStore();
		store.onSyncStart();
		store.onSyncError(false);
		expect(store.status).toBe("error");
	});

	test("onSyncError (offline=true) → status = offline", () => {
		const store = createSyncStatusStore();
		store.onSyncStart();
		store.onSyncError(true);
		expect(store.status).toBe("offline");
	});
});

// ---------------------------------------------------------------------------
// Transition event tests
// ---------------------------------------------------------------------------

describe("SyncStatusStore — transition events", () => {
	test("went-offline fires on first offline error", async () => {
		const store = createSyncStatusStore();
		const events = await captureEvents(store, (s) => {
			s.onSyncStart();
			s.onSyncError(true);
		});
		expect(events).toContain("went-offline");
		expect(events.filter((e) => e === "went-offline")).toHaveLength(1);
	});

	test("went-offline fires only once for consecutive offline errors", async () => {
		const store = createSyncStatusStore();
		const events = await captureEvents(store, (s) => {
			s.onSyncStart();
			s.onSyncError(true);
			s.onSyncStart();
			s.onSyncError(true);
			s.onSyncStart();
			s.onSyncError(true);
		});
		expect(events.filter((e) => e === "went-offline")).toHaveLength(1);
	});

	test("reconnected-synced fires after offline → synced", async () => {
		const store = createSyncStatusStore();
		const uid = nextUid();
		const events = await captureEvents(store, async (s) => {
			s.onSyncStart();
			s.onSyncError(true); // offline
			s.onSyncStart();
			await s.onSyncSuccess(uid); // reconnected
		});
		expect(events).toContain("reconnected-synced");
	});

	test("reconnected-synced does NOT fire on routine synced (no offline stretch)", async () => {
		const store = createSyncStatusStore();
		const uid = nextUid();
		const events = await captureEvents(store, async (s) => {
			s.onSyncStart();
			await s.onSyncSuccess(uid);
			s.onSyncStart();
			await s.onSyncSuccess(uid);
		});
		expect(events).not.toContain("reconnected-synced");
	});

	test("routine syncing→synced emits NO event (after first-sync already fired)", async () => {
		const store = createSyncStatusStore();
		// Use uid whose first-sync flag is already set by calling success first
		const uid = nextUid();
		// Burn the first-sync event
		store.onSyncStart();
		await store.onSyncSuccess(uid);

		// Now do a routine pass
		const events = await captureEvents(store, async (s) => {
			s.onSyncStart();
			await s.onSyncSuccess(uid);
		});
		expect(events).toHaveLength(0);
	});

	test("first-sync-complete fires once on first success", async () => {
		const store = createSyncStatusStore();
		const uid = nextUid();
		const events = await captureEvents(store, async (s) => {
			s.onSyncStart();
			await s.onSyncSuccess(uid);
		});
		expect(events).toContain("first-sync-complete");
		expect(events.filter((e) => e === "first-sync-complete")).toHaveLength(1);
	});

	test("first-sync-complete does NOT fire a second time for the same uid", async () => {
		const store = createSyncStatusStore();
		const uid = nextUid();

		// First sync: fires event
		store.onSyncStart();
		await store.onSyncSuccess(uid);

		// Second sync: should not re-fire
		const events = await captureEvents(store, async (s) => {
			s.onSyncStart();
			await s.onSyncSuccess(uid);
		});
		expect(events).not.toContain("first-sync-complete");
	});

	test("persistent-error fires after N≥2 consecutive failures", () => {
		const store = createSyncStatusStore();
		const events: SyncTransitionEvent[] = [];
		const unsub = store.subscribe((e) => events.push(e));

		store.onSyncStart();
		store.onSyncError(false); // 1 failure — no event yet
		expect(events).not.toContain("persistent-error");

		store.onSyncStart();
		store.onSyncError(false); // 2 failures — should fire
		expect(events).toContain("persistent-error");
		unsub();
	});

	test("persistent-error fires once per failure run (not on every additional failure)", () => {
		const store = createSyncStatusStore();
		const events: SyncTransitionEvent[] = [];
		const unsub = store.subscribe((e) => events.push(e));

		// 5 consecutive failures
		for (let i = 0; i < 5; i++) {
			store.onSyncStart();
			store.onSyncError(false);
		}
		expect(events.filter((e) => e === "persistent-error")).toHaveLength(1);
		unsub();
	});

	test("persistent-error resets after a successful sync", async () => {
		const store = createSyncStatusStore();
		const uid = nextUid();

		// Burn the first-sync event first
		store.onSyncStart();
		await store.onSyncSuccess(uid);

		// 2 failures → persistent-error fires
		store.onSyncStart();
		store.onSyncError(false);
		store.onSyncStart();
		store.onSyncError(false);

		// Recover
		store.onSyncStart();
		await store.onSyncSuccess(uid);

		// New failure run: persistent-error should fire again after threshold
		const events: SyncTransitionEvent[] = [];
		const unsub = store.subscribe((e) => events.push(e));

		store.onSyncStart();
		store.onSyncError(false);
		store.onSyncStart();
		store.onSyncError(false);

		expect(events).toContain("persistent-error");
		unsub();
	});

	test("subscribe returns an unsubscribe function that stops events", () => {
		const store = createSyncStatusStore();
		const events: SyncTransitionEvent[] = [];
		const unsub = store.subscribe((e) => events.push(e));

		// Fire one event
		store.onSyncStart();
		store.onSyncError(true); // went-offline
		expect(events).toHaveLength(1);

		// Unsubscribe
		unsub();

		// Fire another event — should not appear
		store.onSyncStart();
		store.onSyncError(true);
		expect(events).toHaveLength(1); // still 1
	});

	test("onEntitlementBlocked sets needs_upgrade without emitting an event", async () => {
		const store = createSyncStatusStore();
		const events = await captureEvents(store, (s) => {
			s.onSyncStart();
			s.onEntitlementBlocked();
		});
		expect(store.status).toBe("needs_upgrade");
		// Deterministic policy block, not a transient error → no transition event.
		expect(events).toHaveLength(0);
	});
});
