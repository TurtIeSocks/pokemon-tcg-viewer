import { describe, expect, test } from "bun:test";
import type { CorpusCard } from "../store/corpus/corpus-types";
import {
	cardManageLinkPropsFor,
	cardModalLinkPropsFor,
	cardPricesLinkPropsFor,
	cardRouteProps,
} from "./card-route";
import { buildSlugIndex, resolveCard, type SluggableSet } from "./slug";

const sets: SluggableSet[] = [
	{ id: "base1", name: "Base", series: "Base" },
	{ id: "swsh9", name: "Brilliant Stars", series: "Sword & Shield" },
];

// Two same-named cards in different sets — exercises the per-set card slug.
const cards: CorpusCard[] = [
	{
		id: "base1-4",
		name: "Charizard",
		imageUrl: "a",
		imageUrlSmall: "b",
		supertype: "Pokémon",
		setId: "base1",
		number: "4",
	},
	{
		id: "swsh9-18",
		name: "Charizard",
		imageUrl: "a",
		imageUrlSmall: "b",
		supertype: "Pokémon",
		setId: "swsh9",
		number: "18",
	},
];

const idx = buildSlugIndex(sets, cards);

const p = { series: "sword-shield", set: "brilliant-stars", card: "charizard" };

describe("cardRouteProps", () => {
	test("builds /$series/$set/$card props that resolve back to the same card id", () => {
		const props = cardRouteProps(idx, { id: "swsh9-18", setId: "swsh9" });
		expect(props).not.toBeNull();
		expect(props?.to).toBe("/$series/$set/$card");
		// The link the search/pokemon grid emits must resolve, via the same slug
		// index the detail route uses, to exactly the card that was clicked.
		const p = props?.params as { series: string; set: string; card: string };
		expect(resolveCard(idx, p.series, p.set, p.card)).toBe("swsh9-18");
	});

	test("returns null when the card's set is not in the index", () => {
		expect(cardRouteProps(idx, { id: "xy1-1", setId: "xy1" })).toBeNull();
	});

	test("returns null when the card id is unknown in a known set", () => {
		expect(cardRouteProps(idx, { id: "base1-999", setId: "base1" })).toBeNull();
	});
});

const readState = (props: ReturnType<typeof cardModalLinkPropsFor>) =>
	(props.state as (prev: Record<string, unknown>) => Record<string, unknown>)(
		{},
	);

describe("cardTab on the three tab helpers", () => {
	test("detail helper sets cardTab=details", () => {
		const s = readState(cardModalLinkPropsFor(p));
		expect(s.cardTab).toBe("details");
		expect(s.cardOverlay).toBe("sword-shield/brilliant-stars/charizard");
	});

	test("manage helper sets cardTab=collection", () => {
		const s = readState(cardManageLinkPropsFor(p));
		expect(s.cardTab).toBe("collection");
	});

	test("prices helper sets cardTab=pricing and masks to /prices", () => {
		const props = cardPricesLinkPropsFor(p);
		const s = readState(props);
		expect(s.cardTab).toBe("pricing");
		expect(s.cardOverlay).toBe("sword-shield/brilliant-stars/charizard");
		expect((props.mask as { to: string }).to).toBe(
			"/$series/$set/$card/prices",
		);
		expect((props.mask as { params: typeof p }).params).toEqual(p);
	});

	test("prices helper preserves existing state keys", () => {
		const s = (
			cardPricesLinkPropsFor(p).state as (
				prev: Record<string, unknown>,
			) => Record<string, unknown>
		)({ keep: "me" });
		expect(s.keep).toBe("me");
		expect(s.cardTab).toBe("pricing");
	});
});

const readSearch = (props: ReturnType<typeof cardModalLinkPropsFor>) =>
	(props.search as (prev: Record<string, unknown>) => Record<string, unknown>)(
		{},
	);

describe("active-language search param on the tab helpers", () => {
	test("cardModalLinkPropsFor includes search.lang when the active language is Asian", () => {
		const props = cardModalLinkPropsFor(p, "ja");
		expect(readSearch(props).lang).toBe("ja");
	});

	test("cardModalLinkPropsFor omits lang when the active language is en (unchanged)", () => {
		const props = cardModalLinkPropsFor(p, "en");
		expect(readSearch(props).lang).toBeUndefined();
	});

	test("cardModalLinkPropsFor omits lang when no language is passed (byte-identical to today)", () => {
		const props = cardModalLinkPropsFor(p);
		expect(readSearch(props).lang).toBeUndefined();
	});

	test("cardModalLinkPropsFor preserves existing search keys alongside lang", () => {
		const props = cardModalLinkPropsFor(p, "ko");
		const search = (
			props.search as (prev: Record<string, unknown>) => Record<string, unknown>
		)({ keep: "me" });
		expect(search.keep).toBe("me");
		expect(search.lang).toBe("ko");
	});

	test("cardManageLinkPropsFor includes search.lang for an active Asian language", () => {
		const props = cardManageLinkPropsFor(p, "zh-tw");
		expect(readSearch(props).lang).toBe("zh-tw");
	});

	test("cardManageLinkPropsFor omits lang for en", () => {
		const props = cardManageLinkPropsFor(p, "en");
		expect(readSearch(props).lang).toBeUndefined();
	});

	test("cardPricesLinkPropsFor includes search.lang for an active Asian language", () => {
		const props = cardPricesLinkPropsFor(p, "th");
		expect(readSearch(props).lang).toBe("th");
	});
});
