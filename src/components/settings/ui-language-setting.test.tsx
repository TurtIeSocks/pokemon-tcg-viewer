import { expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { UiLanguageSetting } from "./ui-language-setting";

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
