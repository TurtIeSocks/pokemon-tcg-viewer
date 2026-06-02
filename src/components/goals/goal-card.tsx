"use client";

import { Link } from "@tanstack/react-router";
import { useGoalProgress } from "../../store/userland/selectors";
import type { Goal } from "../../store/userland/types";

interface GoalCardProps {
	goal: Goal;
}

export function GoalCard({ goal }: GoalCardProps) {
	const progress = useGoalProgress(goal);
	const pct =
		progress && progress.overall.total > 0
			? Math.round((progress.overall.owned / progress.overall.total) * 100)
			: 0;

	return (
		<Link
			to="/vault/goals/$goalId"
			params={{ goalId: goal.id }}
			className="block rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors"
		>
			<h3 className="font-semibold truncate">{goal.name}</h3>
			<p className="text-sm text-muted-foreground mt-1">
				{goal.targets.length} {goal.targets.length === 1 ? "target" : "targets"}
			</p>
			{progress ? (
				<div className="mt-3 space-y-1">
					<div className="flex justify-between text-xs text-muted-foreground">
						<span>{pct}% complete</span>
						<span>
							{progress.overall.owned}/{progress.overall.total}
						</span>
					</div>
					<div className="h-2 rounded-full bg-muted overflow-hidden">
						<div
							className="h-full bg-primary rounded-full transition-all"
							style={{ width: `${pct}%` }}
						/>
					</div>
				</div>
			) : (
				<div className="mt-3 h-2 rounded-full bg-muted" />
			)}
		</Link>
	);
}
