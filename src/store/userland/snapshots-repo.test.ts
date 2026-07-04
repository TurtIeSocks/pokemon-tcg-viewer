import { afterEach, expect, test } from "bun:test";
import { getSnapshotsRepo, resetSnapshotsForTests } from "./idb-repo";

afterEach(async () => {
	await resetSnapshotsForTests();
});

test("create then list round-trips a snapshot with minted id + timestamps", async () => {
	const repo = getSnapshotsRepo();
	const snap = await repo.create({
		priceDate: "2026-07-03",
		totalCents: 250000,
		currency: "USD",
		cardCount: 42,
	});
	expect(snap.id).toBeTruthy();
	expect(snap.createdAt).toBeGreaterThan(0);
	expect(snap.updatedAt).toBe(snap.createdAt);
	expect(snap.deletedAt).toBeNull();
	expect(snap.totalCents).toBe(250000);
	const list = await repo.list();
	expect(list.map((s) => s.priceDate)).toEqual(["2026-07-03"]);
});

test("clear empties the store", async () => {
	const repo = getSnapshotsRepo();
	await repo.create({
		priceDate: "2026-07-03",
		totalCents: 1,
		currency: "USD",
		cardCount: 1,
	});
	await repo.clear();
	expect(await repo.list()).toEqual([]);
});
