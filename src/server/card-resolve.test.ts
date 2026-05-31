import { describe, expect, test } from "bun:test";
import type { HoloCardData } from "../components/holo-card";
import { buildSetCardSlugs } from "./card-resolve";

const c = (
	over: Partial<HoloCardData> &
		Pick<HoloCardData, "id" | "name" | "cardNumber">,
): HoloCardData => ({
	imageUrl: "l",
	imageUrlSmall: "s",
	supertype: "Pokémon",
	setId: "swsh9",
	setName: "Brilliant Stars",
	setSeries: "Sword & Shield",
	...over,
});

describe("buildSetCardSlugs", () => {
	const cards = [
		c({ id: "swsh9-154", name: "Charizard VSTAR", cardNumber: "154" }),
		c({ id: "swsh9-018", name: "Charizard VSTAR", cardNumber: "018" }),
		c({ id: "swsh9-001", name: "Pikachu", cardNumber: "1" }),
	];
	const map = buildSetCardSlugs(cards);

	test("slug -> id; number disambiguates same-named cards", () => {
		expect(map.idBySlug.get("charizard-vstar-154")).toBe("swsh9-154");
		expect(map.idBySlug.get("charizard-vstar-018")).toBe("swsh9-018");
		expect(map.idBySlug.get("pikachu-1")).toBe("swsh9-001");
	});
	test("id -> slug round-trips", () => {
		expect(map.slugById.get("swsh9-154")).toBe("charizard-vstar-154");
	});
});
