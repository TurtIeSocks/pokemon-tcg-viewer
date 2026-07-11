"use client";

import {
	ChevronDown,
	ChevronUp,
	Pencil,
	Plus,
	RotateCcw,
	Trash2,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Eyebrow } from "@/components/ui/eyebrow";
import { UnitInput } from "@/components/ui/unit-input";
import { isSupportedLanguage } from "@/lib/languages";
import { m } from "@/paraglide/messages";
import { useSlugIndex } from "@/store/corpus/corpus-runtime";
import { getActiveI18nLang } from "@/store/corpus/i18n-active";
import {
	loadPrices,
	syncPrices,
	usePricesRuntime,
} from "@/store/corpus/prices-runtime";
import {
	type ContentRow,
	PRINT_QR_BACKDROP,
	type PrintCard,
	useUiPrefs,
} from "@/store/ui-prefs";
import type { HoloCardData } from "../holo-card/types";
import {
	buildPlaceholderExtras,
	type PlaceholderExtra,
	resolvePlaceholderRow,
} from "./print-extras";
import {
	CARD_HEIGHT_MM,
	CARD_WIDTH_MM,
	mm,
	moveRow,
	PRINT_FIELD,
	PRINTABLE_HEIGHT_MM,
	PRINTABLE_WIDTH_MM,
	pageCount,
	printCountLabel,
	sheetLayout,
	type UnitFieldSpec,
} from "./print-missing";
import { contentTypeLabel, PrintRowEditor } from "./print-row-editor";

/** Warn (once, via a stable toast id so drag-scrubbing can't stack duplicates) when
 * a card dimension is pushed past the real trading-card size and might not fit a
 * binder pocket. No-op at or below standard. */
function warnIfOversized(axis: "width" | "height", value: number) {
	const standard = axis === "width" ? CARD_WIDTH_MM : CARD_HEIGHT_MM;
	if (value <= standard) return;
	toast.warning(
		axis === "width"
			? m.binder_print_wider_title()
			: m.binder_print_taller_title(),
		{
			id: `print-oversize-${axis}`,
			description:
				axis === "width"
					? m.binder_print_oversize_width_desc({ standard })
					: m.binder_print_oversize_height_desc({ standard }),
		},
	);
}

/** Props for {@link PrintMissingDialog}. */
interface PrintMissingDialogProps {
	/** Whether the dialog is open. */
	open: boolean;
	/** Called to request open-state change; caller owns the state. */
	onOpenChange: (open: boolean) => void;
	/** The missing cards to lay out, one placeholder each. */
	cards: HoloCardData[];
}

/**
 * The stacked content of one placeholder: the user's `rows`, resolved against this
 * card, laid out as a vertically-centered column with each row centered
 * horizontally. Null-content rows collapse — {@link resolvePlaceholderRow} returns
 * `null` for an unpriced price row, an art-less image row, a missing rarity/series,
 * etc., and those are filtered out before layout so they reserve no height and no
 * `ySpacingMm` gap (a $0 card simply drops its price line, matching the old fixed
 * output). `ySpacingMm` is the gap BELOW each row, applied as `marginBottom` on all
 * but the last visible row so the block stays centered with no trailing gap.
 *
 * Everything is foreground paint so it reaches paper: text as HTML (kept from the
 * old design so long names still word-wrap), the card image as an `<img>`, and the
 * QR as an inline `<svg>` `<rect>`+`<path>`. CSS backgrounds are dropped by the
 * print pipeline, so none are used for content.
 */
