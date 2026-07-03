import { afterEach, expect, test } from "bun:test";
import {
	clearPrices,
	readPricesGz,
	readPricesMeta,
	writePrices,
} from "./prices-store";

afterEach(async () => {
	await clearPrices();
});

test("writePrices then readPricesGz/Meta roundtrips", async () => {
	const gz = new TextEncoder().encode("PRICES_GZ").buffer;
	await writePrices(gz, { date: "2026-07-03", syncedAt: 111, count: 42 });
	const readGz = await readPricesGz();
	expect(readGz && new TextDecoder().decode(readGz)).toBe("PRICES_GZ");
	expect(await readPricesMeta()).toEqual({
		date: "2026-07-03",
		syncedAt: 111,
		count: 42,
	});
});

test("clearPrices removes both keys", async () => {
	await writePrices(new ArrayBuffer(2), {
		date: "2026-07-03",
		syncedAt: 1,
		count: 1,
	});
	await clearPrices();
	expect(await readPricesGz()).toBeUndefined();
	expect(await readPricesMeta()).toBeUndefined();
});
