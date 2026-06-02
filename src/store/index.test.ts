import { expect, test } from "bun:test";
import { useStore } from "./index";

test("store exposes the sets slice", () => {
	const s = useStore.getState();
	expect(s.sets).toBeNull();
	expect(typeof s.loadSets).toBe("function");
});
