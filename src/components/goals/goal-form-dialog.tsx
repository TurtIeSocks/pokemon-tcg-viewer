"use client";

import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Goal } from "../../store/userland/types";
import { createGoal, updateGoal } from "../../store/userland/userland-store";

const goalFormSchema = z.object({
	name: z.string().min(1, "Name is required"),
	description: z.string(),
});

/** Props for {@link GoalFormDialog}. */
interface GoalFormDialogProps {
	/** Whether the dialog is open. */
	open: boolean;
	/** Called to request open-state change; caller owns the state. */
	onOpenChange: (open: boolean) => void;
	/** When provided the dialog operates in edit mode; omit for create mode. */
	goal?: Goal;
	/** Optional callback invoked with the created or updated goal after a successful save. */
	onSaved?: (goal: Goal) => void;
}

/** Dialog form for creating a new goal or editing an existing one's name/description. */
export function GoalFormDialog({
	open,
	onOpenChange,
	goal,
	onSaved,
}: GoalFormDialogProps) {
	const isEdit = !!goal;

	const form = useForm({
		defaultValues: {
			name: goal?.name ?? "",
			description: goal?.description ?? "",
		},
		validators: { onSubmit: goalFormSchema },
		onSubmit: async ({ value }) => {
			// Empty/whitespace description → null (null-discipline: "" is not a value).
			const description = value.description.trim() ? value.description : null;
			if (isEdit && goal) {
				await updateGoal(goal.id, {
					name: value.name,
					description,
				});
				// Build an updated goal object from the patch
				const updated: Goal = {
					...goal,
					name: value.name,
					description,
					updatedAt: Date.now(),
				};
				onSaved?.(updated);
			} else {
				const created = await createGoal({
					name: value.name,
					description,
				});
				onSaved?.(created);
			}
			onOpenChange(false);
		},
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{isEdit ? "Edit Goal" : "New Goal"}</DialogTitle>
					<DialogDescription>
						{isEdit
							? "Update this goal's name and description."
							: "Create a new collection goal to track sets, series, or specific cards."}
					</DialogDescription>
				</DialogHeader>

				<form
					noValidate
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						void form.handleSubmit();
					}}
					className="flex flex-col gap-4"
				>
					{/* Name field */}
					<form.Field
						name="name"
						validators={{ onBlur: goalFormSchema.shape.name }}
						// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
						children={(field) => {
							const isInvalid =
								field.state.meta.isTouched && !field.state.meta.isValid;
							return (
								<div>
									<Label htmlFor={field.name}>Name</Label>
									<Input
										id={field.name}
										aria-invalid={isInvalid}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="e.g. Complete Base Set"
									/>
									{isInvalid && field.state.meta.errors.length > 0 && (
										<p className="text-sm text-destructive mt-1">
											{String(field.state.meta.errors[0])}
										</p>
									)}
								</div>
							);
						}}
					/>

					{/* Description field */}
					<form.Field
						name="description"
						// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
						children={(field) => (
							<div>
								<Label htmlFor={field.name}>Description</Label>
								<Textarea
									id={field.name}
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									placeholder="Optional notes about this goal"
									rows={3}
								/>
							</div>
						)}
					/>

					<DialogFooter>
						<form.Subscribe
							selector={(s) => ({
								canSubmit: s.canSubmit,
								isSubmitting: s.isSubmitting,
							})}
							// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
							children={({ canSubmit, isSubmitting }) => (
								<>
									<Button
										type="button"
										variant="outline"
										onClick={() => onOpenChange(false)}
									>
										Cancel
									</Button>
									<Button type="submit" disabled={!canSubmit || isSubmitting}>
										{isSubmitting ? "Saving..." : isEdit ? "Save" : "Create"}
									</Button>
								</>
							)}
						/>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
