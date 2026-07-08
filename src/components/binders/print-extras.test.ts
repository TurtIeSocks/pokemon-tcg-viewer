import { expect, test } from "bun:test";
import type { CardPriceEntry, FxTable } from "@/lib/corpus/price-types";
import type { SlugIndex } from "@/lib/slug";
import type { HoloCardData } from "../holo-card/types";
import { buildPlaceholderExtras, pricesUrl } from "./print-extras";

function slugIndex(): SlugIndex {
	return {
		seriesBySlug: new Map(),
		setIdBySlug: new Map(),
		cardIdBySlug: new Map(),
		setSlugById: new Map([
			["base-set-2", { seriesSlug: "base", setSlug: "base-set-2" }],
		]),
		cardSlugById: new Map([["bs2-50", "magikarp-50"]]),
	};
}

function hcard(o: Partial<HoloCardData> = {}): HoloCardData {
	return {
		id: "bs2-50",
		imageUrl: "",
		name: "Magikarp",
		setId: "base-set-2",
		setName: "Base Set 2",
		setSeries: "Base",
		cardNumber: "50",
		...o,
	} as HoloCardData;
}

const FX: FxTable = { base: "EUR", date: "2026-07-03", rates: { USD: 1.09 } };

test("builds an absolute /prices URL from the slug index", () => {
	expect(pricesUrl(hcard(), slugIndex(), "https://x.test", "en")).toBe(
		"https://x.test/base/base-set-2/magikarp-50/prices",
	);
});

test("null URL when the card slug can't be resolved", () => {
	expect(
		pricesUrl(hcard({ id: "nope" }), slugIndex(), "https://x.test", "en"),
	).toBeNull();
});

test("null URL when origin is empty (SSR)", () => {
	expect(pricesUrl(hcard(), slugIndex(), "", "en")).toBeNull();
});

test("formats the market price and builds a QR for a priced, resolvable card", () => {
	const prices = new Map<string, CardPriceEntry>([
		["bs2-50", { tp: { N: [420, 300] } }],
	]);
	const extras = buildPlaceholderExtras({
		cards: [hcard()],
		pricesById: prices,
		fx: FX,
		slugIndex: slugIndex(),
		origin: "https://x.test",
		activeLang: "en",
	});
	const e = extras.get("bs2-50");
	expect(e?.price).toBe("$4.20");
	expect(e?.qr).not.toBeNull();
});

test("price is null when the card is unpriced", () => {
	const extras = buildPlaceholderExtras({
		cards: [hcard()],
		pricesById: new Map(),
		fx: FX,
		slugIndex: slugIndex(),
		origin: "https://x.test",
		activeLang: "en",
	});
	expect(extras.get("bs2-50")?.price).toBeNull();
});
