"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { HoloCardData } from "../holo-card/types";
import {
	CARD_HEIGHT_MM,
	CARD_WIDTH_MM,
	pageCount,
	placeholderMeta,
	printCountLabel,
	sheetLayout,
} from "./print-missing";

/** Print-friendly defaults: white fill, near-black text (least ink, high contrast). */
const DEFAULT_BG = "#ffffff";
const DEFAULT_TEXT = "#111111";

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
	/** Resolved background: a hex color, or "transparent". */
	background: string;
	textColor: string;
	columns: number;
}

/**
 * The physical sheet of placeholders, laid out at true trading-card size (mm).
 * Rendered twice: once as the on-screen live preview inside the modal, and once
 * into a body-level portal that is the only thing the print stylesheet keeps
 * visible. Both copies read the same props so preview matches paper exactly.
 *
 * `printColorAdjust: exact` forces the chosen background color to actually print
 * (browsers drop background colors from print output by default). Cards abut with
 * no gap so adjacent borders form shared cut lines, and `breakInside: avoid`
 * keeps a placeholder from splitting across a page boundary.
 */
function PrintSheet({
	cards,
	background,
	textColor,
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
						borderColor: textColor,
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
							fontSize: "3.6mm",
							lineHeight: 1.15,
							wordBreak: "break-word",
						}}
					>
						{card.name}
					</div>
					<div style={{ marginTop: "2mm", fontSize: "2.8mm", opacity: 0.85 }}>
						{placeholderMeta(card)}
					</div>
				</div>
			))}
		</div>
	);
}

/**
 * Modal to print cut-out placeholders for the cards a collector is missing from
 * a binder. Chrome is liquid-glass (via {@link Dialog}); the placeholders and
 * print sheet are deliberately print-oriented (user-chosen colors, real mm
 * sizing, high contrast) rather than glass. See print-missing.ts for the pure
 * layout/derivation helpers and app.css for the @media print stylesheet.
 */
export function PrintMissingDialog({
	open,
	onOpenChange,
	cards,
}: PrintMissingDialogProps) {
	const [bg, setBg] = useState(DEFAULT_BG);
	const [transparent, setTransparent] = useState(false);
	const [textColor, setTextColor] = useState(DEFAULT_TEXT);

	const layout = sheetLayout();
	const count = cards.length;
	const pages = pageCount(count, layout.perPage);
	const background = transparent ? "transparent" : bg;

	const canPrint =
		typeof document !== "undefined" && typeof window !== "undefined";

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
					<div className="flex flex-col gap-5">
						{/* Color controls */}
						<div className="flex flex-wrap items-end gap-6">
							<div className="flex flex-col gap-2">
								<Label
									htmlFor="print-bg-color"
									className="text-[10.5px] uppercase tracking-[0.18em] text-[var(--faint)] font-semibold"
								>
									Background
								</Label>
								<div className="flex items-center gap-3">
									<input
										id="print-bg-color"
										type="color"
										aria-label="Background color"
										value={bg}
										disabled={transparent}
										onChange={(e) => setBg(e.target.value)}
										className="h-9 w-12 cursor-pointer rounded-[var(--r-control)] border border-[var(--hairline)] bg-transparent disabled:opacity-40"
									/>
									<div className="flex items-center gap-2">
										<Switch
											id="print-transparent"
											checked={transparent}
											onCheckedChange={setTransparent}
										/>
										<Label
											htmlFor="print-transparent"
											className="text-[var(--ink)]"
										>
											Transparent
										</Label>
									</div>
								</div>
							</div>

							<div className="flex flex-col gap-2">
								<Label
									htmlFor="print-text-color"
									className="text-[10.5px] uppercase tracking-[0.18em] text-[var(--faint)] font-semibold"
								>
									Text color
								</Label>
								<input
									id="print-text-color"
									type="color"
									aria-label="Text color"
									value={textColor}
									onChange={(e) => setTextColor(e.target.value)}
									className="h-9 w-12 cursor-pointer rounded-[var(--r-control)] border border-[var(--hairline)] bg-transparent"
								/>
							</div>
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

						{/* On-screen live preview (scrolls; not the print target) */}
						<section
							aria-label="Placeholder preview"
							className="max-h-[55vh] overflow-auto rounded-[var(--r-panel)] border border-[var(--hairline)] bg-[var(--glass-2)] p-4"
						>
							<PrintSheet
								cards={cards}
								background={background}
								textColor={textColor}
								columns={layout.columns}
							/>
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
						<PrintSheet
							cards={cards}
							background={background}
							textColor={textColor}
							columns={layout.columns}
						/>
					</div>,
					document.body,
				)}
		</Dialog>
	);
}
