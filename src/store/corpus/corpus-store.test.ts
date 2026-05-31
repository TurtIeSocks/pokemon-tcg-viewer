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
