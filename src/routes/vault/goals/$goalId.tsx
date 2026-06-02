import { ClientOnly, createFileRoute, Link } from "@tanstack/react-router";
import { GoalDetail } from "@/components/goals/goal-detail";
import { useEnsureCorpus } from "@/store/corpus/use-ensure-corpus";
import { useUserland } from "@/store/userland/userland-store";

export const Route = createFileRoute("/vault/goals/$goalId")({
	component: VaultGoalDetail,
});

function VaultGoalDetailInner() {
	useEnsureCorpus();
	const { goalId } = Route.useParams();
	const goal = useUserland((s) => s.goals[goalId]);

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
