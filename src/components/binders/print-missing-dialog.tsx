"use client";

import { createPortal } from "react-dom";
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
import { Label } from "@/components/ui/label";
import { useUiPrefs } from "@/store/ui-prefs";
import type { HoloCardData } from "../holo-card/types";
import {
	CARD_HEIGHT_MM,
	CARD_WIDTH_MM,
	PLACEHOLDER_GAP_MM,
	pageCount,
	placeholderMeta,
	printCountLabel,
	sheetLayout,
} from "./print-missing";

/** Slider bounds. Defaults + current values live in the persisted store
 * (`useUiPrefs.printPrefs`) so a collector's choices survive across sessions. */
const MAX_RADIUS_MM = 8;

/** Base text sizes (mm). The text-size slider scales BOTH by the same factor, so
 * the name/meta proportion is preserved. */
const NAME_MM = 3.6;
const META_MM = 2.8;
const MIN_TEXT_SCALE = 0.6;
const MAX_TEXT_SCALE = 1.8;

/** Border stroke width (mm) of a placeholder, ~1px at 96dpi. Painted as an SVG
 * stroke (foreground) so it prints; see {@link PrintSheet}. */
const BORDER_MM = 0.3;

/** Format a millimetre length, rounded to 0.01mm so float math (3.6 * 1.5) never
 * leaks "5.399999…mm" into the DOM or the printed sheet. */
const mm = (n: number) => `${Math.round(n * 100) / 100}mm`;

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
	/** Multiplier applied to both text lines, preserving their ratio. */
	textScale: number;
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
	textScale,
	columns,
	gapMm,
}: PrintSheetProps) {
	const width = columns * CARD_WIDTH_MM + Math.max(0, columns - 1) * gapMm;
	// Inset the rect by half the stroke so the border isn't clipped by the viewBox.
	const inset = BORDER_MM / 2;
	return (
		<div
			className="tcgv-print-sheet"
			style={{
				display: "grid",
				gridTemplateColumns: `repeat(${Math.max(1, columns)}, ${CARD_WIDTH_MM}mm)`,
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
						width: `${CARD_WIDTH_MM}mm`,
						height: `${CARD_HEIGHT_MM}mm`,
						overflow: "hidden",
						breakInside: "avoid",
					}}
				>
					{/* Foreground-painted fill + border (see PrintSheet docs). viewBox is in
					    mm units (1 user unit = 1mm) so rx/stroke read as millimetres. */}
					<svg
						width={`${CARD_WIDTH_MM}mm`}
						height={`${CARD_HEIGHT_MM}mm`}
						viewBox={`0 0 ${CARD_WIDTH_MM} ${CARD_HEIGHT_MM}`}
						preserveAspectRatio="none"
						aria-hidden="true"
						style={{ position: "absolute", inset: 0, display: "block" }}
					>
						<rect
							x={inset}
							y={inset}
							width={CARD_WIDTH_MM - BORDER_MM}
							height={CARD_HEIGHT_MM - BORDER_MM}
							rx={radiusMm}
							ry={radiusMm}
							fill={background}
							stroke={borderColor}
							strokeWidth={BORDER_MM}
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

/** A labelled color-picker control (registry ColorPicker: swatch trigger + oklch popover). */
function ColorControl({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (next: string) => void;
}) {
	return (
		<div className="flex flex-col gap-2">
			<span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-(--faint)">
				{label}
			</span>
			<ColorPicker value={value} onChange={(next) => onChange(next)} />
		</div>
	);
}

/** A labelled range slider with a formatted read-out. */
function SliderControl({
	id,
	label,
	value,
	min,
	max,
	step,
	ariaLabel,
	format,
	onChange,
}: {
	id: string;
	label: string;
	value: number;
	min: number;
	max: number;
	step: number;
	ariaLabel: string;
	format: (v: number) => string;
	onChange: (v: number) => void;
}) {
	return (
		<div className="flex flex-col gap-2">
			<Label
				htmlFor={id}
				className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-(--faint)"
			>
				{label}
			</Label>
			<div className="flex h-9 items-center gap-3">
				<input
					id={id}
					type="range"
					min={min}
					max={max}
					step={step}
					value={value}
					aria-label={ariaLabel}
					onChange={(e) => onChange(Number(e.target.value))}
					className="w-32 accent-(--primary)"
				/>
				<span className="min-w-[3.5ch] font-mono text-xs tabular-nums text-(--ink-muted)">
					{format(value)}
				</span>
			</div>
		</div>
	);
}

/**
 * Modal to print cut-out placeholders for the cards a collector is missing from
 * a binder. Chrome is liquid-glass (via {@link Dialog}); the placeholders and
 * print sheet are deliberately print-oriented (user-chosen colors, real mm
 * sizing, high contrast, card-silhouette rounding) rather than glass. The
 * customizing settings persist via {@link useUiPrefs}. See print-missing.ts for
 * the pure layout helpers and app.css for the @media print stylesheet.
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
	const { background, textColor, borderColor, radiusMm, textScale } =
		printPrefs;

	const layout = sheetLayout();
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
			textScale={textScale}
			columns={layout.columns}
			gapMm={PLACEHOLDER_GAP_MM}
		/>
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-3xl">
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
					<div className="flex min-w-0 flex-col gap-5">
						{/* Color + shape controls. Transparency lives in each picker's alpha
						    strip, so there is no separate toggle. */}
						<div className="flex flex-wrap items-end gap-x-8 gap-y-4">
							<ColorControl
								label="Background"
								value={background}
								onChange={(v) => setPrintPrefs({ background: v })}
							/>
							<ColorControl
								label="Text color"
								value={textColor}
								onChange={(v) => setPrintPrefs({ textColor: v })}
							/>
							<ColorControl
								label="Border color"
								value={borderColor}
								onChange={(v) => setPrintPrefs({ borderColor: v })}
							/>
							<SliderControl
								id="print-radius"
								label="Corner radius"
								value={radiusMm}
								min={0}
								max={MAX_RADIUS_MM}
								step={0.5}
								ariaLabel="Corner radius in millimetres"
								format={(v) => `${v}mm`}
								onChange={(v) => setPrintPrefs({ radiusMm: v })}
							/>
							<SliderControl
								id="print-text-size"
								label="Text size"
								value={textScale}
								min={MIN_TEXT_SCALE}
								max={MAX_TEXT_SCALE}
								step={0.1}
								ariaLabel="Text size"
								format={(v) => `${Math.round(v * 100)}%`}
								onChange={(v) => setPrintPrefs({ textScale: v })}
							/>
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

				<DialogFooter>
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
