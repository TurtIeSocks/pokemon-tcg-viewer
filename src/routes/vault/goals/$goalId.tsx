import { ClientOnly, createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { GoalDetail } from "@/components/goals/goal-detail";
import { useStore } from "@/store";
import { loadCorpus } from "@/store/corpus/corpus-runtime";
import { useUserland } from "@/store/userland/userland-store";

export const Route = createFileRoute("/vault/goals/$goalId")({
	component: VaultGoalDetail,
});

function VaultGoalDetailInner() {
	const { goalId } = Route.useParams();
	const goal = useUserland((s) => s.goals[goalId]);
	const loadSets = useStore((s) => s.loadSets);

	useEffect(() => {
		void loadCorpus();
		void loadSets();
	}, [loadSets]);

	if (!goal) {
		return (
			<div className="py-12 text-center space-y-4">
				<p className="text-muted-foreground">Goal not found.</p>
				<Link
					to="/vault/goals"
					className="text-sm underline text-muted-foreground hover:text-foreground"
				>
					Back to goals
				</Link>
			</div>
		);
	}

	return <GoalDetail goal={goal} />;
}

function VaultGoalDetail() {
	return (
		<ClientOnly
			fallback={
				<p className="py-12 text-center text-muted-foreground">Loading goal…</p>
			}
		>
			<VaultGoalDetailInner />
		</ClientOnly>
	);
}
