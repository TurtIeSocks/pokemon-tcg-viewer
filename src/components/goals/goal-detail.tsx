"use client";

import { useNavigate } from "@tanstack/react-router";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { useGoalProgress } from "../../store/userland/selectors";
import type { Goal } from "../../store/userland/types";
import { removeGoal } from "../../store/userland/userland-store";
import { GoalFormDialog } from "./goal-form-dialog";
import { GoalTargetRow } from "./goal-target-row";
import { TargetPicker } from "./target-picker";

/** Props for {@link GoalDetail}. */
interface GoalDetailProps {
	/** The goal to display and manage in full detail. */
	goal: Goal;
}

/** Full-page goal view with progress summary, per-target rows, edit/delete actions, and target picker. */
export function GoalDetail({ goal }: GoalDetailProps) {
	const navigate = useNavigate();
	const [editOpen, setEditOpen] = useState(false);
	const [pickerOpen, setPickerOpen] = useState(false);
	const progress = useGoalProgress(goal);

	async function handleDelete() {
		if (!window.confirm(`Delete goal "${goal.name}"? This cannot be undone.`))
			return;
		await removeGoal(goal.id);
		await navigate({ to: "/vault/goals" });
	}

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-start gap-4">
				<div className="flex-1 min-w-0">
					<h1 className="text-2xl font-bold truncate">{goal.name}</h1>
					{goal.description && (
						<p className="text-muted-foreground mt-1">{goal.description}</p>
					)}
				</div>
				<div className="flex gap-2 shrink-0">
					<Button
						variant="outline"
						size="sm"
						onClick={() => setEditOpen(true)}
						aria-label="Edit goal"
					>
						<Pencil className="h-4 w-4 mr-1" />
						Edit
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => void handleDelete()}
						aria-label="Delete goal"
						className="text-destructive hover:text-destructive"
					>
						<Trash2 className="h-4 w-4 mr-1" />
						Delete
					</Button>
				</div>
			</div>

			{/* Overall progress */}
			{progress ? (
				<div className="rounded-lg border bg-card p-4 space-y-2">
					<div className="flex justify-between text-sm">
						<span className="font-medium">Overall progress</span>
						<span className="text-muted-foreground">
							{progress.overall.owned}/{progress.overall.total} cards (
							{progress.overall.total > 0
								? Math.round(
										(progress.overall.owned / progress.overall.total) * 100,
									)
								: 0}
							%)
						</span>
					</div>
					<ProgressBar
						value={progress.overall.owned}
						total={progress.overall.total}
						className="h-3"
					/>
				</div>
			) : null}

			{/* Targets */}
			<div>
				<div className="flex items-center justify-between mb-2">
					<h2 className="text-lg font-semibold">Targets</h2>
					<Button
						variant="outline"
						size="sm"
						onClick={() => setPickerOpen(true)}
					>
						<Plus className="h-4 w-4 mr-1" />
						Add target
					</Button>
				</div>

				{progress && progress.targets.length > 0 ? (
					<div className="divide-y rounded-lg border bg-card px-4">
						{progress.targets.map((tp, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: targets are positional; no stable key
							<GoalTargetRow key={i} goalId={goal.id} tp={tp} />
						))}
					</div>
				) : (
					<p className="text-muted-foreground text-sm py-4">
						No targets yet — add a set, series, or specific cards.
					</p>
				)}
			</div>

			<GoalFormDialog open={editOpen} onOpenChange={setEditOpen} goal={goal} />

			<TargetPicker
				goalId={goal.id}
				open={pickerOpen}
				onOpenChange={setPickerOpen}
			/>
		</div>
	);
}
