import { expect, test } from "bun:test";
import { finishForPrinting } from "../store/userland/valuation";
import {
	type CardVariant,
	printingFromVariantText,
	variantLabel,
} from "./card-variants";

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

test("hasReverseVariant detects TCGdex + legacy TCGplayer keys", async () => {
	const { hasReverseVariant } = await import("./card-variants");
	expect(hasReverseVariant(["normal", "reverse"])).toBe(true);
	expect(hasReverseVariant(["normal", "reverseHolofoil"])).toBe(true);
	expect(hasReverseVariant(["normal", "holo"])).toBe(false);
	expect(hasReverseVariant(undefined)).toBe(false);
	expect(hasReverseVariant([])).toBe(false);
});

test("isReversePrinting prefers exact printing, falls back to legacy variant", async () => {
	const { isReversePrinting } = await import("./card-variants");
	expect(isReversePrinting({ printing: v({ type: "reverse" }) })).toBe(true);
	expect(
		isReversePrinting({ printing: v({ type: "holo" }), variant: "reverse" }),
	).toBe(false);
	expect(isReversePrinting({ printing: null, variant: "reverse" })).toBe(true);
	expect(
		isReversePrinting({ printing: null, variant: "reverseHolofoil" }),
	).toBe(true);
	expect(isReversePrinting({ printing: null, variant: "normal" })).toBe(false);
	expect(isReversePrinting({ printing: null, variant: null })).toBe(false);
});

test("isReverseOnlyPrinting: true only when every printing is reverse", async () => {
	const { isReverseOnlyPrinting } = await import("./card-variants");
	expect(isReverseOnlyPrinting(["reverse"])).toBe(true); // basep-34 Entei
	expect(isReverseOnlyPrinting(["normal", "reverse"])).toBe(false);
	expect(isReverseOnlyPrinting(["holo"])).toBe(false);
	expect(isReverseOnlyPrinting([])).toBe(false);
	expect(isReverseOnlyPrinting(undefined)).toBe(false);
});

// --- printingFromVariantText: CSV variant text → structured printing ---

const synthesized = (p: Partial<CardVariant>): CardVariant => ({
	variantId: "",
	type: "",
	subtype: null,
	size: null,
	stamp: null,
	...p,
});

test("printingFromVariantText: holo/foil tokens → holo", () => {
	expect(printingFromVariantText("Holofoil")).toEqual(
		synthesized({ type: "holo" }),
	);
	expect(printingFromVariantText("Foil")).toEqual(
		synthesized({ type: "holo" }),
	);
});

test("printingFromVariantText: reverse wins over holo/foil", () => {
	expect(printingFromVariantText("Reverse Holofoil")).toEqual(
		synthesized({ type: "reverse" }),
	);
	expect(printingFromVariantText("reverse holo")).toEqual(
		synthesized({ type: "reverse" }),
	);
});

test("printingFromVariantText: non-holo negation wins over holo", () => {
	expect(printingFromVariantText("non-holo")).toEqual(
		synthesized({ type: "normal" }),
	);
	expect(printingFromVariantText("Non Holo")).toEqual(
		synthesized({ type: "normal" }),
	);
});

test("printingFromVariantText: non-foil negation wins over foil", () => {
	// Foil/Non-Foil is the standard value pair for CSV columns aliased "foil";
	// a naive includes("foil") check read the negation as holo (~10x price).
	expect(printingFromVariantText("Non-Foil")).toEqual(
		synthesized({ type: "normal" }),
	);
	expect(printingFromVariantText("non foil")).toEqual(
		synthesized({ type: "normal" }),
	);
	expect(printingFromVariantText("nonfoil")).toEqual(
		synthesized({ type: "normal" }),
	);
});

test("printingFromVariantText: negation keeps a 1st-edition stamp", () => {
	expect(printingFromVariantText("1st Edition Non-Holo")).toEqual(
		synthesized({ type: "normal", stamp: ["1st-edition"] }),
	);
	expect(
		finishForPrinting(printingFromVariantText("1st Edition Non-Holo")),
	).toBe("1N");
});

test("printingFromVariantText: 1st edition with holo → holo + stamp", () => {
	expect(printingFromVariantText("1st Edition Holofoil")).toEqual(
		synthesized({ type: "holo", stamp: ["1st-edition"] }),
	);
	expect(printingFromVariantText("First Edition Foil")).toEqual(
		synthesized({ type: "holo", stamp: ["1st-edition"] }),
	);
});

test("printingFromVariantText: 1st edition alone → normal + stamp", () => {
	expect(printingFromVariantText("1st Edition")).toEqual(
		synthesized({ type: "normal", stamp: ["1st-edition"] }),
	);
});

test("printingFromVariantText: normal-family tokens → normal", () => {
	expect(printingFromVariantText("Normal")).toEqual(
		synthesized({ type: "normal" }),
	);
	expect(printingFromVariantText("Unlimited")).toEqual(
		synthesized({ type: "normal" }),
	);
	expect(printingFromVariantText("regular")).toEqual(
		synthesized({ type: "normal" }),
	);
});

test("printingFromVariantText: unrecognized/empty text → null", () => {
	expect(printingFromVariantText("Special Illustration Rare")).toBeNull();
	expect(printingFromVariantText("")).toBeNull();
	expect(printingFromVariantText("  ")).toBeNull();
	expect(printingFromVariantText("shiny sparkle nonsense")).toBeNull();
});

test("printingFromVariantText: synthesized shapes resolve through finishForPrinting", () => {
	expect(
		finishForPrinting(printingFromVariantText("1st Edition Holofoil")),
	).toBe("1H");
	expect(finishForPrinting(printingFromVariantText("1st Edition"))).toBe("1N");
	expect(finishForPrinting(printingFromVariantText("Reverse Holofoil"))).toBe(
		"R",
	);
	expect(finishForPrinting(printingFromVariantText("Holofoil"))).toBe("H");
	expect(finishForPrinting(printingFromVariantText("Unlimited"))).toBe("N");
});
