import { expect, test } from "bun:test";
import type { CardPriceEntry, FxTable } from "@/lib/corpus/price-types";
import { qrSvgPath } from "@/lib/qr";
import type { SlugIndex } from "@/lib/slug";
import type { ContentRow, ContentRowType } from "@/store/ui-prefs";
import type { HoloCardData } from "../holo-card/types";
import {
	buildPlaceholderExtras,
	type PlaceholderExtra,
	pricesUrl,
	resolvePlaceholderRow,
} from "./print-extras";

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

test("resolves a CDN image URL for a card with art, null without", () => {
	const withArt = buildPlaceholderExtras({
		cards: [hcard({ imageUrl: "https://img.test/magikarp.png" })],
		pricesById: new Map(),
		fx: FX,
		slugIndex: slugIndex(),
		origin: "https://x.test",
		activeLang: "en",
	});
	const img = withArt.get("bs2-50")?.image;
	expect(img).toContain("wsrv.nl");
	expect(img).toContain(encodeURIComponent("https://img.test/magikarp.png"));

	const noArt = buildPlaceholderExtras({
		cards: [hcard({ imageUrl: "" })],
		pricesById: new Map(),
		fx: FX,
		slugIndex: slugIndex(),
		origin: "https://x.test",
		activeLang: "en",
	});
	expect(noArt.get("bs2-50")?.image).toBeNull();
});

// --- resolvePlaceholderRow: content resolution + null-collapse ---------------

const row = (
	type: ContentRowType,
	over: Partial<ContentRow> = {},
): ContentRow => ({
	id: type,
	type,
	sizeMm: 4,
	ySpacingMm: 3,
	color: "#000",
	...over,
});

const extra = (over: Partial<PlaceholderExtra> = {}): PlaceholderExtra => ({
	price: null,
	qr: null,
	image: null,
	...over,
});

test("text rows resolve from card fields", () => {
	const card = hcard({
		name: "Magikarp",
		cardNumber: "50",
		setName: "Base Set 2",
		setSeries: "Base",
		rarity: "Rare",
	});
	expect(resolvePlaceholderRow(row("cardName"), card, extra())).toEqual({
		kind: "text",
		value: "Magikarp",
	});
	expect(resolvePlaceholderRow(row("number"), card, extra())).toEqual({
		kind: "text",
		value: "#50",
	});
	expect(resolvePlaceholderRow(row("setName"), card, extra())).toEqual({
		kind: "text",
		value: "Base Set 2",
	});
	expect(resolvePlaceholderRow(row("seriesName"), card, extra())).toEqual({
		kind: "text",
		value: "Base",
	});
	expect(resolvePlaceholderRow(row("rarity"), card, extra())).toEqual({
		kind: "text",
		value: "Rare",
	});
});

test("customText resolves from the row's literal, collapsing when blank", () => {
	const card = hcard();
	expect(
		resolvePlaceholderRow(
			row("customText", { text: "Wanted!" }),
			card,
			extra(),
		),
	).toEqual({ kind: "text", value: "Wanted!" });
	expect(
		resolvePlaceholderRow(row("customText", { text: "   " }), card, extra()),
	).toBeNull();
	expect(resolvePlaceholderRow(row("customText"), card, extra())).toBeNull();
});

test("price / qr / image collapse to null when the extra is unavailable", () => {
	const card = hcard();
	expect(resolvePlaceholderRow(row("price"), card, extra())).toBeNull();
	expect(resolvePlaceholderRow(row("qr"), card, extra())).toBeNull();
	expect(resolvePlaceholderRow(row("cardImage"), card, extra())).toBeNull();
});

test("price / qr / image resolve when the extra supplies them", () => {
	const card = hcard();
	const qr = qrSvgPath("https://x.test/p");
	const filled = extra({ price: "$4.20", qr, image: "https://cdn/i.webp" });
	expect(resolvePlaceholderRow(row("price"), card, filled)).toEqual({
		kind: "text",
		value: "$4.20",
	});
	expect(resolvePlaceholderRow(row("cardImage"), card, filled)).toEqual({
		kind: "image",
		src: "https://cdn/i.webp",
	});
	const resolvedQr = resolvePlaceholderRow(row("qr"), card, filled);
	expect(resolvedQr?.kind).toBe("qr");
});

test("rarity / series collapse when the card omits them", () => {
	const card = hcard({ rarity: undefined, setSeries: "" });
	expect(resolvePlaceholderRow(row("rarity"), card, extra())).toBeNull();
	expect(resolvePlaceholderRow(row("seriesName"), card, extra())).toBeNull();
});