function PlaceholderContent({
	card,
	rows,
	extra,
}: {
	card: HoloCardData;
	rows: ContentRow[];
	extra: PlaceholderExtra | undefined;
}) {
	const visible = rows
		.map((row) => ({ row, content: resolvePlaceholderRow(row, card, extra) }))
		.filter(
			(x): x is { row: ContentRow; content: NonNullable<typeof x.content> } =>
				x.content !== null,
		);

	return (
		<div
			className="tcgv-placeholder-content"
			style={{
				position: "absolute",
				inset: 0,
				boxSizing: "border-box",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				textAlign: "center",
				padding: "3mm",
			}}
		>
			{visible.map(({ row, content }, i) => {
				// Gap below each row, dropped on the last so the column stays centered.
				const marginBottom =
					i === visible.length - 1 ? undefined : mm(row.ySpacingMm);
				if (content.kind === "text") {
					return (
						<div
							key={row.id}
							style={{
								marginBottom,
								fontSize: mm(row.sizeMm),
								color: row.color,
								lineHeight: 1.15,
								maxWidth: "100%",
								wordBreak: "break-word",
							}}
						>
							{content.value}
						</div>
					);
				}
				if (content.kind === "image") {
					// A foreground <img> is required here: this is a print target and CSS
					// backgrounds don't reach paper.
					return (
						<img
							key={row.id}
							src={content.src}
							alt=""
							style={{
								marginBottom,
								height: mm(row.sizeMm),
								width: "auto",
								display: "block",
							}}
						/>
					);
				}
				// qr: an inline SVG in module-count units, drawn at sizeMm square.
				return (
					<svg
						key={row.id}
						width={mm(row.sizeMm)}
						height={mm(row.sizeMm)}
						viewBox={`0 0 ${content.qr.count} ${content.qr.count}`}
						preserveAspectRatio="none"
						aria-hidden="true"
						style={{ marginBottom, display: "block" }}
					>
						<rect
							x={0}
							y={0}
							width={content.qr.count}
							height={content.qr.count}
							fill={row.backdrop ?? PRINT_QR_BACKDROP}
						/>
						<path d={content.qr.path} fill={row.color} />
					</svg>
				);
			})}
		</div>
	);
}

/**
 * The physical sheet of placeholders, laid out at true trading-card size (mm).
 * Rendered twice: once as the on-screen live preview inside the modal, and once
 * into a body-level portal that is the only thing the print stylesheet keeps
 * visible. Both copies read the same `card`/`rows` so preview matches paper exactly.
 *
 * Laid out as a CSS grid with an explicit `columns` count (a `gap` leaves cutting
 * room). NOT flex-wrap: Firefox's print engine mis-lays flex containers in paged
 * media — it won't wrap into the 2nd column, so every card lands on its own row and
 * the page count explodes. Declaring the column count sidesteps that; Chrome is
 * happy either way.
 *
 * The fill + border are painted as an SVG `<rect>`, NOT a CSS background: the print
 * pipeline drops CSS backgrounds (they need the "Background graphics" toggle /
 * `print-color-adjust`, unreliable), but SVG shape fills are foreground paint — the
 * same category as text and borders, which do print — so they always reach paper.
 * `breakInside: avoid` keeps one placeholder from splitting across a page boundary.
 */
function PrintSheet({
	cards,
	card,
	rows,
	columns,
	extras,
}: {
	cards: HoloCardData[];
	card: PrintCard;
	rows: ContentRow[];
	columns: number;
	extras: Map<string, PlaceholderExtra>;
}) {
	// Inset the rect by half the stroke so the border isn't clipped by the viewBox.
	const inset = card.borderMm / 2;
	const width =
		columns * card.widthMm + Math.max(0, columns - 1) * card.spacingMm;
	return (
		<div
			className="tcgv-print-sheet"
			style={{
				display: "grid",
				gridTemplateColumns: `repeat(${Math.max(1, columns)}, ${card.widthMm}mm)`,
				gap: mm(card.spacingMm),
				width: mm(width),
			}}
		>
			{cards.map((c) => (
				<div
					key={c.id}
					className="tcgv-placeholder"
					style={{
						position: "relative",
						width: `${card.widthMm}mm`,
						height: `${card.heightMm}mm`,
						overflow: "hidden",
						breakInside: "avoid",
					}}
				>
					{/* Foreground-painted fill + border. viewBox is in mm units (1 user
					    unit = 1mm) so rx/stroke read as millimetres. */}
					<svg
						width={`${card.widthMm}mm`}
						height={`${card.heightMm}mm`}
						viewBox={`0 0 ${card.widthMm} ${card.heightMm}`}
						preserveAspectRatio="none"
						aria-hidden="true"
						style={{ position: "absolute", inset: 0, display: "block" }}
					>
						<rect
							x={inset}
							y={inset}
							width={card.widthMm - card.borderMm}
							height={card.heightMm - card.borderMm}
							rx={card.radiusMm}
							ry={card.radiusMm}
							fill={card.fillColor}
							stroke={card.borderColor}
							strokeWidth={card.borderMm}
						/>
					</svg>
					<PlaceholderContent card={c} rows={rows} extra={extras.get(c.id)} />
				</div>
			))}
		</div>
	);
}

