import { expect, test } from "bun:test";
import { clearI18n, readI18nGz, readI18nMeta, writeI18n } from "./i18n-store";

test("writeI18n then read returns gz + meta per language; clear removes both", async () => {
	const gz = new Uint8Array([1, 2, 3]).buffer;
	const meta = { version: "v1", syncedAt: 123, count: 2 };
	await writeI18n("fr", gz, meta);
	expect(await readI18nMeta("fr")).toEqual(meta);
	expect(new Uint8Array((await readI18nGz("fr")) as ArrayBuffer)).toEqual(
		new Uint8Array([1, 2, 3]),
	);
	await clearI18n("fr");
	expect(await readI18nMeta("fr")).toBeUndefined();
	expect(await readI18nGz("fr")).toBeUndefined();
});

test("overlays are keyed per language — fr and de do not collide", async () => {
	await writeI18n("fr", new Uint8Array([1]).buffer, {
		version: "fr1",
		syncedAt: 1,
		count: 1,
	});
	await writeI18n("de", new Uint8Array([2]).buffer, {
		version: "de1",
		syncedAt: 2,
		count: 1,
	});
	expect((await readI18nMeta("fr"))?.version).toBe("fr1");
	expect((await readI18nMeta("de"))?.version).toBe("de1");
	// Clearing one leaves the other intact.
	await clearI18n("fr");
	expect(await readI18nMeta("fr")).toBeUndefined();
	expect((await readI18nMeta("de"))?.version).toBe("de1");
	await clearI18n("de");
});
