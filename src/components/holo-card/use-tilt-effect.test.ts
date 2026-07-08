import { describe, expect, test } from "bun:test";
import {
	computeTiltVars,
	ensureTiltPermission,
	TILT_MAX_DEG,
} from "./use-tilt-effect";

describe("ensureTiltPermission", () => {
	test("is a safe no-op where DeviceOrientationEvent.requestPermission is absent", () => {
		// Non-iOS / desktop / test env: no requestPermission API. Must not throw.
		expect(() => ensureTiltPermission()).not.toThrow();
	});
});

describe("computeTiltVars", () => {
	test("returns centered (50, 50) when reading equals neutral", () => {
		const { pointerX, pointerY } = computeTiltVars({
			beta: 30,
			gamma: 10,
			betaNeutral: 30,
			gammaNeutral: 10,
		});
		expect(pointerX).toBe(50);
		expect(pointerY).toBe(50);
	});

	test("returns 100 on each axis when delta saturates at +TILT_MAX_DEG", () => {
		const { pointerX, pointerY } = computeTiltVars({
			beta: 0 + TILT_MAX_DEG + 5,
			gamma: 0 + TILT_MAX_DEG + 5,
			betaNeutral: 0,
			gammaNeutral: 0,
		});
		expect(pointerX).toBe(100);
		expect(pointerY).toBe(100);
	});

	test("returns 0 on each axis when delta saturates at -TILT_MAX_DEG", () => {
		const { pointerX, pointerY } = computeTiltVars({
			beta: -TILT_MAX_DEG - 5,
			gamma: -TILT_MAX_DEG - 5,
			betaNeutral: 0,
			gammaNeutral: 0,
		});
		expect(pointerX).toBe(0);
		expect(pointerY).toBe(0);
	});

	test("linearly interpolates inside the swing range", () => {
		// halfway between neutral and +TILT_MAX_DEG → halfway between 50 and 100 = 75
		const { pointerX } = computeTiltVars({
			beta: 0,
			gamma: TILT_MAX_DEG / 2,
			betaNeutral: 0,
			gammaNeutral: 0,
		});
		expect(pointerX).toBe(75);
	});
});
