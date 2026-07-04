import { afterEach, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import {
	resetPricesRuntimeForTests,
	setPricesFetchersForTests,
	useEnsurePrices,
	usePricesRuntime,
} from "./prices-runtime";
import { PRICES_BLOB_FIXTURE as BLOB, gzBlob } from "./prices-test-util";

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
