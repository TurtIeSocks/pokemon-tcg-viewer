import { afterEach, expect, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useOnlineStatus } from "./use-online-status";

afterEach(() => {
	cleanup();
	setOnline(true);
});

function setOnline(v: boolean) {
	Object.defineProperty(navigator, "onLine", { value: v, configurable: true });
}

test("reflects navigator.onLine initially", () => {
	setOnline(false);
	const { result } = renderHook(() => useOnlineStatus());
	expect(result.current).toBe(false);
});

test("flips on online/offline events", () => {
	setOnline(true);
	const { result } = renderHook(() => useOnlineStatus());
	expect(result.current).toBe(true);
	act(() => {
		setOnline(false);
		window.dispatchEvent(new Event("offline"));
	});
	expect(result.current).toBe(false);
	act(() => {
		setOnline(true);
		window.dispatchEvent(new Event("online"));
	});
	expect(result.current).toBe(true);
});
