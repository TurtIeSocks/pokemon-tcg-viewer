import { describe, expect, test } from "bun:test";
import { clamp, DEFAULT_POINTER, setHoloVars } from "./holo-vars";

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
	test("writes all 9 CSS custom properties when called with centered pointer", () => {
		const el = document.createElement("div");
		setHoloVars(el, DEFAULT_POINTER, DEFAULT_POINTER);
		expect(el.style.getPropertyValue("--pointer-x")).toBe("50");
		expect(el.style.getPropertyValue("--pointer-y")).toBe("50");
		expect(el.style.getPropertyValue("--pointer-from-center")).toBe("0");
		expect(el.style.getPropertyValue("--rotate-x")).toBe("0deg");
		expect(el.style.getPropertyValue("--rotate-y")).toBe("0deg");
		expect(el.style.getPropertyValue("--background-x")).toBe("50%");
		expect(el.style.getPropertyValue("--background-y")).toBe("50%");
		expect(el.style.getPropertyValue("--pointer-from-left")).toBe("0.5");
		expect(el.style.getPropertyValue("--pointer-from-top")).toBe("0.5");
	});

	test("clamps out-of-range pointer inputs before writing", () => {
		const el = document.createElement("div");
		setHoloVars(el, 200, -50);
		expect(el.style.getPropertyValue("--pointer-x")).toBe("100");
		expect(el.style.getPropertyValue("--pointer-y")).toBe("0");
	});
});
