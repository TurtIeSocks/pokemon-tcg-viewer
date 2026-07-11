import { beforeEach, expect, spyOn, test } from "bun:test";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { toast } from "sonner";
import {
	setPricesFetchersForTests,
	usePricesRuntime,
} from "@/store/corpus/prices-runtime";
import { DEFAULT_PRINT_PREFS, useUiPrefs } from "@/store/ui-prefs";
import type { HoloCardData } from "../holo-card/types";
import { PrintMissingDialog } from "./print-missing-dialog";

// Print settings live in a persisted (singleton) store, so reset them before every
// test — otherwise one test's edit leaks into the next. structuredClone so the
// shared DEFAULT constant can never be mutated through the store.
beforeEach(() => {
	useUiPrefs.setState({ printPrefs: structuredClone(DEFAULT_PRINT_PREFS) });
	// The dialog loads prices when it opens; stub the fetchers so tests never hit
	// the wire, and start from a "ready" (empty) cache so loadPrices early-returns.
	setPricesFetchersForTests({
		fetchVersion: async () => {
			throw Object.assign(new Error("unavailable"), { status: 503 });
		},
		fetchBlob: async () => {
			throw Object.assign(new Error("unavailable"), { status: 503 });
		},
	});
	usePricesRuntime.setState({ byId: new Map(), meta: null, status: "ready" });
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

/** Ordered text of each content row rendered in the first placeholder. */
function firstPlaceholderRowText(): string[] {
	const content = firstPlaceholder().querySelector(".tcgv-placeholder-content");
	if (!content) throw new Error("no content column rendered");
	return Array.from(content.children).map((c) => c.textContent ?? "");
}

/** Type a value into a UnitInput and commit it (blur). */
function setUnit(labelText: string, value: string) {
	const input = screen.getByLabelText(labelText) as HTMLInputElement;
	act(() => {
		fireEvent.change(input, { target: { value } });
		fireEvent.blur(input);
	});
}

const rows = () => useUiPrefs.getState().printPrefs.rows;

test("lists the correct 'N cards to print' count", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	expect(screen.getByText("3 cards to print")).toBeDefined();
});

test("renders one placeholder per missing card with name, number, and set lines", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	const p = preview();
	expect(p.querySelectorAll(".tcgv-placeholder")).toHaveLength(3);
	expect(within(p).getByText("Bulbasaur")).toBeDefined();
	expect(within(p).getByText("#1")).toBeDefined();
	expect(within(p).getAllByText("Base Set").length).toBe(3);
});

test("the renderer stacks the rows in order (default: name, number, set)", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	// Price + QR default rows collapse (no price data, no slug) so the visible
	// order is exactly name, number, set.
	expect(firstPlaceholderRowText()).toEqual(["Bulbasaur", "#1", "Base Set"]);
});

test("text rows render at their mm size (default card-name 4.68mm, number 3.64mm)", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	expect(within(preview()).getByText("Bulbasaur").style.fontSize).toBe(
		"4.68mm",
	);
	expect(within(preview()).getByText("#1").style.fontSize).toBe("3.64mm");
});

test("null-content rows collapse: an unpriced card drops its price row", () => {
	// Price only for card "a"; b + c stay unpriced and must omit the price row.
	usePricesRuntime.setState({
		byId: new Map([["a", { tp: { N: [420, 300] } }]]),
		meta: {
			date: "2026-07-03",
			sources: { tp: "2026-07-03", cm: null },
			fx: { base: "EUR", date: "2026-07-03", rates: { USD: 1.09 } },
		},
		status: "ready",
	});
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	// Exactly one placeholder (card a) shows the price line.
	expect(within(preview()).getAllByText("$4.20")).toHaveLength(1);
	// Card a's rows include the price; card b's do not (row omitted, not blank).
	const placeholders = preview().querySelectorAll(".tcgv-placeholder");
	expect(placeholders[0].textContent).toContain("$4.20");
	expect(placeholders[1].textContent).not.toContain("$4.20");
});

test("placeholder paints fill + border as an SVG rect (prints reliably), from the card defaults", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	const rect = firstPlaceholder().querySelector("rect");
	if (!rect) throw new Error("no fill rect rendered");
	const c = DEFAULT_PRINT_PREFS.card;
	expect(rect.getAttribute("fill")).toBe(c.fillColor);
	expect(rect.getAttribute("stroke")).toBe(c.borderColor);
	expect(rect.getAttribute("stroke-width")).toBe(String(c.borderMm));
	expect(rect.getAttribute("rx")).toBe(String(c.radiusMm));
});

test("Column A width patches card.widthMm and re-fits the grid", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	const sheet = () =>
		preview().querySelector(".tcgv-print-sheet") as HTMLElement;
	expect(sheet().style.gridTemplateColumns).toBe("repeat(2, 63mm)");

	setUnit("Width", "120"); // floor((190 + 5) / (120 + 5)) = 1 column
	expect(useUiPrefs.getState().printPrefs.card.widthMm).toBe(120);
	expect(sheet().style.gridTemplateColumns).toBe("repeat(1, 120mm)");
});

