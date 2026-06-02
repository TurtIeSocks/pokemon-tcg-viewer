"use client";

import { CreditCard, Layers, Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { TargetProgress } from "../../store/userland/goal-progress";
import { removeGoalTarget } from "../../store/userland/userland-store";

interface GoalTargetRowProps {
	goalId: string;
	tp: TargetProgress;
}

function KindIcon({ kind }: { kind: TargetProgress["target"]["kind"] }) {
	if (kind === "set")
		return <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />;
	if (kind === "series")
		return <Library className="h-4 w-4 shrink-0 text-muted-foreground" />;
	return <CreditCard className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

export function GoalTargetRow({ goalId, tp }: GoalTargetRowProps) {
	return (
		<div className="flex items-center gap-3 py-2">
			<KindIcon kind={tp.target.kind} />
			<div className="flex-1 min-w-0">
				<div className="flex justify-between text-sm">
					<span className="truncate font-medium">{tp.label}</span>
					<span className="text-muted-foreground shrink-0 ml-2">
						{tp.owned}/{tp.total}
					</span>
				</div>
				<ProgressBar value={tp.owned} total={tp.total} className="mt-1 h-1.5" />
			</div>
			<Button
				variant="ghost"
				size="icon"
				className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
				aria-label={`Remove target ${tp.label}`}
				onClick={() => void removeGoalTarget(goalId, tp.target)}
			>
				<span className="text-base leading-none">×</span>
			</Button>
		</div>
	);
}
