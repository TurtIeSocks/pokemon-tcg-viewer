import { afterEach, beforeEach, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import { render, screen } from "@testing-library/react";
import type { PricesBlob } from "@/lib/corpus/price-types";
import {
	resetPricesRuntimeForTests,
	setPricesFetchersForTests,
	usePricesRuntime,
} from "@/store/corpus/prices-runtime";
import { writePrices } from "@/store/corpus/prices-store";
import { makeFocusCard } from "@/test-utils";
import { CardPrices } from "./card-prices";

const card = makeFocusCard({
	id: "base1-4",
	name: "Charizard",
	cardNumber: "4",
});

const SEEDED_DATE = "2026-07-03";

function gzBlob(blob: PricesBlob): ArrayBuffer {
	const buf = gzipSync(Buffer.from(JSON.stringify(blob)));
	return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

async function seed(cards: PricesBlob["cards"]) {
	usePricesRuntime.setState({
		byId: new Map(Object.entries(cards)),
		meta: {
			date: SEEDED_DATE,
			sources: { tp: "2026-07-03", cm: "2026-07-02" },
			fx: { base: "EUR", date: "2026-07-03", rates: { USD: 1.09 } },
		},
		status: "ready",
	});
	// Mirror the seeded meta into IDB so syncPrices' `stored.date === date`
	// fast path (see prices-runtime.ts) finds it fresh and no-ops instead of
	// falling through to a (stubbed but state-clobbering) downloadPrices().
	await writePrices(
		gzBlob({
			v: 1,
			date: SEEDED_DATE,
			fx: { base: "EUR", date: SEEDED_DATE, rates: { USD: 1.09 } },
			sources: { tp: "2026-07-03", cm: "2026-07-02" },
			cards,
		}),
		{
			date: SEEDED_DATE,
			syncedAt: Date.now(),
			count: Object.keys(cards).length,
		},
	);
}

// CardPrices now mounts useEnsurePrices, which calls syncPrices() (a real
// fetchVersion/fetchBlob network call) on top of loadPrices(). Stub both
// seams before every test so mounting never hits the wire — fetchVersion
// reports the same date the test seeds, so syncPrices' `stored.date === date`
// fast path finds it fresh and no-ops (no re-download).
beforeEach(() => {
	setPricesFetchersForTests({
		fetchVersion: async () => ({
			date: SEEDED_DATE,
			count: 1,
			builtAt: "x",
		}),
		fetchBlob: async () =>
			gzBlob({
				v: 1,
				date: SEEDED_DATE,
				fx: { base: "EUR", date: SEEDED_DATE, rates: { USD: 1.09 } },
				sources: { tp: SEEDED_DATE, cm: "2026-07-02" },
				cards: {},
			}),
	});
});

afterEach(async () => {
	await resetPricesRuntimeForTests();
});

test("renders a price line per source for a priced card", async () => {
	await seed({
		"base1-4": { tp: { H: [72034, 53499] }, cm: [50168, 27674, 40096, 56391] },
	});
	render(<CardPrices card={card} />);
	expect(screen.getByText("$720.34")).toBeTruthy();
	expect(screen.getByText("€501.68")).toBeTruthy();
});

test("shows the mandated TCGplayer attribution when a tcgplayer line renders", async () => {
	await seed({ "base1-4": { tp: { H: [72034, 53499] } } });
	render(<CardPrices card={card} />);
	expect(
		screen.getByText(/not endorsed or certified by TCGplayer/i),
	).toBeTruthy();
});

test("renders nothing extra for a card absent from the blob", async () => {
	await seed({ "other-1": { tp: { H: [100, 90] } } });
	const { container } = render(<CardPrices card={card} />);
	expect(container.querySelector("a")).toBeNull();
});
