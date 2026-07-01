"use client";

import { useForm } from "@tanstack/react-form";
import { useMemo } from "react";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fieldErrorText } from "@/lib/field-error";
import {
	LANGUAGE_LABELS,
	SUPPORTED_LANGUAGES,
	toSupportedLanguage,
} from "@/lib/languages";
import { cn } from "@/lib/utils";
import { useStore } from "../../store";
import type { Profile } from "../../store/userland/types";
import { updateProfile } from "../../store/userland/userland-store";
import {
	AVATAR_PRESETS,
	DEFAULT_AVATAR_PRESET_ID,
	getAvatarPreset,
} from "./avatar-presets";

const NONE = "__none__";

const profileFormSchema = z.object({
	displayName: z.string().min(1, "Display name is required"),
	bio: z.string(),
	avatarPreset: z.string(),
	favoriteSetId: z.string(),
	displayLanguage: z.string(),
});

/** Props for {@link ProfileFormDialog}. */
interface ProfileFormDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** The current profile (null = first-time setup; fields seed from defaults). */
	profile?: Profile | null;
}

/** Dialog form for editing the collector profile (name, bio, avatar, favorite set). */
export function ProfileFormDialog({
	open,
	onOpenChange,
	profile,
}: ProfileFormDialogProps) {
	const sets = useStore((s) => s.sets);
	const setOptions = useMemo(
		() =>
			(sets ?? [])
				.map((s) => ({ id: s.id, name: s.name }))
				.sort((a, b) => a.name.localeCompare(b.name)),
		[sets],
	);

	const form = useForm({
		defaultValues: {
			displayName: profile?.displayName ?? "",
			bio: profile?.bio ?? "",
			avatarPreset: profile?.avatarPreset ?? DEFAULT_AVATAR_PRESET_ID,
			favoriteSetId: profile?.favoriteSetId ?? NONE,
			displayLanguage: toSupportedLanguage(profile?.displayLanguage) as string,
		},
		validators: { onSubmit: profileFormSchema },
		onSubmit: async ({ value }) => {
			await updateProfile({
				displayName: value.displayName,
				bio: value.bio.trim() ? value.bio : null,
				avatarPreset: value.avatarPreset,
				favoriteSetId:
					value.favoriteSetId === NONE ? null : value.favoriteSetId,
				displayLanguage: value.displayLanguage,
			});
			onOpenChange(false);
		},
	});

	// Key on the open-session, NOT profile.id: the singleton profile transitions
	// null -> {id:"me"} on first save, and keying on its id would remount the
	// dialog mid-submit (dropping onOpenChange(false), so it never closes).
	// Keying on `open` remounts on each open — re-seeding defaultValues from the
	// current profile — while staying stable through a save.
	return (
		<Dialog
			key={open ? "open" : "closed"}
			open={open}
			onOpenChange={onOpenChange}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="font-display">Edit Profile</DialogTitle>
					<DialogDescription>
						Your collector identity. Shown across the app.
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
						{/* Display name */}
						<form.Field
							name="displayName"
							validators={{ onBlur: profileFormSchema.shape.displayName }}
							// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
							children={(field) => {
								const isInvalid =
									field.state.meta.isTouched && !field.state.meta.isValid;
								return (
									<Field data-invalid={isInvalid}>
										<FieldLabel htmlFor={field.name}>Display name</FieldLabel>
										<Input
											id={field.name}
											aria-invalid={isInvalid}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											placeholder="e.g. Ash Ketchum"
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

						{/* Bio */}
						<form.Field
							name="bio"
							// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
							children={(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>Bio</FieldLabel>
									<Textarea
										id={field.name}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="A line about your collection"
										rows={3}
									/>
								</Field>
							)}
						/>

						{/* Avatar preset */}
						<form.Field
							name="avatarPreset"
							// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
							children={(field) => (
								<Field>
									<FieldLabel>Avatar</FieldLabel>
									<div className="flex flex-wrap gap-2">
										{AVATAR_PRESETS.map((p) => {
											const active = field.state.value === p.id;
											return (
												<button
													key={p.id}
													type="button"
													aria-label={p.name}
													aria-pressed={active}
													onClick={() => field.handleChange(p.id)}
													className={cn(
														"size-8 rounded-full ring-2 ring-offset-2 ring-offset-[var(--canvas)] transition-all",
														active
															? "ring-[var(--primary)]"
															: "ring-transparent hover:ring-white/30",
													)}
													style={{ background: getAvatarPreset(p.id).gradient }}
												/>
											);
										})}
									</div>
								</Field>
							)}
						/>

						{/* Favorite set */}
						<form.Field
							name="favoriteSetId"
							// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
							children={(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>Favorite set</FieldLabel>
									<Select
										value={field.state.value}
										onValueChange={(v) => field.handleChange(v)}
									>
										<SelectTrigger id={field.name}>
											<SelectValue placeholder="None" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value={NONE}>None</SelectItem>
											{setOptions.map((s) => (
												<SelectItem key={s.id} value={s.id}>
													{s.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</Field>
							)}
						/>

						{/* Catalog display language */}
						<form.Field
							name="displayLanguage"
							// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
							children={(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>Catalog language</FieldLabel>
									<Select
										value={field.state.value}
										onValueChange={(v) => field.handleChange(v)}
									>
										<SelectTrigger id={field.name}>
											<SelectValue placeholder="English" />
										</SelectTrigger>
										<SelectContent>
											{SUPPORTED_LANGUAGES.map((lang) => (
												<SelectItem key={lang} value={lang}>
													{LANGUAGE_LABELS[lang]}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
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
										{isSubmitting ? "Saving…" : "Save"}
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
