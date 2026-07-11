"use client";

import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	NativeSelect,
	NativeSelectOption,
} from "@/components/ui/native-select";
import { UnitInput } from "@/components/ui/unit-input";
import { m } from "@/paraglide/messages";
import {
	type ContentRow,
	type ContentRowType,
	PRINT_QR_BACKDROP,
} from "@/store/ui-prefs";
import {
	CONTENT_TYPES,
	type ContentRowField,
	makeContentRow,
} from "./print-content-types";
import { PRINT_FIELD, type UnitFieldSpec } from "./print-missing";

/** The content-row types in the order they appear in the editor's type dropdown. */
const ALL_TYPES: ContentRowType[] = [
	"cardName",
	"number",
	"setName",
	"seriesName",
	"rarity",
	"price",
	"customText",
	"cardImage",
	"qr",
];

/**
 * Human label for a content-row type. Kept here (not the store) because it's the
 * i18n boundary; the dialog imports it for the Column-B row list. Maps each type
 * to its `binder_print_row_*` message (matching `CONTENT_TYPES[type].labelKey`).
 */
const TYPE_LABEL: Record<ContentRowType, () => string> = {
	cardName: m.binder_print_row_card_name,
	number: m.binder_print_row_number,
	setName: m.binder_print_row_set_name,
	seriesName: m.binder_print_row_series_name,
	rarity: m.binder_print_row_rarity,
	price: m.binder_print_row_price,
	customText: m.binder_print_row_custom_text,
	cardImage: m.binder_print_row_card_image,
	qr: m.binder_print_row_qr,
};

export const contentTypeLabel = (type: ContentRowType): string =>
	TYPE_LABEL[type]();

/** A stacked `[label]` over `[control]` form field. A `<div>` (not `<label>`): the
 * controls (color picker, unit input, native select) already carry their own
 * matching `aria-label`, so an implicit label association would be redundant. */
function LabeledField({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<span className="text-xs font-medium text-(--ink-muted)">{label}</span>
			{children}
		</div>
	);
}

/** A `<UnitInput>` bound to a number, formatted + parsed via a {@link UnitFieldSpec}. */
function UnitInputField({
	label,
	value,
	spec,
	onCommit,
}: {
	label: string;
	value: number;
	spec: UnitFieldSpec;
	onCommit: (n: number) => void;
}) {
	return (
		<UnitInput
			unit={spec.unit}
			value={`${Number(value?.toFixed(spec.precision)) || 0}${spec.unit}`}
			min={spec.min}
			max={spec.max}
			step={spec.step}
			precision={spec.precision}
			aria-label={label}
			onChange={(next) => {
				const n = Number.parseFloat(next);
				if (!Number.isNaN(n)) onCommit(n);
			}}
			className="h-9 w-full"
		/>
	);
}

/** Props for {@link PrintRowEditor}. */
interface PrintRowEditorProps {
	/** Whether the editor is open. */
	open: boolean;
	/** Request an open-state change; caller owns the state. */
	onOpenChange: (open: boolean) => void;
	/** The row to edit, or `null` to create a fresh one. */
	row: ContentRow | null;
	/** Persist the built/edited row. The caller appends (new id) or replaces (by id). */
	onSave: (row: ContentRow) => void;
}

/**
 * Nested modal to add or edit one content row. In create mode a type dropdown
 * seeds a fresh {@link makeContentRow}; in edit mode it opens on the existing row.
 * Only the config fields `CONTENT_TYPES[type].fields` lists are shown, in that
 * order — so e.g. `cardImage` has no color control and `qr` gains a backdrop.
 *
 * It renders as a Radix Dialog stacked over the print Dialog. Radix gives each of
 * its own layers (this Dialog's content, the ColorPicker's Popover) `pointer-events:
 * auto` and its own dismissable-layer entry, so clicks land and Escape closes only
 * the top layer — the body `pointer-events:none` trap that bites *foreign*
 * body-portals (see the print portal / the "portal under Radix modal" note) does
 * not apply. `pointer-events-auto` is pinned on the content as belt-and-suspenders,
 * and the type dropdown is a native `<select>` (no portal at all).
 */
