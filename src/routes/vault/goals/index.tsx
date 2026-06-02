import {
	ClientOnly,
	createFileRoute,
	useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";
import { GoalCard } from "@/components/goals/goal-card";
import { GoalFormDialog } from "@/components/goals/goal-form-dialog";
import { Button } from "@/components/ui/button";
import { useEnsureCorpus } from "@/store/corpus/use-ensure-corpus";
import type { Goal } from "@/store/userland/types";
import { useUserland } from "@/store/userland/userland-store";

export const Route = createFileRoute("/vault/goals/")({
	component: VaultGoals,
});

function VaultGoalsInner() {
	useEnsureCorpus();
	const navigate = useNavigate();
	const [newOpen, setNewOpen] = useState(false);
	const goalsMap = useUserland((s) => s.goals);
	const goals = Object.values(goalsMap);

	function handleSaved(goal: Goal) {
		void navigate({ to: "/vault/goals/$goalId", params: { goalId: goal.id } });
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-bold">Goals</h1>
				<Button onClick={() => setNewOpen(true)}>New goal</Button>
			</div>

			{goals.length === 0 ? (
				<p className="py-12 text-center text-muted-foreground">
					No goals yet — create one to track a set, series, or specific cards.
				</p>
			) : (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{goals.map((goal) => (
						<GoalCard key={goal.id} goal={goal} />
					))}
				</div>
			)}

			<GoalFormDialog
				open={newOpen}
				onOpenChange={setNewOpen}
				onSaved={handleSaved}
			/>
		</div>
	);
}

function VaultGoals() {
	return (
		<ClientOnly
			fallback={
				<p className="py-12 text-center text-muted-foreground">
					Loading goals…
				</p>
			}
		>
			<VaultGoalsInner />
		</ClientOnly>
	);
}
