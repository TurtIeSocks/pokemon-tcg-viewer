"use client";

import { BezelPanel } from "@/components/ui/glass";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Stat } from "@/components/ui/stat";
import {
	useOwnedCountBySet,
	useOwnedIndex,
} from "../../store/userland/selectors";

/** Count of distinct owned cards (≥1 copy). */
export function useOwnedCardCount(): number {
	return useOwnedIndex().size;
}

/**
 * Summary hero rendered inside a BezelPanel.
 *
 * Metrics used:
 * - cards owned  → `useOwnedIndex().size`   (distinct cardIds)
 * - sets touched → `useOwnedCountBySet().size` (distinct setIds with ≥1 owned card)
 *
 * No overall-completion % is shown because the corpus total is not exposed by
 * any selector — we render the raw owned count prominently instead.
 */
export function VaultSummaryHero() {
	const cardsOwned = useOwnedIndex().size;
	const setsTouched = useOwnedCountBySet().size;

	return (
		<BezelPanel className="mt-2">
			<div className="flex flex-wrap items-center gap-7">
				{/* Ring shows owned count, not a % (no total-corpus selector exists) */}
				<ProgressRing pct={0} size={88} stroke={0}>
					<div className="flex flex-col items-center leading-none">
						<span className="font-mono text-[22px] font-medium tabular-nums text-[var(--ink)]">
							{cardsOwned.toLocaleString()}
						</span>
						<span className="mt-1 text-[9px] uppercase tracking-[0.14em] text-[var(--faint)]">
							owned
						</span>
					</div>
				</ProgressRing>

				<div className="flex gap-8 flex-wrap">
					<Stat value={cardsOwned.toLocaleString()} label="cards owned" />
					<Stat value={setsTouched.toLocaleString()} label="sets touched" />
				</div>
			</div>
		</BezelPanel>
	);
}
