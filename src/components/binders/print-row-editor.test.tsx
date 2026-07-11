import { expect, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ContentRow } from "@/store/ui-prefs";
import { CONTENT_TYPES, makeContentRow } from "./print-content-types";
import { PrintRowEditor } from "./print-row-editor";

/** Render the editor and return the captured `onSave` payloads. */
function renderEditor(row: ContentRow | null) {
	const saved: ContentRow[] = [];
	render(
		<PrintRowEditor
			open
			onOpenChange={() => {}}
			row={row}
			onSave={(r) => saved.push(r)}
		/>,
	);
	return saved;
}

function selectType(type: string) {
	act(() => {
		fireEvent.change(screen.getByLabelText("Type"), {
			target: { value: type },
		});
	});
}

function setSize(value: string) {
	const input = screen.getByLabelText("Size") as HTMLInputElement;
	act(() => {
		fireEvent.change(input, { target: { value } });
		fireEvent.blur(input);
	});
}

test("create mode defaults to a card-name row: color + size + spacing, no backdrop/text", () => {
	renderEditor(null);
	expect(screen.getByLabelText("Type")).toBeDefined();
	expect(screen.getByLabelText("Color")).toBeDefined();
	expect(screen.getByLabelText("Size")).toBeDefined();
	expect(screen.getByLabelText("Spacing below")).toBeDefined();
	expect(screen.queryByLabelText("Backdrop")).toBeNull();
	expect(screen.queryByLabelText("Text")).toBeNull();
});

test("cardImage shows only size + spacing (no color control)", () => {
	renderEditor(null);
	selectType("cardImage");
	expect(screen.queryByLabelText("Color")).toBeNull();
	expect(screen.getByLabelText("Size")).toBeDefined();
	expect(screen.getByLabelText("Spacing below")).toBeDefined();
});

test("qr adds a backdrop control alongside color + size", () => {
	renderEditor(null);
	selectType("qr");
	expect(screen.getByLabelText("Color")).toBeDefined();
	expect(screen.getByLabelText("Backdrop")).toBeDefined();
	expect(screen.getByLabelText("Size")).toBeDefined();
});

test("customText adds a text field", () => {
	renderEditor(null);
	selectType("customText");
	expect(screen.getByLabelText("Text")).toBeDefined();
});

test("the shown fields track CONTENT_TYPES[type].fields exactly", () => {
	renderEditor(null);
	const controls = ["color", "size", "ySpacing", "backdrop", "text"] as const;
	const labels: Record<(typeof controls)[number], string> = {
		color: "Color",
		size: "Size",
		ySpacing: "Spacing below",
		backdrop: "Backdrop",
		text: "Text",
	};
	for (const type of Object.keys(
		CONTENT_TYPES,
	) as (keyof typeof CONTENT_TYPES)[]) {
		selectType(type);
		const fields = CONTENT_TYPES[type].fields;
		for (const control of controls) {
			const present = screen.queryByLabelText(labels[control]) !== null;
			expect(present).toBe(fields.includes(control));
		}
	}
});

test("Save creates a row of the selected type with the registry defaults", () => {
	const saved = renderEditor(null);
	selectType("rarity");
	act(() => {
		fireEvent.click(screen.getByRole("button", { name: "Save" }));
	});
	expect(saved).toHaveLength(1);
	expect(saved[0].type).toBe("rarity");
	expect(saved[0].sizeMm).toBe(CONTENT_TYPES.rarity.defaultSizeMm);
	expect(saved[0].ySpacingMm).toBe(3);
});

test("edit mode seeds from the row and Save replaces it by id", () => {
	const existing = makeContentRow("cardName");
	const saved = renderEditor(existing);
	setSize("10");
	act(() => {
		fireEvent.click(screen.getByRole("button", { name: "Save" }));
	});
	expect(saved).toHaveLength(1);
	expect(saved[0].id).toBe(existing.id); // same id → caller replaces in place
	expect(saved[0].sizeMm).toBe(10);
});

test("the color control renders inside the nested dialog and it opts back into pointer events", () => {
	renderEditor(null);
	// A ColorPicker trigger (a real control, not the dead fallback span) is present.
	const trigger = screen.getByLabelText("Color");
	expect(trigger.tagName).toBe("BUTTON");
	// The nested editor content re-enables pointer events so it isn't click-dead
	// under the print Dialog's body pointer-events:none (portal-under-modal gotcha).
	const dialog = screen.getByRole("dialog");
	expect(dialog.className).toContain("pointer-events-auto");
});
