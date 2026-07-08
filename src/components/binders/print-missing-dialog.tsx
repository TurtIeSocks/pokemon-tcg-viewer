"use client";

import { RotateCcw } from "lucide-react";
import { type ReactNode, useEffect, useMemo } from "react";
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
import { useSlugIndex } from "@/store/corpus/corpus-runtime";
import { getActiveI18nLang } from "@/store/corpus/i18n-active";
import {
	loadPrices,
	syncPrices,
	usePricesRuntime,
} from "@/store/corpus/prices-runtime";
import { type PrintPrefs, useUiPrefs } from "@/store/ui-prefs";
import type { HoloCardData } from "../holo-card/types";
import { buildPlaceholderExtras, type PlaceholderExtra } from "./print-extras";
import {
	CARD_HEIGHT_MM,
	CARD_WIDTH_MM,
	PRINTABLE_HEIGHT_MM,
	PRINTABLE_WIDTH_MM,
	pageCount,
	printCountLabel,
	sheetLayout,
} from "./print-missing";

/** Bounds for each numeric unit-input. Defaults + current values live in the
 * persisted store (`useUiPrefs.printPrefs`) so choices survive across sessions. */
const FIELD = {
	cardWidth: { unit: "mm", min: 20, max: 120, step: 1, precision: 0 },
	cardHeight: { unit: "mm", min: 20, max: 180, step: 1, precision: 0 },
	spacing: { unit: "mm", min: 0, max: 20, step: 0.5, precision: 1 },
	radius: { unit: "mm", min: 0, max: 8, step: 0.5, precision: 1 },
	border: { unit: "mm", min: 0, max: 3, step: 0.1, precision: 2 },
	fontLine: { unit: "mm", min: 1, max: 12, step: 0.5, precision: 1 },
	// Text size is a multiplier stored as 0.6..1.8; shown/edited as a percent.
	textPct: { unit: "%", min: 60, max: 180, step: 5, precision: 0 },
	// QR is a square; size is its side length in mm.
	qrSize: { unit: "mm", min: 10, max: 40, step: 1, precision: 0 },
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

/**
 * The optional price line + QR code appended below a placeholder's text lines.
 * Price is the card's formatted market value; the QR encodes its /prices page.
 * Both are foreground paint (HTML text / SVG `<rect>` + `<path>`) so they reach
 * paper (CSS backgrounds don't print). Each is hidden when its pref is off or its
 * data is unavailable: an unpriced card (`price: null`) or an unresolved slug
 * (`qr: null`). QR is fixed black-on-white for scan reliability, independent of the
 * user's chosen placeholder colors.
 */
function PlaceholderExtras({
	extra,
	showPrice,
	priceSizeMm,
	showQr,
	qrSizeMm,
	textScale,
}: {
	extra: PlaceholderExtra | undefined;
	showPrice: boolean;
	priceSizeMm: number;
	showQr: boolean;
	qrSizeMm: number;
	textScale: number;
}) {
	return (
		<>
			{showPrice && extra?.price ? (
				<div
					style={{
						marginTop: "3mm",
						fontWeight: 700,
						fontSize: mm(priceSizeMm * textScale),
						fontVariantNumeric: "tabular-nums",
					}}
				>
					{extra.price}
				</div>
			) : null}
			{showQr && extra?.qr ? (
				<svg
					width={mm(qrSizeMm)}
					height={mm(qrSizeMm)}
					viewBox={`0 0 ${extra.qr.count} ${extra.qr.count}`}
					preserveAspectRatio="none"
					aria-hidden="true"
					style={{ marginTop: "3mm", display: "block" }}
				>
					<rect
						x={0}
						y={0}
						width={extra.qr.count}
						height={extra.qr.count}
						fill="#ffffff"
					/>
					<path d={extra.qr.path} fill="#000000" />
				</svg>
			) : null}
		</>
	);
}

/**
 * The physical sheet of placeholders, laid out at true trading-card size (mm).
 * Rendered twice: once as the on-screen live preview inside the modal, and once
 * into a body-level portal that is the only thing the print stylesheet keeps
 * visible. Both copies read the same `prefs` so preview matches paper exactly.
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
 * reach paper. Name / number / set name are separate HTML lines on top (each
 * independently shown/sized) so long names still word-wrap. `breakInside: avoid`
 * keeps one placeholder from splitting across a page boundary.
 */
function PrintSheet({
	cards,
	prefs,
	columns,
	extras,
}: {
	cards: HoloCardData[];
	prefs: PrintPrefs;
	columns: number;
	extras: Map<string, PlaceholderExtra>;
}) {
	const {
		background,
		textColor,
		borderColor,
		radiusMm,
		borderMm,
		textScale,
		cardWidthMm,
		cardHeightMm,
		gapMm,
		showName,
		nameSizeMm,
		showNumber,
		numberSizeMm,
		showSetName,
		setNameSizeMm,
		showPrice,
		priceSizeMm,
		showQr,
		qrSizeMm,
	} = prefs;
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
						{showName ? (
							<div
								style={{
									fontWeight: 700,
									fontSize: mm(nameSizeMm * textScale),
									lineHeight: 1.15,
									wordBreak: "break-word",
								}}
							>
								{card.name}
							</div>
						) : null}
						{showNumber ? (
							<div
								style={{
									marginTop: "3mm",
									fontSize: mm(numberSizeMm * textScale),
									opacity: 0.85,
								}}
							>
								#{card.cardNumber}
							</div>
						) : null}
						{showSetName ? (
							<div
								style={{
									marginTop: "3mm",
									fontSize: mm(setNameSizeMm * textScale),
									opacity: 0.85,
								}}
							>
								{card.setName}
							</div>
						) : null}
						<PlaceholderExtras
							extra={extras.get(card.id)}
							showPrice={showPrice}
							priceSizeMm={priceSizeMm}
							showQr={showQr}
							qrSizeMm={qrSizeMm}
							textScale={textScale}
						/>
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
 * group matches a taller neighbour in the same row instead of leaving a gap.
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
				<div className="flex flex-col gap-3 h-full justify-evenly">
					{children}
				</div>
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

/** The `<UnitInput>` for a numeric field, formatted from a number and parsed back. */
function NumberUnitInput({
	label,
	value,
	spec,
	disabled,
	onCommit,
}: {
	label: string;
	value: number;
	spec: UnitFieldSpec;
	disabled?: boolean;
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
			disabled={disabled}
			aria-label={label}
			onChange={(next) => {
				const n = Number.parseFloat(next);
				if (!Number.isNaN(n)) onCommit(n);
			}}
			className="h-9 w-26"
		/>
	);
}

/** A numeric unit-input row (`[label] ......... [input]`). `value`/`onCommit` speak
 * the display unit (mm, or % for text size); the caller maps % to the multiplier. */
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
			<NumberUnitInput
				label={label}
				value={value}
				spec={spec}
				onCommit={onCommit}
			/>
		</LabeledRow>
	);
}

