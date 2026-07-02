import { useForm } from "@tanstack/react-form";
import { DatePicker } from "@/components/islands/date-picker";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fieldErrorText } from "@/lib/field-error";
import {
	ASIAN_LANGUAGES,
	LANGUAGE_LABELS,
	SUPPORTED_LANGUAGES,
	type SupportedLanguage,
} from "@/lib/languages";
import { cn } from "@/lib/utils";
import { type CardVariant, variantLabel } from "../../lib/card-variants";
import type { Stack } from "../../store/userland/types";
import { addStack, updateStack } from "../../store/userland/userland-store";
import { formToPatch, itemToForm } from "./stack-form-mapping";
import { CONDITIONS, GRADERS, stackFormSchema } from "./stack-form-schema";

/** Western-region languages, in display order (everything not in ASIAN_LANGUAGES). */
const WESTERN_LANGUAGES: readonly SupportedLanguage[] =
	SUPPORTED_LANGUAGES.filter((lang) => !ASIAN_LANGUAGES.includes(lang));

/** Radix Select prohibits value="". Use this sentinel for the "Unspecified" item. */
const NONE = "__none__";

/**
 * The subset of a TanStack Form field API the field helpers below use. Every
 * field in this form is string-valued, so `T` defaults to the field's value type.
 */
interface FormFieldApi<T extends string> {
	name: string;
	state: {
		value: T;
		meta: { isTouched: boolean; isValid: boolean; errors: unknown[] };
	};
	handleBlur: () => void;
	handleChange: (value: T) => void;
}

/** True when a TanStack Form field has been touched and is currently invalid. */
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

interface TextFieldProps {
	field: FormFieldApi<string>;
	label: string;
	type?: "text" | "number" | "date";
	placeholder?: string;
	/** aria-label for inputs whose visible label needs reinforcing (e.g. numeric). */
	ariaLabel?: string;
	min?: number;
	/** Render a multi-line <Textarea> instead of <Input>. */
	multiline?: boolean;
	/** Monospace + tabular-nums styling, for numeric fields. */
	mono?: boolean;
}

/**
 * Labeled text/number/date input (or textarea) bound to a string-valued form field.
 * The error region only renders once the field is touched-and-invalid, so fields
 * without validators (which are never invalid) show no error.
 */
function TextField({
	field,
	label,
	type = "text",
	placeholder,
	ariaLabel,
	min,
	multiline,
	mono,
}: TextFieldProps) {
	const invalid = fieldIsInvalid(field);
	return (
		<Field data-invalid={invalid || undefined}>
			<FieldLabel htmlFor={field.name}>{label}</FieldLabel>
			{multiline ? (
				<Textarea
					id={field.name}
					aria-invalid={invalid}
					value={field.state.value}
					onBlur={field.handleBlur}
					onChange={(e) => field.handleChange(e.target.value)}
				/>
			) : (
				<Input
					id={field.name}
					type={type}
					min={min}
					placeholder={placeholder}
					aria-label={ariaLabel}
					aria-invalid={invalid}
					value={field.state.value}
					onBlur={field.handleBlur}
					onChange={(e) => field.handleChange(e.target.value)}
					className={mono ? "font-mono tabular-nums" : undefined}
				/>
			)}
			{invalid && (
				<FieldError errors={toFieldErrors(field.state.meta.errors)} />
			)}
		</Field>
	);
}

interface DateFieldProps {
	field: FormFieldApi<string>;
	label: string;
}

/**
 * Labeled day picker bound to a `yyyy-MM-dd` string field. Replaces the old
 * free-text `<input type="date">`: the calendar can only emit a valid day, so
 * the "invalid date" path is unreachable through the UI. Popover-close runs the
 * field's blur validator, matching the other fields' touch-then-validate flow.
 */
function DateField({ field, label }: DateFieldProps) {
	const invalid = fieldIsInvalid(field);
	return (
		<Field data-invalid={invalid || undefined}>
			<FieldLabel htmlFor={field.name}>{label}</FieldLabel>
			<DatePicker
				id={field.name}
				value={field.state.value}
				onChange={field.handleChange}
				onClose={field.handleBlur}
				aria-invalid={invalid}
			/>
			{invalid && (
				<FieldError errors={toFieldErrors(field.state.meta.errors)} />
			)}
		</Field>
	);
}

interface SelectFieldProps<T extends string> {
	field: FormFieldApi<T>;
	label: string;
	ariaLabel?: string;
	placeholder: string;
	/** Non-empty option values; the "Unspecified" (empty) item is added automatically. */
	options: readonly string[];
}

/**
 * Labeled Select bound to a string-valued form field, with an "Unspecified"
 * sentinel item (Radix Select forbids value=""), generic over the field's value type.
 */
