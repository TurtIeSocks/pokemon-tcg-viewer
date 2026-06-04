import { Pencil, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CollectionItem } from "../../store/userland/types";
import {
	removeCopy,
	setPrimaryCopy,
} from "../../store/userland/userland-store";
import { CopyEditForm } from "./copy-edit-form";
import { dayMsToInput } from "./copy-form-mapping";
import { copyDisplayLabel, isAutoLabel } from "./copy-label";

/** Props for {@link CopyRow}. */
interface CopyRowProps {
	/** The individual collection item this row represents. */
	item: CollectionItem;
	/** Optional known variant strings for this card; forwarded to CopyEditForm. */
	variants?: string[];
}

/** Returns true if any optional field on the item is non-null; used to gate the delete confirmation prompt. */
function hasNonNullOptional(item: CollectionItem): boolean {
	return (
		item.pricePaid != null ||
		item.variant != null ||
		item.notes != null ||
		item.condition != null ||
		item.grading != null
	);
}

/**
 * Card tile showing a copy's distinguishing attributes as readable badges.
 * A filled-star Primary toggle marks the primary copy with a gold ring.
 * An explicit Edit button (not "click row to expand") reveals the inline CopyEditForm.
 */
export function CopyRow({ item, variants }: CopyRowProps) {
	const [editOpen, setEditOpen] = useState(false);

	const gradingLabel = item.grading
		? `${item.grading.company} ${item.grading.grade}`
		: null;

	function handleDelete() {
		if (hasNonNullOptional(item)) {
			if (!window.confirm("Delete this copy?")) return;
		}
		void removeCopy(item.id);
	}

	function handleSetPrimary() {
		void setPrimaryCopy(item.cardId, item.id);
	}

	return (
		<div
			className={[
				"rounded-lg border p-3 flex flex-col gap-3 transition-colors duration-150",
				item.isPrimary
					? "border-[var(--primary)] bg-[var(--primary-wash)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_25%,transparent)]"
					: "border-[var(--border)] bg-[var(--glass)]",
			].join(" ")}
		>
			{/* Tile header: badges + action row */}
			<div className="flex items-start gap-2 flex-wrap">
				{/* Name + metadata */}
				<div className="flex flex-1 flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0">
					{/* Display name: the user's label, or auto-derived from metadata */}
					<span className="min-w-0 truncate font-medium text-[var(--ink)]">
						{copyDisplayLabel(item)}
					</span>
					{/* Acquired date */}
					<span className="font-mono text-[11px] text-[var(--faint)]">
						acquired {dayMsToInput(item.acquiredAt)}
					</span>
					{/* When the user named the copy, surface key metadata as chips —
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
					{/* Price paid */}
					{item.pricePaid != null && (
						<span className="font-mono text-[11px] text-[var(--ink-muted)]">
							${item.pricePaid}
						</span>
					)}
				</div>

				{/* Actions: primary star, edit, delete */}
				<div className="flex items-center gap-1 shrink-0">
					{/* Primary star toggle */}
					{item.isPrimary ? (
						<span
							role="img"
							aria-label="Primary copy"
							title="Primary copy"
							className="inline-flex items-center justify-center h-8 w-8 text-[var(--primary)]"
						>
							<Star className="h-4 w-4 fill-current" aria-hidden="true" />
						</span>
					) : (
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="h-8 w-8 text-[var(--ink-muted)] hover:text-[var(--primary)] transition-colors duration-150"
							aria-label="Set as primary"
							title="Set as primary"
							onClick={handleSetPrimary}
						>
							<Star className="h-4 w-4" aria-hidden="true" />
						</Button>
					)}

					{/* Edit button — explicit, discoverable */}
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="h-8 w-8"
						aria-label={editOpen ? "Close editor" : "Edit"}
						aria-expanded={editOpen}
						title="Edit copy details"
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
						aria-label="Delete"
						title="Delete this copy"
						onClick={handleDelete}
					>
						<Trash2 className="h-4 w-4" aria-hidden="true" />
					</Button>
				</div>
			</div>

			{/* Inline editor — revealed only after Edit is clicked */}
			{editOpen && (
				<div className="border-t pt-3">
					<CopyEditForm
						mode="edit"
						item={item}
						cardId={item.cardId}
						variants={variants}
						onSaved={() => setEditOpen(false)}
						onCancel={() => setEditOpen(false)}
					/>
				</div>
			)}
		</div>
	);
}