test("Column A height patches card.heightMm", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	setUnit("Height", "100");
	expect(useUiPrefs.getState().printPrefs.card.heightMm).toBe(100);
});

test("spacing feeds both the grid gap and the auto-fit", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	const sheet = () =>
		preview().querySelector(".tcgv-print-sheet") as HTMLElement;
	expect(sheet().style.gap).toBe("5mm");
	setUnit("Spacing", "0"); // 3 * 63 = 189 <= 190mm → 3rd column fits again
	expect(useUiPrefs.getState().printPrefs.card.spacingMm).toBe(0);
	expect(sheet().style.gap).toBe("0mm");
	expect(sheet().style.gridTemplateColumns).toBe("repeat(3, 63mm)");
});

test("corner-radius + border-width patch the placeholder rect", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	setUnit("Corner radius", "6");
	expect(firstPlaceholder().querySelector("rect")?.getAttribute("rx")).toBe(
		"6",
	);
	setUnit("Border width", "2");
	expect(
		firstPlaceholder().querySelector("rect")?.getAttribute("stroke-width"),
	).toBe("2");
});

test("Column A exposes a fill + border color control", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	// The registry ColorPicker trigger is labelled by its aria-label.
	expect(screen.getByLabelText("Background")).toBeDefined();
	expect(screen.getByLabelText("Border")).toBeDefined();
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

test("Column B lists a row per content row with a type label", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	// Default rows: Card name, Number, Set name, Price, QR code.
	const list = screen.getByRole("list");
	expect(within(list).getByText("Card name")).toBeDefined();
	expect(within(list).getByText("Number")).toBeDefined();
	expect(within(list).getByText("QR code")).toBeDefined();
});

test("reorder: move-up swaps two rows in the persisted array", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	expect(rows().map((r) => r.type)).toEqual([
		"cardName",
		"number",
		"setName",
		"price",
		"qr",
	]);
	// The 2nd row (number) is index 1 in the enabled move-up buttons list.
	act(() => {
		fireEvent.click(screen.getAllByLabelText("Move up")[1]);
	});
	expect(rows().map((r) => r.type)).toEqual([
		"number",
		"cardName",
		"setName",
		"price",
		"qr",
	]);
	// Preview reflects the new order (number now first).
	expect(firstPlaceholderRowText()).toEqual(["#1", "Bulbasaur", "Base Set"]);
});

test("remove: drops a row from the persisted array", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	// Remove the first row (Card name).
	act(() => {
		fireEvent.click(screen.getAllByLabelText("Remove")[0]);
	});
	const types = rows().map((r) => r.type);
	expect(types).toHaveLength(4);
	expect(types).not.toContain("cardName");
});

test("add row: the editor appends a row of the chosen type with default fields", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	act(() => {
		fireEvent.click(screen.getByRole("button", { name: "Add row" }));
	});
	// Choose a rarity row, then save.
	act(() => {
		fireEvent.change(screen.getByLabelText("Type"), {
			target: { value: "rarity" },
		});
	});
	act(() => {
		fireEvent.click(screen.getByRole("button", { name: "Save" }));
	});
	const all = rows();
	expect(all).toHaveLength(6);
	const added = all[all.length - 1];
	expect(added.type).toBe("rarity");
	expect(added.sizeMm).toBe(3.64); // CONTENT_TYPES.rarity.defaultSizeMm
	expect(added.ySpacingMm).toBe(3);
});

test("Reset to defaults restores the card + rows", () => {
	useUiPrefs.setState({
		printPrefs: {
			card: { ...DEFAULT_PRINT_PREFS.card, fillColor: "#123456", widthMm: 120 },
			rows: [],
		},
	});
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	const sheet = () =>
		preview().querySelector(".tcgv-print-sheet") as HTMLElement;
	expect(firstPlaceholder().querySelector("rect")?.getAttribute("fill")).toBe(
		"#123456",
	);
	expect(sheet().style.gridTemplateColumns).toBe("repeat(1, 120mm)");

	act(() => {
		fireEvent.click(screen.getByRole("button", { name: /reset to defaults/i }));
	});

	expect(firstPlaceholder().querySelector("rect")?.getAttribute("fill")).toBe(
		DEFAULT_PRINT_PREFS.card.fillColor,
	);
	expect(sheet().style.gridTemplateColumns).toBe("repeat(2, 63mm)");
	expect(rows()).toHaveLength(DEFAULT_PRINT_PREFS.rows.length);
});

test("print settings persist across dialog remounts (saved in the store)", () => {
	const { unmount } = render(
		<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />,
	);
	setUnit("Width", "120");
	unmount();
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	const sheet = preview().querySelector(".tcgv-print-sheet") as HTMLElement;
	expect(sheet.style.gridTemplateColumns).toBe("repeat(1, 120mm)");
});

test("preview sheet is an explicit 2-col grid with a cutting gap (Firefox-safe, not flex)", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	const sheet = preview().querySelector(".tcgv-print-sheet") as HTMLElement;
	expect(sheet.style.gap).toBe("5mm");
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
	act(() => {
		fireEvent.click(screen.getByRole("button", { name: "Print" }));
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
	expect(
		screen.queryByRole("region", { name: "Placeholder preview" }),
	).toBeNull();
});
