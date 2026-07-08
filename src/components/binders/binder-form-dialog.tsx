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
import { m } from "@/paraglide/messages";
import type { Binder } from "../../store/userland/types";
import {
	createBinder,
	updateBinder,
} from "../../store/userland/userland-store";

/**
 * A factory, not a module-scope constant: the `.min()` message calls `m.*()`,
 * which reads the ACTIVE locale when called — building this at module-eval
 * time would freeze it to the base locale forever.
 */
function makeBinderFormSchema() {
	return z.object({
		name: z.string().min(1, m.binder_form_name_required()),
		description: z.string(),
	});
}

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
	// Built at render time (not module scope) so its message resolves against
	// the active locale — see makeBinderFormSchema's doc comment.
	const binderFormSchema = makeBinderFormSchema();

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
						{isEdit ? m.binder_form_edit_title() : m.binder_form_new_title()}
					</DialogTitle>
					<DialogDescription>
						{isEdit
							? m.binder_form_edit_description()
							: m.binder_form_new_description()}
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
										<FieldLabel htmlFor={field.name}>
											{m.binder_form_name_label()}
										</FieldLabel>
										<Input
											id={field.name}
											aria-invalid={isInvalid}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											placeholder={m.binder_form_name_placeholder()}
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
									<FieldLabel htmlFor={field.name}>
										{m.binder_form_description_label()}
									</FieldLabel>
									<Textarea
										id={field.name}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder={m.binder_form_description_placeholder()}
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
										{m.form_cancel()}
									</Button>
									<Button type="submit" disabled={!canSubmit || isSubmitting}>
										{isSubmitting
											? m.form_saving()
											: isEdit
												? m.form_save()
												: m.binder_form_create_button()}
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
