import { useForm } from "@tanstack/react-form";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fieldErrorText } from "@/lib/field-error";
import { cn } from "@/lib/utils";
import type { CollectionItem } from "../../store/userland/types";
import { addCopy, updateCopy } from "../../store/userland/userland-store";
import { formToPatch, itemToForm } from "./copy-form-mapping";
import { CONDITIONS, copyFormSchema, GRADERS } from "./copy-form-schema";

/** Radix Select prohibits value="". Use this sentinel for the "Unspecified" item. */
const NONE = "__none__";
function toSelectVal(v: string) {
	return v === "" ? NONE : v;
}
function fromSelectVal(v: string) {
	return v === NONE ? "" : v;
}

/** Returns true when a TanStack Form field has been touched and is currently invalid. */
function fieldIsInvalid(field: {
	state: { meta: { isTouched: boolean; isValid: boolean } };
}): boolean {
	return field.state.meta.isTouched && !field.state.meta.isValid;
}

/**
 * Converts TanStack Form errors array to the shape expected by shadcn FieldError.
 * Uses `fieldErrorText` to avoid the "[object Object]" Zod issue rendering bug.
 */
function toFieldErrors(
	errors: unknown[],
): Array<{ message?: string } | undefined> {
	return errors.map((e) => {
		const msg = fieldErrorText(e);
		return msg ? { message: msg } : undefined;
	});
}

/**
 * Segmented pill control — renders a track of segments, one active at a time.
 * Active segment: `bg-[var(--primary)] text-[var(--primary-ink)] font-semibold`.
 * Matches the `.seg` pattern in the card-manage mock.
 */
interface SegmentedControlProps<T extends string> {
	value: T;
	onChange: (v: T) => void;
	options: { value: T; label: string }[];
	/** Optional accessible label for the group */
	"aria-label"?: string;
}

function SegmentedControl<T extends string>({
	value,
	onChange,
	options,
	"aria-label": ariaLabel,
}: SegmentedControlProps<T>) {
	return (
		// biome-ignore lint/a11y/useSemanticElements: pill track needs rounded styling incompatible with <fieldset>
		<div
			role="group"
			aria-label={ariaLabel}
			className={cn(
				"inline-flex bg-[var(--glass)] border border-[var(--border)]",
				"rounded-[var(--r-pill,9999px)] p-0.5 gap-0.5",
			)}
		>
			{options.map((opt) => {
				const active = opt.value === value;
				return (
					// biome-ignore lint/a11y/useSemanticElements: segmented pill button styled with explicit role=radio; native radio input fights the track layout
					<button
						key={opt.value}
						type="button"
						role="radio"
						aria-checked={active}
						aria-label={opt.label}
						onClick={() => onChange(opt.value)}
						className={cn(
							"text-[12px] px-3 py-1.5 rounded-[calc(var(--r-pill,9999px)-2px)] transition-colors duration-150",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
							active
								? "bg-[var(--primary)] text-[var(--primary-ink)] font-semibold"
								: "text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer",
						)}
					>
						{opt.label}
					</button>
				);
			})}
		</div>
	);
}

/**
 * Props for {@link CopyEditForm}.
 *
 * - `mode="edit"`: editing an existing copy; `item` is required.
 * - `mode="create"`: adding a new copy; `item` is omitted; uses blank defaults.
 */
interface CopyEditFormProps {
	mode: "edit" | "create";
	/** Required in edit mode; the item to prefill and update on Save. */
	item?: CollectionItem;
	/** Required in create mode; the card the new copy belongs to. */
	cardId: string;
	/** Optional list of known variant strings for this card (from the corpus). */
	variants?: string[];
	/** Called after a successful Save. */
	onSaved: () => void;
	/** Called when Cancel is clicked. */
	onCancel: () => void;
}

/** Blank defaults for a new copy form. */
const BLANK_DEFAULTS = {
	label: "",
	acquiredAt: new Date().toISOString().slice(0, 10),
	pricePaid: "",
	variant: "",
	notes: "",
	state: "raw" as const,
	condition: "" as const,
	gradingCompany: "" as const,
	grade: "",
};

/**
 * Draft→Save form for creating or editing a single copy's metadata.
 * No per-field auto-save: all changes are committed atomically when Save is clicked.
 *
 * Variant and State are rendered as segmented pill controls matching the mock.
 */