function SelectField<T extends string>({
	field,
	label,
	ariaLabel,
	placeholder,
	options,
}: SelectFieldProps<T>) {
	const invalid = fieldIsInvalid(field);
	return (
		<Field data-invalid={invalid || undefined}>
			<FieldLabel htmlFor={field.name}>{label}</FieldLabel>
			<Select
				value={field.state.value === "" ? NONE : field.state.value}
				onValueChange={(v) => field.handleChange((v === NONE ? "" : v) as T)}
			>
				<SelectTrigger
					id={field.name}
					aria-label={ariaLabel}
					aria-invalid={invalid}
					onBlur={field.handleBlur}
				>
					<SelectValue placeholder={placeholder} />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={NONE}>Unspecified</SelectItem>
					{options.map((o) => (
						<SelectItem key={o} value={o}>
							{o}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{invalid && (
				<FieldError errors={toFieldErrors(field.state.meta.errors)} />
			)}
		</Field>
	);
}

/**
 * Labeled Select bound to the stack's `language` field, grouped into "Western"
 * and "Asian" sections (mirrors {@link import("../islands/card-language-control").LanguageRadioMenu}'s
 * region split). Options show the human-readable {@link LANGUAGE_LABELS}
 * rather than the raw ISO code; the stored value is still the ISO code string.
 */
function LanguageSelectField({
	field,
	label,
	placeholder,
}: {
	field: FormFieldApi<string>;
	label: string;
	placeholder: string;
}) {
	const invalid = fieldIsInvalid(field);
	return (
		<Field data-invalid={invalid || undefined}>
			<FieldLabel htmlFor={field.name}>{label}</FieldLabel>
			<Select
				value={field.state.value === "" ? NONE : field.state.value}
				onValueChange={(v) => field.handleChange(v === NONE ? "" : v)}
			>
				<SelectTrigger
					id={field.name}
					aria-invalid={invalid}
					onBlur={field.handleBlur}
				>
					<SelectValue placeholder={placeholder} />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={NONE}>Unspecified</SelectItem>
					<SelectGroup>
						<SelectLabel>Western</SelectLabel>
						{WESTERN_LANGUAGES.map((lang) => (
							<SelectItem key={lang} value={lang}>
								{LANGUAGE_LABELS[lang]}
							</SelectItem>
						))}
					</SelectGroup>
					<SelectSeparator />
					<SelectGroup>
						<SelectLabel>Asian</SelectLabel>
						{ASIAN_LANGUAGES.map((lang) => (
							<SelectItem key={lang} value={lang}>
								{LANGUAGE_LABELS[lang]}
							</SelectItem>
						))}
					</SelectGroup>
				</SelectContent>
			</Select>
			{invalid && (
				<FieldError errors={toFieldErrors(field.state.meta.errors)} />
			)}
		</Field>
	);
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
 * Props for {@link StackEditForm}.
 *
 * - `mode="edit"`: editing an existing stack; `item` is required.
 * - `mode="create"`: adding a new stack; `item` is omitted; uses blank defaults.
 */
interface StackEditFormProps {
	mode: "edit" | "create";
	/** Required in edit mode; the item to prefill and update on Save. */
	item?: Stack;
	/** Required in create mode; the card the new stack belongs to. */
	cardId: string;
	/** Optional list of known variant strings for this card (from the corpus). */
	variants?: string[];
	/** Exact printings from the live card detail; when present, drives the printing picker. */
	variantsDetailed?: CardVariant[];
	/** Called after a successful Save. */
	onSaved: () => void;
	/** Called when Cancel is clicked. */
	onCancel: () => void;
}

/** Blank defaults for a new stack form. */
const BLANK_DEFAULTS = {
	label: "",
	quantity: "1",
	acquiredAt: new Date().toISOString().slice(0, 10),
	pricePaid: "",
	language: "en",
	variant: "",
	variantId: "",
	notes: "",
	source: "",
	storageLocation: "",
	state: "raw" as const,
	condition: "" as const,
	gradingCompany: "" as const,
	grade: "",
	gradingCert: "",
};

/**
 * Draft→Save form for creating or editing a single stack's metadata.
 * No per-field auto-save: all changes are committed atomically when Save is clicked.
 *
 * Variant and State are rendered as segmented pill controls matching the mock.
 */
export function StackEditForm({
	mode,
	item,
	cardId,
	variants,
	variantsDetailed,
	onSaved,
	onCancel,
}: StackEditFormProps) {
	const defaultValues =
		mode === "edit" && item ? itemToForm(item) : BLANK_DEFAULTS;

	const form = useForm({
		defaultValues,
		validators: { onSubmit: stackFormSchema },
		onSubmit: async ({ value }) => {
			const patch = formToPatch(value, variantsDetailed);
			if (mode === "edit" && item) {
				await updateStack(item.id, patch);
			} else {
				await addStack(cardId, patch);
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
			{/* Label — optional user-given name; blank → auto metadata label (stack-label.ts) */}
			<form.Field
				name="label"
				// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
				children={(field) => (
					<TextField
						field={field}
						label="Label"
						placeholder="Name this stack (optional)"
					/>
				)}
			/>

			{/* 2-column responsive grid */}
			<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
				{/* Quantity — how many identical cards in this stack */}
				<form.Field
					name="quantity"
					validators={{ onBlur: stackFormSchema.shape.quantity }}
					// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
					children={(field) => (
						<TextField
							field={field}
							label="Quantity"
							type="number"
							min={1}
							mono
							ariaLabel="Quantity"
						/>
					)}
				/>

				{/* Printing (detailed) — precise variantId picker when the card carries
				    exact TCGdex printings; falls back to the coarse variant pill. */}
				{variantsDetailed && variantsDetailed.length > 0 ? (
					<form.Field
						name="variantId"
						// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
						children={(field) => (
							<Field className="sm:col-span-2">
								<FieldLabel>Printing</FieldLabel>
								<SegmentedControl
									aria-label="Printing"
									value={field.state.value}
									onChange={(v) => field.handleChange(v)}
									options={[
										{ value: "", label: "Unspecified" },
										...variantsDetailed.map((v) => ({
											value: v.variantId,
											label: variantLabel(v),
										})),
									]}
								/>
							</Field>
						)}
					/>
				) : (
					variants &&
					variants.length > 0 && (
						<form.Field
							name="variant"
							validators={{ onBlur: stackFormSchema.shape.variant }}
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
					)
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

				{/* Conditional: raw → condition Select; graded → grader + grade */}
				<form.Subscribe
					selector={(s) => s.values.state}
					// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
					children={(state) =>
						state === "raw" ? (
							<form.Field
								name="condition"
								validators={{ onBlur: stackFormSchema.shape.condition }}
								// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
								children={(field) => (
									<SelectField
										field={field}
										label="Condition"
										placeholder="Select condition…"
										options={CONDITIONS}
									/>
								)}
							/>
						) : (
							<>
								<form.Field
									name="gradingCompany"
									validators={{ onBlur: stackFormSchema.shape.gradingCompany }}
									// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
									children={(field) => (
										<SelectField
											field={field}
											label="Grader / company"
											ariaLabel="Grader / company"
											placeholder="Select grader…"
											options={GRADERS}
										/>
									)}
								/>

								<form.Field
									name="grade"
									validators={{
										onBlur: ({ value }) => {
											if (value === "") return undefined;
											const n = Number(value);
											if (!Number.isFinite(n) || n < 0 || n > 10) return "0-10";
											return undefined;
										},
									}}
									// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
									children={(field) => (
										<TextField field={field} label="Grade" type="number" />
									)}
								/>

								<form.Field
									name="gradingCert"
									// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
									children={(field) => (
										<TextField
											field={field}
											label="Cert / serial"
											placeholder="Slab cert number (optional)"
										/>
									)}
								/>
							</>
						)
					}
				/>

				{/* Acquired date */}
				<form.Field
					name="acquiredAt"
					validators={{ onBlur: stackFormSchema.shape.acquiredAt }}
					// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
					children={(field) => (
						<DateField field={field} label="Acquired date" />
					)}
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
					children={(field) => (
						<TextField
							field={field}
							label="Price paid"
							type="number"
							mono
							ariaLabel="Price paid"
						/>
					)}
				/>

				{/* Language — ISO 639-1 select, grouped Western / Asian, default EN */}
				<form.Field
					name="language"
					// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
					children={(field) => (
						<LanguageSelectField
							field={field}
							label="Language"
							placeholder="Select language…"
						/>
					)}
				/>
			</div>

			{/* Provenance — source + storage location */}
			<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<form.Field
					name="source"
					// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
					children={(field) => (
						<TextField
							field={field}
							label="Source"
							placeholder="Where / who from"
						/>
					)}
				/>
				<form.Field
					name="storageLocation"
					// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
					children={(field) => (
						<TextField
							field={field}
							label="Storage location"
							placeholder="Binder / box"
						/>
					)}
				/>
			</div>

			{/* Notes — full width */}
			<form.Field
				name="notes"
				validators={{ onBlur: stackFormSchema.shape.notes }}
				// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
				children={(field) => (
					<TextField field={field} label="Notes" multiline />
				)}
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
