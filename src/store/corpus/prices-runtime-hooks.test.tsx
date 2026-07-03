import { afterEach, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import { render } from "@testing-library/react";
import type { PricesBlob } from "../../lib/corpus/price-types";
import {
	resetPricesRuntimeForTests,
	setPricesFetchersForTests,
	useEnsurePrices,
	usePricesRuntime,
} from "./prices-runtime";

const BLOB: PricesBlob = {
	v: 1,
	date: "2026-07-03",
	fx: { base: "EUR", date: "2026-07-03", rates: { USD: 1.09 } },
	sources: { tp: "2026-07-03", cm: "2026-07-03" },
	cards: {
		"base1-4": { tp: { H: [72034, 53499] }, cm: [50168, 27674, 40096, 56391] },
	},
};

function gzBlob(blob: PricesBlob): ArrayBuffer {
	const buf = gzipSync(Buffer.from(JSON.stringify(blob)));
	return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

afterEach(async () => {
	await resetPricesRuntimeForTests();
});

function Probe() {
	useEnsurePrices();
	return null;
}

test("useEnsurePrices loads then revalidates via syncPrices", async () => {
	let versionCalls = 0;
	setPricesFetchersForTests({
		fetchVersion: async () => {
			versionCalls++;
			return { date: "2026-07-03", count: 1, builtAt: "x" };
		},
		fetchBlob: async () => gzBlob(BLOB),
	});

	render(<Probe />);
	// Let the mount effect's async chain (loadPrices().then(syncPrices)) settle.
	await new Promise((r) => setTimeout(r, 20));

	expect(versionCalls).toBeGreaterThanOrEqual(1);
	expect(usePricesRuntime.getState().status).toBe("ready");
	expect(usePricesRuntime.getState().meta?.date).toBe("2026-07-03");
});
