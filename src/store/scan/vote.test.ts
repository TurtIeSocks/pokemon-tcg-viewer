import { describe, expect, test } from "bun:test";
import { createVoter } from "./vote";

describe("createVoter", () => {
	test("two agreeing pushes reach consensus on the 2nd", () => {
		const voter = createVoter();
		expect(voter.push({ number: "86", total: 198 })).toBeNull();
		expect(voter.push({ number: "86", total: 198 })).toEqual({
			number: "86",
			total: 198,
		});
	});

	test("null pushes neither count nor reset the tally", () => {
		const voter = createVoter();
		expect(voter.push({ number: "86", total: 198 })).toBeNull();
		expect(voter.push(null)).toBeNull();
		expect(voter.push(null)).toBeNull();
		expect(voter.push({ number: "86", total: 198 })).toEqual({
			number: "86",
			total: 198,
		});
	});

	test("a conflicting reading resets the tally and starts counting the new value", () => {
		const voter = createVoter();
		expect(voter.push({ number: "86", total: 198 })).toBeNull();
		// card swapped mid-scan
		expect(voter.push({ number: "4", total: 102 })).toBeNull();
		// still only 1 consecutive-compatible reading of the new card
		expect(voter.push({ number: "4", total: 102 })).toEqual({
			number: "4",
			total: 102,
		});
	});

	test("reset() clears the tally", () => {
		const voter = createVoter();
		expect(voter.push({ number: "86", total: 198 })).toBeNull();
		voter.reset();
		expect(voter.push({ number: "86", total: 198 })).toBeNull();
		expect(voter.push({ number: "86", total: 198 })).toEqual({
			number: "86",
			total: 198,
		});
	});

	test("consensus repeats while readings persist (UI dedupes)", () => {
		const voter = createVoter();
		voter.push({ number: "86", total: 198 });
		expect(voter.push({ number: "86", total: 198 })).toEqual({
			number: "86",
			total: 198,
		});
		expect(voter.push({ number: "86", total: 198 })).toEqual({
			number: "86",
			total: 198,
		});
		expect(voter.push({ number: "86", total: 198 })).toEqual({
			number: "86",
			total: 198,
		});
	});

	test("custom agreeCount", () => {
		const voter = createVoter(3);
		expect(voter.push({ number: "86", total: 198 })).toBeNull();
		expect(voter.push({ number: "86", total: 198 })).toBeNull();
		expect(voter.push({ number: "86", total: 198 })).toEqual({
			number: "86",
			total: 198,
		});
	});
});
