import { beforeEach, expect, spyOn, test } from "bun:test";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { toast } from "sonner";
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

test("renders one placeholder per missing card with name, number, and set lines", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	const p = preview();
	expect(p.querySelectorAll(".tcgv-placeholder")).toHaveLength(3);
	expect(within(p).getByText("Bulbasaur")).toBeDefined();
	// Number and set name are now independent lines (not "#1 / Base Set").
	expect(within(p).getByText("#1")).toBeDefined();
	expect(within(p).getAllByText("Base Set").length).toBe(3);
});

test("exposes background, text, and border color controls", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	// The registry ColorPicker is a popover trigger, not a native input; assert the
	// three labelled controls (background, text, border) are present.
	expect(screen.getByText("Background")).toBeDefined();
	expect(screen.getByText("Text")).toBeDefined();
	expect(screen.getByText("Border")).toBeDefined();
});

test("placeholder paints fill + border as an SVG rect (prints reliably), from the print defaults", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	const ph = firstPlaceholder();
	// Fill + border are an SVG <rect> (foreground paint), not a CSS background —
	// CSS backgrounds are dropped by the print pipeline. Values are read from
	// DEFAULT_PRINT_PREFS so this tracks the defaults instead of rotting when they change.
	const rect = ph.querySelector("rect");
	if (!rect) throw new Error("no fill rect rendered");
	expect(rect.getAttribute("fill")).toBe(DEFAULT_PRINT_PREFS.background);
	expect(rect.getAttribute("stroke")).toBe(DEFAULT_PRINT_PREFS.borderColor);
	expect(rect.getAttribute("stroke-width")).toBe(
		String(DEFAULT_PRINT_PREFS.borderMm),
	);
	// Rounded corners (mm units) give the card-silhouette look.
	expect(rect.getAttribute("rx")).toBe(String(DEFAULT_PRINT_PREFS.radiusMm));
});

/** Type a value into a UnitInput and commit it (blur). */
function setUnit(labelText: string, value: string) {
	const input = screen.getByLabelText(labelText) as HTMLInputElement;
	act(() => {
		fireEvent.change(input, { target: { value } });
		fireEvent.blur(input);
	});
}

test("the text-size field (%) master-scales every line by the same factor", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	// Base 3.6mm name / 2.8mm number, scaled by the 1.3x default → 4.68 / 3.64.
	expect(within(preview()).getByText("Bulbasaur").style.fontSize).toBe(
		"4.68mm",
	);
	expect(within(preview()).getByText("#1").style.fontSize).toBe("3.64mm");

	// 150% → 1.5x multiplier; ratio preserved (5.4 / 4.2 === 3.6 / 2.8).
	setUnit("Text size", "150");
	expect(within(preview()).getByText("Bulbasaur").style.fontSize).toBe("5.4mm");
	expect(within(preview()).getByText("#1").style.fontSize).toBe("4.2mm");
});

test("a per-line font-size field sets that line's base size (x textScale)", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	setUnit("Card name font size", "6"); // 6mm base * 1.3 default scale = 7.8mm
	expect(within(preview()).getByText("Bulbasaur").style.fontSize).toBe("7.8mm");
});

test("unchecking a font-size line hides it on every placeholder", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	expect(within(preview()).getByText("#1")).toBeDefined();
	act(() => {
		fireEvent.click(screen.getByLabelText("Show Card #"));
	});
	expect(within(preview()).queryByText("#1")).toBeNull();
	// The line's size input is disabled while hidden.
	expect(
		(screen.getByLabelText("Card # font size") as HTMLInputElement).disabled,
	).toBe(true);
});

test("spacing feeds both the grid gap and the auto-fit", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	const sheet = () =>
		preview().querySelector(".tcgv-print-sheet") as HTMLElement;
	expect(sheet().style.gap).toBe("5mm");
	// Gap 0 → the 3rd column fits again (3 * 63 = 189 <= 190mm printable).
	setUnit("Spacing", "0");
	expect(sheet().style.gap).toBe("0mm");
	expect(sheet().style.gridTemplateColumns).toBe("repeat(3, 63mm)");
});

