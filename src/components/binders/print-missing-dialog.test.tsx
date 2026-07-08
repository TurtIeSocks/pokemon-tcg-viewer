import { beforeEach, expect, test } from "bun:test";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { DEFAULT_PRINT_PREFS, useUiPrefs } from "@/store/ui-prefs";
import type { HoloCardData } from "../holo-card/types";
import { PrintMissingDialog } from "./print-missing-dialog";

// Print settings now live in a persisted (singleton) store, so reset them before
// every test — otherwise one test's slider change leaks into the next.
beforeEach(() => {
	useUiPrefs.setState({ printPrefs: { ...DEFAULT_PRINT_PREFS } });
});

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

test("exposes background, text, and border color controls", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	// The registry ColorPicker is a popover trigger, not a native input; assert the
	// three labelled controls (background, text, border) are present.
	expect(screen.getByText("Background")).toBeDefined();
	expect(screen.getByText("Text color")).toBeDefined();
	expect(screen.getByText("Border color")).toBeDefined();
});

test("placeholder renders as a card silhouette: white fill, dark text + border, 3mm radius", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	const ph = firstPlaceholder();
	const bg = ph.style.backgroundColor;
	expect(bg === "#ffffff" || bg === "rgb(255, 255, 255)").toBe(true);
	// Text and border are independent state, both defaulting to the dark ink.
	const color = ph.style.color;
	expect(color === "#111111" || color === "rgb(17, 17, 17)").toBe(true);
	const border = ph.style.borderColor;
	expect(border === "#111111" || border === "rgb(17, 17, 17)").toBe(true);
	// Rounded corners give the card-silhouette look.
	expect(ph.style.borderRadius).toBe("3mm");
});

test("the text-size slider scales both lines by the same factor (ratio preserved)", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	// Defaults: 3.6mm name / 2.8mm meta.
	expect(within(preview()).getByText("Bulbasaur").style.fontSize).toBe("3.6mm");
	expect(within(preview()).getByText("#1 / Base Set").style.fontSize).toBe(
		"2.8mm",
	);

	const slider = screen.getByLabelText("Text size") as HTMLInputElement;
	act(() => {
		fireEvent.change(slider, { target: { value: "1.5" } });
	});

	// Both scaled by 1.5, ratio preserved (5.4 / 4.2 === 3.6 / 2.8).
	expect(within(preview()).getByText("Bulbasaur").style.fontSize).toBe("5.4mm");
	expect(within(preview()).getByText("#1 / Base Set").style.fontSize).toBe(
		"4.2mm",
	);
});

test("the corner-radius slider updates the placeholder rounding", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	expect(firstPlaceholder().style.borderRadius).toBe("3mm");

	const slider = screen.getByLabelText(
		"Corner radius in millimetres",
	) as HTMLInputElement;
	act(() => {
		fireEvent.change(slider, { target: { value: "6" } });
	});

	expect(slider.value).toBe("6");
	expect(firstPlaceholder().style.borderRadius).toBe("6mm");
});

test("print settings persist across dialog remounts (saved in the store)", () => {
	const { unmount } = render(
		<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />,
	);
	const slider = screen.getByLabelText("Text size") as HTMLInputElement;
	act(() => {
		fireEvent.change(slider, { target: { value: "1.5" } });
	});
	unmount();

	// Remount reads the persisted store, not a fresh local default → still scaled.
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	expect(within(preview()).getByText("Bulbasaur").style.fontSize).toBe("5.4mm");
});

test("preview sheet leaves a cutting gap between placeholders", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	const sheet = preview().querySelector(".tcgv-print-sheet") as HTMLElement;
	expect(sheet.style.gap).toBe("5mm");
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
