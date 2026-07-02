import { expect, test } from "bun:test";
import { clearCorpus, readGz, readMeta, writeCorpus } from "./corpus-store";

test("roundtrips gz bytes and meta in a dedicated store", async () => {
	const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
	await writeCorpus(bytes, { etag: '"v1"', version: "v1", fetchedAt: 123 });

	const gz = await readGz();
	expect(gz ? new Uint8Array(gz) : null).toEqual(new Uint8Array([1, 2, 3, 4]));
	expect(await readMeta()).toEqual({
		etag: '"v1"',
		version: "v1",
		fetchedAt: 123,
	});

	await clearCorpus();
	expect(await readGz()).toBeUndefined();
	expect(await readMeta()).toBeUndefined();
});

test("defaults to the west region and keeps the pre-existing bare key", async () => {
	const bytes = new Uint8Array([9, 9]).buffer;
	await writeCorpus(bytes, { etag: '"west"', version: "west", fetchedAt: 1 });

	// Back-compat: reading with no region arg (as the already-deployed client
	// does) must still see the blob written without an explicit region.
	const gz = await readGz();
	expect(gz ? new Uint8Array(gz) : null).toEqual(new Uint8Array([9, 9]));

	// And explicitly asking for "west" must see the same blob (same key).
	const gzWest = await readGz("west");
	expect(gzWest ? new Uint8Array(gzWest) : null).toEqual(
		new Uint8Array([9, 9]),
	);

	await clearCorpus();
});

test("asia region roundtrips independently and does not clobber west", async () => {
	const westBytes = new Uint8Array([1, 1, 1]).buffer;
	const asiaBytes = new Uint8Array([2, 2, 2]).buffer;

	await writeCorpus(westBytes, {
		etag: '"west"',
		version: "west",
		fetchedAt: 1,
	});
	await writeCorpus(
		asiaBytes,
		{ etag: '"asia"', version: "asia", fetchedAt: 2 },
		"asia",
	);

	const gzWest = await readGz("west");
	const gzAsia = await readGz("asia");
	expect(gzWest ? new Uint8Array(gzWest) : null).toEqual(
		new Uint8Array([1, 1, 1]),
	);
	expect(gzAsia ? new Uint8Array(gzAsia) : null).toEqual(
		new Uint8Array([2, 2, 2]),
	);

	expect(await readMeta("west")).toEqual({
		etag: '"west"',
		version: "west",
		fetchedAt: 1,
	});
	expect(await readMeta("asia")).toEqual({
		etag: '"asia"',
		version: "asia",
		fetchedAt: 2,
	});

	await clearCorpus("west");
	await clearCorpus("asia");
});

test("reading an unset region returns undefined, never throws", async () => {
	await clearCorpus("asia");
	expect(await readGz("asia")).toBeUndefined();
	expect(await readMeta("asia")).toBeUndefined();
});

test("clearing one region leaves the other untouched", async () => {
	await writeCorpus(
		new Uint8Array([5]).buffer,
		{ etag: '"w"', version: "w", fetchedAt: 1 },
		"west",
	);
	await writeCorpus(
		new Uint8Array([6]).buffer,
		{ etag: '"a"', version: "a", fetchedAt: 2 },
		"asia",
	);

	await clearCorpus("asia");

	expect(await readGz("asia")).toBeUndefined();
	const gzWest = await readGz("west");
	expect(gzWest ? new Uint8Array(gzWest) : null).toEqual(new Uint8Array([5]));

	await clearCorpus("west");
});
