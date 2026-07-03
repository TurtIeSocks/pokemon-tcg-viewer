"use client";

import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BezelPanel } from "@/components/ui/glass";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Stat } from "@/components/ui/stat";
import { ImportDialog } from "@/components/vault/import-dialog";
import { formatPrice } from "@/store/userland/money";
import { useCollectionStats } from "../../store/userland/stats";

const MIXED_CURRENCY_LABEL = "—";
const MIXED_CURRENCY_HINT =
	"Mixed currencies — total needs conversion (coming soon)";

/**
 * Double-bezel summary hero: big completion ring + 4 stats + Add/Import actions.
 * Real data only — omits est. value stat gracefully when no pricePaid entries exist.
 */
export function VaultSummaryHero() {
	const [importOpen, setImportOpen] = useState(false);
	const {
		cardsOwned,
		setsTouched,
		completionPct,
		estValue,
		estValueCurrency,
		thisWeek,
	} = useCollectionStats();
	const pct = completionPct;

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
						{estValue !== null &&
							(estValueCurrency !== null ? (
								<Stat
									value={formatPrice(estValue, estValueCurrency)}
									label="est. value"
								/>
							) : (
								<span title={MIXED_CURRENCY_HINT} role="note">
									<Stat value={MIXED_CURRENCY_LABEL} label="est. value" />
								</span>
							))}
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
