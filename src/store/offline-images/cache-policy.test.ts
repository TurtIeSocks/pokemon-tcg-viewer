import { expect, test } from "bun:test";
import { evictionPlan, imageCacheKindFor } from "./cache-policy";

test("imageCacheKindFor maps wsrv.nl image sizes to caches, rejects the rest", () => {
	expect(
		imageCacheKindFor(new URL("https://wsrv.nl/?url=x&w=300&output=webp"))
			?.name,
	).toBe("ptcg-thumbs");
	expect(
		imageCacheKindFor(new URL("https://wsrv.nl/?url=x&w=734&output=webp"))
			?.name,
	).toBe("ptcg-hires");
	expect(imageCacheKindFor(new URL("https://wsrv.nl/?url=x&w=999"))).toBeNull(); // unknown size
	expect(
		imageCacheKindFor(new URL("https://ptcg.turtlesocks.dev/assets/index.js")),
	).toBeNull(); // app asset
	expect(
		imageCacheKindFor(new URL("https://images.pokemontcg.io/base1/4.png")),
	).toBeNull(); // not the proxy
});

test("evictionPlan returns the oldest keys over cap, none when under", () => {
	expect(evictionPlan([1, 2, 3, 4, 5], 3)).toEqual([1, 2]); // delete 2 oldest
	expect(evictionPlan([1, 2], 3)).toEqual([]);
	expect(evictionPlan([1, 2, 3], 0)).toEqual([1, 2, 3]); // cap 0 = off, drop all
});
