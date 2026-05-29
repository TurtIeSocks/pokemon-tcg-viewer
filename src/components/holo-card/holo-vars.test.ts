import { describe, expect, test } from "bun:test";
import {
	clamp,
	DEFAULT_POINTER,
	isSettled,
	setHoloVars,
	stepHoloState,
} from "./holo-vars";

describe("clamp", () => {
	test("returns input when within range", () => {
		expect(clamp(50, 0, 100)).toBe(50);
	});

	test("saturates at min when below", () => {
		expect(clamp(-5, 0, 100)).toBe(0);
	});

	test("saturates at max when above", () => {
		expect(clamp(120, 0, 100)).toBe(100);
	});
});

describe("setHoloVars", () => {
	test("centered pointer writes neutral values; pointer coords carry % units", () => {
		const el = document.createElement("div");
		setHoloVars(el, DEFAULT_POINTER, DEFAULT_POINTER, 0);
		// Pointer coords MUST be percentages — simey consumes them as <position>
		// inside radial-gradient(circle at var(--pointer-x) ...). Unitless = invalid.
		expect(el.style.getPropertyValue("--pointer-x")).toBe("50%");
		expect(el.style.getPropertyValue("--pointer-y")).toBe("50%");
		expect(el.style.getPropertyValue("--pointer-from-center")).toBe("0");
		expect(el.style.getPropertyValue("--rotate-x")).toBe("0deg");
		expect(el.style.getPropertyValue("--rotate-y")).toBe("0deg");
		expect(el.style.getPropertyValue("--background-x")).toBe("50%");
		expect(el.style.getPropertyValue("--background-y")).toBe("50%");
		expect(el.style.getPropertyValue("--pointer-from-left")).toBe("0.5");
		expect(el.style.getPropertyValue("--pointer-from-top")).toBe("0.5");
		expect(el.style.getPropertyValue("--card-opacity")).toBe("0");
	});

	test("off-center pointer: background remaps to simey's narrow bands, tilt faces cursor", () => {
		const el = document.createElement("div");
		setHoloVars(el, 75, 75, 1);
		expect(el.style.getPropertyValue("--pointer-x")).toBe("75%");
		expect(el.style.getPropertyValue("--pointer-y")).toBe("75%");
		// background-x = adjust(75, 0,100, 37,63) = 56.5  (NOT inverted 37.5)
		expect(el.style.getPropertyValue("--background-x")).toBe("56.5%");
		// background-y = adjust(75, 0,100, 33,67) = 58.5  (y band differs from x)
		expect(el.style.getPropertyValue("--background-y")).toBe("58.5%");
		// rotate-x = +centerY/3.5 = +7.143 (simey leans the card toward the cursor)
		expect(el.style.getPropertyValue("--rotate-x")).toBe("7.143deg");
		// rotate-y = -(centerX)/3.5 = -7.143
		expect(el.style.getPropertyValue("--rotate-y")).toBe("-7.143deg");
		expect(
			Number.parseFloat(el.style.getPropertyValue("--pointer-from-center")),
		).toBeCloseTo(Math.SQRT1_2, 3);
		expect(el.style.getPropertyValue("--pointer-from-left")).toBe("0.75");
		expect(el.style.getPropertyValue("--pointer-from-top")).toBe("0.75");
		expect(el.style.getPropertyValue("--card-opacity")).toBe("1");
	});

	test("clamps out-of-range pointer and opacity inputs before writing", () => {
		const el = document.createElement("div");
		setHoloVars(el, 200, -50, 2);
		expect(el.style.getPropertyValue("--pointer-x")).toBe("100%");
		expect(el.style.getPropertyValue("--pointer-y")).toBe("0%");
		expect(el.style.getPropertyValue("--card-opacity")).toBe("1");
	});
});

describe("stepHoloState", () => {
	test("lerps each field toward target by factor k", () => {
		expect(
			stepHoloState({ x: 0, y: 0, o: 0 }, { x: 100, y: 50, o: 1 }, 0.5),
		).toEqual({ x: 50, y: 25, o: 0.5 });
	});

	test("k=1 snaps to target", () => {
		expect(
			stepHoloState({ x: 10, y: 20, o: 0 }, { x: 90, y: 80, o: 1 }, 1),
		).toEqual({ x: 90, y: 80, o: 1 });
	});
});

describe("isSettled", () => {
	test("true when every field is within epsilon of target", () => {
		expect(isSettled({ x: 50, y: 50, o: 1 }, { x: 50, y: 50, o: 1 })).toBe(
			true,
		);
	});

	test("false when any field is outside epsilon", () => {
		expect(isSettled({ x: 50, y: 50, o: 0.5 }, { x: 50, y: 50, o: 1 })).toBe(
			false,
		);
	});
});
