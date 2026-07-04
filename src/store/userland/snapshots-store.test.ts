import { afterEach, expect, test } from "bun:test";
import { setupUserlandTest } from "../../test-utils";
import { resetSnapshotsForTests } from "./idb-repo";
import { captureSnapshot, useUserland } from "./userland-store";

afterEach(async () => {
	await resetSnapshotsForTests();
});

test("captureSnapshot appends a snapshot and dedups by priceDate", async () => {
	await setupUserlandTest();
	await captureSnapshot({
		priceDate: "2026-07-03",
		totalCents: 100000,
		currency: "USD",
		cardCount: 10,
	});
	expect(useUserland.getState().snapshots.map((s) => s.priceDate)).toEqual([
		"2026-07-03",
	]);
	// same date → no-op
	await captureSnapshot({
		priceDate: "2026-07-03",
		totalCents: 999999,
		currency: "USD",
		cardCount: 99,
	});
	expect(useUserland.getState().snapshots.length).toBe(1);
	expect(useUserland.getState().snapshots[0].totalCents).toBe(100000);
	// new date → appends
	await captureSnapshot({
		priceDate: "2026-07-04",
		totalCents: 110000,
		currency: "USD",
		cardCount: 11,
	});
	expect(useUserland.getState().snapshots.map((s) => s.priceDate)).toEqual([
		"2026-07-03",
		"2026-07-04",
	]);
});
