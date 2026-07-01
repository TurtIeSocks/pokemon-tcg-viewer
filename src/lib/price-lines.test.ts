import { describe, expect, test } from "bun:test";
import { makeFocusCard } from "../test-utils";
import { buildPriceLines } from "./price-lines";

const base = makeFocusCard();

describe("buildPriceLines", () => {
	test("always returns empty (pricing dark behind PRICING_ENABLED flag)", () => {
		expect(buildPriceLines(base)).toEqual([]);
	});
});
