"use client";

import { Link } from "@tanstack/react-router";
import { Share2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { GlassPanel } from "@/components/ui/glass";
import { ProgressBar } from "@/components/ui/progress-bar";
import { useBinderProgress } from "../../store/userland/selectors";
import type { Binder } from "../../store/userland/types";
import { ShareDialog } from "./share-dialog";

/** Props for {@link BinderCard}. */
interface BinderCardProps {
	/** Binder to display in summary form. */
	binder: Binder;
}

/** Summary card linking to a binder's detail page; shows progress bar, rule/card counts, and share action. */
export function BinderCard({ binder }: BinderCardProps) {
	const [shareOpen, setShareOpen] = useState(false);
	const progress = useBinderProgress(binder.id);

	const countLine = useMemo(
		() =>
			`${binder.rules.length} ${binder.rules.length === 1 ? "rule" : "rules"} · ${binder.includeCardIds.length} ${binder.includeCardIds.length === 1 ? "card" : "cards"}`,
		[binder.rules.length, binder.includeCardIds.length],
	);

	const pct =
		progress && progress.total > 0
			? Math.round((progress.owned / progress.total) * 100)
			: 0;

	return (
		<>
			<div className="relative group">
				<GlassPanel
					interactive
					className="block p-0 focus-within:ring-2 focus-within:ring-[var(--primary)]"
				>
					<Link
						to="/vault/binders/$binderId"
						params={{ binderId: binder.id }}
						className="block p-5 rounded-[var(--r-panel)] outline-none"
					>
						{/* Name */}
						<h3 className="font-semibold text-[var(--ink)] truncate pr-8 leading-snug">
							{binder.name}
						</h3>

						{/* Description */}
						{binder.description && (
							<p className="text-sm text-[var(--ink-muted)] mt-1 line-clamp-2">
								{binder.description}
							</p>
						)}

						{/* Meta: rules + card count */}
						<p className="mt-2 font-mono text-[11px] text-[var(--faint)] tabular-nums">
							{countLine}
						</p>

						{/* Progress bar + owned/total */}
						<div className="mt-3 space-y-1.5">
							<ProgressBar
								value={progress?.owned ?? 0}
								total={progress?.total ?? 0}
							/>
							<div className="flex items-baseline justify-between">
								<span className="text-[11px] text-[var(--faint)] uppercase tracking-wide">
									progress
								</span>
								<span className="font-mono text-xs tabular-nums text-[var(--ink)]">
									{progress ? (
										<>
											{progress.owned}/{progress.total}
											{pct > 0 && (
												<span className="ml-1.5 text-[var(--faint)]">
													{pct}%
												</span>
											)}
										</>
									) : (
										"—"
									)}
								</span>
							</div>
						</div>
					</Link>
				</GlassPanel>

				{/* Share button — outside the Link so clicks don't navigate */}
				<Button
					variant="ghost"
					size="icon"
					className="absolute top-3.5 right-3.5 h-7 w-7 text-[var(--faint)] hover:text-[var(--ink)]"
					aria-label="Share binder"
					onClick={(e) => {
						e.stopPropagation();
						setShareOpen(true);
					}}
				>
					<Share2 className="h-4 w-4" />
				</Button>
			</div>

			<ShareDialog
				open={shareOpen}
				onOpenChange={setShareOpen}
				binder={binder}
			/>
		</>
	);
}
