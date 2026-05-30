import { expect, test } from "bun:test";
import { useStore } from "./index";

test("store exposes the cards-cache slice", () => {
	const s = useStore.getState();
	expect(s.cardsCache).toBeDefined();
	expect(s.cardsCacheOrder).toBeDefined();
	expect(typeof s.appendCardsPage).toBe("function");
	expect(typeof s.touchCardsKey).toBe("function");
});
