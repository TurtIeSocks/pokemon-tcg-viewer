import { expect, test } from "bun:test";
import { type CardVariant, variantLabel } from "./card-variants";

const v = (p: Partial<CardVariant>): CardVariant => ({
	variantId: "x",
	type: "holo",
	subtype: null,
	size: null,
	stamp: null,
	...p,
});

test("variantLabel composes stamp · subtype · type", () => {
	expect(
		variantLabel(v({ subtype: "shadowless", stamp: ["1st-edition"] })),
	).toBe("1st Edition · Shadowless · Holo");
});

test("variantLabel of a bare printing is just the humanized type", () => {
	expect(variantLabel(v({ type: "normal" }))).toBe("Normal");
});

test("variantLabel appends non-standard size, hides standard", () => {
	expect(variantLabel(v({ size: "standard" }))).toBe("Holo");
	expect(variantLabel(v({ subtype: "unlimited", size: "jumbo" }))).toBe(
		"Unlimited · Holo · Jumbo",
	);
});

test("variantLabel humanizes multi-token subtypes, keeping inter-digit hyphens", () => {
	expect(variantLabel(v({ subtype: "1999-2000-copyright" }))).toBe(
		"1999-2000 Copyright · Holo",
	);
});
