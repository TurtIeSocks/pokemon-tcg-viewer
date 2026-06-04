"use client";

import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BezelPanel } from "@/components/ui/glass";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Stat } from "@/components/ui/stat";
import { ImportDialog } from "@/components/vault/import-dialog";
import { useStore } from "../../store";
import { setsById } from "../../store/corpus/corpus-engine";
import {
	useOwnedCountBySet,
	useOwnedIndex,
} from "../../store/userland/selectors";
import { useUserland } from "../../store/userland/userland-store";

/** Count of distinct owned cards (≥1 copy). */
export function useOwnedCardCount(): number {
	return useOwnedIndex().size;
}

/**
 * Compute overall collection completion %.
 * Denominator = sum of set.total for every set the user has touched (≥1 owned card).
 * Returns 0 when no sets are touched.
 */
function useCompletionPct(countBySet: Map<string, number>): number {
	const sets = useStore((s) => s.sets);
	if (!sets || countBySet.size === 0) return 0;
	const byId = setsById(sets);
	let owned = 0;
	let total = 0;
	for (const [setId, count] of countBySet) {
		const set = byId.get(setId);
		if (!set || set.total <= 0) continue;
		owned += count;
		total += set.total;
	}
	return total === 0 ? 0 : Math.min(100, Math.round((owned / total) * 100));
}

/**
 * Est. value = sum of pricePaid over all copies where pricePaid is non-null.
 * CorpusCard has no market-price field, so this is the user's own cost data only.
 */
function useEstValue(): number | null {
	const items = useUserland((s) => s.items);
	let sum = 0;
	let any = false;
	for (const item of Object.values(items)) {
		if (item.pricePaid !== null) {
			sum += item.pricePaid;
			any = true;
		}
	}
	return any ? sum : null;
}

/** Copies acquired within the last 7 days. */
function useThisWeekCount(): number {
	const items = useUserland((s) => s.items);
	const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
	return Object.values(items).filter((i) => i.acquiredAt >= cutoff).length;
}

function formatDollars(cents: number): string {
	// pricePaid is stored as a number; treat as dollars (consistent with edit UI)
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(cents);
}

/**
 * Double-bezel summary hero: big completion ring + 4 stats + Add/Import actions.
 * Real data only — omits est. value stat gracefully when no pricePaid entries exist.
 */
export function VaultSummaryHero() {
	const [importOpen, setImportOpen] = useState(false);
	const index = useOwnedIndex();
	const countBySet = useOwnedCountBySet();
	const cardsOwned = index.size;
	const setsTouched = countBySet.size;
	const pct = useCompletionPct(countBySet);
	const estValue = useEstValue();
	const thisWeek = useThisWeekCount();

	return (
		<>
			<BezelPanel className="mt-2">
				<div className="flex flex-wrap items-center gap-7">
					{/* Big completion ring */}
					<ProgressRing pct={pct} size={88} stroke={8}>
						<div className="flex flex-col items-center leading-none">
							<span className="font-mono text-[21px] font-medium tabular-nums text-[var(--ink)]">
								{pct}%
							</span>
							<span className="mt-0.5 text-[9.5px] uppercase tracking-[0.10em] text-[var(--faint)]">
								complete
							</span>
						</div>
					</ProgressRing>

					{/* Stats row */}
					<div className="flex flex-1 flex-wrap gap-8">
						<Stat value={cardsOwned.toLocaleString()} label="cards owned" />
						<Stat value={setsTouched.toLocaleString()} label="sets touched" />
						{estValue !== null && (
							<Stat value={formatDollars(estValue)} label="est. value" />
						)}
						{thisWeek > 0 && (
							<Stat value={`+${thisWeek}`} label="this week" tone="up" />
						)}
					</div>

					{/* Actions */}
					<div className="flex flex-wrap gap-2">
						<Button asChild size="sm">
							<Link to="/vault/cards">Add cards</Link>
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setImportOpen(true)}
						>
							Import
						</Button>
					</div>
				</div>
			</BezelPanel>

			<ImportDialog open={importOpen} onOpenChange={setImportOpen} />
		</>
	);
}
