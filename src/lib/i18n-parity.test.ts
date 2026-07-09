import { describe, expect, test } from "bun:test";
import en from "../../messages/en.json";
import { UI_LANGUAGES } from "./languages";

// Every non-English locale must fully mirror en.json: same key set, same
// interpolation placeholders per key, and the same string-vs-structured shape.
// Plural CATEGORY keys (e.g. "countPlural=one") legitimately differ per locale's
// CLDR set (ja/ko/zh/th/id collapse to "other"), so those are NOT compared —
// only the interpolation variables and the structural shape are.

const NON_EN = UI_LANGUAGES.filter((l) => l !== "en");

type MsgValue = string | Array<{ match?: Record<string, unknown> }>;

const keysOf = (o: Record<string, unknown>): string[] =>
	Object.keys(o)
		.filter((k) => !k.startsWith("$"))
		.sort();

/** Interpolation variables ({name}, {count}) across a value (string or structured plural). */
function placeholders(v: MsgValue): string[] {
	const out = new Set<string>();
	const scan = (s: string) => {
		for (const m of s.matchAll(/\{([a-zA-Z0-9_]+)/g)) out.add(m[1]);
	};
	if (typeof v === "string") {
		scan(v);
	} else if (Array.isArray(v)) {
		for (const variant of v) {
			if (variant && typeof variant.match === "object" && variant.match) {
				for (const s of Object.values(variant.match)) {
					if (typeof s === "string") scan(s);
				}
			}
		}
	}
	return [...out].sort();
}

const enRec = en as Record<string, MsgValue>;

describe.each(NON_EN)("messages/%s.json", (locale) => {
	test("has exactly the same keys as en.json", async () => {
		const mod = (await import(`../../messages/${locale}.json`))
			.default as Record<string, MsgValue>;
		expect(keysOf(mod)).toEqual(keysOf(enRec));
	});

	test("preserves placeholders + plural structure per key", async () => {
		const mod = (await import(`../../messages/${locale}.json`))
			.default as Record<string, MsgValue>;
		for (const k of keysOf(enRec)) {
			const ev = enRec[k];
			const lv = mod[k];
			// structured-plural entries in en must stay structured in the locale
			expect(Array.isArray(lv)).toBe(Array.isArray(ev));
			// same interpolation variables (plural category keys may differ per CLDR)
			expect(placeholders(lv)).toEqual(placeholders(ev));
		}
	});
});
