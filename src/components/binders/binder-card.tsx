"use client";

import { Link } from "@tanstack/react-router";
import { Share2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { GlassPanel } from "@/components/ui/glass";
import { ProgressBar } from "@/components/ui/progress-bar";
import { useBinderProgress } from "../../store/userland/selectors";
import { useUserland } from "../../store/userland/userland-store";
import { ShareDialog } from "./share-dialog";

/** Props for {@link BinderCard}. */
interface BinderCardProps {
	/** Id of the binder to display; the card subscribes to its own slice (S3). */
	binderId: string;
}

/**
 * Summary card linking to a binder's detail page; shows progress bar, rule/card
 * counts, and share action. Subscribes to its own binder by id (S3) so editing
 * one binder re-renders only that card, not the whole list.
 */
export function BinderCard({ binderId }: BinderCardProps) {
	const [shareOpen, setShareOpen] = useState(false);
	const binder = useUserland((s) => s.binders[binderId]);
	const progress = useBinderProgress(binderId);

	const countLine = useMemo(
		() =>
			binder
				? `${binder.rules.length} ${binder.rules.length === 1 ? "rule" : "rules"} · ${binder.includeCardIds.length} ${binder.includeCardIds.length === 1 ? "card" : "cards"}`
				: "",
		[binder],
	);

	const pct =
		progress && progress.total > 0
			? Math.round((progress.owned / progress.total) * 100)
			: 0;

	// Guard the brief window where the parent still lists an id the store dropped
	// (e.g. mid-delete) — the row unmounts on the parent's next render. All hooks
	// run above this point so the early return never reorders them.
	if (!binder) return null;

	return (
		<>
			<div className="relative group">
				<GlassPanel
					interactive
					className="block p-0 focus-within:ring-2 focus-within:ring-(--primary)"
				>
					<Link
						to="/vault/binders/$binderId"
						params={{ binderId: binder.id }}
						className="block p-5 rounded-(--r-panel) outline-none"
					>
						{/* Name */}
						<h3 className="font-semibold text-(--ink) truncate pr-8 leading-snug">
							{binder.name}
						</h3>

						{/* Description */}
						{binder.description && (
							<p className="text-sm text-(--ink-muted) mt-1 line-clamp-2">
								{binder.description}
							</p>
						)}

						{/* Meta: rules + card count */}
						<p className="mt-2 font-mono text-[11px] text-(--faint) tabular-nums">
							{countLine}
						</p>

						{/* Progress bar + owned/total */}
						<div className="mt-3 space-y-1.5">
							<ProgressBar
								value={progress?.owned ?? 0}
								total={progress?.total ?? 0}
							/>
							<div className="flex items-baseline justify-between">
								<span className="text-[11px] text-(--faint) uppercase tracking-wide">
									progress
								</span>
								<span className="font-mono text-xs tabular-nums text-(--ink)">
									{progress ? (
										<>
											{progress.owned}/{progress.total}
											{pct > 0 && (
												<span className="ml-1.5 text-(--faint)">
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
					className="absolute top-3.5 right-3.5 h-7 w-7 text-(--faint) hover:text-(--ink)"
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
