import { useEffect, useRef } from "react";
import { PRICING_ENABLED } from "@/lib/pricing-flag";
import { cn } from "@/lib/utils";
import type { CardTab } from "../../lib/card-route";

const ALL_TABS: { value: CardTab; label: string }[] = [
	{ value: "details", label: "Details" },
	{ value: "collection", label: "Collection" },
	{ value: "pricing", label: "Pricing" },
];

const TABS = ALL_TABS.filter((t) => t.value !== "pricing" || PRICING_ENABLED);

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
		// Folder organizers: each tab is a labelled folder cap. The active one is
		// raised glass that merges seamlessly into the pane below (the pane's
		// -mt-px + this tab's border-b-0 dissolve the seam); inactive tabs sit a
		// hair lower and dimmer, reading as folders tucked behind. Render flush-left
		// so the first cap aligns with the pane's edge.
		<div
			ref={listRef}
			role="tablist"
			aria-label="Card views"
			className="relative z-10 flex items-end gap-1"
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
							"relative rounded-t-[var(--r-control)] border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] transition-all duration-200 ease-[var(--ease)]",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)]",
							active
								? "z-10 border-b-0 border-white/12 bg-[var(--glass-2)] text-[var(--ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]"
								: "translate-y-px border-transparent bg-white/[0.02] text-[var(--faint)] hover:bg-white/[0.05] hover:text-[var(--ink-muted)] motion-reduce:translate-y-0",
						)}
					>
						{t.label}
					</button>
				);
			})}
		</div>
	);
}
