import { expect, test } from "bun:test";
import { shellStrategy } from "./sw-shell-policy";

const base = {
	method: "GET",
	sameOrigin: true,
	mode: "cors",
	destination: "",
	pathname: "/x",
};

test("navigations → network-first", () => {
	expect(
		shellStrategy({
			...base,
			mode: "navigate",
			destination: "document",
			pathname: "/base-set",
		}),
	).toBe("network-first");
});

test("same-origin script/style/font → cache-first", () => {
	for (const d of ["script", "style", "font"])
		expect(
			shellStrategy({ ...base, destination: d, pathname: `/assets/x.${d}` }),
		).toBe("cache-first");
});

test("same-origin image → stale-while-revalidate", () => {
	expect(
		shellStrategy({ ...base, destination: "image", pathname: "/icon-192.png" }),
	).toBe("stale-while-revalidate");
});

test("RPC / api / corpus → passthrough", () => {
	for (const p of [
		"/_serverFn/getSetCardsFn",
		"/api/stripe/webhook",
		"/corpus",
		"/corpus-region/asia",
	])
		expect(shellStrategy({ ...base, destination: "empty", pathname: p })).toBe(
			"passthrough",
		);
});

test("cross-origin non-navigation → passthrough", () => {
	expect(
		shellStrategy({
			...base,
			sameOrigin: false,
			destination: "script",
			pathname: "/x.js",
		}),
	).toBe("passthrough");
});

test("non-GET → passthrough", () => {
	expect(
		shellStrategy({
			...base,
			method: "POST",
			mode: "navigate",
			destination: "document",
		}),
	).toBe("passthrough");
});
