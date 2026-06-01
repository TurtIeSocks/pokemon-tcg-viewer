import { expect, test } from "bun:test";
import { useStore } from "./index";

test("store composes the sets and collection slices", () => {
	const s = useStore.getState();
	expect(s.sets).toBeNull();
	expect(typeof s.loadSets).toBe("function");
	expect(s.owned).toBeDefined();
});
