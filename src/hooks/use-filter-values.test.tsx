import { describe, expect, test } from "bun:test";
import { renderHook } from "@testing-library/react";
import { useFilterValues } from "./use-filter-values";

describe("useFilterValues", () => {
	test("returns object with four named arrays", () => {
		const { result } = renderHook(() => useFilterValues());
		expect(result.current).toHaveProperty("types");
		expect(result.current).toHaveProperty("rarities");
		expect(result.current).toHaveProperty("supertypes");
		expect(result.current).toHaveProperty("subtypes");
	});

	test("each dimension defaults to an empty array (not null)", () => {
		const { result } = renderHook(() => useFilterValues());
		expect(Array.isArray(result.current.types)).toBe(true);
		expect(Array.isArray(result.current.rarities)).toBe(true);
		expect(Array.isArray(result.current.supertypes)).toBe(true);
		expect(Array.isArray(result.current.subtypes)).toBe(true);
	});
});
