import { expect, test } from "bun:test";
import { resolveVersion } from "./resolve-version";

const NO_GIT = () => null;

test("explicit APP_VERSION wins and is not truncated", () => {
	expect(resolveVersion({ APP_VERSION: "1.4.2-rc1" }, NO_GIT)).toBe(
		"1.4.2-rc1",
	);
});

test("Vercel commit SHA is used and truncated to 7", () => {
	expect(
		resolveVersion({ VERCEL_GIT_COMMIT_SHA: "abcdef1234567890" }, NO_GIT),
	).toBe("abcdef1");
});

test("Cloudflare Pages SHA is used when Vercel absent", () => {
	expect(resolveVersion({ CF_PAGES_COMMIT_SHA: "0123456789" }, NO_GIT)).toBe(
		"0123456",
	);
});

test("GitHub SHA is used when others absent", () => {
	expect(resolveVersion({ GITHUB_SHA: "deadbeefcafe" }, NO_GIT)).toBe(
		"deadbee",
	);
});

test("falls back to git short SHA when no env source", () => {
	expect(resolveVersion({}, () => "feedfaceceded")).toBe("feedfac");
});

test("falls back to build timestamp when no env and no git", () => {
	expect(resolveVersion({}, NO_GIT, () => 1_749_456_789_000)).toBe(
		"1749456789000",
	);
});

test("precedence: APP_VERSION over CI SHAs over git", () => {
	expect(
		resolveVersion(
			{
				APP_VERSION: "explicit",
				VERCEL_GIT_COMMIT_SHA: "aaaaaaa",
				GITHUB_SHA: "bbbbbbb",
			},
			() => "ccccccc",
		),
	).toBe("explicit");
});
