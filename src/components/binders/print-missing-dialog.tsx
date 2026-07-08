"use client";

import { useState } from "react";
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
import type { HoloCardData } from "../holo-card/types";
import {
	CARD_HEIGHT_MM,
	CARD_WIDTH_MM,
	pageCount,
	placeholderMeta,
	printCountLabel,
	sheetLayout,
} from "./print-missing";

/** Print-friendly defaults: white fill, near-black text + border (least ink, high
 * contrast). Radius ~3mm ≈ a real trading-card corner, so a placeholder reads as
 * a card silhouette out of the box. Transparency is set via the picker's own
 * alpha strip (an 8-digit color with alpha 0), so there is no separate toggle. */
const DEFAULT_BG = "#ffffff";
const DEFAULT_TEXT = "#111111";
const DEFAULT_BORDER = "#111111";
const DEFAULT_RADIUS_MM = 3;
const MAX_RADIUS_MM = 8;

/** Base text sizes (mm). The text-size slider scales BOTH by the same factor, so
 * the name/meta proportion is preserved. */
const NAME_MM = 3.6;
const META_MM = 2.8;
const MIN_TEXT_SCALE = 0.6;
const MAX_TEXT_SCALE = 1.8;

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
}

/**
 * The physical sheet of placeholders, laid out at true trading-card size (mm).
 * Rendered twice: once as the on-screen live preview inside the modal, and once
 * into a body-level portal that is the only thing the print stylesheet keeps
 * visible. Both copies read the same props so preview matches paper exactly.
 *
 * `printColorAdjust: exact` forces the chosen background/border colors to actually
 * print (browsers drop them from print output by default). Each placeholder is a
 * rounded, bordered card silhouette; `breakInside: avoid` keeps one from splitting
 * across a page boundary.
 */
function PrintSheet({
	cards,
	background,
	textColor,
	borderColor,
	radiusMm,
	textScale,
	columns,
}: PrintSheetProps) {
	return (
		<div
			className="tcgv-print-sheet"
			style={{
				width: `${columns * CARD_WIDTH_MM}mm`,
				display: "flex",
				flexWrap: "wrap",
			}}
		>
			{cards.map((card) => (
				<div
					key={card.id}
					className="tcgv-placeholder"
					style={{
						width: `${CARD_WIDTH_MM}mm`,
						height: `${CARD_HEIGHT_MM}mm`,
						boxSizing: "border-box",
						borderWidth: "1px",
						borderStyle: "solid",
						borderColor,
						borderRadius: `${radiusMm}mm`,
						backgroundColor: background,
						color: textColor,
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						justifyContent: "center",
						textAlign: "center",
						padding: "3mm",
						overflow: "hidden",
						breakInside: "avoid",
						printColorAdjust: "exact",
						WebkitPrintColorAdjust: "exact",
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
			<span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">
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
				className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]"
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
					className="w-32 accent-[var(--primary)]"
				/>
				<span className="min-w-[3.5ch] font-mono text-xs tabular-nums text-[var(--ink-muted)]">
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
 * sizing, high contrast, card-silhouette rounding) rather than glass. See
 * print-missing.ts for the pure layout helpers and app.css for the @media print
 * stylesheet.
 */
export function PrintMissingDialog({
	open,
	onOpenChange,
	cards,
}: PrintMissingDialogProps) {
	const [background, setBackground] = useState(DEFAULT_BG);
	const [textColor, setTextColor] = useState(DEFAULT_TEXT);
	const [borderColor, setBorderColor] = useState(DEFAULT_BORDER);
	const [radiusMm, setRadiusMm] = useState(DEFAULT_RADIUS_MM);
	const [textScale, setTextScale] = useState(1);

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
					<p className="py-8 text-center text-sm text-[var(--ink-muted)]">
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
								onChange={setBackground}
							/>
							<ColorControl
								label="Text color"
								value={textColor}
								onChange={setTextColor}
							/>
							<ColorControl
								label="Border color"
								value={borderColor}
								onChange={setBorderColor}
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
								onChange={setRadiusMm}
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
								onChange={setTextScale}
							/>
						</div>

						{/* Count feedback */}
						<div className="flex items-baseline justify-between">
							<p className="font-mono tabular-nums text-[var(--ink)]">
								{printCountLabel(count)}
							</p>
							<p className="text-xs text-[var(--ink-muted)]">
								About {pages} {pages === 1 ? "sheet" : "sheets"} of paper.
							</p>
						</div>

						{/* On-screen live preview (scrolls; not the print target). min-w-0 +
						    overflow keeps the true-size sheet inside the modal box. */}
						<section
							aria-label="Placeholder preview"
							className="max-h-[55vh] min-w-0 overflow-auto rounded-[var(--r-panel)] border border-[var(--hairline)] bg-[var(--glass-2)] p-4"
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
