import { describe, expect, test } from "bun:test";
import type { Region } from "../lib/languages";
import { type NavSet, resolveSetRegion } from "./nav-tree";

const navSet = (id: string): NavSet => ({
	id,
	name: id,
	slug: id,
	total: 1,
});

/**
 * `resolveSetRegion` is the crash safety net: a set's region is intrinsic and
 * slugs are globally unique, so if a set is missing in the preferred region we
 * try the other before giving up. Loading of each region's tree is delegated to
 * the injected `lookup` so the helper stays pure — and the non-preferred region
 * must only be queried on a preferred-region MISS (west viewers never pay for
 * the asia tree).
 */
describe("resolveSetRegion", () => {
	test("returns the preferred region when the set is there, without touching the other", async () => {
		const queried: Region[] = [];
		const result = await resolveSetRegion("west", (region) => {
			queried.push(region);
			return region === "west" ? navSet("base1") : undefined;
		});
		expect(result).toEqual({ region: "west", set: navSet("base1") });
		// Laziness: the asia tree is never consulted on a preferred-region hit.
		expect(queried).toEqual(["west"]);
	});

	test("falls back to the other region on a preferred-region miss", async () => {
		const queried: Region[] = [];
		const result = await resolveSetRegion("west", (region) => {
			queried.push(region);
			return region === "asia" ? navSet("sv1a") : undefined;
		});
		expect(result).toEqual({ region: "asia", set: navSet("sv1a") });
		expect(queried).toEqual(["west", "asia"]);
	});

	test("honors preferred=asia, falling back to west on a miss", async () => {
		const queried: Region[] = [];
		const result = await resolveSetRegion("asia", (region) => {
			queried.push(region);
			return region === "west" ? navSet("swsh9") : undefined;
		});
		expect(result).toEqual({ region: "west", set: navSet("swsh9") });
		expect(queried).toEqual(["asia", "west"]);
	});

	test("preferred=asia hits asia directly without touching west", async () => {
		const queried: Region[] = [];
		const result = await resolveSetRegion("asia", (region) => {
			queried.push(region);
			return region === "asia" ? navSet("sm1") : undefined;
		});
		expect(result).toEqual({ region: "asia", set: navSet("sm1") });
		expect(queried).toEqual(["asia"]);
	});

	test("returns null when the set is in neither region", async () => {
		const queried: Region[] = [];
		const result = await resolveSetRegion("west", (region) => {
			queried.push(region);
			return undefined;
		});
		expect(result).toBeNull();
		expect(queried).toEqual(["west", "asia"]);
	});

	test("awaits an async lookup (real tree loads are Promises)", async () => {
		const result = await resolveSetRegion("west", async (region) =>
			region === "asia" ? navSet("s12a") : undefined,
		);
		expect(result).toEqual({ region: "asia", set: navSet("s12a") });
	});
});
