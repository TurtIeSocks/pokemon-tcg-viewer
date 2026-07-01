// src/components/islands/card-language-control.test.tsx
import { expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { LIST_SEARCH_DEFAULTS } from "../../lib/list-search";
import { CardLanguageControl } from "./card-language-control";

function renderControl(overrides = {}, onChange = () => {}) {
	return render(
		<CardLanguageControl
			value={{ ...LIST_SEARCH_DEFAULTS, ...overrides }}
			onChange={onChange}
		/>,
	);
}

function openMenu() {
	fireEvent.pointerDown(
		screen.getByRole("button", { name: /Catalog language/i }),
		{
			button: 0,
			ctrlKey: false,
		},
	);
}

test("renders both group headings, Western catalog and Asian catalog", async () => {
	renderControl();
	openMenu();
	expect(await screen.findByText("Western catalog")).toBeDefined();
	expect(screen.getByText("Asian catalog")).toBeDefined();
});

test("renders all twelve language options across both groups", async () => {
	renderControl();
	openMenu();
	await screen.findByText("Western catalog");

	const westernLabels = [
		"English",
		"Français",
		"Deutsch",
		"Español",
		"Italiano",
		"Português",
	];
	const asianLabels = [
		"日本語",
		"한국어",
		"繁體中文",
		"简体中文",
		"ไทย",
		"Bahasa Indonesia",
	];

	for (const label of [...westernLabels, ...asianLabels]) {
		expect(
			screen.getByRole("menuitemradio", { name: new RegExp(label) }),
		).toBeDefined();
	}
});

test("copy warns that Asian languages switch to a different catalog (no em-dash)", async () => {
	renderControl();
	openMenu();
	const hint = await screen.findByText(/switches to the asian catalog/i);
	expect(hint.textContent).not.toContain("—");
});

test("selecting an Asian language fires onChange with that lang", async () => {
	const onChange = mock(() => {});
	renderControl({}, onChange);
	openMenu();
	await screen.findByText("Asian catalog");
	fireEvent.click(screen.getByRole("menuitemradio", { name: /日本語/ }));
	expect(onChange).toHaveBeenCalledWith({ lang: "ja" });
});
