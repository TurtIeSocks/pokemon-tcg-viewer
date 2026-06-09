"use client";

import { useForm } from "@tanstack/react-form";
import { MailCheck } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { fieldErrorText } from "@/lib/field-error";
import { isCloudEnabled } from "@/lib/supabase/client";
import { sendMagicLink } from "./auth-actions";

const signInSchema = z.object({
	email: z.string().min(1, "Email is required").email("Enter a valid email"),
});

/**
 * Passwordless sign-in: enter an email → receive a magic link → land back on
 * `/auth/callback`. Renders nothing when cloud is disabled (no env), so the app
 * stays pure local-first.
 */
export function SignIn() {
	// Gate at the top: when cloud is off there is no client to call.
	if (!isCloudEnabled()) return null;
	return <SignInForm />;
}

function SignInForm() {
	// `null` = not yet sent; a string = the address we mailed (success state).
	const [sentTo, setSentTo] = useState<string | null>(null);
	// Submit-level error (network / Supabase), distinct from field validation.
	const [submitError, setSubmitError] = useState<string | null>(null);

	const form = useForm({
		defaultValues: { email: "" },
		validators: { onSubmit: signInSchema },
		onSubmit: async ({ value }) => {
			setSubmitError(null);
			const error = await sendMagicLink(value.email);
			if (error) {
				setSubmitError(error);
				return;
			}
			setSentTo(value.email);
		},
	});

	if (sentTo !== null) {
		return (
			<div className="flex flex-col items-center gap-3 py-2 text-center">
				<div className="grid size-11 place-items-center rounded-full bg-[var(--primary-wash)] text-[var(--primary)]">
					<MailCheck className="size-5" />
				</div>
				<div className="space-y-1">
					<p className="font-medium text-[var(--ink)]">Check your email</p>
					<p className="text-sm text-[var(--ink-muted)]">
						We sent a sign-in link to{" "}
						<span className="font-medium text-[var(--ink)]">{sentTo}</span>.
						Open it on this device to finish signing in.
					</p>
				</div>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => {
						setSentTo(null);
						setSubmitError(null);
					}}
				>
					Use a different email
				</Button>
			</div>
		);
	}

	return (
		<form
			noValidate
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				void form.handleSubmit();
			}}
			className="flex flex-col gap-4"
		>
			<form.Field
				name="email"
				validators={{ onBlur: signInSchema.shape.email }}
				// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
				children={(field) => {
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;
					return (
						<Field data-invalid={isInvalid}>
							<FieldLabel htmlFor={field.name}>Email</FieldLabel>
							<Input
								id={field.name}
								type="email"
								autoComplete="email"
								inputMode="email"
								aria-invalid={isInvalid}
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								placeholder="you@example.com"
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

			{submitError !== null && (
				<p className="text-sm text-[var(--danger)]" role="alert">
					{submitError}
				</p>
			)}

			<form.Subscribe
				selector={(s) => ({
					canSubmit: s.canSubmit,
					isSubmitting: s.isSubmitting,
				})}
				// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
				children={({ canSubmit, isSubmitting }) => (
					<Button type="submit" disabled={!canSubmit || isSubmitting}>
						{isSubmitting ? "Sending…" : "Send magic link"}
					</Button>
				)}
			/>
		</form>
	);
}
