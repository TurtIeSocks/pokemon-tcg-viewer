import { expect, test } from "bun:test";
import {
	parseSidebarState,
	readCookieValue,
	SIDEBAR_COOKIE_NAME,
} from "./sidebar-cookie";

test("parseSidebarState: \"true\" → true", () => {
	expect(parseSidebarState("true")).toBe(true);
});

test("parseSidebarState: \"false\" → false", () => {
	expect(parseSidebarState("false")).toBe(false);
});

test("parseSidebarState: absent (undefined) → true", () => {
	expect(parseSidebarState(undefined)).toBe(true);
});

test("parseSidebarState: absent (null) → true", () => {
	expect(parseSidebarState(null)).toBe(true);
});

test("parseSidebarState: invalid value → true (default open)", () => {
	expect(parseSidebarState("nope")).toBe(true);
	expect(parseSidebarState("")).toBe(true);
});

test("readCookieValue: reads a named value", () => {
	expect(readCookieValue("sidebar_state=false", SIDEBAR_COOKIE_NAME)).toBe(
		"false",
	);
});

test("readCookieValue: picks the value among several cookies", () => {
	const jar = "theme=dark; sidebar_state=true; other=1";
	expect(readCookieValue(jar, SIDEBAR_COOKIE_NAME)).toBe("true");
});

test("readCookieValue: absent cookie → null", () => {
	expect(readCookieValue("theme=dark; other=1", SIDEBAR_COOKIE_NAME)).toBeNull();
});

test("readCookieValue: empty string → null", () => {
	expect(readCookieValue("", SIDEBAR_COOKIE_NAME)).toBeNull();
});

test("parse ∘ read round-trips the collapsed state", () => {
	const jar = "a=1; sidebar_state=false; b=2";
	expect(parseSidebarState(readCookieValue(jar, SIDEBAR_COOKIE_NAME))).toBe(
		false,
	);
});
