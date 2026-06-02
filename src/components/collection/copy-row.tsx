import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { CollectionItem } from "../../store/userland/types";
import { removeCopy } from "../../store/userland/userland-store";
import { CopyEditForm } from "./copy-edit-form";
import { dayMsToInput } from "./copy-form-mapping";

interface CopyRowProps {
	item: CollectionItem;
	variants?: string[];
}

function hasNonNullOptional(item: CollectionItem): boolean {
	return (
		item.pricePaid != null ||
		item.variant != null ||
		item.notes != null ||
		item.condition != null ||
		item.grading != null
	);
}

export function CopyRow({ item, variants }: CopyRowProps) {
	const [expanded, setExpanded] = useState(false);

	const summary = item.grading
		? `${item.grading.company} ${item.grading.grade}`
		: [
				dayMsToInput(item.acquiredAt),
				item.pricePaid != null ? `$${item.pricePaid}` : null,
				item.condition,
			]
				.filter(Boolean)
				.join(" · ");

	function handleDelete() {
		if (hasNonNullOptional(item)) {
			if (!window.confirm("Delete this copy?")) return;
		}
		void removeCopy(item.id);
	}

	return (
		<div className="border rounded p-2 flex flex-col gap-2">
			<div className="flex items-center gap-2">
				<button
					type="button"
					className="flex-1 text-left text-sm"
					onClick={() => setExpanded((e) => !e)}
					aria-expanded={expanded}
				>
					{summary || dayMsToInput(item.acquiredAt)}
				</button>
				<Button variant="destructive" size="sm" onClick={handleDelete}>
					Delete
				</Button>
			</div>
			{expanded && <CopyEditForm item={item} variants={variants} />}
		</div>
	);
}
