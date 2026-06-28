import type { ReactNode } from "react";

/**
 * The thin toolbar that sits between the search/filter controls and a card
 * grid: an optional "{n} cards" count on the left, a right-aligned actions
 * slot (bulk-select, view toggle, pack opener) on the right. Shared by the
 * search, set, and species list pages so the row layout + count styling live
 * in one place — change the bar once, every list page follows.
 */
export function ResultsBar({
	count,
	unit = "cards",
	children,
}: {
	/** Item count shown as "{count} {unit}"; `null` hides it. */
	count: number | null;
	/** Noun for the count label. Defaults to "cards". */
	unit?: string;
	/** Right-aligned actions. */
	children: ReactNode;
}) {
	return (
		<div className="mb-3 flex items-center gap-3">
			{count != null && (
				<span className="font-mono text-sm tabular-nums text-(--ink-muted)">
					{count} {unit}
				</span>
			)}
			<div className="ml-auto flex items-center gap-2">{children}</div>
		</div>
	);
}
