import { expect, test } from "bun:test";
import { mergeTranslations } from "./seed-ui-translations";

test("fills only missing keys, preserving existing translations", () => {
	const existing = { a: "gardé", $schema: "x" };
	const fresh = { a: "NEW", b: "ajouté", $schema: "x" };
	expect(mergeTranslations(existing, fresh, false)).toEqual({
		a: "gardé",
		b: "ajouté",
		$schema: "x",
	});
});

test("force mode overwrites everything", () => {
	const existing = { a: "gardé", $schema: "x" };
	const fresh = { a: "NEW", $schema: "x" };
	expect(mergeTranslations(existing, fresh, true)).toEqual({
		a: "NEW",
		$schema: "x",
	});
});

test("fill-missing never touches a key already present, even if fresh differs", () => {
	const existing = { a: "gardé", b: "aussi gardé", $schema: "x" };
	const fresh = { a: "NEW-A", b: "NEW-B", c: "NEW-C", $schema: "x" };
	expect(mergeTranslations(existing, fresh, false)).toEqual({
		a: "gardé",
		b: "aussi gardé",
		c: "NEW-C",
		$schema: "x",
	});
});
