import { beforeEach, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { setLocale } from "@/paraglide/runtime";
import { resetUserlandForTests } from "@/store/userland/userland-store";
import { UiLanguageSetting } from "./ui-language-setting";

// Start from a clean store + base locale so a prior test file (e.g. ui-locale.test,
// which switches to "ja") can't leak the active locale into these assertions.
beforeEach(() => {
	resetUserlandForTests();
	setLocale("en", { reload: false });
});

function openMenu() {
	fireEvent.pointerDown(
		screen.getByRole("button", { name: /Interface language/i }),
		{ button: 0, ctrlKey: false },
	);
}

test("renders the Interface language heading and current-language trigger", () => {
	render(<UiLanguageSetting />);
	expect(screen.getByText("Interface language")).toBeTruthy();
	// No profile in the store -> resolves to the English default.
	expect(
		screen
			.getByRole("button", { name: /Interface language/i })
			.textContent?.includes("English"),
	).toBe(true);
});

test("dropdown lists locales by endonym as radio items", async () => {
	render(<UiLanguageSetting />);
	openMenu();
	expect(
		await screen.findByRole("menuitemradio", { name: /日本語/ }),
	).toBeTruthy();
	expect(screen.getByRole("menuitemradio", { name: /Français/ })).toBeTruthy();
	expect(screen.getByRole("menuitemradio", { name: /English/ })).toBeTruthy();
});
