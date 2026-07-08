"use client";

import { RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
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
import { useUiPrefs } from "@/store/ui-prefs";
import type { HoloCardData } from "../holo-card/types";
import {
	CARD_HEIGHT_MM,
	CARD_WIDTH_MM,
	PLACEHOLDER_GAP_MM,
	PRINTABLE_HEIGHT_MM,
	PRINTABLE_WIDTH_MM,
	pageCount,
	placeholderMeta,
	printCountLabel,
	sheetLayout,
} from "./print-missing";

/** Base text sizes (mm). The text-size control scales BOTH by the same factor, so
 * the name/meta proportion is preserved. */
const NAME_MM = 3.6;
const META_MM = 2.8;

/** Bounds for each numeric unit-input. Defaults + current values live in the
 * persisted store (`useUiPrefs.printPrefs`) so choices survive across sessions. */
const FIELD = {
	cardWidth: { unit: "mm", min: 20, max: 120, step: 1, precision: 0 },
	cardHeight: { unit: "mm", min: 20, max: 180, step: 1, precision: 0 },
	radius: { unit: "mm", min: 0, max: 8, step: 0.5, precision: 1 },
	border: { unit: "mm", min: 0, max: 3, step: 0.1, precision: 2 },
	// Text size is a multiplier stored as 0.6..1.8; shown/edited as a percent.
	textPct: { unit: "%", min: 60, max: 180, step: 5, precision: 0 },
} as const;

/** Format a millimetre length, rounded to 0.01mm so float math (3.6 * 1.5) never
 * leaks "5.399999…mm" into the DOM or the printed sheet. */
const mm = (n: number) => `${Math.round(n * 100) / 100}mm`;

/** Warn (once, via a stable toast id so drag-scrubbing can't stack duplicates) when
 * a card dimension is pushed past the real trading-card size and might not fit a
 * binder pocket. No-op at or below standard. */
function warnIfOversized(axis: "width" | "height", value: number) {
	const standard = axis === "width" ? CARD_WIDTH_MM : CARD_HEIGHT_MM;
	if (value <= standard) return;
	toast.warning(
		axis === "width"
			? "Wider than a standard card"
			: "Taller than a standard card",
		{
			id: `print-oversize-${axis}`,
			description: `Standard ${axis} is ${standard}mm. Placeholders this ${
				axis === "width" ? "wide" : "tall"
			} may not fit in binder pockets.`,
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

interface PrintSheetProps {
	cards: HoloCardData[];
	background: string;
	textColor: string;
	borderColor: string;
	/** Corner radius in millimetres (the card-silhouette rounding). */
	radiusMm: number;
	/** Border thickness in millimetres (SVG stroke width). */
	borderMm: number;
	/** Multiplier applied to both text lines, preserving their ratio. */
	textScale: number;
	/** Placeholder dimensions in millimetres. */
	cardWidthMm: number;
	cardHeightMm: number;
	columns: number;
	/** Whitespace (mm) between adjacent placeholders, for cutting room. */
	gapMm: number;
}

/**
 * The physical sheet of placeholders, laid out at true trading-card size (mm).
 * Rendered twice: once as the on-screen live preview inside the modal, and once
 * into a body-level portal that is the only thing the print stylesheet keeps
 * visible. Both copies read the same props so preview matches paper exactly.
 *
 * Laid out as a CSS grid with an explicit `columns` count (a `gap` leaves cutting
 * room). NOT flex-wrap: Firefox's print engine mis-lays flex containers in paged
 * media — it won't wrap into the 2nd column, so every card lands on its own row and
 * the page count explodes. Declaring the column count sidesteps the container-width
 * wrapping that Firefox botches; Chrome is happy either way.
 *
 * The fill + border are painted as an SVG `<rect>`, NOT a CSS background. The print
 * pipeline drops CSS backgrounds (they need the "Background graphics" toggle /
 * `print-color-adjust`, which is unreliable), but SVG shape fills are foreground
 * paint — the same category as text and borders, which do print — so they always
 * reach paper. The card name/meta stay HTML on top so long names still word-wrap.
 * `breakInside: avoid` keeps one placeholder from splitting across a page boundary.
 */
function PrintSheet({
	cards,
	background,
	textColor,
	borderColor,
	radiusMm,
	borderMm,
	textScale,
	cardWidthMm,
	cardHeightMm,
	columns,
	gapMm,
}: PrintSheetProps) {
	const width = columns * cardWidthMm + Math.max(0, columns - 1) * gapMm;
	// Inset the rect by half the stroke so the border isn't clipped by the viewBox.
	const inset = borderMm / 2;
	return (
		<div
			className="tcgv-print-sheet"
			style={{
				display: "grid",
				gridTemplateColumns: `repeat(${Math.max(1, columns)}, ${cardWidthMm}mm)`,
				gap: mm(gapMm),
				width: mm(width),
			}}
		>
			{cards.map((card) => (
				<div
					key={card.id}
					className="tcgv-placeholder"
					style={{
						position: "relative",
						width: `${cardWidthMm}mm`,
						height: `${cardHeightMm}mm`,
						overflow: "hidden",
						breakInside: "avoid",
					}}
				>
					{/* Foreground-painted fill + border (see PrintSheet docs). viewBox is in
					    mm units (1 user unit = 1mm) so rx/stroke read as millimetres. */}
					<svg
						width={`${cardWidthMm}mm`}
						height={`${cardHeightMm}mm`}
						viewBox={`0 0 ${cardWidthMm} ${cardHeightMm}`}
						preserveAspectRatio="none"
						aria-hidden="true"
						style={{ position: "absolute", inset: 0, display: "block" }}
					>
						<rect
							x={inset}
							y={inset}
							width={cardWidthMm - borderMm}
							height={cardHeightMm - borderMm}
							rx={radiusMm}
							ry={radiusMm}
							fill={background}
							stroke={borderColor}
							strokeWidth={borderMm}
						/>
					</svg>
					<div
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
							color: textColor,
						}}
					>
						<div
							style={{
								fontWeight: 700,
								fontSize: mm(NAME_MM * textScale),
								lineHeight: 1.15,
								wordBreak: "break-word",
							}}
						>
							{card.name}
						</div>
						<div
							style={{
								marginTop: "2mm",
								fontSize: mm(META_MM * textScale),
								opacity: 0.85,
							}}
						>
							{placeholderMeta(card)}
						</div>
					</div>
				</div>
			))}
		</div>
	);
}

/**
 * A grouped, labelled cluster of controls: the app's double-bezel (outer shell +
 * inner core) with an eyebrow header. Inlined rather than using {@link BezelPanel}
 * so the inner core carries `h-full`: in a grid the outer shell already stretches
 * to the row height (align-items: stretch), so the inner core fills it and a shorter
 * group (Card size) matches a taller neighbour (Style) instead of leaving a gap.
 * The outer shell has NO `h-full` — that would balloon the full-width Colors group.
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
				<div className="flex flex-col gap-3">{children}</div>
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

interface UnitFieldSpec {
	unit: string;
	min: number;
	max: number;
	step: number;
	precision: number;
}

/** A numeric unit-input row. `value`/`onCommit` speak the display unit (mm, or %
 * for text size); the caller maps % back to the stored multiplier. */
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
				value={`${Number(value.toFixed(spec.precision))}${spec.unit}`}
				min={spec.min}
				max={spec.max}
				step={spec.step}
				precision={spec.precision}
				aria-label={label}
				onChange={(next) => {
					const n = Number.parseFloat(next);
					if (!Number.isNaN(n)) onCommit(n);
				}}
				className="h-9 w-[104px]"
			/>
		</LabeledRow>
	);
}

