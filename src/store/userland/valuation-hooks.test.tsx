import { afterEach, expect, test } from "bun:test";
import { renderHook } from "@testing-library/react";
import { makeProfile, setupUserlandTest } from "../../test-utils";
import { useUserland } from "./userland-store";
import { useHideValue } from "./valuation-hooks";

afterEach(async () => {
	await setupUserlandTest(); // resets userland between cases
});

test("useHideValue reflects the profile flag, defaulting false", async () => {
	await setupUserlandTest();
	expect(renderHook(() => useHideValue()).result.current).toBe(false);
	useUserland.setState({
		profile: makeProfile({ hideValue: true }),
	});
	expect(renderHook(() => useHideValue()).result.current).toBe(true);
});
