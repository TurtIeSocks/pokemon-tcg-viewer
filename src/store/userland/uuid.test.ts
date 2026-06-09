import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { uuidv7 } from "./uuid";

const V7 =
	/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("uuidv7", () => {
	afterEach(() => {
		// Restore any Date.now spy so a mocked clock can't leak into later tests.
		(Date.now as unknown as { mockRestore?: () => void }).mockRestore?.();
	});

	it("emits a canonical v7 string (version nibble 7, variant 10xx)", () => {
		expect(uuidv7()).toMatch(V7);
	});

	it("is collision-free across a tight loop", () => {
		const ids = new Set<string>();
		for (let i = 0; i < 5000; i++) ids.add(uuidv7());
		expect(ids.size).toBe(5000);
	});

	it("sorts lexicographically by mint time (the whole point of v7)", () => {
		const now = spyOn(Date, "now");
		now.mockReturnValue(1_000_000_000_000);
		const earlier = uuidv7();
		now.mockReturnValue(1_700_000_000_000);
		const later = uuidv7();
		expect(earlier < later).toBe(true);
	});

	it("encodes the 48-bit timestamp big-endian in the leading hex", () => {
		const now = spyOn(Date, "now");
		now.mockReturnValue(0x0123456789ab);
		// First 48 bits (12 hex chars, minus the dash) must echo the timestamp.
		expect(uuidv7().replace("-", "").slice(0, 12)).toBe("0123456789ab");
	});

	it("still differs within the same millisecond (random tail)", () => {
		const now = spyOn(Date, "now");
		now.mockReturnValue(1_700_000_000_000);
		expect(uuidv7()).not.toBe(uuidv7());
	});
});