/** A labelled color picker (stacked label + swatch trigger). */
function ColorField({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (next: string) => void;
}) {
	return (
		<div className="flex flex-col items-start gap-1.5">
			<span className="text-xs font-medium text-(--ink-muted)">{label}</span>
			<ColorPicker value={value} onChange={onChange} />
		</div>
	);
}

/**
 * Modal to print cut-out placeholders for the cards a collector is missing from
 * a binder. Chrome is liquid-glass (via {@link Dialog}); the placeholders and
 * print sheet are deliberately print-oriented (user-chosen colors, real mm
 * sizing, high contrast, card-silhouette rounding) rather than glass. The
 * customizing settings persist via {@link useUiPrefs}, and card width/height feed
 * {@link sheetLayout} so the grid auto-fits more or fewer cards per sheet. See
 * print-missing.ts for the pure layout helpers and app.css for the @media print
 * stylesheet.
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
	const {
		background,
		textColor,
		borderColor,
		radiusMm,
		borderMm,
		textScale,
		cardWidthMm,
		cardHeightMm,
	} = printPrefs;

	// Card dimensions drive the grid, so it re-fits as the user resizes the card.
	const layout = sheetLayout(
		PRINTABLE_WIDTH_MM,
		PRINTABLE_HEIGHT_MM,
		cardWidthMm,
		cardHeightMm,
		PLACEHOLDER_GAP_MM,
	);
	const count = cards.length;
	const pages = pageCount(count, layout.perPage);

	const canPrint =
		typeof document !== "undefined" && typeof window !== "undefined";

	const sheet = (
		<PrintSheet
			cards={cards}
			background={background}
			textColor={textColor}
			borderColor={borderColor}
			radiusMm={radiusMm}
			borderMm={borderMm}
			textScale={textScale}
			cardWidthMm={cardWidthMm}
			cardHeightMm={cardHeightMm}
			columns={layout.columns}
			gapMm={PLACEHOLDER_GAP_MM}
		/>
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle className="font-display">
						Print missing cards
					</DialogTitle>
					<DialogDescription>
						Print a placeholder for every card you are missing, then cut them
						out and slot them into your binder as gap markers.
					</DialogDescription>
				</DialogHeader>

				{count === 0 ? (
					<p className="py-8 text-center text-sm text-(--ink-muted)">
						You own every card in this binder. Nothing to print.
					</p>
				) : (
					<div className="flex min-w-0 flex-col gap-4">
						{/* Grouped controls: colors, then card size + style side by side. */}
						<ControlGroup label="Colors">
							<div className="grid grid-cols-3 gap-4">
								<ColorField
									label="Background"
									value={background}
									onChange={(v) => setPrintPrefs({ background: v })}
								/>
								<ColorField
									label="Text"
									value={textColor}
									onChange={(v) => setPrintPrefs({ textColor: v })}
								/>
								<ColorField
									label="Border"
									value={borderColor}
									onChange={(v) => setPrintPrefs({ borderColor: v })}
								/>
							</div>
						</ControlGroup>

						<div className="grid gap-3 sm:grid-cols-2">
							<ControlGroup label="Card size">
								<UnitField
									label="Width"
									value={cardWidthMm}
									spec={FIELD.cardWidth}
									onCommit={(n) => {
										setPrintPrefs({ cardWidthMm: n });
										warnIfOversized("width", n);
									}}
								/>
								<UnitField
									label="Height"
									value={cardHeightMm}
									spec={FIELD.cardHeight}
									onCommit={(n) => {
										setPrintPrefs({ cardHeightMm: n });
										warnIfOversized("height", n);
									}}
								/>
								<p className="pt-0.5 font-mono text-xs tabular-nums text-(--faint)">
									Fits {layout.perPage} per sheet ({layout.columns} ×{" "}
									{layout.rows})
								</p>
							</ControlGroup>

							<ControlGroup label="Style">
								<UnitField
									label="Corner radius"
									value={radiusMm}
									spec={FIELD.radius}
									onCommit={(n) => setPrintPrefs({ radiusMm: n })}
								/>
								<UnitField
									label="Border width"
									value={borderMm}
									spec={FIELD.border}
									onCommit={(n) => setPrintPrefs({ borderMm: n })}
								/>
								<UnitField
									label="Text size"
									value={textScale * 100}
									spec={FIELD.textPct}
									onCommit={(n) => setPrintPrefs({ textScale: n / 100 })}
								/>
							</ControlGroup>
						</div>

						{/* Count feedback */}
						<div className="flex items-baseline justify-between">
							<p className="font-mono tabular-nums text-(--ink)">
								{printCountLabel(count)}
							</p>
							<p className="text-xs text-(--ink-muted)">
								About {pages} {pages === 1 ? "sheet" : "sheets"} of paper.
							</p>
						</div>

						{/* On-screen live preview (scrolls; not the print target). min-w-0 +
						    overflow keeps the true-size sheet inside the modal box. */}
						<section
							aria-label="Placeholder preview"
							className="max-h-[55vh] min-w-0 overflow-auto rounded-(--r-panel) border border-(--hairline) bg-(--glass-2) p-4"
						>
							{sheet}
						</section>
					</div>
				)}

				<DialogFooter className="sm:justify-between">
					{count > 0 ? (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => resetPrintPrefs()}
						>
							<RotateCcw aria-hidden="true" />
							Reset to defaults
						</Button>
					) : null}
					<div className="flex gap-2 sm:ml-auto">
						<Button
							type="button"
							variant="ghost"
							onClick={() => onOpenChange(false)}
						>
							Close
						</Button>
						<Button
							type="button"
							variant="soft"
							onClick={() => window.print()}
							disabled={count === 0}
						>
							Print
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>

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
