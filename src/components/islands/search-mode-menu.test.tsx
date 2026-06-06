import { expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SearchMode } from "@/store/corpus/fuzzy";
import { SearchModeMenu } from "./search-mode-menu";

// Radix DropdownMenu opens on pointerDown (not click) under happy-dom; the
// radio items render with role="menuitemradio". Mirrors the bulk-add-menu test.
function openMenu() {
	fireEvent.pointerDown(screen.getByRole("button", { name: "Search mode" }), {
		button: 0,
		ctrlKey: false,
	});
}

test("trigger reflects the active mode (Fuzzy) via visible label + title", () => {
	render(<SearchModeMenu value="fuzzy" onChange={() => {}} />);
	const trigger = screen.getByRole("button", { name: "Search mode" });
	expect(trigger.textContent).toContain("Fuzzy");
	expect(trigger.getAttribute("title")).toContain("Fuzzy");
});

test("trigger reflects the active mode (Exact) when value=exact", () => {
	render(<SearchModeMenu value="exact" onChange={() => {}} />);
	const trigger = screen.getByRole("button", { name: "Search mode" });
	expect(trigger.textContent).toContain("Exact");
	expect(trigger.getAttribute("title")).toContain("Exact");
});

test("opening the menu and selecting Exact fires onChange('exact')", async () => {
	const onChange = mock((_m: SearchMode) => {});
	render(<SearchModeMenu value="fuzzy" onChange={onChange} />);

	openMenu();

	const exactItem = await waitFor(() =>
		screen.getByRole("menuitemradio", { name: /exact/i }),
	);
	fireEvent.click(exactItem);

	await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
	expect(onChange.mock.calls[0][0]).toBe("exact");
});

test("opening the menu and selecting Contains fires onChange('contains')", async () => {
	const onChange = mock((_m: SearchMode) => {});
	render(<SearchModeMenu value="fuzzy" onChange={onChange} />);

	openMenu();

	const containsItem = await waitFor(() =>
		screen.getByRole("menuitemradio", { name: /contains/i }),
	);
	fireEvent.click(containsItem);

	await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
	expect(onChange.mock.calls[0][0]).toBe("contains");
});

test("the active mode's radio item is checked", async () => {
	render(<SearchModeMenu value="contains" onChange={() => {}} />);

	openMenu();

	const containsItem = await waitFor(() =>
		screen.getByRole("menuitemradio", { name: /contains/i }),
	);
	expect(containsItem.getAttribute("aria-checked")).toBe("true");
});

test("disabled trigger is not interactive", () => {
	render(<SearchModeMenu value="fuzzy" onChange={() => {}} disabled />);
	expect(
		screen
			.getByRole("button", { name: "Search mode" })
			.hasAttribute("disabled"),
	).toBe(true);
});
