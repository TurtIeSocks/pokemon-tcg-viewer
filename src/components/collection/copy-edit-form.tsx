import { useForm } from "@tanstack/react-form";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fieldErrorText } from "@/lib/field-error";
import type { CollectionItem } from "../../store/userland/types";
import { updateCopy } from "../../store/userland/userland-store";
import { formFieldToPatch, itemToForm } from "./copy-form-mapping";
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

/** Props for {@link CopyEditForm}. */
interface CopyEditFormProps {
	/** The collection item being edited; used both as initial values and as the patch target. */
	item: CollectionItem;
	/** Optional list of known variant strings for this card (from the corpus). */
	variants?: string[];
}

/** Inline form for editing a single copy's metadata; each field auto-saves on blur. */
export function CopyEditForm({ item, variants }: CopyEditFormProps) {
	const form = useForm({
		defaultValues: itemToForm(item),
	});

	return (
		<form noValidate className="flex flex-col gap-3">
			{/* Acquired date */}
			<form.Field
				name="acquiredAt"
				validators={{ onBlur: copyFormSchema.shape.acquiredAt }}
				listeners={{
					onBlur: ({ value, fieldApi }) => {
						if (fieldApi.state.meta.errors.length === 0) {
							void updateCopy(
								item.id,
								formFieldToPatch("acquiredAt", value, {
									gradingCompany: form.getFieldValue("gradingCompany"),
									grade: form.getFieldValue("grade"),
								}),
							);
						}
					},
				}}
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
				listeners={{
					onBlur: ({ value, fieldApi }) => {
						if (fieldApi.state.meta.errors.length === 0) {
							void updateCopy(
								item.id,
								formFieldToPatch("pricePaid", value, {
									gradingCompany: form.getFieldValue("gradingCompany"),
									grade: form.getFieldValue("grade"),
								}),
							);
						}
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
							/>
							{invalid && (
								<FieldError errors={toFieldErrors(field.state.meta.errors)} />
							)}
						</Field>
					);
				}}
			/>

			{/* Variant */}
			<form.Field
				name="variant"
				validators={{ onBlur: copyFormSchema.shape.variant }}
				listeners={{
					onBlur: ({ value, fieldApi }) => {
						if (fieldApi.state.meta.errors.length === 0) {
							void updateCopy(
								item.id,
								formFieldToPatch("variant", value, {
									gradingCompany: form.getFieldValue("gradingCompany"),
									grade: form.getFieldValue("grade"),
								}),
							);
						}
					},
				}}
				// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
				children={(field) => {
					const invalid = fieldIsInvalid(field);
					return (
						<Field data-invalid={invalid}>
							<FieldLabel htmlFor={field.name}>Variant</FieldLabel>
							<Select
								value={toSelectVal(field.state.value)}
								onValueChange={(v) => {
									const val = fromSelectVal(v);
									field.handleChange(val);
									void updateCopy(item.id, formFieldToPatch("variant", val));
								}}
							>
								<SelectTrigger
									id={field.name}
									aria-invalid={invalid}
									onBlur={field.handleBlur}
								>
									<SelectValue placeholder="Select variant..." />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={NONE}>Unspecified</SelectItem>
									{(variants ?? []).map((v) => (
										<SelectItem key={v} value={v}>
											{v}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
					);
				}}
			/>

			{/* State radio: raw | graded */}
			<form.Field
				name="state"
				listeners={{
					onChange: ({ value, fieldApi: _fieldApi }) => {
						void updateCopy(item.id, formFieldToPatch("state", value));
					},
				}}
				// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
				children={(field) => (
					<div>
						<span className="text-sm font-medium">Condition type</span>
						<RadioGroup
							value={field.state.value}
							onValueChange={(v) => {
								field.handleChange(v as "raw" | "graded");
							}}
							className="flex gap-4 mt-1"
						>
							<div className="flex items-center gap-2">
								<RadioGroupItem value="raw" id="state-raw" />
								<FieldLabel htmlFor="state-raw">Raw</FieldLabel>
							</div>
							<div className="flex items-center gap-2">
								<RadioGroupItem value="graded" id="state-graded" />
								<FieldLabel htmlFor="state-graded">Graded</FieldLabel>
							</div>
						</RadioGroup>
					</div>
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
							listeners={{
								onBlur: ({ value, fieldApi }) => {
									if (fieldApi.state.meta.errors.length === 0) {
										void updateCopy(
											item.id,
											formFieldToPatch("condition", value),
										);
									}
								},
							}}
							// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
							children={(field) => {
								const invalid = fieldIsInvalid(field);
								return (
									<Field data-invalid={invalid}>
										<FieldLabel htmlFor={field.name}>Condition</FieldLabel>
										<Select
											value={toSelectVal(field.state.value)}
											onValueChange={(v) => {
												const val = fromSelectVal(
													v,
												) as typeof field.state.value;
												field.handleChange(val);
												void updateCopy(
													item.id,
													formFieldToPatch("condition", val),
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
								listeners={{
									onBlur: ({ value, fieldApi }) => {
										if (fieldApi.state.meta.errors.length === 0) {
											void updateCopy(
												item.id,
												formFieldToPatch("gradingCompany", value, {
													gradingCompany: value,
													grade: form.getFieldValue("grade"),
												}),
											);
										}
									},
								}}
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
													const val = fromSelectVal(
														v,
													) as typeof field.state.value;
													field.handleChange(val);
													void updateCopy(
														item.id,
														formFieldToPatch("gradingCompany", val, {
															gradingCompany: val,
															grade: form.getFieldValue("grade"),
														}),
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
								listeners={{
									onBlur: ({ value, fieldApi }) => {
										if (fieldApi.state.meta.errors.length === 0) {
											void updateCopy(
												item.id,
												formFieldToPatch("grade", value, {
													gradingCompany: form.getFieldValue("gradingCompany"),
													grade: value,
												}),
											);
										}
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

			{/* Notes */}
			<form.Field
				name="notes"
				validators={{ onBlur: copyFormSchema.shape.notes }}
				listeners={{
					onBlur: ({ value, fieldApi }) => {
						if (fieldApi.state.meta.errors.length === 0) {
							void updateCopy(
								item.id,
								formFieldToPatch("notes", value, {
									gradingCompany: form.getFieldValue("gradingCompany"),
									grade: form.getFieldValue("grade"),
								}),
							);
						}
					},
				}}
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
						</Field>
					);
				}}
			/>
		</form>
	);
}
