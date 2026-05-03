import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { FilterChip } from "./filter-chip";

function renderInRouter(ui: React.ReactElement, initialUrl = "/") {
	return render(
		<MemoryRouter initialEntries={[initialUrl]}>{ui}</MemoryRouter>,
	);
}

describe("<FilterChip />", () => {
	const baseProps = {
		label: "Type",
		paramName: "types",
		options: ["Fire", "Water", "Grass"],
	};

	test("renders inactive label when no values selected", () => {
		renderInRouter(<FilterChip {...baseProps} />);
		const button = screen.getByRole("button", { name: /^type$/i });
		expect(button.textContent).toContain("Type");
		expect(button.textContent).not.toContain("·");
	});

	test("renders active label preview with first value", () => {
		renderInRouter(<FilterChip {...baseProps} />, "/?types=Fire");
		const button = screen.getByRole("button", { name: /^type$/i });
		expect(button.textContent).toContain("Fire");
	});

	test("renders +N suffix when multiple values selected", () => {
		renderInRouter(<FilterChip {...baseProps} />, "/?types=Fire,Water,Grass");
		const button = screen.getByRole("button", { name: /^type$/i });
		expect(button.textContent).toContain("+2");
	});

	test("popover opens on click and shows options", () => {
		renderInRouter(<FilterChip {...baseProps} />);
		fireEvent.click(screen.getByRole("button", { name: /^type$/i }));
		expect(screen.getByRole("checkbox", { name: "Fire" })).toBeDefined();
		expect(screen.getByRole("checkbox", { name: "Water" })).toBeDefined();
		expect(screen.getByRole("checkbox", { name: "Grass" })).toBeDefined();
	});

	test("popover stays open in active state, allowing additional toggles", () => {
		renderInRouter(<FilterChip {...baseProps} />, "/?types=Fire");
		fireEvent.click(screen.getByRole("button", { name: /^type$/i }));
		// Now the popover is open with Fire already checked
		expect(screen.getByRole("checkbox", { name: "Fire" })).toBeDefined();
		// Add Water by clicking its checkbox
		fireEvent.click(screen.getByRole("checkbox", { name: "Water" }));
		// Chip's preview should now reflect both
		const chipButton = screen.getByRole("button", { name: /^type$/i });
		expect(chipButton.textContent).toContain("Fire");
		expect(chipButton.textContent).toContain("+1");
	});

	test("clear button (×) clears just this dimension", () => {
		renderInRouter(<FilterChip {...baseProps} />, "/?types=Fire,Water");
		const clearButton = screen.getByRole("button", { name: /clear type/i });
		fireEvent.click(clearButton);
		// After clearing, only the chip remains; its label returns to inactive.
		const chipButton = screen.getByRole("button", { name: /^type$/i });
		expect(chipButton.textContent).not.toContain("Fire");
	});

	test("renders disabled chip when options array is empty", () => {
		renderInRouter(<FilterChip {...baseProps} options={[]} />);
		const button = screen.getByRole("button", { name: /^type$/i });
		expect(button.hasAttribute("disabled")).toBe(true);
	});
});
