import { describe, expect, it } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useSeriesMenu } from "./use-series-menu";

describe("useSeriesMenu", () => {
	it("starts closed", () => {
		const { result } = renderHook(() => useSeriesMenu());
		expect(result.current.openSeries).toBeNull();
	});

	it("opens after the open delay on hover-enter", async () => {
		const { result } = renderHook(() =>
			useSeriesMenu({ openDelay: 10, closeDelay: 10 }),
		);
		act(() => result.current.handleEnter("A"));
		expect(result.current.openSeries).toBeNull(); // still within the delay
		await waitFor(() => expect(result.current.openSeries).toBe("A"));
	});

	it("cancels opening when the pointer leaves before the delay elapses", async () => {
		const { result } = renderHook(() =>
			useSeriesMenu({ openDelay: 30, closeDelay: 5 }),
		);
		act(() => result.current.handleEnter("A"));
		act(() => result.current.handleLeave());
		await new Promise((r) => setTimeout(r, 50));
		expect(result.current.openSeries).toBeNull();
	});

	it("switches instantly between series while a menu is already open", () => {
		const { result } = renderHook(() =>
			useSeriesMenu({ openDelay: 50, closeDelay: 50 }),
		);
		act(() => result.current.openNow("A"));
		expect(result.current.openSeries).toBe("A");
		act(() => result.current.handleEnter("B"));
		expect(result.current.openSeries).toBe("B");
	});

	it("closes after the grace period on leave", async () => {
		const { result } = renderHook(() =>
			useSeriesMenu({ openDelay: 5, closeDelay: 10 }),
		);
		act(() => result.current.openNow("A"));
		act(() => result.current.handleLeave());
		await waitFor(() => expect(result.current.openSeries).toBeNull());
	});

	it("toggles the same series open then closed", () => {
		const { result } = renderHook(() => useSeriesMenu());
		act(() => result.current.toggle("A"));
		expect(result.current.openSeries).toBe("A");
		act(() => result.current.toggle("A"));
		expect(result.current.openSeries).toBeNull();
	});

	it("closeNow closes an open menu immediately", () => {
		const { result } = renderHook(() => useSeriesMenu());
		act(() => result.current.openNow("A"));
		act(() => result.current.closeNow());
		expect(result.current.openSeries).toBeNull();
	});
});
