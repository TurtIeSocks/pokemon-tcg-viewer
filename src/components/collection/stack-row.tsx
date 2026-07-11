import { Pencil, Split, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { m } from "@/paraglide/messages";
import type { CardVariant } from "../../lib/card-variants";
import { formatPrice, formatSignedPrice } from "../../store/userland/money";
import type { Stack } from "../../store/userland/types";
import {
	removeStack,
	setPrimaryStack,
	splitStack,
} from "../../store/userland/userland-store";
import {
	useHideValue,
	useStackMarketValue,
} from "../../store/userland/valuation-hooks";
import { StackEditForm } from "./stack-edit-form";
import { dayMsToInput } from "./stack-form-mapping";
import { isAutoLabel, stackDisplayLabel } from "./stack-label";

/** Props for {@link StackRow}. */
interface StackRowProps {
	/** The individual collection item this row represents. */
	item: Stack;
	/** Optional known variant strings for this card; forwarded to StackEditForm. */
	variants?: string[];
	/** Exact printings from the live card detail; forwarded to the edit-mode form. */
	variantsDetailed?: CardVariant[];
}

/** Returns true if any optional field on the item is non-null; used to gate the delete confirmation prompt. */
function hasNonNullOptional(item: Stack): boolean {
	return (
		item.pricePaid != null ||
		item.variant != null ||
		item.notes != null ||
		item.condition != null ||
		item.grading != null
	);
}

/**
 * Card tile showing a stack's distinguishing attributes as readable badges.
 * A filled-star Primary toggle marks the primary stack with a gold ring.
 * An explicit Edit button (not "click row to expand") reveals the inline StackEditForm.
 */
export function StackRow({ item, variants, variantsDetailed }: StackRowProps) {
	const [editOpen, setEditOpen] = useState(false);
	const [splitOpen, setSplitOpen] = useState(false);
	const [splitN, setSplitN] = useState(1);
	const market = useStackMarketValue(item);
	const hidden = useHideValue();

	const gradingLabel = item.grading
		? `${item.grading.company} ${item.grading.grade}`
		: null;

	function handleDelete() {
		if (hasNonNullOptional(item)) {
			if (!window.confirm(m.stack_delete_confirm())) return;
		}
		void removeStack(item.id);
	}

	function handleSetPrimary() {
		void setPrimaryStack(item.cardId, item.id);
	}

	async function handleSplit() {
		const n = Math.floor(splitN);
		if (n < 1 || n >= item.quantity) return;
		await splitStack(item.id, n);
		setSplitOpen(false);
		setSplitN(1);
	}

	return (
		<div
			className={[
				"rounded-lg border p-3 flex flex-col gap-3 transition-colors duration-150",
				item.isPrimary
					? "border-(--primary) bg-(--primary-wash) shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_25%,transparent)]"
					: "border-(--border) bg-(--glass)",
			].join(" ")}
		>
			{/* Tile header: badges + action row */}
			<div className="flex items-start gap-2 flex-wrap">
				{/* Name + metadata */}
				<div className="flex flex-1 flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0">
					{/* Display name: the user's label, or auto-derived from metadata */}
					<span className="min-w-0 truncate font-medium text-(--ink)">
						{stackDisplayLabel(item)}
					</span>
					{item.quantity > 1 && (
						<Badge
							variant="secondary"
							className="font-mono text-[10px] tabular-nums"
						>
							×{item.quantity}
						</Badge>
					)}
					{/* Acquired date */}
					<span className="font-mono text-[11px] text-(--faint)">
						{m.stack_acquired_label({ date: dayMsToInput(item.acquiredAt) })}
					</span>
					{/* When the user named the stack, surface key metadata as chips —
					    the auto-label already shows variant/grade otherwise. */}
					{!isAutoLabel(item) && item.variant && (
						<Badge variant="secondary" className="text-[10px]">
							{item.variant}
						</Badge>
					)}
					{!isAutoLabel(item) && gradingLabel && (
						<Badge variant="success" className="text-[10px]">
							{gradingLabel}
						</Badge>
					)}
					{/* Price paid — masked when the collector hides values */}
					{item.pricePaid != null && (
						<span className="font-mono text-[11px] text-(--ink-muted)">
							{hidden ? "•••" : formatPrice(item.pricePaid, item.currency)}
						</span>
					)}
					{/* Market value + unrealized P&L — masked when the collector hides values */}
					{market.marketValue != null && (
						<span className="font-mono text-[11px] text-(--success)">
							{hidden ? (
								"•••"
							) : (
								<>
									{formatPrice(market.marketValue, market.currency)}
									{market.pnl != null && (
										<span
											className={
												market.pnl >= 0 ? "text-(--success)" : "text-(--danger)"
											}
										>
											{" "}
											{formatSignedPrice(market.pnl, market.currency)}
										</span>
									)}
								</>
							)}
						</span>
					)}
				</div>

				{/* Actions: primary star, edit, delete */}
				<div className="flex items-center gap-1 shrink-0">
					{/* Primary star toggle */}
					{item.isPrimary ? (
						<span
							role="img"
							aria-label={m.stack_primary()}
							title={m.stack_primary()}
							className="inline-flex items-center justify-center h-8 w-8 text-(--primary)"
						>
							<Star className="h-4 w-4 fill-current" aria-hidden="true" />
						</span>
					) : (
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="h-8 w-8 text-(--ink-muted) hover:text-(--primary) transition-colors duration-150"
							aria-label={m.stack_set_primary()}
							title={m.stack_set_primary()}
							onClick={handleSetPrimary}
						>
							<Star className="h-4 w-4" aria-hidden="true" />
						</Button>
					)}

					{/* Split button — only when the stack holds more than one card */}
					{item.quantity > 1 && (
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="h-8 w-8"
							aria-label={m.stack_split()}
							aria-expanded={splitOpen}
							title={m.stack_split()}
							onClick={() => setSplitOpen((o) => !o)}
						>
							<Split className="h-4 w-4" aria-hidden="true" />
						</Button>
					)}

					{/* Edit button — explicit, discoverable */}
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="h-8 w-8"
						aria-label={editOpen ? m.stack_close_editor() : m.stack_edit()}
						aria-expanded={editOpen}
						title={m.stack_edit_details()}
						onClick={() => setEditOpen((o) => !o)}
					>
						<Pencil className="h-4 w-4" aria-hidden="true" />
					</Button>

					{/* Delete button */}
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors duration-150"
						aria-label={m.stack_delete()}
						title={m.stack_delete()}
						onClick={handleDelete}
					>
						<Trash2 className="h-4 w-4" aria-hidden="true" />
					</Button>
				</div>
			</div>

			{/* Inline split panel — peel cards into a new stack */}
			{splitOpen && (
				<div className="border-t pt-3 flex items-end gap-2 flex-wrap">
					<div className="flex flex-col gap-1 text-[11px] text-(--ink-muted)">
						{m.stack_split_quantity_label()}
						<Input
							type="number"
							min={1}
							max={item.quantity - 1}
							aria-label={m.stack_split_quantity_label()}
							value={splitN}
							onChange={(e) => setSplitN(Number(e.target.value))}
							className="w-24 font-mono tabular-nums"
						/>
					</div>
					<Button type="button" size="sm" onClick={handleSplit}>
						{m.stack_split_off()}
					</Button>
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={() => setSplitOpen(false)}
					>
						{m.form_cancel()}
					</Button>
				</div>
			)}

			{/* Inline editor — revealed only after Edit is clicked */}
			{editOpen && (
				<div className="border-t pt-3">
					<StackEditForm
						mode="edit"
						item={item}
						cardId={item.cardId}
						variants={variants}
						variantsDetailed={variantsDetailed}
						onSaved={() => setEditOpen(false)}
						onCancel={() => setEditOpen(false)}
					/>
				</div>
			)}
		</div>
	);
}