/**
 * A grouped, labelled cluster of controls: the app's double-bezel (outer shell +
 * inner core) with an eyebrow header. The inner core carries `h-full` so, in a grid
 * row, a shorter column matches a taller neighbour instead of leaving a gap.
 */
function ControlGroup({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<div className="min-w-0 rounded-[calc(var(--r-panel)+6px)] border border-(--hairline) bg-white/4 p-1.5 backdrop-blur-xl">
			<div className="flex h-full flex-col gap-3.5 rounded-(--r-panel) bg-(--bg) p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.10)]">
				<Eyebrow>{label}</Eyebrow>
				<div className="flex h-full flex-col gap-3">{children}</div>
			</div>
		</div>
	);
}

/** A single control laid out as `[label] ......... [control]`. */
function LabeledRow({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<div className="flex items-center justify-between gap-3">
			<span className="text-xs font-medium text-(--ink-muted)">{label}</span>
			{children}
		</div>
	);
}

/** A numeric unit-input row (`[label] ......... [input]`) speaking millimetres. */
function UnitField({
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
		<LabeledRow label={label}>
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
				className="h-9 w-26"
			/>
		</LabeledRow>
	);
}

/** A color-swatch row (`[label] ......... [ColorPicker]`). */
function ColorRow({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<LabeledRow label={label}>
			<ColorPicker
				value={value}
				mode="oklch"
				aria-label={label}
				onChange={onChange}
			/>
		</LabeledRow>
	);
}

/** A small icon action button used in the Column-B row list. */
function IconAction({
	label,
	disabled,
	onClick,
	children,
}: {
	label: string;
	disabled?: boolean;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<Button
			type="button"
			variant="ghost"
			size="icon-sm"
			aria-label={label}
			disabled={disabled}
			onClick={onClick}
		>
			{children}
		</Button>
	);
}

/** One row in the Column-B content list: type label + reorder / edit / remove. */
function ContentRowItem({
	row,
	index,
	total,
	onMove,
	onEdit,
	onRemove,
}: {
	row: ContentRow;
	index: number;
	total: number;
	onMove: (delta: number) => void;
	onEdit: () => void;
	onRemove: () => void;
}) {
	const summary = row.type === "customText" && row.text ? `: ${row.text}` : "";
	return (
		<li className="flex items-center gap-1.5 rounded-(--r-control) border border-(--hairline) bg-white/4 px-3 py-2">
			<span
				className="size-3 shrink-0 rounded-full border border-white/20"
				style={{
					backgroundColor: row.type === "cardImage" ? "transparent" : row.color,
				}}
				aria-hidden="true"
			/>
			<span className="min-w-0 flex-1 truncate text-sm text-(--ink)">
				{contentTypeLabel(row.type)}
				{summary}
			</span>
			<IconAction
				label={m.binder_print_row_move_up()}
				disabled={index === 0}
				onClick={() => onMove(-1)}
			>
				<ChevronUp aria-hidden="true" />
			</IconAction>
			<IconAction
				label={m.binder_print_row_move_down()}
				disabled={index === total - 1}
				onClick={() => onMove(1)}
			>
				<ChevronDown aria-hidden="true" />
			</IconAction>
			<IconAction label={m.binder_print_row_edit()} onClick={onEdit}>
				<Pencil aria-hidden="true" />
			</IconAction>
			<IconAction label={m.binder_print_row_remove()} onClick={onRemove}>
				<Trash2 aria-hidden="true" />
			</IconAction>
		</li>
	);
}

/**
 * Modal to print cut-out placeholders for the cards a collector is missing from a
 * binder — now a two-column builder. Column A ("Card") sets the physical
 * placeholder (size, cut gap, frame); Column B ("Content") is an ordered, editable
 * list of content rows (name, number, price, image, QR, custom text, ...) rendered
 * by {@link PlaceholderContent}. Every setting persists via {@link useUiPrefs};
 * `card.widthMm/heightMm/spacingMm` feed {@link sheetLayout} so the grid auto-fits.
 * See print-missing.ts for the pure helpers and app.css for the @media print sheet.
 */
