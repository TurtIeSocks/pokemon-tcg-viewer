import { describe, expect, test } from "bun:test";
import { displayName } from "./display-name";

describe("displayName", () => {
	test("uppercases the first letter", () => {
		expect(displayName("pikachu")).toBe("Pikachu");
	});

	test("splits on hyphens and title-cases each segment", () => {
		expect(displayName("mr-mime")).toBe("Mr Mime");
		expect(displayName("nidoran-f")).toBe("Nidoran F");
	});

	test("returns empty string unchanged", () => {
		expect(displayName("")).toBe("");
	});
});
