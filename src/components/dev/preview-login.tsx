"use client";

import { useState } from "react";
import { useAuthSession } from "@/components/auth/use-auth-session";
import { getBrowserClient, isCloudEnabled } from "@/lib/supabase/client";

// Renders ONLY when VITE_CLAUDE_PREVIEW is set — that flag is set exclusively by
// the Claude-preview launch config (`.claude/launch.json` → `dev:preview`), so a
// production build never sets it, the gate below is statically `false`, and Vite
// dead-code-eliminates this whole component out of the prod bundle.
const IS_PREVIEW = import.meta.env.VITE_CLAUDE_PREVIEW === "true";

// Local-only dev credentials. The user exists solely in the local Supabase
// stack; `enable_confirmations = false` (config.toml) means `signUp` immediately
// yields a usable session — no email round-trip. NEVER put real/secret creds here.
const DEV_EMAIL = "preview@local.dev";
const DEV_PASSWORD = "preview-dev-only-password";

/** A floating dev-only panel that signs a throwaway user in/out without the magic-link email. */
export function PreviewLogin() {
	if (!IS_PREVIEW || !isCloudEnabled()) return null;
	return <PreviewLoginPanel />;
}

function PreviewLoginPanel() {
	const { session, email } = useAuthSession();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function devSignIn() {
		setBusy(true);
		setError(null);
		const auth = getBrowserClient().auth;
		// Existing dev user → straight in. First run → sign up (auto-confirmed
		// locally, returns a session) and fall back to password sign-in if needed.
		const signIn = await auth.signInWithPassword({
			email: DEV_EMAIL,
			password: DEV_PASSWORD,
		});
		if (signIn.error) {
			const created = await auth.signUp({
				email: DEV_EMAIL,
				password: DEV_PASSWORD,
			});
			if (created.error) {
				setError(created.error.message);
			} else if (!created.data.session) {
				const retry = await auth.signInWithPassword({
					email: DEV_EMAIL,
					password: DEV_PASSWORD,
				});
				if (retry.error) setError(retry.error.message);
			}
		}
		setBusy(false);
	}

	async function devSignOut() {
		setBusy(true);
		setError(null);
		await getBrowserClient().auth.signOut();
		setBusy(false);
	}

	return (
		<div className="fixed bottom-3 right-3 z-[9999] w-56 rounded-lg border border-amber-400/40 bg-black/85 p-2.5 font-mono text-[11px] text-amber-200 shadow-lg backdrop-blur">
			<div className="mb-1.5 flex items-center gap-1 font-semibold uppercase tracking-wide text-amber-300">
				<span aria-hidden>⚙</span> preview login
			</div>
			{session ? (
				<div className="space-y-1.5">
					<div className="truncate text-amber-100/70">
						signed in: {email ?? DEV_EMAIL}
					</div>
					<button
						type="button"
						onClick={devSignOut}
						disabled={busy}
						className="w-full rounded border border-amber-400/40 px-2 py-1 hover:bg-amber-400/10 disabled:opacity-50"
					>
						{busy ? "…" : "Sign out"}
					</button>
				</div>
			) : (
				<button
					type="button"
					onClick={devSignIn}
					disabled={busy}
					className="w-full rounded border border-amber-400/40 px-2 py-1 hover:bg-amber-400/10 disabled:opacity-50"
				>
					{busy ? "Signing in…" : "Sign in as dev user"}
				</button>
			)}
			{error && <div className="mt-1.5 text-red-300">{error}</div>}
		</div>
	);
}
