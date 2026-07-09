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
import { m } from "@/paraglide/messages";
import { sendMagicLink } from "./auth-actions";

/**
 * A factory, not a module-scope constant: the `.min()`/`.email()` messages call
 * `m.*()`, which reads the ACTIVE locale when called — building this at
 * module-eval time would freeze it to the base locale forever.
 */
function makeSignInSchema() {
	return z.object({
		email: z
			.string()
			.min(1, m.auth_email_required())
			.email(m.auth_email_invalid()),
	});
}

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
	// Built at render time (not module scope) so its messages resolve against
	// the active locale — see makeSignInSchema's doc comment.
	const signInSchema = makeSignInSchema();

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
				<div className="grid size-11 place-items-center rounded-full bg-(--primary-wash) text-(--primary)">
					<MailCheck className="size-5" />
				</div>
				<div className="space-y-1">
					<p className="font-medium text-(--ink)">
						{m.shell_check_your_email()}
					</p>
					<p className="text-sm text-(--ink-muted)">
						{m.shell_sign_in_link_sent({ email: sentTo ?? "" })}
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
					{m.shell_use_different_email()}
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
							<FieldLabel htmlFor={field.name}>
								{m.shell_email_label()}
							</FieldLabel>
							<Input
								id={field.name}
								type="email"
								autoComplete="email"
								inputMode="email"
								aria-invalid={isInvalid}
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								placeholder={m.shell_email_placeholder()}
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
				<p className="text-sm text-(--danger)" role="alert">
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
						{isSubmitting
							? m.shell_sending_ellipsis()
							: m.shell_send_magic_link()}
					</Button>
				)}
			/>
		</form>
	);
}
