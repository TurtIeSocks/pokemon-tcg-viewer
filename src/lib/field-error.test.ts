import { expect, test } from "bun:test";
import { fieldErrorText } from "./field-error";

test("reads .message from a Zod-issue-shaped object (no [object Object])", () => {
	expect(fieldErrorText({ message: "Name is required", path: ["name"] })).toBe(
		"Name is required",
	);
});

test("passes through a plain string error", () => {
	expect(fieldErrorText("Too short")).toBe("Too short");
});

test("returns empty string for null / undefined", () => {
	expect(fieldErrorText(null)).toBe("");
	expect(fieldErrorText(undefined)).toBe("");
});

test("returns empty string for an object without a usable message", () => {
	expect(fieldErrorText({})).toBe("");
	expect(fieldErrorText({ message: null })).toBe("");
});

test("never produces the literal [object Object]", () => {
	expect(fieldErrorText({ foo: "bar" })).not.toBe("[object Object]");
});
