"use client";

import { useMemo } from "react";
import { useOwnedIndex } from "../../store/userland/selectors";
import type { GoalTarget } from "../../store/userland/types";
import {
	addGoalTargets,
	bulkAddCopies,
	useUserland,
} from "../../store/userland/userland-store";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { partitionUnowned } from "./bulk-add";

interface BulkAddMenuProps {
	cardIds: string[];
	goalTarget?: GoalTarget;
	label?: string;
}

export function BulkAddMenu({ cardIds, goalTarget, label }: BulkAddMenuProps) {
	const ownedIndex = useOwnedIndex();
	const goals = useUserland((s) => s.goals);

	const ownedSet = useMemo(() => new Set(ownedIndex.keys()), [ownedIndex]);

	const { toAdd, skipped } = useMemo(
		() => partitionUnowned(cardIds, ownedSet),
		[cardIds, ownedSet],
	);

	const goalList = useMemo(() => Object.values(goals), [goals]);

	async function handleCollectionAdd() {
		if (toAdd.length === 0) return;
		if (toAdd.length > 25) {
			const ok = window.confirm(
				`Add ${toAdd.length} cards to your collection?`,
			);
			if (!ok) return;
		}
		await bulkAddCopies(toAdd);
		window.alert(
			`Added ${toAdd.length}${skipped ? ` · skipped ${skipped} already owned` : ""}`,
		);
	}

	async function handleGoalAdd(goalId: string) {
		const targets: GoalTarget[] = goalTarget
			? [goalTarget]
			: cardIds
					.slice(0, 100)
					.map((id) => ({ kind: "card" as const, cardId: id }));
		await addGoalTargets(goalId, targets);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="rounded border px-3 py-1.5 text-sm hover:bg-secondary"
				>
					{label ?? "Add all"}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent>
				<DropdownMenuItem
					disabled={toAdd.length === 0}
					onSelect={handleCollectionAdd}
				>
					{toAdd.length === 0
						? "All owned"
						: `Add ${toAdd.length} to collection`}
				</DropdownMenuItem>

				<DropdownMenuSub>
					<DropdownMenuSubTrigger>Add to goal</DropdownMenuSubTrigger>
					<DropdownMenuSubContent>
						{goalList.length === 0 ? (
							<DropdownMenuItem disabled>No goals yet</DropdownMenuItem>
						) : (
							goalList.map((goal) => (
								<DropdownMenuItem
									key={goal.id}
									onSelect={() => {
										void handleGoalAdd(goal.id);
									}}
								>
									{goal.name}
								</DropdownMenuItem>
							))
						)}
					</DropdownMenuSubContent>
				</DropdownMenuSub>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
