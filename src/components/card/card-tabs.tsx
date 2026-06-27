import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { CardTab } from "../../lib/card-route";

const TABS: { value: CardTab; label: string }[] = [
	{ value: "details", label: "Details" },
	{ value: "collection", label: "Collection" },
	{ value: "pricing", label: "Pricing" },
];

/**
 * Card cockpit tab switcher. A proper `role="tablist"` with roving tabIndex and
 * arrow-key navigation. `idBase` ties each tab to its panel via aria-controls /
 * the panel's aria-labelledby.
 */
export function CardTabs({
	tab,
	onChange,
	idBase = "card",
}: {
	tab: CardTab;
	onChange: (t: CardTab) => void;
	idBase?: string;
}) {
	const listRef = useRef<HTMLDivElement>(null);

	// APG roving focus: when the active tab changes AND focus is already inside
	// the tablist, move focus to the newly-active tab. Does NOT steal focus on
	// mount or route-change.
	// biome-ignore lint/correctness/useExhaustiveDependencies: tab is intentional — re-run when selection changes
	useEffect(() => {
		const list = listRef.current;
		if (!list?.contains(document.activeElement)) return;
		list
			.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')
			?.focus();
	}, [tab]);

	const move = (dir: 1 | -1) => {
		const i = TABS.findIndex((t) => t.value === tab);
		const next = TABS[(i + dir + TABS.length) % TABS.length];
		onChange(next.value);
	};
	return (
		<div
			ref={listRef}
			role="tablist"
			aria-label="Card views"
			className="inline-flex gap-1 rounded-[var(--r-pill)] border border-white/10 bg-white/[0.04] p-1"
		>
			{TABS.map((t) => {
				const active = t.value === tab;
				return (
					<button
						key={t.value}
						type="button"
						role="tab"
						id={`${idBase}-tab-${t.value}`}
						aria-controls={`${idBase}-panel-${t.value}`}
						aria-selected={active}
						tabIndex={active ? 0 : -1}
						onClick={() => onChange(t.value)}
						onKeyDown={(e) => {
							if (e.key === "ArrowRight") {
								e.preventDefault();
								move(1);
							} else if (e.key === "ArrowLeft") {
								e.preventDefault();
								move(-1);
							}
						}}
						className={cn(
							"rounded-[var(--r-pill)] px-3.5 py-1.5 font-mono text-[12px] tracking-[0.04em] transition-colors",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
							active
								? "bg-[var(--primary)] font-semibold text-[var(--primary-ink)]"
								: "text-[var(--ink-muted)] hover:text-[var(--ink)]",
						)}
					>
						{t.label}
					</button>
				);
			})}
		</div>
	);
}
