"use client";

import { Link } from "@tanstack/react-router";
import { Share2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
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

	return (
		<>
			<div className="relative">
				<Link
					to="/vault/binders/$binderId"
					params={{ binderId: binder.id }}
					className="block rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors"
				>
					<h3 className="font-semibold truncate pr-8">{binder.name}</h3>

					{binder.description && (
						<p className="text-sm text-muted-foreground mt-1 line-clamp-2">
							{binder.description}
						</p>
					)}

					{progress ? (
						<div className="mt-3 space-y-1">
							<div className="flex justify-between text-xs text-muted-foreground">
								<span>
									{progress.total > 0
										? Math.round((progress.owned / progress.total) * 100)
										: 0}
									% complete
								</span>
								<span>
									{progress.owned}/{progress.total}
								</span>
							</div>
							<ProgressBar value={progress.owned} total={progress.total} />
						</div>
					) : (
						<div className="mt-3 h-2 rounded-full bg-muted" />
					)}

					<p className="text-xs text-muted-foreground mt-2">{countLine}</p>
				</Link>

				{/* Share button — outside the Link so clicks don't navigate */}
				<Button
					variant="ghost"
					size="icon"
					className="absolute top-3 right-3 h-7 w-7"
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