/** A togglable text line: `[label] ..... [checkbox] [size input]`. The checkbox
 * shows/hides the line on the placeholder; the input sets its base font size (mm).
 * When hidden, the size input is disabled. */
function FontSizeField({
	label,
	shown,
	onToggle,
	sizeMm,
	onSize,
	spec = FIELD.fontLine,
}: {
	label: string;
	shown: boolean;
	onToggle: (on: boolean) => void;
	sizeMm: number;
	onSize: (n: number) => void;
	spec?: UnitFieldSpec;
}) {
	return (
		<div className="flex items-center justify-between gap-3">
			<span className="text-xs font-medium text-(--ink-muted)">{label}</span>
			<div className="flex items-center gap-2.5">
				<input
					type="checkbox"
					checked={shown}
					onChange={(e) => onToggle(e.target.checked)}
					aria-label={`Show ${label}`}
					className="size-4 shrink-0 cursor-pointer accent-primary"
				/>
				<NumberUnitInput
					label={`${label} size`}
					value={sizeMm}
					spec={spec}
					disabled={!shown}
					onCommit={onSize}
				/>
			</div>
		</div>
	);
}

/**
 * Modal to print cut-out placeholders for the cards a collector is missing from
 * a binder. Chrome is liquid-glass (via {@link Dialog}); the placeholders and
 * print sheet are deliberately print-oriented (user-chosen colors, real mm
 * sizing, high contrast, card-silhouette rounding) rather than glass. Every
 * setting persists via {@link useUiPrefs}; card width/height/spacing feed
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
		gapMm,
		showName,
		nameSizeMm,
		showNumber,
		numberSizeMm,
		showSetName,
		setNameSizeMm,
		showPrice,
		priceSizeMm,
		showQr,
		qrSizeMm,
	} = printPrefs;

	// Card size + spacing drive the grid, so it re-fits as the user resizes.
	const layout = sheetLayout(
		PRINTABLE_WIDTH_MM,
		PRINTABLE_HEIGHT_MM,
		cardWidthMm,
		cardHeightMm,
		gapMm,
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

	// Precompute each card's price string + QR (pure; memoized). Price reuses the
	// app's canonical valuation; QR encodes the card's absolute /prices URL.
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
			prefs={printPrefs}
			columns={layout.columns}
			extras={extras}
		/>
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[95dvh] overflow-y-auto sm:max-w-3xl">
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
						{/* Four control groups in a 2x2 grid, three inputs each. */}
						<div className="grid gap-3 sm:grid-cols-2">
							<ControlGroup label="Colors">
								<LabeledRow label="Background">
									<ColorPicker
										value={background}
										mode="oklch"
										onChange={(v) => setPrintPrefs({ background: v })}
									/>
								</LabeledRow>
								<LabeledRow label="Text">
									<ColorPicker
										value={textColor}
										mode="oklch"
										onChange={(v) => setPrintPrefs({ textColor: v })}
									/>
								</LabeledRow>
								<LabeledRow label="Border">
									<ColorPicker
										value={borderColor}
										mode="oklch"
										onChange={(v) => setPrintPrefs({ borderColor: v })}
									/>
								</LabeledRow>
							</ControlGroup>

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
								<UnitField
									label="Spacing"
									value={gapMm}
									spec={FIELD.spacing}
									onCommit={(n) => setPrintPrefs({ gapMm: n })}
								/>
							</ControlGroup>

							<ControlGroup label="Font sizes">
								<FontSizeField
									label="Card name"
									shown={showName}
									onToggle={(on) => setPrintPrefs({ showName: on })}
									sizeMm={nameSizeMm}
									onSize={(n) => setPrintPrefs({ nameSizeMm: n })}
								/>
								<FontSizeField
									label="Card #"
									shown={showNumber}
									onToggle={(on) => setPrintPrefs({ showNumber: on })}
									sizeMm={numberSizeMm}
									onSize={(n) => setPrintPrefs({ numberSizeMm: n })}
								/>
								<FontSizeField
									label="Set name"
									shown={showSetName}
									onToggle={(on) => setPrintPrefs({ showSetName: on })}
									sizeMm={setNameSizeMm}
									onSize={(n) => setPrintPrefs({ setNameSizeMm: n })}
								/>
								<FontSizeField
									label="Price"
									shown={showPrice}
									onToggle={(on) => setPrintPrefs({ showPrice: on })}
									sizeMm={priceSizeMm}
									onSize={(n) => setPrintPrefs({ priceSizeMm: n })}
								/>
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
								<FontSizeField
									label="QR code"
									spec={FIELD.qrSize}
									shown={showQr}
									onToggle={(on) => setPrintPrefs({ showQr: on })}
									sizeMm={qrSizeMm}
									onSize={(n) => setPrintPrefs({ qrSizeMm: n })}
								/>
							</ControlGroup>
						</div>

						{/* Count feedback */}
						<div className="flex flex-col sm:flex-row items-baseline justify-between">
							<p className="font-mono tabular-nums text-(--ink)">
								{printCountLabel(count)}
							</p>
							<p className="pt-0.5 font-mono text-xs tabular-nums text-(--faint)">
								Fits {layout.perPage} per sheet ({layout.columns} ×{" "}
								{layout.rows})
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

				<DialogFooter className="flex-row">
					{count > 0 ? (
						<Button
							type="button"
							variant="ghost"
							onClick={() => resetPrintPrefs()}
						>
							<RotateCcw aria-hidden="true" />
							Reset to defaults
						</Button>
					) : null}
					<div className="grow" />
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
