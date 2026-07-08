"use client";

import { Link } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BezelPanel } from "@/components/ui/glass";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Stat } from "@/components/ui/stat";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { ImportDialog } from "@/components/vault/import-dialog";
import { PortfolioChart } from "@/components/vault/portfolio-chart";
import { ValueStats } from "@/components/vault/value-stats";
import { m } from "@/paraglide/messages";
import { useEnsurePrices } from "@/store/corpus/prices-runtime";
import { useCaptureSnapshot } from "../../store/userland/snapshot-capture";
import { useCollectionStats } from "../../store/userland/stats";
import { updateProfile } from "../../store/userland/userland-store";
import { useHideValue } from "../../store/userland/valuation-hooks";

/**
 * Double-bezel summary hero: big completion ring + stats + Add/Import actions.
 * Real data only — ValueStats omits/masks money stats gracefully when
 * prices/FX are unavailable or the collector has hidden values.
 */
export function VaultSummaryHero() {
	useEnsurePrices();
	useCaptureSnapshot();
	const [importOpen, setImportOpen] = useState(false);
	const { cardsOwned, setsTouched, completionPct, thisWeek } =
		useCollectionStats();
	const hidden = useHideValue();
	const pct = completionPct;

	return (
		<>
			<BezelPanel className="mt-2">
				<div className="flex flex-wrap items-center gap-7">
					{/* Big completion ring */}
					<ProgressRing pct={pct} size={88} stroke={8}>
						<div className="flex flex-col items-center leading-none">
							<span className="font-mono text-[21px] font-medium tabular-nums text-(--ink)">
								{pct}%
							</span>
							<span className="mt-0.5 text-[9.5px] uppercase tracking-widest text-(--faint)">
								{m.vault_complete_label()}
							</span>
						</div>
					</ProgressRing>

					{/* Stats row */}
					<div className="flex flex-1 flex-wrap gap-8">
						<Stat
							value={cardsOwned.toLocaleString()}
							label={m.vault_cards_owned_label()}
						/>
						<Stat
							value={setsTouched.toLocaleString()}
							label={m.vault_sets_touched_label()}
						/>
						<ValueStats />
						{thisWeek > 0 && (
							<Stat
								value={`+${thisWeek}`}
								label={m.vault_this_week_label()}
								tone="up"
							/>
						)}
					</div>

					{/* Actions */}
					<div className="flex flex-wrap gap-2">
						<Button asChild size="sm">
							<Link to="/vault/cards">{m.vault_add_cards()}</Link>
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setImportOpen(true)}
						>
							{m.vault_import_action()}
						</Button>
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon-sm"
										aria-label={
											hidden ? m.vault_show_values() : m.vault_hide_values()
										}
										onClick={() => updateProfile({ hideValue: !hidden })}
									>
										{hidden ? (
											<EyeOff className="size-4" />
										) : (
											<Eye className="size-4" />
										)}
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									{hidden
										? m.vault_show_monetary_values()
										: m.vault_hide_monetary_values()}
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					</div>
				</div>

				<div className="mt-6">
					<PortfolioChart />
				</div>
			</BezelPanel>

			<ImportDialog open={importOpen} onOpenChange={setImportOpen} />
		</>
	);
}
