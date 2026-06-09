import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useVersionAvailable } from "./use-version-available";

function mockFetch(version: string, ok = true) {
	return spyOn(globalThis, "fetch").mockResolvedValue({
		ok,
		json: async () => ({ version }),
	} as unknown as Response);
}

function setVisibility(state: "visible" | "hidden") {
	Object.defineProperty(document, "visibilityState", {
		value: state,
		configurable: true,
	});
}

beforeEach(() => {
	(globalThis as Record<string, unknown>).__APP_VERSION__ = "boot-v1";
	setVisibility("visible");
});

afterEach(() => {
	mock.restore();
	setVisibility("visible");
	delete (globalThis as Record<string, unknown>).__APP_VERSION__;
});

test("flags an update when the served version differs from boot", async () => {
	mockFetch("new-v2");
	const { result } = renderHook(() =>
		useVersionAvailable({ enabled: true, intervalMs: 10_000 }),
	);
	await waitFor(() => expect(result.current.updateReady).toBe(true));
	expect(result.current.latestVersion).toBe("new-v2");
});

test("no update when the served version equals boot", async () => {
	const f = mockFetch("boot-v1");
	const { result } = renderHook(() =>
		useVersionAvailable({ enabled: true, intervalMs: 10_000 }),
	);
	await waitFor(() => expect(f).toHaveBeenCalled());
	expect(result.current.updateReady).toBe(false);
});

test("never flags on a rejected fetch", async () => {
	const f = spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
	const { result } = renderHook(() =>
		useVersionAvailable({ enabled: true, intervalMs: 10_000 }),
	);
	await waitFor(() => expect(f).toHaveBeenCalled());
	expect(result.current.updateReady).toBe(false);
});

test("never flags on a non-200 response", async () => {
	const f = mockFetch("new-v2", false);
	const { result } = renderHook(() =>
		useVersionAvailable({ enabled: true, intervalMs: 10_000 }),
	);
	await waitFor(() => expect(f).toHaveBeenCalled());
	expect(result.current.updateReady).toBe(false);
});

test("dismiss suppresses the current token until a newer one ships", async () => {
	const f = mockFetch("new-v2");
	const { result } = renderHook(() =>
		useVersionAvailable({ enabled: true, intervalMs: 10_000 }),
	);
	await waitFor(() => expect(result.current.updateReady).toBe(true));

	act(() => result.current.dismiss());
	expect(result.current.updateReady).toBe(false);

	// Same token again → stays suppressed.
	f.mockResolvedValue({
		ok: true,
		json: async () => ({ version: "new-v2" }),
	} as unknown as Response);
	window.dispatchEvent(new Event("focus"));
	await waitFor(() => expect(f.mock.calls.length).toBeGreaterThan(1));
	expect(result.current.updateReady).toBe(false);

	// Newer token → flags again.
	f.mockResolvedValue({
		ok: true,
		json: async () => ({ version: "new-v3" }),
	} as unknown as Response);
	window.dispatchEvent(new Event("focus"));
	await waitFor(() => expect(result.current.updateReady).toBe(true));
	expect(result.current.latestVersion).toBe("new-v3");
});

test("a focus event triggers a re-check", async () => {
	const f = mockFetch("boot-v1");
	renderHook(() => useVersionAvailable({ enabled: true, intervalMs: 10_000 }));
	await waitFor(() => expect(f).toHaveBeenCalledTimes(1));
	window.dispatchEvent(new Event("focus"));
	await waitFor(() => expect(f.mock.calls.length).toBeGreaterThan(1));
});

test("does not poll on an interval while the tab is hidden", async () => {
	setVisibility("hidden");
	const f = mockFetch("boot-v1");
	renderHook(() => useVersionAvailable({ enabled: true, intervalMs: 20 }));
	await waitFor(() => expect(f).toHaveBeenCalledTimes(1)); // mount check only
	await new Promise((r) => setTimeout(r, 80));
	expect(f).toHaveBeenCalledTimes(1); // no interval growth while hidden
});

test("becoming visible starts the interval", async () => {
	setVisibility("hidden");
	const f = mockFetch("boot-v1");
	renderHook(() => useVersionAvailable({ enabled: true, intervalMs: 20 }));
	await waitFor(() => expect(f).toHaveBeenCalledTimes(1));

	setVisibility("visible");
	document.dispatchEvent(new Event("visibilitychange"));
	await waitFor(() => expect(f.mock.calls.length).toBeGreaterThan(2));
});

test("disabled hook never fetches", async () => {
	const f = mockFetch("new-v2");
	const { result } = renderHook(() =>
		useVersionAvailable({ enabled: false, intervalMs: 10_000 }),
	);
	await new Promise((r) => setTimeout(r, 40));
	expect(f).not.toHaveBeenCalled();
	expect(result.current.updateReady).toBe(false);
});

test("aborts the in-flight request on unmount", async () => {
	const abortSpy = spyOn(AbortController.prototype, "abort");
	mockFetch("new-v2");
	const { unmount } = renderHook(() =>
		useVersionAvailable({ enabled: true, intervalMs: 10_000 }),
	);
	unmount();
	expect(abortSpy).toHaveBeenCalled();
});
