import { describe, expect, test } from "bun:test";
import { escapeLucene } from "./escape-lucene";

describe("escapeLucene", () => {
	test("leaves plain text untouched", () => {
		expect(escapeLucene("pikachu")).toBe("pikachu");
	});

	test("leaves spaces, periods, and apostrophes literal", () => {
		expect(escapeLucene("Mr. Mime")).toBe("Mr. Mime");
		expect(escapeLucene("Farfetch'd")).toBe("Farfetch'd");
	});

	test("escapes double quotes (clause break-out)", () => {
		expect(escapeLucene('a"b')).toBe('a\\"b');
	});

	test("escapes backslash before anything else", () => {
		expect(escapeLucene("a\\b")).toBe("a\\\\b");
	});

	test("escapes wildcard characters so they are literal", () => {
		expect(escapeLucene("a*b")).toBe("a\\*b");
		expect(escapeLucene("who?")).toBe("who\\?");
	});
});
