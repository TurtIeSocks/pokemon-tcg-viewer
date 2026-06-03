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
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fieldErrorText } from "@/lib/field-error";
import type { Binder } from "../../store/userland/types";
import {
	createBinder,
	updateBinder,
} from "../../store/userland/userland-store";

const binderFormSchema = z.object({
	name: z.string().min(1, "Name is required"),
	description: z.string(),
});

/** Props for {@link BinderFormDialog}. */
interface BinderFormDialogProps {
	/** Whether the dialog is open. */
	open: boolean;
	/** Called to request open-state change; caller owns the state. */
	onOpenChange: (open: boolean) => void;
	/** When provided the dialog operates in edit mode; omit for create mode. */
	binder?: Binder;
	/** Optional callback invoked with the created or updated binder after a successful save. */
	onSaved?: (binder: Binder) => void;
}

/** Dialog form for creating a new binder or editing an existing one's name/description. */
export function BinderFormDialog({
	open,
	onOpenChange,
	binder,
	onSaved,
}: BinderFormDialogProps) {
	const isEdit = !!binder;

	const form = useForm({
		defaultValues: {
			name: binder?.name ?? "",
			description: binder?.description ?? "",
		},
		validators: { onSubmit: binderFormSchema },
		onSubmit: async ({ value }) => {
			// Empty/whitespace description → null (null-discipline: "" is not a value).
			const description = value.description.trim() ? value.description : null;
			if (isEdit && binder) {
				await updateBinder(binder.id, { name: value.name, description });
				const updated: Binder = {
					...binder,
					name: value.name,
					description,
					updatedAt: Date.now(),
				};
				onSaved?.(updated);
			} else {
				const created = await createBinder({ name: value.name, description });
				onSaved?.(created);
			}
			onOpenChange(false);
		},
	});

	return (
		<Dialog
			key={binder?.id ?? "create"}
			open={open}
			onOpenChange={onOpenChange}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="font-display">
						{isEdit ? "Edit Binder" : "New Binder"}
					</DialogTitle>
					<DialogDescription className="text-[var(--ink-muted)]">
						{isEdit
							? "Update this binder's name and description."
							: "Create a new binder to organize your card collection."}
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
					<FieldGroup>
						{/* Name field */}
						<form.Field
							name="name"
							validators={{ onBlur: binderFormSchema.shape.name }}
							// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
							children={(field) => {
								const isInvalid =
									field.state.meta.isTouched && !field.state.meta.isValid;
								return (
									<Field data-invalid={isInvalid}>
										<FieldLabel htmlFor={field.name}>Name</FieldLabel>
										<Input
											id={field.name}
											aria-invalid={isInvalid}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											placeholder="e.g. Base Set Complete"
										/>
										{isInvalid && field.state.meta.errors.length > 0 && (
											<FieldError>
												{fieldErrorText(field.state.meta.errors[0])}
											</FieldError>
										)}
									</Field>
								);
							}}
						/>

						{/* Description field */}
						<form.Field
							name="description"
							// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
							children={(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>Description</FieldLabel>
									<Textarea
										id={field.name}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="Optional notes about this binder"
										rows={3}
									/>
								</Field>
							)}
						/>
					</FieldGroup>

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
										variant="ghost"
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
