import { expect, test } from "bun:test";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { HoloCardData } from "../holo-card/types";
import { PrintMissingDialog } from "./print-missing-dialog";

function card(overrides: Partial<HoloCardData> = {}): HoloCardData {
	return {
		id: "c",
		imageUrl: "",
		name: "Card",
		setId: "s",
		setName: "Set",
		setSeries: "Series",
		cardNumber: "1",
		...overrides,
	} as HoloCardData;
}

const missing = [
	card({ id: "a", name: "Bulbasaur", setName: "Base Set", cardNumber: "1" }),
	card({ id: "b", name: "Ivysaur", setName: "Base Set", cardNumber: "2" }),
	card({ id: "c", name: "Venusaur", setName: "Base Set", cardNumber: "3" }),
];

/** The on-screen preview copy of the sheet (scoped away from the body portal). */
function preview() {
	return screen.getByRole("region", { name: "Placeholder preview" });
}

function firstPlaceholder(): HTMLElement {
	const el = preview().querySelector(".tcgv-placeholder");
	if (!el) throw new Error("no placeholder rendered in preview");
	return el as HTMLElement;
}

test("lists the correct 'N cards to print' count", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	expect(screen.getByText("3 cards to print")).toBeDefined();
});

test("renders one placeholder per missing card with name + set/number meta", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	const p = preview();
	expect(p.querySelectorAll(".tcgv-placeholder")).toHaveLength(3);
	expect(within(p).getByText("Bulbasaur")).toBeDefined();
	expect(within(p).getByText("#1 / Base Set")).toBeDefined();
});

test("changing the background color updates the placeholder background", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	const bgInput = screen.getByLabelText("Background color") as HTMLInputElement;

	act(() => {
		fireEvent.change(bgInput, { target: { value: "#ff0000" } });
	});

	expect(bgInput.value).toBe("#ff0000");
	// Inline style reflects the chosen fill on the live preview.
	const bg = firstPlaceholder().style.backgroundColor;
	expect(bg === "#ff0000" || bg === "rgb(255, 0, 0)").toBe(true);
});

test("toggling Transparent makes the placeholder background transparent", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	// Default is a solid (non-transparent) fill.
	expect(firstPlaceholder().style.backgroundColor).not.toBe("transparent");

	const toggle = screen.getByLabelText("Transparent");
	act(() => {
		fireEvent.click(toggle);
	});

	expect(firstPlaceholder().style.backgroundColor).toBe("transparent");
	// The background color input disables while transparent is active.
	expect(
		(screen.getByLabelText("Background color") as HTMLInputElement).disabled,
	).toBe(true);
});

test("changing the text color updates the placeholder text + border color", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	const textInput = screen.getByLabelText("Text color") as HTMLInputElement;

	act(() => {
		fireEvent.change(textInput, { target: { value: "#0000ff" } });
	});

	expect(textInput.value).toBe("#0000ff");
	const ph = firstPlaceholder();
	const color = ph.style.color;
	expect(color === "#0000ff" || color === "rgb(0, 0, 255)").toBe(true);
	const border = ph.style.borderColor;
	expect(border === "#0000ff" || border === "rgb(0, 0, 255)").toBe(true);
});

test("Print button calls window.print (stubbed)", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	const orig = window.print;
	let called = 0;
	window.print = () => {
		called += 1;
	};

	const printBtn = screen.getByRole("button", { name: "Print" });
	act(() => {
		fireEvent.click(printBtn);
	});

	expect(called).toBe(1);
	window.print = orig;
});

test("empty state: shows a nothing-to-print message and disables Print", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={[]} />);
	expect(screen.getByText(/nothing to print/i)).toBeDefined();
	expect(
		(screen.getByRole("button", { name: "Print" }) as HTMLButtonElement)
			.disabled,
	).toBe(true);
	// No preview sheet when there is nothing to print.
	expect(
		screen.queryByRole("region", { name: "Placeholder preview" }),
	).toBeNull();
});