export function CopyEditForm({
	mode,
	item,
	cardId,
	variants,
	onSaved,
	onCancel,
}: CopyEditFormProps) {
	const defaultValues =
		mode === "edit" && item ? itemToForm(item) : BLANK_DEFAULTS;

	const form = useForm({
		defaultValues,
		validators: { onSubmit: copyFormSchema },
		onSubmit: async ({ value }) => {
			const patch = formToPatch(value);
			if (mode === "edit" && item) {
				await updateCopy(item.id, patch);
			} else {
				await addCopy(cardId, patch);
			}
			onSaved();
		},
	});

	return (
		<form
			noValidate
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				void form.handleSubmit();
			}}
			className="flex flex-col gap-4 [&_[data-slot=field-label]]:text-[var(--ink-muted)]"
		>
			{/* Label — optional user-given name; blank → auto metadata label (copy-label.ts) */}
			<form.Field
				name="label"
				// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
				children={(field) => (
					<Field>
						<FieldLabel htmlFor={field.name}>Label</FieldLabel>
						<Input
							id={field.name}
							placeholder="Name this copy (optional)"
							value={field.state.value}
							onBlur={field.handleBlur}
							onChange={(e) => field.handleChange(e.target.value)}
						/>
					</Field>
				)}
			/>

			{/* 2-column responsive grid */}
			<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
				{/* Variant — segmented pill */}
				{variants && variants.length > 0 && (
					<form.Field
						name="variant"
						validators={{ onBlur: copyFormSchema.shape.variant }}
						// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
						children={(field) => (
							<Field className="sm:col-span-2">
								<FieldLabel>Variant</FieldLabel>
								<SegmentedControl
									aria-label="Variant"
									value={field.state.value}
									onChange={(v) => field.handleChange(v)}
									options={[
										{ value: "", label: "Unspecified" },
										...variants.map((v) => ({ value: v, label: v })),
									]}
								/>
							</Field>
						)}
					/>
				)}

				{/* State — segmented pill: Raw | Graded */}
				<form.Field
					name="state"
					// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
					children={(field) => (
						<Field className="sm:col-span-2">
							<FieldLabel>State</FieldLabel>
							<SegmentedControl
								aria-label="State"
								value={field.state.value}
								onChange={(v) => field.handleChange(v as "raw" | "graded")}
								options={[
									{ value: "raw", label: "Raw" },
									{ value: "graded", label: "Graded" },
								]}
							/>
						</Field>
					)}
				/>

				{/* Conditional: raw → condition Select */}
				<form.Subscribe
					selector={(s) => s.values.state}
					// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
					children={(state) =>
						state === "raw" ? (
							<form.Field
								name="condition"
								validators={{ onBlur: copyFormSchema.shape.condition }}
								// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
								children={(field) => {
									const invalid = fieldIsInvalid(field);
									return (
										<Field data-invalid={invalid}>
											<FieldLabel htmlFor={field.name}>Condition</FieldLabel>
											<Select
												value={toSelectVal(field.state.value)}
												onValueChange={(v) => {
													field.handleChange(
														fromSelectVal(v) as typeof field.state.value,
													);
												}}
											>
												<SelectTrigger
													id={field.name}
													aria-invalid={invalid}
													onBlur={field.handleBlur}
												>
													<SelectValue placeholder="Select condition..." />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value={NONE}>Unspecified</SelectItem>
													{CONDITIONS.map((c) => (
														<SelectItem key={c} value={c}>
															{c}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											{invalid && (
												<FieldError
													errors={toFieldErrors(field.state.meta.errors)}
												/>
											)}
										</Field>
									);
								}}
							/>
						) : (
							<>
								{/* Grader / company Select */}
								<form.Field
									name="gradingCompany"
									validators={{ onBlur: copyFormSchema.shape.gradingCompany }}
									// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
									children={(field) => {
										const invalid = fieldIsInvalid(field);
										return (
											<Field data-invalid={invalid}>
												<FieldLabel htmlFor={field.name}>
													Grader / company
												</FieldLabel>
												<Select
													value={toSelectVal(field.state.value)}
													onValueChange={(v) => {
														field.handleChange(
															fromSelectVal(v) as typeof field.state.value,
														);
													}}
												>
													<SelectTrigger
														id={field.name}
														aria-label="Grader / company"
														aria-invalid={invalid}
														onBlur={field.handleBlur}
													>
														<SelectValue placeholder="Select grader..." />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value={NONE}>Unspecified</SelectItem>
														{GRADERS.map((g) => (
															<SelectItem key={g} value={g}>
																{g}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
												{invalid && (
													<FieldError
														errors={toFieldErrors(field.state.meta.errors)}
													/>
												)}
											</Field>
										);
									}}
								/>

								{/* Grade Input */}
								<form.Field
									name="grade"
									validators={{
										onBlur: ({ value }) => {
											if (value === "") return undefined;
											const n = Number(value);
											if (!Number.isFinite(n) || n < 0 || n > 10) return "0–10";
											return undefined;
										},
									}}
									// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
									children={(field) => {
										const invalid = fieldIsInvalid(field);
										return (
											<Field data-invalid={invalid}>
												<FieldLabel htmlFor={field.name}>Grade</FieldLabel>
												<Input
													id={field.name}
													type="number"
													aria-invalid={invalid}
													value={field.state.value}
													onBlur={field.handleBlur}
													onChange={(e) => field.handleChange(e.target.value)}
												/>
												{invalid && (
													<FieldError
														errors={toFieldErrors(field.state.meta.errors)}
													/>
												)}
											</Field>
										);
									}}
								/>
							</>
						)
					}
				/>

				{/* Acquired date */}
				<form.Field
					name="acquiredAt"
					validators={{ onBlur: copyFormSchema.shape.acquiredAt }}
					// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
					children={(field) => {
						const invalid = fieldIsInvalid(field);
						return (
							<Field data-invalid={invalid}>
								<FieldLabel htmlFor={field.name}>Acquired date</FieldLabel>
								<Input
									id={field.name}
									type="date"
									aria-invalid={invalid}
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
								{invalid && (
									<FieldError errors={toFieldErrors(field.state.meta.errors)} />
								)}
							</Field>
						);
					}}
				/>

				{/* Price paid */}
				<form.Field
					name="pricePaid"
					validators={{
						onBlur: ({ value }) => {
							if (value === "") return undefined;
							const n = Number(value);
							if (!Number.isFinite(n) || n < 0) return "Must be a number ≥ 0";
							return undefined;
						},
					}}
					// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
					children={(field) => {
						const invalid = fieldIsInvalid(field);
						return (
							<Field data-invalid={invalid}>
								<FieldLabel htmlFor={field.name}>Price paid</FieldLabel>
								<Input
									id={field.name}
									type="number"
									aria-label="Price paid"
									aria-invalid={invalid}
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									className="font-mono tabular-nums"
								/>
								{invalid && (
									<FieldError errors={toFieldErrors(field.state.meta.errors)} />
								)}
							</Field>
						);
					}}
				/>
			</div>

			{/* Notes — full width */}
			<form.Field
				name="notes"
				validators={{ onBlur: copyFormSchema.shape.notes }}
				// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
				children={(field) => {
					const invalid = fieldIsInvalid(field);
					return (
						<Field data-invalid={invalid}>
							<FieldLabel htmlFor={field.name}>Notes</FieldLabel>
							<Textarea
								id={field.name}
								aria-invalid={invalid}
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
							/>
							{invalid && (
								<FieldError errors={toFieldErrors(field.state.meta.errors)} />
							)}
						</Field>
					);
				}}
			/>

			{/* Save / Cancel */}
			<form.Subscribe
				selector={(s) => ({
					canSubmit: s.canSubmit,
					isSubmitting: s.isSubmitting,
				})}
				// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
				children={({ canSubmit, isSubmitting }) => (
					<div className="flex gap-2 pt-1">
						<Button
							type="submit"
							disabled={!canSubmit || isSubmitting}
							className="flex-1"
						>
							{isSubmitting ? "Saving…" : "Save"}
						</Button>
						<Button
							type="button"
							variant="ghost"
							onClick={onCancel}
							className="flex-1"
						>
							Cancel
						</Button>
					</div>
				)}
			/>
		</form>
	);
}
