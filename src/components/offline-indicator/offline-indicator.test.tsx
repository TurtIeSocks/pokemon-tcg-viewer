import { afterEach, describe, expect, test } from "bun:test";
import { act, render, screen } from "@testing-library/react";
import { OfflineIndicator } from "./offline-indicator";

afterEach(() => {
	// Reset navigator.onLine via property descriptor in case tests poked it
	Object.defineProperty(window.navigator, "onLine", {
		configurable: true,
		get: () => true,
	});
});

describe("<OfflineIndicator />", () => {
	test("renders nothing when navigator.onLine is true", () => {
		Object.defineProperty(window.navigator, "onLine", {
			configurable: true,
			get: () => true,
		});
		const { container } = render(<OfflineIndicator />);
		expect(container.querySelector(".offline-indicator")).toBeNull();
	});

	test("renders the 'Offline' chip after offline event fires", () => {
		Object.defineProperty(window.navigator, "onLine", {
			configurable: true,
			get: () => false,
		});
		render(<OfflineIndicator />);
		act(() => {
			window.dispatchEvent(new Event("offline"));
		});
		expect(screen.getByText(/offline/i)).toBeDefined();
	});
});