export function PrintMissingDialog({
	open,
	onOpenChange,
	cards,
}: PrintMissingDialogProps) {
	// Persisted print settings; a single small slice fed to one preview that must
	// re-render on any change, so the whole-object subscription is correct here.
	const printPrefs = useUiPrefs((s) => s.printPrefs);
	const setPrintPrefs = useUiPrefs((s) => s.setPrintPrefs);
	const resetPrintPrefs = useUiPrefs((s) => s.resetPrintPrefs);
	const { card, rows } = printPrefs;

	// The row-editor modal (nested Dialog). `editingRow === null` → create mode.
	const [editorOpen, setEditorOpen] = useState(false);
	const [editingRow, setEditingRow] = useState<ContentRow | null>(null);
	const openEditor = (target: ContentRow | null) => {
		setEditingRow(target);
		setEditorOpen(true);
	};

	// Card size + cut gap drive the grid, so it re-fits as the user resizes.
	const layout = sheetLayout(
		PRINTABLE_WIDTH_MM,
		PRINTABLE_HEIGHT_MM,
		card.widthMm,
		card.heightMm,
		card.spacingMm,
	);
	const count = cards.length;
	const pages = pageCount(count, layout.perPage);

	const canPrint =
		typeof document !== "undefined" && typeof window !== "undefined";

	// Load prices when the dialog opens (the binder page doesn't otherwise fetch
	// them); revalidate the daily blob's date after the instant IDB-first load.
	useEffect(() => {
		if (open) void loadPrices().then(() => syncPrices());
	}, [open]);

	// Precompute each card's price string + QR + image (pure; memoized).
	const pricesById = usePricesRuntime((s) => s.byId);
	const fx = usePricesRuntime((s) => s.meta?.fx ?? null);
	const slugIndex = useSlugIndex();
	const extras = useMemo(() => {
		const active = getActiveI18nLang();
		const activeLang = isSupportedLanguage(active) ? active : "en";
		const origin = typeof window === "undefined" ? "" : window.location.origin;
		return buildPlaceholderExtras({
			cards,
			pricesById,
			fx,
			slugIndex,
			origin,
			activeLang,
		});
	}, [cards, pricesById, fx, slugIndex]);

	const sheet = (
		<PrintSheet
			cards={cards}
			card={card}
			rows={rows}
			columns={layout.columns}
			extras={extras}
		/>
	);

	const handleSaveRow = (saved: ContentRow) => {
		const exists = rows.some((r) => r.id === saved.id);
		const next = exists
			? rows.map((r) => (r.id === saved.id ? saved : r))
			: [...rows, saved];
		setPrintPrefs({ rows: next });
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[95dvh] overflow-y-auto sm:max-w-4xl">
				<DialogHeader>
					<DialogTitle className="font-display">
						{m.binder_print_missing_cards()}
					</DialogTitle>
					<DialogDescription>
						{m.binder_print_dialog_description()}
					</DialogDescription>
				</DialogHeader>

				{count === 0 ? (
					<p className="py-8 text-center text-sm text-(--ink-muted)">
						{m.binder_print_empty()}
					</p>
				) : (
					<div className="flex min-w-0 flex-col gap-4">
						<div className="grid gap-3 sm:grid-cols-2">
							{/* Column A — the physical placeholder. */}
							<ControlGroup label={m.binder_print_column_card()}>
								<UnitField
									label={m.binder_print_label_width()}
									value={card.widthMm}
									spec={PRINT_FIELD.cardWidth}
									onCommit={(n) => {
										setPrintPrefs({ card: { widthMm: n } });
										warnIfOversized("width", n);
									}}
								/>
								<UnitField
									label={m.binder_print_label_height()}
									value={card.heightMm}
									spec={PRINT_FIELD.cardHeight}
									onCommit={(n) => {
										setPrintPrefs({ card: { heightMm: n } });
										warnIfOversized("height", n);
									}}
								/>
								<UnitField
									label={m.binder_print_label_spacing()}
									value={card.spacingMm}
									spec={PRINT_FIELD.spacing}
									onCommit={(n) => setPrintPrefs({ card: { spacingMm: n } })}
								/>
								<UnitField
									label={m.binder_print_label_corner_radius()}
									value={card.radiusMm}
									spec={PRINT_FIELD.radius}
									onCommit={(n) => setPrintPrefs({ card: { radiusMm: n } })}
								/>
								<UnitField
									label={m.binder_print_label_border_width()}
									value={card.borderMm}
									spec={PRINT_FIELD.border}
									onCommit={(n) => setPrintPrefs({ card: { borderMm: n } })}
								/>
								<ColorRow
									label={m.binder_print_label_border()}
									value={card.borderColor}
									onChange={(v) => setPrintPrefs({ card: { borderColor: v } })}
								/>
								<ColorRow
									label={m.binder_print_label_background()}
									value={card.fillColor}
									onChange={(v) => setPrintPrefs({ card: { fillColor: v } })}
								/>
							</ControlGroup>

							{/* Column B — the ordered content rows. */}
							<ControlGroup label={m.binder_print_column_content()}>
								<ul className="flex flex-col gap-2">
									{rows.map((row, i) => (
										<ContentRowItem
											key={row.id}
											row={row}
											index={i}
											total={rows.length}
											onMove={(delta) =>
												setPrintPrefs({ rows: moveRow(rows, i, delta) })
											}
											onEdit={() => openEditor(row)}
											onRemove={() =>
												setPrintPrefs({
													rows: rows.filter((r) => r.id !== row.id),
												})
											}
										/>
									))}
								</ul>
								<Button
									type="button"
									variant="soft"
									className="self-start"
									onClick={() => openEditor(null)}
								>
									<Plus aria-hidden="true" />
									{m.binder_print_add_row()}
								</Button>
							</ControlGroup>
						</div>

						{/* Count feedback */}
						<div className="flex flex-col items-baseline justify-between sm:flex-row">
							<p className="font-mono tabular-nums text-(--ink)">
								{printCountLabel(count)}
							</p>
							<p className="pt-0.5 font-mono text-xs tabular-nums text-(--faint)">
								{m.binder_print_fits_per_sheet({
									count: layout.perPage,
									columns: layout.columns,
									rows: layout.rows,
								})}
							</p>
							<p className="text-xs text-(--ink-muted)">
								{m.binder_print_pages_of_paper({ pages })}
							</p>
						</div>

						{/* On-screen live preview (scrolls; not the print target). */}
						<section
							aria-label={m.binder_print_preview_aria()}
							className="max-h-[55vh] min-w-0 overflow-auto rounded-(--r-panel) border border-(--hairline) bg-(--glass-2) p-4"
						>
							{sheet}
						</section>
					</div>
				)}

				<DialogFooter className="flex-row">
					{count > 0 ? (
						<Button
							type="button"
							variant="ghost"
							onClick={() => resetPrintPrefs()}
						>
							<RotateCcw aria-hidden="true" />
							{m.binder_print_reset_defaults()}
						</Button>
					) : null}
					<div className="grow" />
					<Button
						type="button"
						variant="ghost"
						onClick={() => onOpenChange(false)}
					>
						{m.binder_close()}
					</Button>
					<Button
						type="button"
						variant="soft"
						onClick={() => window.print()}
						disabled={count === 0}
					>
						{m.binder_print_action()}
					</Button>
				</DialogFooter>
			</DialogContent>

			{/* The Add/Edit Row modal, nested over this dialog. */}
			<PrintRowEditor
				open={editorOpen}
				onOpenChange={setEditorOpen}
				row={editingRow}
				onSave={handleSaveRow}
			/>

			{/*
			 * Print target: a body-level portal that escapes the centered dialog box.
			 * Hidden on screen (.tcgv-print-portal { display:none }); the @media print
			 * rule in app.css hides everything else and shows only this. Rendered only
			 * while open + on the client so SSR and closed state stay clean.
			 */}
			{open &&
				count > 0 &&
				canPrint &&
				createPortal(
					<div className="tcgv-print-portal" aria-hidden="true">
						{sheet}
					</div>,
					document.body,
				)}
		</Dialog>
	);
}