test("the corner-radius field updates the placeholder rounding (SVG rect rx)", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	expect(firstPlaceholder().querySelector("rect")?.getAttribute("rx")).toBe(
		"3",
	);

	setUnit("Corner radius", "6");
	expect(firstPlaceholder().querySelector("rect")?.getAttribute("rx")).toBe(
		"6",
	);
});

test("the border-width field updates the placeholder stroke", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	setUnit("Border width", "1");
	expect(
		firstPlaceholder().querySelector("rect")?.getAttribute("stroke-width"),
	).toBe("1");
});

test("card size drives the grid: wider cards fit fewer columns (auto-fit)", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	const sheet = () =>
		preview().querySelector(".tcgv-print-sheet") as HTMLElement;
	expect(sheet().style.gridTemplateColumns).toBe("repeat(2, 63mm)");

	// 120mm wide → floor((190 + 5) / (120 + 5)) = 1 column.
	setUnit("Width", "120");
	expect(sheet().style.gridTemplateColumns).toBe("repeat(1, 120mm)");
	// The "fits N per sheet" read-out reflects the re-fit (text spans nodes).
	const fits = screen.getByText(
		(_, el) =>
			el?.tagName === "P" &&
			(el.textContent ?? "").replace(/\s+/g, " ").includes("Fits 3 per sheet"),
	);
	expect(fits.textContent?.replace(/\s+/g, " ")).toContain(
		"Fits 3 per sheet (1 × 3)",
	);
});

test("warns when a card dimension exceeds the standard size", () => {
	const warn = spyOn(toast, "warning").mockImplementation(() => "");
	try {
		render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
		setUnit("Width", "70"); // > 63mm standard
		expect(warn).toHaveBeenCalledTimes(1);
		expect(String(warn.mock.calls[0]?.[0])).toMatch(
			/wider than a standard card/i,
		);
	} finally {
		warn.mockRestore();
	}
});

test("no oversize warning at or below the standard size", () => {
	const warn = spyOn(toast, "warning").mockImplementation(() => "");
	try {
		render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
		setUnit("Width", "50"); // a real change (from 63) but under standard
		expect(warn).not.toHaveBeenCalled();
	} finally {
		warn.mockRestore();
	}
});

test("Reset to defaults restores every setting", () => {
	useUiPrefs.setState({
		printPrefs: {
			...DEFAULT_PRINT_PREFS,
			background: "#123456",
			cardWidthMm: 120,
		},
	});
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	// Sanity: the overridden fill + single-column grid are in effect.
	expect(firstPlaceholder().querySelector("rect")?.getAttribute("fill")).toBe(
		"#123456",
	);

	act(() => {
		fireEvent.click(screen.getByRole("button", { name: /reset to defaults/i }));
	});

	expect(firstPlaceholder().querySelector("rect")?.getAttribute("fill")).toBe(
		DEFAULT_PRINT_PREFS.background,
	);
	const sheet = preview().querySelector(".tcgv-print-sheet") as HTMLElement;
	expect(sheet.style.gridTemplateColumns).toBe("repeat(2, 63mm)");
});

test("print settings persist across dialog remounts (saved in the store)", () => {
	const { unmount } = render(
		<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />,
	);
	setUnit("Text size", "150");
	unmount();

	// Remount reads the persisted store, not a fresh local default → still scaled.
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	expect(within(preview()).getByText("Bulbasaur").style.fontSize).toBe("5.4mm");
});

test("preview sheet is an explicit 2-col grid with a cutting gap (Firefox-safe, not flex)", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	const sheet = preview().querySelector(".tcgv-print-sheet") as HTMLElement;
	expect(sheet.style.gap).toBe("5mm");
	// Explicit column count, not flex-wrap — Firefox print won't wrap flex columns.
	expect(sheet.style.display).toBe("grid");
	expect(sheet.style.gridTemplateColumns).toBe("repeat(2, 63mm)");
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
