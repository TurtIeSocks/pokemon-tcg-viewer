"use client";

import { useState } from "react";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { useStore } from "../../store";
import { useCorpusRuntime } from "../../store/corpus/corpus-runtime";
import { addGoalTargets } from "../../store/userland/userland-store";

/** Props for {@link TargetPicker}. */
interface TargetPickerProps {
	/** ID of the goal that receives the newly picked targets. */
	goalId: string;
	/** Whether the command dialog is open. */
	open: boolean;
	/** Called to request open-state change; caller owns the state. */
	onOpenChange: (open: boolean) => void;
}

/** Command-palette dialog for searching sets, series, and cards to add as goal targets. Card results only shown after 2+ characters. */
export function TargetPicker({
	goalId,
	open,
	onOpenChange,
}: TargetPickerProps) {
	const [input, setInput] = useState("");
	const sets = useStore((s) => s.sets) ?? [];
	const index = useCorpusRuntime((s) => s.index);

	// Distinct series from sets
	const seriesList = Array.from(new Set(sets.map((s) => s.series)));

	// Cards: only render when input length >= 2 to avoid 20k items
	const filteredCards =
		input.length >= 2 && index
			? index.cards
					.filter((c) => c.name.toLowerCase().includes(input.toLowerCase()))
					.slice(0, 30)
			: [];

	async function handleSelect(fn: () => Promise<void>) {
		await fn();
		onOpenChange(false);
	}

	return (
		<CommandDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Add target"
			description="Search sets, series, or cards to add to this goal."
		>
			<CommandInput
				placeholder="Search sets, series, or cards..."
				value={input}
				onValueChange={setInput}
			/>
			<CommandList>
				<CommandEmpty>No results found.</CommandEmpty>

				{sets.length > 0 && (
					<CommandGroup heading="Sets">
						{sets.map((set) => (
							<CommandItem
								key={`set-${set.id}`}
								value={`set:${set.id}:${set.name}`}
								onSelect={() => {
									void handleSelect(() =>
										addGoalTargets(goalId, [{ kind: "set", setId: set.id }]),
									);
								}}
							>
								{set.name}
							</CommandItem>
						))}
					</CommandGroup>
				)}

				{seriesList.length > 0 && (
					<CommandGroup heading="Series">
						{seriesList.map((series) => (
							<CommandItem
								key={`series-${series}`}
								value={`series:${series}`}
								onSelect={() => {
									void handleSelect(() =>
										addGoalTargets(goalId, [{ kind: "series", series }]),
									);
								}}
							>
								{series}
							</CommandItem>
						))}
					</CommandGroup>
				)}

				{input.length >= 2 && (
					<CommandGroup heading="Cards">
						{filteredCards.length === 0 ? (
							<CommandItem disabled value="__no-cards__">
								No cards match "{input}"
							</CommandItem>
						) : (
							filteredCards.map((card) => (
								<CommandItem
									key={`card-${card.id}`}
									value={`card:${card.id}:${card.name}`}
									onSelect={() => {
										void handleSelect(() =>
											addGoalTargets(goalId, [
												{ kind: "card", cardId: card.id },
											]),
										);
									}}
								>
									{card.name}
								</CommandItem>
							))
						)}
					</CommandGroup>
				)}
			</CommandList>
		</CommandDialog>
	);
}
