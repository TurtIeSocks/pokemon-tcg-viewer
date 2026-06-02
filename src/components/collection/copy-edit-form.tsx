import { useForm } from "@tanstack/react-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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

interface CopyEditFormProps {
	item: CollectionItem;
	variants?: string[];
}

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
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;
					return (
						<div>
							<Label htmlFor={field.name}>Acquired date</Label>
							<Input
								id={field.name}
								type="date"
								aria-invalid={isInvalid}
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
							/>
							{isInvalid && field.state.meta.errors.length > 0 && (
								<p className="text-sm text-destructive">
									{String(field.state.meta.errors[0])}
								</p>
							)}
						</div>
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
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;
					return (
						<div>
							<Label htmlFor={field.name}>Price paid</Label>
							<Input
								id={field.name}
								type="number"
								aria-label="Price paid"
								aria-invalid={isInvalid}
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
							/>
							{isInvalid && field.state.meta.errors.length > 0 && (
								<p className="text-sm text-destructive">
									{String(field.state.meta.errors[0])}
								</p>
							)}
						</div>
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
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;
					return (
						<div>
							<Label htmlFor={field.name}>Variant</Label>
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
									aria-invalid={isInvalid}
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
						</div>
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
								<Label htmlFor="state-raw">Raw</Label>
							</div>
							<div className="flex items-center gap-2">
								<RadioGroupItem value="graded" id="state-graded" />
								<Label htmlFor="state-graded">Graded</Label>
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
								const isInvalid =
									field.state.meta.isTouched && !field.state.meta.isValid;
								return (
									<div>
										<Label htmlFor={field.name}>Condition</Label>
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
												aria-invalid={isInvalid}
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
									</div>
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
									const isInvalid =
										field.state.meta.isTouched && !field.state.meta.isValid;
									return (
										<div>
											<Label htmlFor={field.name}>Grader / company</Label>
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
													aria-invalid={isInvalid}
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
										</div>
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
									const isInvalid =
										field.state.meta.isTouched && !field.state.meta.isValid;
									return (
										<div>
											<Label htmlFor={field.name}>Grade</Label>
											<Input
												id={field.name}
												type="number"
												aria-invalid={isInvalid}
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
											/>
											{isInvalid && field.state.meta.errors.length > 0 && (
												<p className="text-sm text-destructive">
													{String(field.state.meta.errors[0])}
												</p>
											)}
										</div>
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
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;
					return (
						<div>
							<Label htmlFor={field.name}>Notes</Label>
							<Textarea
								id={field.name}
								aria-invalid={isInvalid}
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
							/>
						</div>
					);
				}}
			/>
		</form>
	);
}
