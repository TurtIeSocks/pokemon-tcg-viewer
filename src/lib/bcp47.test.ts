import { expect, test } from "bun:test";
import { bcp47 } from "./bcp47";

test("maps Chinese script variants to valid BCP-47 tags", () => {
	expect(bcp47("zh-tw")).toBe("zh-Hant-TW");
	expect(bcp47("zh-cn")).toBe("zh-Hans-CN");
});

test("passes plain language codes through unchanged", () => {
	expect(bcp47("en")).toBe("en");
	expect(bcp47("ja")).toBe("ja");
	expect(bcp47("pt")).toBe("pt");
});