export function PrintRowEditor({
	open,
	onOpenChange,
	row,
	onSave,
}: PrintRowEditorProps) {
	// The working copy. Seeded on open so reopening for a different row (or for
	// create) always starts clean rather than keeping the last session's edits.
	const [draft, setDraft] = useState<ContentRow>(
		() => row ?? makeContentRow("cardName"),
	);
	useEffect(() => {
		if (open) setDraft(row ? { ...row } : makeContentRow("cardName"));
	}, [open, row]);

	const type = draft.type;
	const fields = CONTENT_TYPES[type].fields;

	// Switching type rebuilds the draft from that type's defaults (dropping fields
	// the new type doesn't support), but keeps the id so an edit still replaces.
	const changeType = (next: ContentRowType) =>
		setDraft((prev) => ({ ...makeContentRow(next), id: prev.id }));

	const patch = (p: Partial<ContentRow>) =>
		setDraft((prev) => ({ ...prev, ...p }));

	const save = () => {
		onSave(draft);
		onOpenChange(false);
	};

	const renderField = (field: ContentRowField): ReactNode => {
		switch (field) {
			case "text":
				return (
					<LabeledField key={field} label={m.binder_print_row_field_text()}>
						<Input
							value={draft.text ?? ""}
							aria-label={m.binder_print_row_field_text()}
							onChange={(e) => patch({ text: e.target.value })}
							className="h-9"
						/>
					</LabeledField>
				);
			case "color":
				return (
					<LabeledField key={field} label={m.binder_print_row_field_color()}>
						<ColorPicker
							value={draft.color}
							mode="oklch"
							aria-label={m.binder_print_row_field_color()}
							onChange={(v) => patch({ color: v })}
						/>
					</LabeledField>
				);
			case "backdrop":
				return (
					<LabeledField key={field} label={m.binder_print_row_field_backdrop()}>
						<ColorPicker
							value={draft.backdrop ?? PRINT_QR_BACKDROP}
							mode="oklch"
							aria-label={m.binder_print_row_field_backdrop()}
							onChange={(v) => patch({ backdrop: v })}
						/>
					</LabeledField>
				);
			case "size":
				return (
					<LabeledField key={field} label={m.binder_print_row_field_size()}>
						<UnitInputField
							label={m.binder_print_row_field_size()}
							value={draft.sizeMm}
							spec={PRINT_FIELD.rowSize}
							onCommit={(n) => patch({ sizeMm: n })}
						/>
					</LabeledField>
				);
			case "ySpacing":
				return (
					<LabeledField
						key={field}
						label={m.binder_print_row_field_y_spacing()}
					>
						<UnitInputField
							label={m.binder_print_row_field_y_spacing()}
							value={draft.ySpacingMm}
							spec={PRINT_FIELD.rowSpacing}
							onCommit={(n) => patch({ ySpacingMm: n })}
						/>
					</LabeledField>
				);
			default:
				return null;
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				aria-describedby={undefined}
				className="pointer-events-auto sm:max-w-md"
			>
				<DialogHeader>
					<DialogTitle className="font-display">
						{row
							? m.binder_print_row_editor_edit_title()
							: m.binder_print_add_row()}
					</DialogTitle>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<LabeledField label={m.binder_print_row_field_type()}>
						<NativeSelect
							value={type}
							aria-label={m.binder_print_row_field_type()}
							onChange={(e) => changeType(e.target.value as ContentRowType)}
						>
							{ALL_TYPES.map((t) => (
								<NativeSelectOption key={t} value={t}>
									{contentTypeLabel(t)}
								</NativeSelectOption>
							))}
						</NativeSelect>
					</LabeledField>

					{fields.map((field) => renderField(field))}
				</div>

				<DialogFooter className="flex-row justify-end">
					<Button
						type="button"
						variant="ghost"
						onClick={() => onOpenChange(false)}
					>
						{m.binder_close()}
					</Button>
					<Button type="button" variant="soft" onClick={save}>
						{m.binder_print_row_save()}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
